import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { bootstrap } from '../scripts/bootstrap.ts';
import { testDatabase } from './database.ts';

await test('offline bootstrap creates a scoped owner and rolls back duplicate membership', async () => {
  const db = await testDatabase();
  const input = {
    organizationId: randomUUID(),
    projectId: randomUUID(),
    projectName: 'Bootstrap fixture',
    subject: randomUUID(),
    name: 'Fixture owner',
  };
  try {
    await bootstrap(db, input, 'https://app.example.test');
    const project = (
      await db.query<{ id: string; project_id: string; organization_id: string }>(
        'SELECT id,project_id,organization_id FROM platform_documents WHERE id=$1',
        [input.projectId],
      )
    ).rows[0];
    assert.equal(project?.id, input.projectId);
    assert.equal(project?.project_id, input.projectId);
    assert.equal(project?.organization_id, input.organizationId);
    const member = (
      await db.query<{ body: { role: string; projectIds: string[] } }>(
        'SELECT body FROM memberships WHERE subject=$1',
        [input.subject],
      )
    ).rows[0];
    assert.equal(member?.body.role, 'administrator');
    assert.deepEqual(member?.body.projectIds, [input.projectId]);
    const secondId = randomUUID();
    await assert.rejects(
      bootstrap(db, { ...input, projectId: secondId }, 'https://app.example.test'),
    );
    assert.equal(
      (await db.query('SELECT id FROM platform_documents WHERE id=$1', [secondId])).rows.length,
      0,
    );
    await assert.rejects(bootstrap(db, input, 'https://app.example.test'));
    assert.equal((await db.query('SELECT subject FROM memberships')).rows.length, 1);
  } finally {
    await db.close();
  }
});
