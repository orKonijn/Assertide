import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { requireLocalObjectStore } from './local-object-store-health.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export function localStorageEnvironment(credentials, env = process.env) {
  // Explicit external storage always takes precedence over the local fixture.
  if (env.S3_BUCKET || env.S3_ENDPOINT) return { ...env };
  if (!credentials.objectStoreAccessKey || !credentials.objectStoreSecretKey) return { ...env };
  return {
    ...env,
    S3_WINDOWS_FIXTURE: 'true',
    S3_BUCKET: 'assertide-local',
    S3_ENDPOINT: 'http://127.0.0.1:9000',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: credentials.objectStoreAccessKey,
    AWS_SECRET_ACCESS_KEY: credentials.objectStoreSecretKey,
  };
}

export function usesLocalObjectStore(env) {
  if (!env.S3_BUCKET || !env.S3_ENDPOINT) return false;
  const url = new URL(env.S3_ENDPOINT);
  return (
    url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(url.hostname) &&
    url.port === '9000'
  );
}

export async function ensureLocalObjectStore(
  credentials,
  {
    ready = requireLocalObjectStore,
    launch = async () => {
      const executable = `${root}/.local/tools/${process.platform === 'win32' ? 'minio.exe' : 'minio'}`;
      await access(executable).catch(() => {
        throw new Error(
          'Local MinIO is not installed. Run node scripts/setup-object-store.mjs once, then restart the app.',
        );
      });
      await mkdir(`${root}/.local/objects`, { recursive: true });
      return spawn(
        executable,
        [
          'server',
          `${root}/.local/objects`,
          '--address',
          '127.0.0.1:9000',
          '--console-address',
          '127.0.0.1:9001',
        ],
        {
          env: {
            ...process.env,
            MINIO_ROOT_USER: credentials.objectStoreAccessKey,
            MINIO_ROOT_PASSWORD: credentials.objectStoreSecretKey,
            MINIO_BROWSER: 'off',
          },
          stdio: 'ignore',
          windowsHide: true,
        },
      );
    },
    timeout = 15000,
    pause = () => delay(100),
  } = {},
) {
  try {
    await ready();
    return undefined; // Reuse a running service; never stop a service we do not own.
  } catch {
    /* Start the local fixture when it is not already healthy. */
  }
  if (!credentials.objectStoreAccessKey || !credentials.objectStoreSecretKey)
    throw new Error(
      'Local MinIO credentials are missing. Run node scripts/dev-object-store.mjs once to initialize them.',
    );
  const child = await launch();
  let failure;
  child.once('error', (error) => {
    failure = error;
  });
  child.once('exit', (code) => {
    failure = new Error(`Local MinIO stopped (${code})`);
  });
  // Also clean up when the parent exits during startup or with an uncaught error.
  const cleanup = () => {
    if (child.exitCode === null) child.kill();
  };
  process.once('exit', cleanup);
  child.once('exit', () => process.off('exit', cleanup));
  try {
    const deadline = Date.now() + timeout;
    for (;;) {
      if (failure) throw failure;
      try {
        await ready();
        if (failure) throw failure;
        return child;
      } catch (error) {
        if (failure) throw failure;
        if (Date.now() >= deadline) throw error;
      }
      await pause();
    }
  } catch (cause) {
    cleanup();
    throw new Error(
      'Local MinIO could not start; check port 9000 and the .local/objects directory.',
      { cause },
    );
  }
}
