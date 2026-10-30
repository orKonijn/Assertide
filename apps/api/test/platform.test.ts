import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.ts";
import { PlatformService, localProjectId } from "../src/platform.ts";
import type { Principal } from "../src/identity.ts";
import { catalogRevision, verifySource } from "../src/source.ts";

test("platform authorization, suite concurrency, launch deduplication and cancellation ownership", async () => {
  const db = await testDatabase();
  const service = new PlatformService(db);
  const admin: Principal = {
    subject: "admin",
    name: "Admin",
    organizationId: "00000000-0000-4000-8000-000000000001",
    projectIds: [localProjectId],
    role: "administrator",
  };
  const viewer: Principal = { ...admin, subject: "viewer", role: "viewer" };
  const outsider: Principal = { ...admin, subject: "outside", projectIds: [] };
  const config = {
    catalogRevision,
    selection: { testIds: ["LAB-001"] },
    environmentId: "local-lab",
    browserProjects: [],
    workers: 1,
    retries: 0,
    headed: false,
    video: "off",
  };
  try {
    await service.initialize();
    await service.seedLocal();
    await verifySource(catalogRevision);
    await assert.rejects(
      service.launch(
        admin,
        localProjectId,
        { ...config, catalogRevision: "stale" },
        randomUUID(),
      ),
      { status: 409 },
    );
    await assert.rejects(service.list(outsider, localProjectId, "project"), {
      status: 404,
    });
    await assert.rejects(
      service.launch(viewer, localProjectId, config, randomUUID()),
      { status: 403 },
    );
    await assert.rejects(
      service.launch(
        admin,
        localProjectId,
        { ...config, workers: 99 },
        randomUUID(),
      ),
      { status: 422 },
    );
    await assert.rejects(
      service.launch(
        admin,
        localProjectId,
        { ...config, selection: { testIds: ["; rm anything"] } },
        randomUUID(),
      ),
      { status: 422 },
    );
    const key = randomUUID();
    const runs = await Promise.all([
      service.launch(admin, localProjectId, config, key),
      service.launch(admin, localProjectId, config, key),
    ]);
    assert.equal(runs[0]?.["id"], runs[1]?.["id"]);
    assert.equal((await service.list(admin, localProjectId, "run")).length, 1);
    await assert.rejects(
      service.launch(admin, localProjectId, { ...config, retries: 1 }, key),
      { status: 409 },
    );
    const id = String(runs[0]?.["id"]);
    await assert.rejects(
      service.cancel({ ...admin, subject: "another", role: "operator" }, id),
      { status: 403 },
    );
    assert.equal((await service.cancel(admin, id))["phase"], "canceled");
    assert.equal((await service.cancel(admin, id))["phase"], "canceled");
    await assert.rejects(
      service.rerun(
        admin,
        id,
        { mode: "selected", testIds: ["UI-001"] },
        randomUUID(),
      ),
      { status: 422 },
    );
    await assert.rejects(
      service.rerun(admin, id, { mode: "failed" }, randomUUID()),
      { status: 422 },
    );
    await db.query(
      "UPDATE platform_documents SET body=body || $1::jsonb WHERE id=$2",
      [
        JSON.stringify({
          phase: "completed",
          results: [{ id: "LAB-001", caseId: "LAB-001", status: "failed" }],
        }),
        id,
      ],
    );
    const retry = await service.rerun(
      admin,
      id,
      { mode: "failed" },
      randomUUID(),
    );
    assert.equal(retry["parentRunId"], id);
    assert.deepEqual(retry["selection"], { testIds: ["LAB-001"] });
    assert.equal((await service.get(admin, id, "run"))["phase"], "completed");
    const firstPage = await service.history(admin, localProjectId, {
      limit: 1,
      browser: "api",
    });
    assert.equal(firstPage.items.length, 1);
    assert.ok(firstPage.nextCursor);
    const secondPage = await service.history(admin, localProjectId, {
      limit: 1,
      browser: "api",
      cursor: firstPage.nextCursor,
    });
    assert.equal(secondPage.items.length, 1);
    assert.notDeepEqual(firstPage.items, secondPage.items);
    assert.equal(secondPage.nextCursor, null);
    assert.equal(
      (await service.history(admin, localProjectId, { browser: "chromium" }))
        .items.length,
      0,
    );
    await assert.rejects(
      service.history(admin, localProjectId, { cursor: "forged" }),
      { status: 422 },
    );
    const suite = await service.saveSuite(admin, localProjectId, {
      name: "Smoke",
      testIds: ["LAB-001"],
    });
    const suiteConfig = { ...config, suite: { id: suite.id, version: 1 } };
    const suiteRun = await service.launch(
      admin,
      localProjectId,
      suiteConfig,
      randomUUID(),
    );
    assert.equal((suiteRun["suite"] as { name: string }).name, "Smoke");
    await assert.rejects(
      service.launch(
        admin,
        localProjectId,
        { ...suiteConfig, selection: { testIds: ["LAB-002"] } },
        randomUUID(),
      ),
      { status: 422 },
    );
    await service.saveSuite(
      admin,
      localProjectId,
      { name: "New name", testIds: [] },
      suite.id,
      '"1"',
    );
    await assert.rejects(
      service.launch(admin, localProjectId, suiteConfig, randomUUID()),
      { status: 412 },
    );
    assert.equal(
      (
        (await service.get(admin, String(suiteRun["id"]), "run"))["suite"] as {
          name: string;
        }
      ).name,
      "Smoke",
    );
    await assert.rejects(
      service.saveSuite(
        admin,
        localProjectId,
        { name: "Stale", testIds: [] },
        suite.id,
        '"1"',
      ),
      { status: 412 },
    );
  } finally {
    await db.close();
  }
});
