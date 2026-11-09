import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import express from 'express';

import { IdentityService } from '../src/identity.ts';
import { localProjectId, mountPlatform, PlatformService } from '../src/platform.ts';
import { testDatabase } from './database.ts';

await test('suite pagination is complete and history/comparison respect project and configuration scope', async () => {
  const db = await testDatabase();
  const identity = new IdentityService(db, 'http://127.0.0.1');
  const service = new PlatformService(db);
  await identity.initialize();
  await service.initialize();
  const org = randomUUID();
  const otherProject = randomUUID();
  await identity.provision({
    subject: 'history-reader',
    name: 'Reader',
    role: 'viewer',
    organizationId: org,
    projectIds: [localProjectId],
  });
  const token = randomBytes(32).toString('hex');
  await db.query(
    "INSERT INTO sessions(digest,subject,expires_at) VALUES($1,'history-reader',now()+interval '1 hour')",
    [createHash('sha256').update(token).digest('hex')],
  );
  const insert = async (
    kind: string,
    body: Record<string, unknown>,
    project = localProjectId,
  ): Promise<string> => {
    const id = randomUUID();
    await db.query(
      'INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,$4,$5)',
      [id, org, project, kind, JSON.stringify({ ...body, id, projectId: project })],
    );
    return id;
  };
  for (let i = 0; i < 205; i++) {
    await insert('suite', { name: `Suite ${i}`, testIds: [] });
  }
  await insert('suite', { name: 'Private other suite' }, otherProject);
  const config = {
    catalogRevision: 'revision',
    environmentId: 'local-lab',
    browserProjects: [],
    selection: { testIds: ['LAB-001'] },
    workers: 1,
    retries: 0,
  };
  const result = { id: 'LAB-001', status: 'passed', duration: 1000 };
  let prior = '';
  for (let i = 1; i <= 7; i++) {
    prior = await insert('run', {
      config,
      phase: 'completed',
      endedAt: `2026-11-0${i}T00:00:00Z`,
      results: [
        { ...result, duration: i * 1000 },
        { id: 'LAB-002', status: 'skipped', expectedFailure: true, duration: 0 },
      ],
    });
  }
  await insert(
    'run',
    { config, phase: 'completed', endedAt: '2026-11-08T12:00:00Z', results: [result] },
    otherProject,
  );
  await insert('run', {
    config: { ...config, environmentId: 'other' },
    phase: 'completed',
    endedAt: '2026-11-08T12:00:00Z',
    results: [result],
  });
  const current = await insert('run', {
    config,
    phase: 'running',
    createdAt: '2026-11-09T00:00:00Z',
  });
  const forbidden = await insert('run', { config, phase: 'completed' }, otherProject);
  const app = express();
  mountPlatform(app, service, identity);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/v1`;
  const get = (path: string): Promise<Response> =>
    fetch(base + path, { headers: { Cookie: `assertide_session=${token}` } });
  try {
    const suites = `/projects/${localProjectId}/suites`;
    assert.equal((await fetch(base + suites)).status, 401);
    assert.equal((await get(`/projects/${otherProject}/suites`)).status, 404);
    const first = await (await get(suites + '?limit=200')).json();
    const second = await (await get(suites + '?limit=200&cursor=' + first.nextCursor)).json();
    assert.equal(first.items.length, 200);
    assert.equal(second.items.length, 5);
    assert.equal(second.nextCursor, null);
    assert.equal(
      new Set([...first.items, ...second.items].map((r: { id: string }) => r.id)).size,
      205,
    );
    assert.equal((await get(suites + '?cursor=bad')).status, 422);
    const history = await (
      await get(`/projects/${localProjectId}/test-history?environment=local-lab&revision=revision`)
    ).json();
    assert.equal(history.items.length, 10);
    assert.deepEqual(
      history.items
        .filter((r: { id: string }) => r.id === 'LAB-001')
        .map((r: { duration: number }) => r.duration),
      [7000, 6000, 5000, 4000, 3000],
    );
    assert.ok(
      history.items
        .filter((r: { id: string }) => r.id === 'LAB-002')
        .every((r: { status: string }) => r.status === 'skipped'),
    );
    assert.equal(
      (await get(`/projects/${otherProject}/test-history?environment=local-lab&revision=revision`))
        .status,
      404,
    );
    const comparison = await (await get(`/runs/${current}/comparison`)).json();
    assert.equal(comparison.previous.id, prior);
    assert.equal((await get(`/runs/${forbidden}/comparison`)).status, 404);
    const different = await insert('run', {
      config: { ...config, retries: 1 },
      phase: 'running',
      createdAt: '2026-11-09T00:00:00Z',
    });
    assert.equal((await (await get(`/runs/${different}/comparison`)).json()).previous, null);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
