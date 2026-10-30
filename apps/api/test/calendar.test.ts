import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateAnalytics } from '../src/analytics.ts';
import { calendar } from '../src/calendar.ts';
await test('organization calendar handles UTC boundaries, DST and fractional offsets', () => {
  const ny = calendar('America/New_York');
  assert.equal(ny.start('2026-03-08').toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(ny.start('2026-03-09').getTime() - ny.start('2026-03-08').getTime(), 23 * 3600000);
  assert.equal(ny.start('2026-11-02').getTime() - ny.start('2026-11-01').getTime(), 25 * 3600000);
  assert.equal(
    calendar('Asia/Kathmandu').start('2026-01-01').toISOString(),
    '2025-12-31T18:15:00.000Z',
  );
  assert.throws(() => calendar('invalid/zone'));
  const metrics = calculateAnalytics(
    [
      {
        endedAt: '2026-01-02T00:00:00Z',
        results: [{ id: 'LAB-001', status: 'passed' }],
      },
      {
        endedAt: '2026-01-02T06:00:00Z',
        results: [{ id: 'LAB-001', status: 'failed' }],
      },
    ],
    'all',
    'America/New_York',
  );
  assert.deepEqual(
    metrics.trends.map((point) => [point.day, point.finalPassRate]),
    [
      ['2026-01-01', 1],
      ['2026-01-02', 0],
    ],
  );
});
