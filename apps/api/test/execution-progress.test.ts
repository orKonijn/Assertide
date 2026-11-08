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
  assert.deepEqual(progress.snapshot(), { passed: 1, failed: 1, other: 1 });
});
