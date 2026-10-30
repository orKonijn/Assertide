import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import express from 'express';
import { z } from 'zod';

import { IdentityService } from '../src/identity.ts';
import { localProjectId, mountPlatform, PlatformService } from '../src/platform.ts';
import { mountServiceAccounts } from '../src/service-accounts.ts';
import { testDatabase } from './database.ts';

await test('CI credentials are project-scoped, write-only, rotatable and immediately revocable', async () => {
  const db = await testDatabase();
  const identity = new IdentityService(db, 'http://127.0.0.1');
  const platform = new PlatformService(db);
  await identity.initialize();
  await platform.initialize();
  await identity.provision({
    subject: 'admin',
    name: 'Admin',
    role: 'administrator',
    organizationId: '00000000-0000-4000-8000-000000000001',
    projectIds: [localProjectId],
  });
  const session = randomBytes(32).toString('hex');
  await db.query(
    "INSERT INTO sessions(digest,subject,expires_at) VALUES($1,'admin',now()+interval '1 hour')",
    [createHash('sha256').update(session).digest('hex')],
  );
  const app = express();
  app.use(express.json());
  mountPlatform(app, platform, identity);
  mountServiceAccounts(app, identity, platform);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const base = `${origin}/v1/projects/${localProjectId}/service-accounts`;
  const headers = {
    Cookie: `assertide_session=${session}`,
    Origin: 'http://127.0.0.1',
    'Content-Type': 'application/json',
  };
  try {
    const created = await fetch(base, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'CI fixture', days: 1 }),
    });
    assert.equal(created.status, 201);
    const credential = z
      .object({ id: z.uuid(), token: z.string(), version: z.number() })
      .parse(await created.json());
    const listed = await (await fetch(base, { headers })).text();
    assert.equal(listed.includes(credential.token), false);
    assert.equal(listed.includes('"digest"'), false);
    const machine = {
      Authorization: `Bearer ${credential.token}`,
      'Content-Type': 'application/json',
    };
    const launch = await fetch(`${origin}/v1/projects/${localProjectId}/runs`, {
      method: 'POST',
      headers: { ...machine, 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({
        catalogRevision: platform.revision,
        selection: { testIds: ['LAB-001'] },
        environmentId: 'local-lab',
        browserProjects: [],
        workers: 1,
        retries: 0,
        headed: false,
        video: 'off',
        commitSha: 'a'.repeat(40),
      }),
    });
    assert.equal(launch.status, 202);
    assert.equal((await launch.json()).config.commitSha, 'a'.repeat(40));
    assert.equal(
      (
        await fetch(`${origin}/v1/projects/${randomUUID()}/catalog`, {
          headers: machine,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${origin}/v1/projects/${localProjectId}/suites`, {
          method: 'POST',
          headers: machine,
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal((await fetch(base, { headers: machine })).status, 403);
    const rotated = await fetch(`${base}/${credential.id}/rotate`, {
      method: 'POST',
      headers: { ...headers, 'If-Match': '"1"' },
      body: '{}',
    });
    assert.equal(rotated.status, 200);
    const next = z.object({ token: z.string() }).parse(await rotated.json());
    const history = `${origin}/v1/runs?projectId=${localProjectId}`;
    assert.equal((await fetch(history, { headers: machine })).status, 401);
    assert.equal(
      (
        await fetch(history, {
          headers: { Authorization: `Bearer ${next.token}` },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(`${base}/${credential.id}/revoke`, {
          method: 'POST',
          headers: { ...headers, 'If-Match': '"2"' },
          body: '{}',
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(history, {
          headers: { Authorization: `Bearer ${next.token}` },
        })
      ).status,
      401,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
