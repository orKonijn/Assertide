import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { connectDatabase } from "../src/database.ts";
import { LabService } from "../src/lab.ts";

test("Lab persists CRUD, rejects stale writes, deduplicates starts and isolates tenants", async () => {
  const db = await connectDatabase();
  const password = randomBytes(20).toString("hex");
  const lab = new LabService(db, password, randomBytes(32).toString("hex"));
  try {
    await lab.initialize();
    const identity = async (user: string) =>
      lab.authenticate(`Bearer ${await lab.token(user, password)}`);
    const a = await identity("operator-a");
    const b = await identity("operator-b");
    const viewer = await identity("viewer-a");
    const fields = { sku: "DEMO-01", quantity: 2, status: "draft" };
    const key = randomUUID();
    const [first, duplicate] = await Promise.all([
      lab.create(a, fields, key),
      lab.create(a, fields, key),
    ]);
    assert.equal(first.id, duplicate.id);
    assert.equal((await lab.list(a, {})).items.length, 1);
    await assert.rejects(lab.create(a, { ...fields, quantity: 3 }, key), {
      status: 409,
    });
    await assert.rejects(lab.create(viewer, fields, randomUUID()), {
      status: 403,
    });
    await assert.rejects(lab.get(b, first.id), { status: 404 });
    await assert.rejects(lab.update(b, first.id, fields, '"1"', false), {
      status: 404,
    });
    await assert.rejects(lab.remove(b, first.id, '"1"'), { status: 404 });
    const replaced = await lab.update(
      a,
      first.id,
      { ...fields, quantity: 3 },
      '"1"',
      false,
    );
    assert.equal(replaced.quantity, 3);
    await assert.rejects(lab.update(a, first.id, fields, '"1"', false), {
      status: 412,
    });
    const patched = await lab.update(a, first.id, { quantity: 4 }, '"2"', true);
    assert.equal(patched.version, 3);
    assert.equal((await lab.get(a, first.id)).quantity, 4);
    await lab.remove(a, first.id, '"3"');
    await assert.rejects(lab.get(a, first.id), { status: 404 });
    for (const quantity of [0, 11])
      await assert.rejects(
        lab.create(a, { ...fields, quantity }, randomUUID()),
        { status: 422 },
      );
    for (const quantity of [1, 10])
      assert.equal(
        (await lab.create(a, { ...fields, quantity }, randomUUID())).quantity,
        quantity,
      );
    const confirmed = await lab.create(
      a,
      { ...fields, status: "confirmed" },
      randomUUID(),
    );
    await assert.rejects(lab.remove(a, confirmed.id, '"1"'), { status: 409 });
    await assert.rejects(lab.authenticate(undefined), { status: 401 });
    await assert.rejects(lab.authenticate("Bearer invalid"), { status: 401 });
    await assert.rejects(lab.token("operator-a", "wrong"), { status: 401 });
    const page = await lab.list(a, { limit: 2 });
    assert.equal(page.items.length, 2);
    const next = await lab.list(a, { limit: 2, cursor: page.nextCursor });
    assert.equal(next.items.length, 1);
    assert.equal(
      new Set([...page.items, ...next.items].map((item) => item.id)).size,
      3,
    );
  } finally {
    await db.close();
  }
});
