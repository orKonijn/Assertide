import assert from 'node:assert/strict';
import { test } from 'node:test';

import express from 'express';

import { mountAdministration } from '../src/administration.ts';
import { IdentityService } from '../src/identity.ts';
import { mountPlatform, PlatformService } from '../src/platform.ts';
import { allowAuthAttempt, provisionPersonalWorkspace, safeReturnTo } from '../src/registration.ts';
import { testDatabase } from './database.ts';

await test('verified provisioning is atomic, idempotent and isolated from other workspaces', async () => {
  const db = await testDatabase();
  try {
    const identity = new IdentityService(db, 'http://127.0.0.1');
    await identity.initialize();
    const platform = new PlatformService(db);
    await platform.initialize();
    await assert.rejects(provisionPersonalWorkspace(db, 'unverified', 'Unverified', false));
    const owners = await Promise.all(
      Array.from({ length: 8 }, () =>
        provisionPersonalWorkspace(db, 'stable-provider-subject', 'Sample owner', true),
      ),
    );
    assert.equal(new Set(owners.map((p) => p.organizationId)).size, 1);
    const owner = owners[0]!;
    assert.equal(owner.role, 'administrator');
    assert.equal(owner.personalWorkspace, true);
    assert.equal(owner.onboardingComplete, false);
    const other = await provisionPersonalWorkspace(db, 'different-subject', 'Sample owner', true);
    assert.notEqual(owner.organizationId, other.organizationId);
    assert.equal(
      (await db.query("SELECT id FROM platform_documents WHERE kind='project'")).rows.length,
      2,
    );
    assert.equal(
      (await db.query("SELECT id FROM platform_documents WHERE kind='run'")).rows.length,
      0,
    );
    await assert.rejects(platform.list(other, owner.projectIds[0]!, 'project'), { status: 404 });
    await db.query(
      "CREATE FUNCTION fail_signup() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''controlled failure''; END;'",
    );
    await db.query(
      'CREATE TRIGGER fail_signup BEFORE INSERT ON platform_documents FOR EACH ROW EXECUTE FUNCTION fail_signup()',
    );
    await assert.rejects(provisionPersonalWorkspace(db, 'retry-subject', 'Retry', true));
    assert.equal(
      (await db.query("SELECT subject FROM memberships WHERE subject='retry-subject'")).rows.length,
      0,
    );
    await db.query('DROP TRIGGER fail_signup ON platform_documents');
    await provisionPersonalWorkspace(db, 'retry-subject', 'Retry', true);
    for (let i = 0; i < 20; i++) {
      assert.equal(await allowAuthAttempt(db, 'controlled-client'), true);
    }
    assert.equal(await allowAuthAttempt(db, 'controlled-client'), false);
    for (let i = 0; i < 200; i++) {
      assert.equal(await allowAuthAttempt(db, 'controlled-local-fixture', 200), true);
    }
    assert.equal(await allowAuthAttempt(db, 'controlled-local-fixture', 200), false);
    await assert.rejects(allowAuthAttempt(db, 'invalid', 201), /Invalid authentication rate limit/);
    await db.query("UPDATE auth_rate_limits SET expires_at=now()-interval '1 second'");
    assert.equal(await allowAuthAttempt(db, 'controlled-client'), true);
  } finally {
    await db.close();
  }
});

await test('guest browser preferences cannot grant API reads, writes or execution', async () => {
  const db = await testDatabase();
  const identity = new IdentityService(db, 'http://127.0.0.1');
  await identity.initialize();
  const platform = new PlatformService(db);
  await platform.initialize();
  const app = express();
  app.use(express.json());
  mountPlatform(app, platform, identity);
  mountAdministration(app, identity, platform);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    for (const [method, path] of [
      ['GET', '/v1/projects'],
      ['POST', '/v1/projects'],
      ['GET', '/v1/projects/00000000-0000-4000-8000-000000000010/catalog'],
      ['POST', '/v1/projects/00000000-0000-4000-8000-000000000010/runs'],
      ['GET', '/v1/members'],
    ] as const) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method,
        headers: {
          Cookie: 'assertide_guest=true; assertide_session=guest',
          Origin: 'http://127.0.0.1',
          'Content-Type': 'application/json',
        },
        ...(method === 'POST' ? { body: '{}' } : {}),
      });
      assert.equal(response.status, 401);
    }
    assert.equal(
      (await db.query("SELECT id FROM platform_documents WHERE kind='run'")).rows.length,
      0,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await db.close();
  }
});

await test('return destinations reject external, credential, auth-loop and encoded redirect paths', () => {
  for (const value of [
    'https://evil.invalid/',
    '//evil.invalid/',
    'javascript:alert(1)',
    '/auth/register',
    '/register',
    '/\\evil.invalid',
    '/%2f%2fevil.invalid',
    'https://user@assertide.test/',
  ]) {
    assert.equal(safeReturnTo(value, 'https://assertide.test'), '/');
  }
  assert.equal(
    safeReturnTo('/explorer?query=LAB', 'https://assertide.test'),
    '/explorer?query=LAB',
  );
});
