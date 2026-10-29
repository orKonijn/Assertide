import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { testDatabase } from "./database.ts";
import { PlatformService, localProjectId } from "../src/platform.ts";
import { IdentityService, type Principal } from "../src/identity.ts";
import {
  captureAttachments,
  expireArtifacts,
  mountArtifacts,
} from "../src/artifacts.ts";

test("artifact access is scoped, redacted, audited and expires with a tombstone", async () => {
  const db = await testDatabase();
  const platform = new PlatformService(db);
  const identity = new IdentityService(db, "http://127.0.0.1");
  await platform.initialize();
  await identity.initialize();
  const principal: Principal = {
    subject: "artifact-reader",
    name: "Reader",
    organizationId: "00000000-0000-4000-8000-000000000001",
    role: "viewer",
    projectIds: [localProjectId],
  };
  await identity.provision(principal);
  const session = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions(digest,subject,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [createHash("sha256").update(session).digest("hex"), principal.subject],
  );
  const id = randomUUID();
  const directory = fileURLToPath(
    new URL(`../../../.local/runs/${id}/`, import.meta.url),
  );
  await mkdir(directory, { recursive: true });
  const artifacts = await captureAttachments(
    id,
    "LAB-001",
    1,
    [
      {
        name: "safe-response.json",
        contentType: "application/json",
        body: Buffer.from('{"token":"secret"}').toString("base64"),
      },
    ],
    (value) => value.replace("secret", "[REDACTED]"),
  );
  const artifact = artifacts[0]!;
  await db.query(
    "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'run',$4)",
    [
      id,
      principal.organizationId,
      localProjectId,
      JSON.stringify({ id, projectId: localProjectId, artifacts }),
    ],
  );
  const app = express();
  mountArtifacts(app, identity, platform);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/v1/runs/${id}/artifacts/${artifact.id}`;
  const headers = { Cookie: `assertide_session=${session}` };
  try {
    assert.equal((await fetch(url)).status, 401);
    const response = await fetch(url, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { token: "[REDACTED]" });
    assert.equal(
      (await platform.list(principal, localProjectId, "audit")).length,
      1,
    );
    await identity.provision({ ...principal, projectIds: [] });
    assert.equal((await fetch(url, { headers })).status, 404);
    await identity.provision(principal);
    await expireArtifacts(db, new Date(Date.now() + 31 * 86400000));
    assert.equal((await fetch(url, { headers })).status, 410);
    await assert.rejects(
      access(path.join(directory, "artifacts", artifact.id)),
    );
    const run = await platform.get(principal, id, "run");
    assert.match(
      JSON.stringify(run["artifacts"]),
      /Expired under evidence retention policy/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
