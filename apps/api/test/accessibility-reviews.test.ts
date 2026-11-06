import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import express from 'express';
import { z } from 'zod';

import { accessibilityFindings } from '../src/accessibility-reviews.ts';
import { IdentityService } from '../src/identity.ts';
import { localProjectId, mountPlatform, PlatformService } from '../src/platform.ts';
import { testDatabase } from './database.ts';

const reviewList = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      version: z.number(),
      owner: z.string(),
      exceptionState: z.string(),
    }),
  ),
});
await test('accessibility ownership, exception approval, concurrency and expiry are scoped and never rewrite outcomes', async () => {
  const db = await testDatabase();
  const identity = new IdentityService(db, 'http://127.0.0.1');
  const platform = new PlatformService(db);
  await identity.initialize();
  await platform.initialize();
  const org = randomUUID();
  const tokens: Record<string, string> = {};
  for (const [subject, role] of [
    ['reviewer', 'operator'],
    ['reader', 'viewer'],
    ['approver', 'administrator'],
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
  const run = {
    id: randomUUID(),
    projectId: localProjectId,
    phase: 'completed',
    config: { environmentId: 'local-lab' },
    results: [{ id: 'UI-001:chromium', status: 'passed' }],
    accessibility: [
      {
        resultId: 'UI-001:chromium',
        checkpoint: {
          version: 1,
          state: 'final',
          status: 'checked',
          engine: '4.14.0',
          viewport: null,
          violations: [
            {
              id: 'label',
              impact: 'critical',
              description: 'Inputs need labels',
              helpUrl: 'https://dequeuniversity.com/rules/axe/4.14/label',
              nodes: 1,
            },
          ],
          incomplete: 0,
          truncated: false,
        },
      },
    ],
  };
  await db.query(
    "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'run',$4)",
    [run.id, org, localProjectId, JSON.stringify(run)],
  );
  const app = express();
  app.use(express.json());
  mountPlatform(app, platform, identity);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const path = `http://127.0.0.1:${address.port}/v1/runs/${run.id}/results/UI-001%3Achromium/accessibility/reviews`;
  const request = (
    subject: string,
    body?: unknown,
    version = 0,
    origin = 'http://127.0.0.1',
    finding = accessibilityFindings(run, 'UI-001:chromium')[0]!.id,
  ): Promise<Response> =>
    fetch(path + (body ? `/${finding}` : ''), {
      method: body ? 'PATCH' : 'GET',
      headers: {
        Cookie: `assertide_session=${tokens[subject]}`,
        Origin: origin,
        'Content-Type': 'application/json',
        'If-Match': `"${version}"`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const input = {
    owner: 'Frontend team',
    status: 'investigating',
    note: 'Checking the form labels',
  };
  try {
    assert.equal((await fetch(path)).status, 401);
    assert.equal((await request('reader', input)).status, 403);
    assert.equal((await request('reviewer', input, 0, 'https://other.test')).status, 403);
    assert.equal((await request('reviewer', input, 0, 'http://127.0.0.1', 'missing')).status, 404);
    const exception = {
      reason: 'Temporary fixture review pending',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
    assert.equal((await request('reviewer', { ...input, exception })).status, 403);
    const raced = await Promise.all([request('reviewer', input), request('reviewer', input)]);
    assert.deepEqual(raced.map((response) => response.status).sort(), [204, 412]);
    assert.equal((await request('reviewer', input)).status, 412);
    assert.equal(
      (
        await request(
          'approver',
          {
            ...input,
            exception: {
              ...exception,
              expiresAt: new Date(Date.now() + 31 * 86400000).toISOString(),
            },
          },
          1,
        )
      ).status,
      422,
    );
    assert.equal((await request('approver', { ...input, exception }, 1)).status, 204);
    let items = reviewList.parse(await (await request('reader')).json()).items;
    assert.equal(items[0]?.owner, 'Frontend team');
    assert.equal(items[0]?.exceptionState, 'active');
    const otherRun = { ...run, id: randomUUID() };
    assert.equal(accessibilityFindings(otherRun, 'UI-001:chromium')[0]?.id, items[0]?.id);
    assert.notEqual(
      accessibilityFindings({ ...run, config: { environmentId: 'other' } }, 'UI-001:chromium')[0]
        ?.id,
      items[0]?.id,
    );
    await db.query(
      "UPDATE platform_documents SET body=jsonb_set(body,'{exception,expiresAt}',to_jsonb($1::text)) WHERE organization_id=$2 AND kind='accessibility-review'",
      [new Date(Date.now() - 1000).toISOString(), org],
    );
    items = reviewList.parse(await (await request('reader')).json()).items;
    assert.equal(items[0]?.exceptionState, 'expired');
    assert.equal((await request('reviewer', { ...input, owner: 'New owner' }, 2)).status, 204);
    assert.deepEqual(
      (
        await db.query<{ body: unknown }>('SELECT body FROM platform_documents WHERE id=$1', [
          run.id,
        ])
      ).rows[0]?.body,
      run,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM platform_documents WHERE kind='audit' AND organization_id=$1 AND body->>'action'='accessibility.reviewed'",
          [org],
        )
      ).rows[0]?.count,
      3,
    );
    await identity.provision({
      subject: 'reader',
      name: 'reader',
      role: 'viewer',
      organizationId: org,
      projectIds: [],
    });
    assert.equal((await request('reader')).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
