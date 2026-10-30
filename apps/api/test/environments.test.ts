import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import express from "express";
import { testDatabase } from "./database.ts";
import { IdentityService, type Principal } from "../src/identity.ts";
import {
  PlatformService,
  mountPlatform,
  localProjectId,
} from "../src/platform.ts";
import {
  defaultEnvironment,
  mountEnvironments,
  resolveSecret,
} from "../src/environments.ts";

test("environment policies freeze versioned encrypted credentials and reject forbidden launches", async () => {
  process.env["SECRET_ENCRYPTION_KEY"] = randomBytes(32).toString("hex");
  const db = await testDatabase();
  const identity = new IdentityService(db, "http://127.0.0.1");
  const platform = new PlatformService(db);
  await identity.initialize();
  await platform.initialize();
  const principal: Principal = {
    subject: "admin",
    name: "Admin",
    role: "administrator",
    organizationId: "00000000-0000-4000-8000-000000000001",
    projectIds: [localProjectId],
  };
  await identity.provision(principal);
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions(digest,subject,expires_at) VALUES($1,'admin',now()+interval '1 hour')",
    [createHash("sha256").update(token).digest("hex")],
  );
  const app = express();
  app.use(express.json());
  mountPlatform(app, platform, identity);
  mountEnvironments(app, identity, platform);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const request = (path: string, body?: unknown, version?: number) =>
    fetch(
      `http://127.0.0.1:${address.port}/v1/projects/${localProjectId}/${path}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: `assertide_session=${token}`,
          Origin: "http://127.0.0.1",
          "Content-Type": "application/json",
          ...(version === undefined ? {} : { "If-Match": `"${version}"` }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
  try {
    const secretValue = randomBytes(24).toString("hex");
    const created = await request("secrets", {
      name: "Lab password",
      value: secretValue,
    });
    assert.equal(created.status, 201);
    const ref = await created.json();
    assert.equal(JSON.stringify(ref).includes(secretValue), false);
    assert.equal(
      (await (await request("secrets")).text()).includes(secretValue),
      false,
    );
    const ciphertext = (
      await db.query<{ ciphertext: string }>(
        "SELECT ciphertext FROM secret_versions WHERE id=$1",
        [ref.id],
      )
    ).rows[0]?.ciphertext;
    assert.ok(ciphertext);
    assert.equal(ciphertext.includes(secretValue), false);
    assert.equal(
      await resolveSecret(db, principal.organizationId, localProjectId, ref),
      secretValue,
    );
    await assert.rejects(
      resolveSecret(db, principal.organizationId, randomUUID(), ref),
    );
    const env = {
      ...defaultEnvironment,
      id: "restricted",
      name: "Restricted",
      maxWorkers: 1,
      maxRetries: 0,
      allowVideo: false,
      passwordRef: { id: ref.id, version: ref.version },
    };
    assert.equal(
      (
        await request(
          "environments",
          { ...env, apiUrl: "http://169.254.169.254/" },
          0,
        )
      ).status,
      422,
    );
    assert.equal((await request("environments", env, 0)).status, 200);
    assert.equal((await request("environments", env, 0)).status, 412);
    const input = {
      catalogRevision: platform.revision,
      selection: { testIds: ["LAB-001"] },
      environmentId: "restricted",
      browserProjects: [],
      workers: 1,
      retries: 0,
      headed: false,
      video: "off",
    };
    await assert.rejects(
      platform.launch(
        principal,
        localProjectId,
        { ...input, workers: 2 },
        randomUUID(),
      ),
      /policy/,
    );
    const run = await platform.launch(
      principal,
      localProjectId,
      input,
      randomUUID(),
    );
    assert.equal(JSON.stringify(run).includes(secretValue), false);
    await assert.rejects(
      platform.launch(
        principal,
        localProjectId,
        { ...input, headed: true },
        randomUUID(),
      ),
      /policy/,
    );
    assert.equal(
      (
        await request(
          "secrets",
          { id: ref.id, name: "Lab password", value: "rotated-password-value" },
          1,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          "secrets",
          { id: ref.id, name: "Lab password", value: "stale-password-value" },
          1,
        )
      ).status,
      412,
    );
    assert.equal(
      await resolveSecret(db, principal.organizationId, localProjectId, ref),
      secretValue,
    );
    const snapshot = run["environment"] as {
      passwordRef: { id: string; version: number };
    };
    assert.equal(snapshot.passwordRef.version, 1);
    const runtime = process.env["WORKER_RUNTIME"];
    try {
      assert.equal(
        (
          await request(
            "environments",
            { ...env, id: "headed", allowHeaded: true },
            0,
          )
        ).status,
        200,
      );
      const headedInput = {
        ...input,
        environmentId: "headed",
        headed: true,
        selection: { testIds: ["UI-001"] },
        browserProjects: ["chromium"],
      };
      process.env["WORKER_RUNTIME"] = "local";
      await assert.rejects(
        platform.launch(principal, localProjectId, headedInput, randomUUID()),
        /policy/,
      );
      process.env["WORKER_RUNTIME"] = "oci";
      const headedRun = await platform.launch(
        principal,
        localProjectId,
        headedInput,
        randomUUID(),
      );
      assert.equal((headedRun["config"] as { headed: boolean }).headed, true);
    } finally {
      if (runtime === undefined) delete process.env["WORKER_RUNTIME"];
      else process.env["WORKER_RUNTIME"] = runtime;
    }
    assert.equal(
      (await request("environments", { ...env, enabled: false }, 1)).status,
      200,
    );
    await assert.rejects(
      platform.launch(principal, localProjectId, input, randomUUID()),
      /unavailable/,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await db.close();
    delete process.env["SECRET_ENCRYPTION_KEY"];
  }
});
