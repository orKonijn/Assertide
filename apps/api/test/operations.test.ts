import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import express from "express";
import { testDatabase } from "./database.ts";
import { IdentityService } from "../src/identity.ts";
import { PlatformService, localProjectId } from "../src/platform.ts";
import { readiness, mountOperations } from "../src/operations.ts";
test("readiness detects dependency failure and operations remain scoped to authorized administrators", async () => {
  const db = await testDatabase();
  const identity = new IdentityService(db, "http://127.0.0.1");
  const platform = new PlatformService(db);
  await identity.initialize();
  await platform.initialize();
  await platform.seedLocal();
  const tokens: Record<string, string> = {};
  const org = "00000000-0000-4000-8000-000000000001";
  for (const subject of ["admin", "viewer"]) {
    await identity.provision({
      subject,
      name: subject,
      role: subject === "admin" ? "administrator" : "viewer",
      organizationId: org,
      projectIds: [localProjectId],
    });
    const token = randomBytes(32).toString("hex");
    tokens[subject] = token;
    await db.query(
      "INSERT INTO sessions(digest,subject,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [createHash("sha256").update(token).digest("hex"), subject],
    );
  }
  const app = express();
  mountOperations(app, db, identity);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await readiness(db)).status, "ready");
    const broken = await readiness({
      ...db,
      query: async () => {
        throw new Error("private database connection details");
      },
    });
    assert.equal(broken.status, "unavailable");
    assert.equal(JSON.stringify(broken).includes("private"), false);
    for (const projectId of [localProjectId, randomUUID()]) {
      const id = randomUUID();
      await db.query(
        "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'run',$4)",
        [
          id,
          org,
          projectId,
          JSON.stringify({
            id,
            phase: "queued",
            createdAt: new Date().toISOString(),
            config: { workers: 1 },
          }),
        ],
      );
    }
    assert.equal((await fetch(`${url}/ready`)).status, 200);
    assert.equal((await fetch(`${url}/v1/operations`)).status, 401);
    assert.equal(
      (
        await fetch(`${url}/v1/operations`, {
          headers: { Cookie: `assertide_session=${tokens["viewer"]}` },
        })
      ).status,
      403,
    );
    const response = await fetch(`${url}/v1/operations`, {
      headers: { Cookie: `assertide_session=${tokens["admin"]}` },
    });
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.deepEqual(state.phases, [{ phase: "queued", count: 1, workers: 1 }]);
    assert.equal(state.quota.organizationWorkers, 8);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
