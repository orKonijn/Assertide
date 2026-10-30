import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import pg from "pg";
import { connectDatabase, type SqlConnection } from "../src/database.ts";
import { backupDatabase, restoreDatabase } from "../src/database-backup.ts";
import { PlatformService, localProjectId } from "../src/platform.ts";
import { IdentityService } from "../src/identity.ts";
import { mountEnvironments, resolveSecret } from "../src/environments.ts";
const adminUrl = process.env["TEST_DATABASE_URL"];
if (!adminUrl)
  throw new Error("Restore drill requires an isolated PostgreSQL service");
const admin = new pg.Pool({ connectionString: adminUrl });
const prefix = `assertide_drill_${randomUUID().replaceAll("-", "")}`;
const sourceName = `${prefix}_source`;
const destinationName = `${prefix}_restore`;
const created: string[] = [];
const url = (name: string) => {
  const parsed = new URL(adminUrl);
  parsed.pathname = `/${name}`;
  return parsed.href;
};
let source: SqlConnection | undefined;
let restored: SqlConnection | undefined;
try {
  for (const name of [sourceName, destinationName]) {
    assert.match(name, /^assertide_drill_[a-f0-9]+_(source|restore)$/);
    await admin.query(`CREATE DATABASE ${name}`);
    created.push(name);
  }
  source = await connectDatabase(url(sourceName));
  const identity = new IdentityService(source, "http://127.0.0.1");
  const platform = new PlatformService(source);
  await identity.initialize();
  await platform.initialize();
  await platform.seedLocal();
  const principal = {
    subject: "restore-admin",
    name: "Restore administrator",
    role: "administrator" as const,
    organizationId: "00000000-0000-4000-8000-000000000001",
    projectIds: [localProjectId],
  };
  await identity.provision(principal);
  const run = await platform.launch(
    principal,
    localProjectId,
    {
      catalogRevision: platform.revision,
      selection: { testIds: ["LAB-001"] },
      environmentId: "local-lab",
      browserProjects: [],
      workers: 1,
      retries: 0,
      headed: false,
      video: "off",
    },
    randomUUID(),
  );
  const token = randomBytes(32).toString("hex");
  await source.query(
    "INSERT INTO sessions(digest,subject,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [createHash("sha256").update(token).digest("hex"), principal.subject],
  );
  process.env["SECRET_ENCRYPTION_KEY"] = randomBytes(32).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const app = express();
  app.use(express.json());
  mountEnvironments(app, identity, platform);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  let reference: { id: string; version: number };
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/v1/projects/${localProjectId}/secrets`,
      {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1",
          Cookie: `assertide_session=${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Recovery fixture", value: secret }),
      },
    );
    assert.equal(response.status, 201);
    reference = await response.json();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const directory = fileURLToPath(
    new URL("../../../.local/verification/", import.meta.url),
  );
  await mkdir(directory, { recursive: true });
  const backup = `${directory}${prefix}.dump`;
  const started = performance.now();
  const metadata = await backupDatabase(url(sourceName), backup);
  const backupMs = performance.now() - started;
  const key = process.env["SECRET_ENCRYPTION_KEY"];
  process.env["SECRET_ENCRYPTION_KEY"] = randomBytes(32).toString("hex");
  await assert.rejects(
    restoreDatabase(url(destinationName), backup),
    /matching secret/,
  );
  process.env["SECRET_ENCRYPTION_KEY"] = key;
  const restoreStarted = performance.now();
  await restoreDatabase(url(destinationName), backup);
  const restoreMs = performance.now() - restoreStarted;
  restored = await connectDatabase(url(destinationName));
  const recovered = new PlatformService(restored);
  const recoveredRun = await recovered.get(principal, String(run["id"]), "run");
  assert.equal(recoveredRun["phase"], "queued");
  assert.equal(
    (
      await restored.query("SELECT run_id FROM run_outbox WHERE run_id=$1", [
        run["id"],
      ])
    ).rows.length,
    1,
  );
  assert.equal(
    await resolveSecret(
      restored,
      principal.organizationId,
      localProjectId,
      reference,
    ),
    secret,
  );
  assert.equal(
    (
      await restored.query("SELECT subject FROM memberships WHERE subject=$1", [
        principal.subject,
      ])
    ).rows.length,
    1,
  );
  await assert.rejects(
    restoreDatabase(url(destinationName), backup),
    /empty database/,
  );
  const original = await readFile(backup);
  await writeFile(backup, Buffer.concat([original, Buffer.from("corrupt")]));
  await assert.rejects(
    restoreDatabase(url(destinationName), backup),
    /integrity/,
  );
  await writeFile(backup, original);
  delete process.env["SECRET_ENCRYPTION_KEY"];
  await assert.rejects(
    backupDatabase(url(sourceName), `${backup}.missing-key`),
    /encryption key separately/,
  );
  // Ciphertext format controls legacy-key requirements; Transit decryption is tested against real Vault separately.
  await source.query(
    "UPDATE secret_versions SET ciphertext='vault:v1:synthetic-backup-policy-fixture'",
  );
  const transitBackup = await backupDatabase(
    url(sourceName),
    `${backup}.vault`,
  );
  assert.equal(transitBackup.encryptionKeyFingerprint, null);
  process.env["SECRET_ENCRYPTION_KEY"] = key;
  const result = {
    recordedAt: new Date().toISOString(),
    backupMs: Math.round(backupMs),
    restoreMs: Math.round(restoreMs),
    bytes: metadata.bytes,
    sha256: metadata.sha256,
    verified: [
      "project-scoped run",
      "outbox",
      "membership",
      "encrypted credential recovery",
      "wrong-key refusal",
      "nonempty-target refusal",
      "corrupt-backup refusal",
      "legacy backup refuses missing key",
      "Vault ciphertext does not require a legacy AES key",
    ],
    scope:
      "Synthetic PostgreSQL database drill; object versions are verified separately; no production RPO claimed",
  };
  await writeFile(
    directory + "restore-drill.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await source?.close();
  await restored?.close();
  for (const name of created) {
    assert.match(name, /^assertide_drill_[a-f0-9]+_(source|restore)$/);
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
  }
  await admin.end();
}
