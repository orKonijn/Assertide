import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cachedStorageProbe } from '../src/storage-readiness.ts';

await test('storage health shares concurrent requests and stays within the idle free-tier budget', async () => {
  let now = 0;
  let calls = 0;
  const check = cachedStorageProbe(
    async () => {
      calls += 1;
    },
    900_000,
    () => now,
  );
  await Promise.all(Array.from({ length: 50 }, () => check()));
  assert.equal(calls, 1);
  for (now = 10_000; now < 86_400_000; now += 10_000) {
    await check();
  }
  assert.equal(calls, 96);
  assert.equal(calls * 3, 288);
});

await test('storage denial stays unhealthy and is retried after a bounded failure interval', async () => {
  let now = 0;
  let calls = 0;
  const check = cachedStorageProbe(
    async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('Storage access denied');
      }
    },
    900_000,
    () => now,
  );
  await assert.rejects(check(), /Storage access denied/);
  now = 59_999;
  await assert.rejects(check(), /Storage access denied/);
  assert.equal(calls, 1);
  now = 60_000;
  await check();
  assert.equal(calls, 2);
  assert.throws(() => cachedStorageProbe(async () => {}, 900_001), /interval/);
});
