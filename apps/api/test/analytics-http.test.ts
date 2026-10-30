import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import express from "express";
import { testDatabase } from "./database.ts";
import { IdentityService } from "../src/identity.ts";
import { PlatformService, localProjectId } from "../src/platform.ts";
import { mountAnalytics } from "../src/analytics.ts";
test("analytics compares equal UTC intervals with identical scoped filters and exclusive boundaries", async () => {
  const db = await testDatabase();
  const identity = new IdentityService(db, "http://127.0.0.1");
  const platform = new PlatformService(db);
  await identity.initialize();
  await platform.initialize();
  const org = randomUUID();
  await identity.provision({
    subject: "analyst",
    name: "Analyst",
    role: "viewer",
    organizationId: org,
    projectIds: [localProjectId],
  });
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions(digest,subject,expires_at) VALUES($1,'analyst',now()+interval '1 hour')",
    [createHash("sha256").update(token).digest("hex")],
  );
  for (const [endedAt, status, environment, project, phase] of [
    ["2026-01-01T12:00:00Z", "failed", "qa", localProjectId, "completed"],
    ["2026-01-02T00:00:00Z", "passed", "qa", localProjectId, "completed"],
    ["2026-01-03T00:00:00Z", "failed", "qa", localProjectId, "completed"],
    ["2026-01-02T12:00:00Z", "failed", "other", localProjectId, "completed"],
    ["2026-01-02T12:00:00Z", "failed", "qa", randomUUID(), "completed"],
    ["2026-01-02T12:00:00Z", "failed", "qa", localProjectId, "running"],
  ])
    await db.query(
      "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'run',$4)",
      [
        randomUUID(),
        org,
        project,
        JSON.stringify({
          phase,
          endedAt,
          config: { environmentId: environment },
          results: [{ id: "LAB-001", status }],
        }),
      ],
    );
  const app = express();
  mountAnalytics(app, identity, platform);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/v1/projects/${localProjectId}/analytics`;
  const request = (query: string) =>
    fetch(`${base}?${query}`, {
      headers: { Cookie: `assertide_session=${token}` },
    });
  try {
    assert.equal((await fetch(base)).status, 401);
    const query = "from=2026-01-02&to=2026-01-02&environment=qa&browser=api";
    const response = await request(query);
    assert.equal(response.status, 200);
    const summary = await response.json();
    assert.equal(summary.executed, 1);
    assert.equal(summary.finalPassRate, 1);
    assert.equal(summary.comparison.executed, 1);
    assert.equal(summary.comparison.finalPassRate, 0);
    assert.equal(summary.comparison.finalPassRateChange, 1);
    assert.equal(summary.comparison.missingPriorIdentities, 0);
    assert.equal(summary.testDuration.samples, 0);
    assert.equal(
      (await (await request(query + "&status=failed")).json()).executed,
      0,
    );
    assert.equal((await request("from=2026-01-03&to=2026-01-01")).status, 422);
    assert.equal((await request("from=2026-02-30")).status, 422);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
