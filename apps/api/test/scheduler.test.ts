import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { testDatabase } from "./database.ts";
import { PlatformService, localProjectId } from "../src/platform.ts";
import type { Principal } from "../src/identity.ts";
import {
  claimExecution,
  updateOwnedRun,
  recoverExpiredLeases,
  RedisTransport,
} from "../src/scheduler.ts";

const principal: Principal = {
  subject: "scheduler",
  name: "Scheduler",
  organizationId: "00000000-0000-4000-8000-000000000001",
  projectIds: [localProjectId],
  role: "administrator",
};
const config = (service: PlatformService) => ({
  catalogRevision: service.revision,
  selection: { testIds: ["LAB-001"] },
  environmentId: "local-lab",
  browserProjects: [],
  workers: 1,
  retries: 0,
  headed: false,
  video: "off",
});
test("transactional outbox and leases reject duplicate owners, stale writes and terminal changes", async () => {
  const db = await testDatabase();
  const service = new PlatformService(db);
  try {
    await service.initialize();
    const run = await service.launch(
      principal,
      localProjectId,
      config(service),
      randomUUID(),
    );
    const id = String(run["id"]);
    assert.equal(
      (
        await db.query(
          "SELECT run_id FROM run_outbox WHERE run_id=$1 AND published_at IS NULL",
          [id],
        )
      ).rows.length,
      1,
    );
    const [a, b] = await Promise.all([
      claimExecution(db, "a", id),
      claimExecution(db, "b", id),
    ]);
    assert.equal(Number(Boolean(a)) + Number(Boolean(b)), 1);
    const owner = a ? "a" : "b";
    await assert.rejects(
      updateOwnedRun(db, id, "intruder", 1, { phase: "completed" }),
      /Stale worker/,
    );
    await assert.rejects(
      updateOwnedRun(db, id, owner, 2, { phase: "completed" }),
      /Stale worker/,
    );
    await db.query(
      "UPDATE platform_documents SET body=jsonb_set(body,'{leaseExpires}',to_jsonb(now()-interval '1 minute')) WHERE id=$1",
      [id],
    );
    await assert.rejects(
      updateOwnedRun(db, id, owner, 1, { phase: "completed" }),
      /Stale worker/,
    );
    await recoverExpiredLeases(db);
    assert.equal(
      (await service.get(principal, id, "run"))["phase"],
      "infrastructure_error",
    );
    assert.equal(await claimExecution(db, "new-owner", id), undefined);
    const second = await service.launch(
      principal,
      localProjectId,
      config(service),
      randomUUID(),
    );
    const secondId = String(second["id"]);
    await claimExecution(db, owner, secondId);
    await service.cancel(principal, secondId);
    await updateOwnedRun(db, secondId, owner, 1, { phase: "completed" });
    assert.equal(
      (await service.get(principal, secondId, "run"))["phase"],
      "canceled",
    );
    await assert.rejects(
      updateOwnedRun(db, secondId, owner, 1, { phase: "running" }),
      /Stale worker/,
    );
  } finally {
    await db.close();
  }
});

test("concurrent claims enforce project and organization worker capacity", async () => {
  const db = await testDatabase();
  const service = new PlatformService(db);
  try {
    await service.initialize();
    const runs = await Promise.all(
      Array.from({ length: 3 }, () =>
        service.launch(
          principal,
          localProjectId,
          { ...config(service), workers: 4 },
          randomUUID(),
        ),
      ),
    );
    const claims = await Promise.all(
      runs.map((run, index) =>
        claimExecution(db, `quota-${index}`, String(run["id"])),
      ),
    );
    assert.equal(claims.filter(Boolean).length, 2);
    const blocked = runs.find((_, index) => !claims[index])!;
    assert.equal(
      (await service.get(principal, String(blocked["id"]), "run"))["phase"],
      "queued",
    );
    assert.match(
      String(
        (await service.get(principal, String(blocked["id"]), "run"))[
          "queueReason"
        ],
      ),
      /capacity/,
    );
    const active = claims.find(Boolean)!;
    await updateOwnedRun(
      db,
      String(active["id"]),
      String(active["leaseOwner"]),
      Number(active["leaseEpoch"]),
      { phase: "completed" },
    );
    assert.ok(await claimExecution(db, "quota-next", String(blocked["id"])));
  } finally {
    await db.close();
  }
});

test(
  "Redis outbox delivery remains idempotent across duplicate publication",
  { skip: !process.env["TEST_REDIS_URL"], timeout: 20000 },
  async () => {
    const db = await testDatabase();
    const service = new PlatformService(db);
    await service.initialize();
    const run = await service.launch(
      principal,
      localProjectId,
      config(service),
      randomUUID(),
    );
    const id = String(run["id"]);
    let executions = 0;
    const transport = new RedisTransport(
      db,
      process.env["TEST_REDIS_URL"]!,
      async (runId) => {
        const claimed = await claimExecution(db, "redis-worker", runId);
        if (!claimed) return;
        executions++;
        await updateOwnedRun(
          db,
          runId,
          "redis-worker",
          Number(claimed["leaseEpoch"]),
          { phase: "completed" },
        );
      },
      `assertide-test-${randomUUID()}`,
    );
    try {
      await transport.start();
      await Promise.all([transport.publish(), transport.publish()]);
      for (
        let attempt = 0;
        attempt < 100 &&
        (await service.get(principal, id, "run"))["phase"] !== "completed";
        attempt++
      )
        await setTimeout(50);
      assert.equal(
        (await service.get(principal, id, "run"))["phase"],
        "completed",
      );
      assert.equal(executions, 1);
    } finally {
      await transport.close();
      await db.close();
    }
  },
);
