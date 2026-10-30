import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import express from 'express';

import { mountAdministration } from '../src/administration.ts';
import { IdentityService } from '../src/identity.ts';
import { localProjectId, mountPlatform, PlatformService } from '../src/platform.ts';
import { testDatabase } from './database.ts';

await test('project and membership administration enforces scope, versions and immediate revocation', async () => {
  const db = await testDatabase();
  const identity = new IdentityService(db, 'http://127.0.0.1');
  const platform = new PlatformService(db);
  await identity.initialize();
  await platform.initialize();
  await platform.seedLocal();
  const org = '00000000-0000-4000-8000-000000000001';
  const tokens: Record<string, string> = {};
  for (const subject of ['admin', 'viewer']) {
    await identity.provision({
      subject,
      name: subject,
      role: subject === 'admin' ? 'administrator' : 'viewer',
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
  const app = express();
  app.use(express.json());
  mountPlatform(app, platform, identity);
  mountAdministration(app, identity, platform);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const request = (
    path: string,
    method = 'GET',
    body?: unknown,
    subject = 'admin',
    version?: number,
  ): Promise<Response> =>
    fetch(`http://127.0.0.1:${address.port}/v1${path}`, {
      method,
      headers: {
        Cookie: `assertide_session=${tokens[subject]}`,
        Origin: 'http://127.0.0.1',
        'Content-Type': 'application/json',
        ...(version ? { 'If-Match': `"${version}"` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    assert.equal((await request('/projects', 'POST', { name: 'Forbidden' }, 'viewer')).status, 403);
    const created = await request('/projects', 'POST', {
      name: 'Payments',
      description: 'Contract coverage',
    });
    assert.equal(created.status, 201);
    const project = await created.json();
    assert.equal(
      (await request(`/projects/${project.id}`, 'PATCH', { name: 'Payments QA' }, 'admin', 1))
        .status,
      200,
    );
    assert.equal(
      (await request(`/projects/${project.id}`, 'PATCH', { name: 'Stale' }, 'admin', 1)).status,
      412,
    );
    assert.equal(
      (await request(`/projects/${project.id}/catalog`, 'GET', undefined, 'viewer')).status,
      404,
    );
    const members = (await (await request('/members')).json()).items;
    const viewer = members.find((member: { subject: string }) => member.subject === 'viewer');
    assert.equal(
      (
        await request(
          '/members',
          'POST',
          {
            subject: 'viewer',
            name: 'Reviewer',
            role: 'viewer',
            projectIds: [project.id],
          },
          'admin',
          viewer.version,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request(`/projects/${project.id}/catalog`, 'GET', undefined, 'viewer')).status,
      200,
    );
    assert.equal(
      (await request(`/projects/${localProjectId}/catalog`, 'GET', undefined, 'viewer')).status,
      404,
    );
    assert.equal(
      (
        await request(
          '/members',
          'POST',
          {
            subject: 'viewer',
            name: 'Stale',
            role: 'administrator',
            projectIds: [],
          },
          'admin',
          viewer.version,
        )
      ).status,
      412,
    );
    assert.equal(
      (
        await request(
          '/members',
          'POST',
          { subject: 'admin', name: 'Admin', role: 'viewer', projectIds: [] },
          'admin',
          1,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request('/members', 'POST', {
          subject: 'outsider',
          name: 'Outsider',
          role: 'viewer',
          projectIds: [randomUUID()],
        })
      ).status,
      403,
    );
    await identity.provision(
      {
        subject: 'viewer',
        name: 'Bootstrap',
        role: 'viewer',
        organizationId: org,
        projectIds: [localProjectId],
      },
      false,
    );
    assert.equal(
      (await request(`/projects/${localProjectId}/catalog`, 'GET', undefined, 'viewer')).status,
      404,
    );
    assert.equal((await request('/members', 'GET', undefined, 'viewer')).status, 403);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await db.close();
  }
});
