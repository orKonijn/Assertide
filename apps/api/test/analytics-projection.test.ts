import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { initializeAnalyticsProjection } from '../src/analytics-projection.ts';
import { testDatabase } from './database.ts';

await test('incremental analytics backfills, excludes live/quarantined results and rolls back with its source', async () => {
  const db = await testDatabase();
  try {
    await db.query(
      'CREATE TABLE platform_documents(id text PRIMARY KEY, organization_id uuid NOT NULL, project_id uuid NOT NULL, kind text NOT NULL, body jsonb NOT NULL)',
    );
    const org = randomUUID(),
      project = randomUUID(),
      id = randomUUID();
    const body = {
      phase: 'completed',
      endedAt: '2026-10-01T00:00:00Z',
      results: [
        {
          id: 'a',
          status: 'passed',
          attempts: [{ status: 'failed' }, { status: 'passed' }],
        },
        { id: 'b', status: 'failed', quarantined: true },
      ],
    };
    await db.query("INSERT INTO platform_documents VALUES($1,$2,$3,'run',$4)", [
      id,
      org,
      project,
      JSON.stringify(body),
    ]);
    await initializeAnalyticsProjection(db);
    const counts = async (): Promise<number[][]> =>
      (
        await db.query<{
          executed: string | number;
          passed: string | number;
          recovered: string | number;
        }>('SELECT executed,passed,recovered FROM analytics_daily_utc')
      ).rows.map((row) => [Number(row.executed), Number(row.passed), Number(row.recovered)]);
    assert.deepEqual(await counts(), [[1, 1, 1]]);
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query(
          "UPDATE platform_documents SET body=jsonb_set(body,'{phase}','\"running\"') WHERE id=$1",
          [id],
        );
        assert.equal((await tx.query('SELECT run_id FROM analytics_instances')).rows.length, 0);
        throw new Error('rollback');
      }),
      /rollback/,
    );
    assert.deepEqual(await counts(), [[1, 1, 1]]);
    await db.query(
      "UPDATE platform_documents SET body=jsonb_set(body,'{results,0,status}','\"failed\"') WHERE id=$1",
      [id],
    );
    assert.deepEqual(await counts(), [[1, 0, 0]]);
    assert.deepEqual(
      (await db.query<{ body: unknown }>('SELECT body FROM platform_documents WHERE id=$1', [id]))
        .rows[0]?.body,
      {
        ...body,
        results: [{ ...body.results[0], status: 'failed' }, body.results[1]],
      },
    );
    await db.query('DELETE FROM platform_documents WHERE id=$1', [id]);
    assert.equal((await db.query('SELECT run_id FROM analytics_instances')).rows.length, 0);
  } finally {
    await db.close();
  }
});
