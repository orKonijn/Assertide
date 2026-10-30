import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import {
  claimHistory,
  commitHistory,
  historyStream,
  initializeHistory,
  readHistory,
  releaseHistory,
  visibleHistory,
} from '../src/report-history.ts';
import { testDatabase } from './database.ts';
await test('compatible report history serializes writers, rejects stale commits and clears expired links', async () => {
  const db = await testDatabase();
  await initializeHistory(db);
  const stream = 'test-stream';
  const first = randomUUID();
  const second = randomUUID();
  try {
    const claims = await Promise.all([
      claimHistory(db, stream, first),
      claimHistory(db, stream, second),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    const owner = claims[0] ? first : second;
    const contender = owner === first ? second : first;
    const entry = {
      runId: randomUUID(),
      endedAt: new Date().toISOString(),
      reportExpiresAt: new Date(Date.now() - 1).toISOString(),
      point: {
        uuid: randomUUID(),
        timestamp: Date.now(),
        url: 'https://private.invalid/report/',
        testResults: {
          sample: {
            url: 'https://private.invalid/report/',
            reportLinks: [{ href: 'https://private.invalid/report/' }],
          },
        },
      },
    };
    await assert.rejects(commitHistory(db, stream, contender, 0, [entry]), /Stale/);
    await commitHistory(db, stream, owner, 0, [entry]);
    const next = await claimHistory(db, stream, contender);
    assert.equal(next?.version, 1);
    assert.equal(next.entries.length, 1);
    await assert.rejects(commitHistory(db, stream, owner, 0, []), /Stale/);
    const visible = visibleHistory(next.entries, randomUUID());
    assert.equal(visible[0]?.['url'], '');
    assert.equal((visible[0]?.testResults['sample'] as { url: string }).url, '');
    assert.deepEqual(visibleHistory(next.entries, entry.runId), []);
    await db.transaction(async (tx) => {
      await commitHistory(tx, stream, contender, 1, [entry]);
    });
    await releaseHistory(db, stream, contender);
    const builder = async (): Promise<void> => {
      const writer = randomUUID();
      let lease = await claimHistory(db, stream, writer);
      while (!lease) {
        await delay(10);
        lease = await claimHistory(db, stream, writer);
      }
      await delay(30);
      await commitHistory(db, stream, writer, lease.version, [
        ...lease.entries,
        { ...entry, runId: randomUUID() },
      ]);
    };
    await Promise.all([builder(), builder()]);
    assert.equal((await readHistory(db, stream)).length, 3);
    const base = {
      organizationId: randomUUID(),
      projectId: randomUUID(),
      config: { environmentId: 'local-lab', browserProjects: ['chromium'] },
      selection: { testIds: ['UI-001', 'UI-005'] },
    };
    assert.equal(
      historyStream(base),
      historyStream({ ...base, selection: { testIds: ['UI-005', 'UI-001'] } }),
    );
    assert.notEqual(
      historyStream(base),
      historyStream({
        ...base,
        config: { ...base.config, browserProjects: ['firefox'] },
      }),
    );
  } finally {
    await db.close();
  }
});
