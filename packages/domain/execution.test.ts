import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transitionRun, requestCancellation, summarizeHistory, nearestRankP95 } from './execution.ts';
import type { ExecutionState, FinalInstance } from './execution.ts';

test('terminal completion wins cancellation and cannot be rewritten', () => {
  const running: ExecutionState = { phase: 'finalizing', version: 3, leaseEpoch: 2, cancelRequested: false };
  const completed = transitionRun(running, 'completed', 3, 2);
  assert.equal(requestCancellation(completed), completed);
  assert.throws(() => transitionRun(completed, 'running', 4, 2));
});

test('stale workers and stale versions cannot finalize', () => {
  const running: ExecutionState = { phase: 'running', version: 3, leaseEpoch: 2, cancelRequested: false };
  assert.throws(() => transitionRun(running, 'finalizing', 3, 1));
  assert.throws(() => transitionRun(running, 'finalizing', 2, 2));
  const cancel = requestCancellation(running);
  assert.equal(cancel.phase, 'running');
  assert.equal(requestCancellation(cancel), cancel);
  assert.equal(requestCancellation({ ...running, phase: 'queued' }).phase, 'canceled');
});

test('PRD historical fixture has correct denominators and excludes live runs', () => {
  const instances: FinalInstance[] = [
    ...Array.from({ length: 2223 }, (): FinalInstance => ({ state: 'passed', expectedFailure: false, attempts: ['passed'] })),
    ...Array.from({ length: 45 }, (): FinalInstance => ({ state: 'passed', expectedFailure: false, attempts: ['failed', 'passed'] })),
    ...Array.from({ length: 72 }, (): FinalInstance => ({ state: 'failed', expectedFailure: false, attempts: ['failed'] })),
    ...Array.from({ length: 60 }, (): FinalInstance => ({ state: 'skipped', expectedFailure: false, attempts: ['skipped'] })),
  ];
  const result = summarizeHistory([{ phase: 'completed', instances }, { phase: 'running', instances }]);
  assert.equal(result.total, 2400);
  assert.equal(result.executed, 2340);
  assert.equal(result.finalPassRate, 2268 / 2340);
  assert.equal(result.firstAttemptPassRate, 2223 / 2340);
  assert.equal(result.recoveredFlakyRate, 45 / 2340);
});

test('expected failures and incomplete results do not improve pass rates', () => {
  const result = summarizeHistory([{ phase: 'completed', instances: [
    { state: 'failed', expectedFailure: true, attempts: ['failed'] },
    { state: 'incomplete', expectedFailure: false, attempts: [] },
    { state: 'canceled', expectedFailure: false, attempts: ['canceled'] },
  ] }]);
  assert.equal(result.executed, 0);
  assert.equal(result.finalPassRate, null);
  assert.equal(result.excluded, 3);
});

test('latency uses nearest rank and rejects invalid measurements', () => {
  assert.equal(nearestRankP95(Array.from({ length: 20 }, (_, i) => i + 1)), 19);
  assert.equal(nearestRankP95([]), null);
  assert.throws(() => nearestRankP95([NaN]));
  assert.throws(() => nearestRankP95([-1]));
});
