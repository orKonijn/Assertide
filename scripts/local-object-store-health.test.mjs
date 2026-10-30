import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireLocalObjectStore } from './local-object-store-health.mjs';

test('local storage readiness permits startup only after a successful health response', async () => {
  await requireLocalObjectStore(async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:9000/minio/health/ready');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true };
  });
});

test('offline and unhealthy storage stop startup with recovery instructions', async () => {
  for (const fetchHealth of [
    async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:9000');
    },
    async () => ({ ok: false, status: 503 }),
  ]) {
    await assert.rejects(requireLocalObjectStore(fetchHealth), (error) => {
      assert.match(error.message, /127\.0\.0\.1:9000/);
      assert.match(error.message, /Restart the app/);
      assert.ok(error.cause);
      return true;
    });
  }
});
