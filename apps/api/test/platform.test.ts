import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connectDatabase } from "../src/database.ts";
import { PlatformService, localProjectId } from "../src/platform.ts";
import type { Principal } from "../src/identity.ts";

test("platform authorization, suite concurrency, launch deduplication and cancellation ownership", async () => {
  const db = await connectDatabase();
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
    catalogRevision: "local-lab-v1",
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
    const suite = await service.saveSuite(admin, localProjectId, {
      name: "Smoke",
      testIds: ["LAB-001"],
    });
    await service.saveSuite(
      admin,
      localProjectId,
      { name: "New name", testIds: [] },
      suite.id,
      '"1"',
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
