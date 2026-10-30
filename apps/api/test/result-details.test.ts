import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import express from 'express';

import { IdentityService } from '../src/identity.ts';
import { localProjectId, mountPlatform, PlatformService } from '../src/platform.ts';
import { assertionValues, classifyResult } from '../src/result-details.ts';
import { testDatabase } from './database.ts';
await test('failure categories have ordered, versionable rules without inferring root cause', () => {
  assert.deepEqual(assertionValues('Expected: 200\nReceived: 500'), {
    expected: '200',
    actual: '500',
  });
  assert.equal(assertionValues('Network error'), undefined);
  assert.equal(classifyResult('interrupted', '401 timeout', true), 'canceled');
  assert.equal(classifyResult('failed', '401 timeout', true), 'infrastructure');
  assert.equal(classifyResult('failed', '401 timeout'), 'authentication');
  assert.equal(classifyResult('timedOut', 'Expected schema'), 'timeout');
  assert.equal(classifyResult('failed', 'schema mismatch Expected:'), 'contract');
  assert.equal(classifyResult('failed', 'Expected: 200 Received: 500'), 'assertion');
  assert.equal(classifyResult('failed', 'unclassified'), 'unknown');
  assert.equal(classifyResult('passed', '401'), 'none');
});
await test('result annotations enforce roles and project scope without rewriting outcomes', async () => {
  const db = await testDatabase();
  const identity = new IdentityService(db, 'http://127.0.0.1');
  const platform = new PlatformService(db);
  await identity.initialize();
  await platform.initialize();
  const org = randomUUID();
  const tokens: Record<string, string> = {};
  for (const [subject, role] of [
    ['writer', 'operator'],
    ['reader', 'viewer'],
  ] as const) {
    await identity.provision({
      subject,
      name: subject,
      role,
      organizationId: org,
      projectIds: [localProjectId],
    });
    const token = randomBytes(32).toString('hex');
    tokens[subject] = token;
    await db.query(
      "INSERT INTO sessions(digest,subject,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [createHash('sha256').update(token).digest('hex'), subject],
    );
  }
  const id = randomUUID();
  const run = {
    id,
    projectId: localProjectId,
    phase: 'completed',
    results: [{ id: 'LAB-001', status: 'failed', error: 'Original error' }],
  };
  await db.query(
    "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'run',$4)",
    [id, org, localProjectId, JSON.stringify(run)],
  );
  const app = express();
  app.use(express.json());
  mountPlatform(app, platform, identity);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const request = (subject: string, body?: unknown, target = id): Promise<Response> =>
    fetch(`http://127.0.0.1:${address.port}/v1/runs/${target}/annotations`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Cookie: `assertide_session=${tokens[subject]}`,
        Origin: 'http://127.0.0.1',
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    assert.equal((await request('reader', { resultId: 'LAB-001', text: 'Forbidden' })).status, 403);
    assert.equal((await request('writer', { resultId: 'LAB-999', text: 'Missing' })).status, 404);
    assert.equal(
      (
        await request('writer', {
          resultId: 'LAB-001',
          text: 'Investigating fixture setup',
        })
      ).status,
      201,
    );
    const response = await request('reader');
    assert.equal(response.status, 200);
    const notes = await response.json();
    assert.equal(notes.items.length, 1);
    assert.equal(notes.items[0].author, 'writer');
    assert.equal(notes.items[0].text, 'Investigating fixture setup');
    assert.ok(notes.items[0].createdAt);
    assert.deepEqual(
      (await db.query<{ body: unknown }>('SELECT body FROM platform_documents WHERE id=$1', [id]))
        .rows[0]?.body,
      run,
    );
    await db.query(
      "UPDATE platform_documents SET project_id=$2::uuid,body=jsonb_set(body,'{projectId}',to_jsonb($2::uuid::text)) WHERE id=$1",
      [id, randomUUID()],
    );
    assert.equal((await request('reader')).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
