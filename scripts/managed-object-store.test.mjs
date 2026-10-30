import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  ensureLocalObjectStore,
  localStorageEnvironment,
  usesLocalObjectStore,
} from './managed-object-store.mjs';

const credentials = {
  objectStoreAccessKey: 'fixture',
  objectStoreSecretKey: 'fixture-secret',
};
function fakeChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    child.exitCode = 0;
    child.emit('exit', 0);
  };
  return child;
}
test('saved local configuration is restored without overriding explicit remote storage', () => {
  assert.equal(usesLocalObjectStore(localStorageEnvironment(credentials, {})), true);
  assert.deepEqual(localStorageEnvironment({}, {}), {});
  const remote = {
    S3_BUCKET: 'remote',
    S3_ENDPOINT: 'https://objects.example.test',
  };
  assert.deepEqual(localStorageEnvironment(credentials, remote), remote);
  assert.equal(usesLocalObjectStore(remote), false);
});
test('running MinIO is reused without launching or owning it', async () => {
  assert.equal(
    await ensureLocalObjectStore(credentials, {
      ready: async () => {},
      launch: async () => {
        assert.fail('Must not launch a duplicate');
      },
    }),
    undefined,
  );
});
test('offline MinIO starts and readiness is awaited before returning', async () => {
  const child = fakeChild();
  let checks = 0;
  const result = await ensureLocalObjectStore(credentials, {
    ready: async () => {
      if (++checks < 3) throw new Error('Offline');
    },
    launch: async () => child,
    pause: async () => {},
  });
  assert.equal(result, child);
  assert.equal(checks, 3);
  assert.equal(child.killed, false);
  child.kill();
});
test('failed startup cleans up its own child and reports an actionable error', async () => {
  const child = fakeChild();
  await assert.rejects(
    ensureLocalObjectStore(credentials, {
      ready: async () => {
        throw new Error('Offline');
      },
      launch: async () => child,
      timeout: 0,
    }),
    /Local MinIO could not start/,
  );
  assert.equal(child.killed, true);
});
