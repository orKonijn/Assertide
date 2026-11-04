import assert from 'node:assert/strict';
import { test } from 'node:test';

import { executionPhase } from '../src/execution-outcome.ts';

await test('only complete evidence can become a completed execution', () => {
  assert.equal(executionPhase(0, false, false), 'completed');
  assert.equal(executionPhase(1, false, false), 'completed');
  assert.equal(executionPhase(0, false, true), 'infrastructure_error');
  assert.equal(executionPhase(1, false, true), 'infrastructure_error');
  assert.equal(executionPhase(2, false, false), 'infrastructure_error');
  assert.equal(executionPhase(-2, false, true), 'timed_out');
  assert.equal(executionPhase(2, true, true), 'canceled');
});
