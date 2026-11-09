import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ExecutionProgress } from '../src/execution-progress.ts';

await test('progress handles split chunks, duplicate events and malformed worker output', () => {
  const progress = new ExecutionProgress();
  progress.accept('worker output\nASSERTIDE_PRO');
  progress.accept('GRESS {"id":"LAB-001:api","outcome":"passed"}\n');
  progress.accept('ASSERTIDE_PROGRESS {"id":"LAB-001:api","outcome":"passed"}\n');
  progress.accept('ASSERTIDE_PROGRESS {"id":"UI-001:firefox","outcome":"failed"}\n');
  progress.accept('ASSERTIDE_PROGRESS {"id":"UI-001:chromium","outcome":"other"}\n');
  progress.accept(
    'ASSERTIDE_PROGRESS not-json\nASSERTIDE_PROGRESS {"id":"invalid","outcome":"passed"}\n',
  );
  assert.deepEqual(progress.snapshot(), {
    passed: 1,
    failed: 1,
    other: 1,
    active: [],
    outcomes: [
      { id: 'LAB-001:api', status: 'passed' },
      { id: 'UI-001:firefox', status: 'failed' },
      { id: 'UI-001:chromium', status: 'other' },
    ],
  });
});

await test('retry attempts remain pending and only final outcomes change counters', () => {
  const progress = new ExecutionProgress();
  const event = (data: Record<string, unknown>): void =>
    progress.accept(`ASSERTIDE_PROGRESS ${JSON.stringify({ id: 'UI-001:chromium', ...data })}\n`);
  event({
    outcome: 'running',
    startedAt: '2026-11-09T00:00:00Z',
    retry: 0,
    title: 'UI-001 controlled case',
  });
  assert.equal(progress.snapshot().active.length, 1);
  event({ outcome: 'retrying' });
  assert.equal(progress.snapshot().failed, 0);
  assert.equal(progress.snapshot().active.length, 0);
  event({ outcome: 'running', startedAt: '2026-11-09T00:00:01Z', retry: 1 });
  assert.equal(progress.snapshot().active[0]?.retry, 1);
  event({ outcome: 'passed' });
  assert.equal(progress.snapshot().passed, 1);
  assert.equal(progress.snapshot().failed, 0);
  assert.equal(progress.snapshot().active.length, 0);
});
