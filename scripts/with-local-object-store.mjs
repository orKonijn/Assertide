import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { ensureLocalObjectStore } from './managed-object-store.mjs';
const credentials = JSON.parse(
  await readFile(new URL('../.local/credentials.json', import.meta.url), 'utf8'),
);
if (!credentials.objectStoreAccessKey || !credentials.objectStoreSecretKey)
  throw new Error('Start the local object store first');
const args = process.argv.slice(2);
if (!args.length) throw new Error('Pass a Node script to run against the local object store');
const storage = await ensureLocalObjectStore(credentials);
const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    S3_WINDOWS_FIXTURE: 'true',
    S3_BUCKET: 'assertide-local',
    S3_ENDPOINT: 'http://127.0.0.1:9000',
    AWS_ACCESS_KEY_ID: credentials.objectStoreAccessKey,
    AWS_SECRET_ACCESS_KEY: credentials.objectStoreSecretKey,
  },
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
  storage?.kill();
});
child.once('error', () => {
  process.exitCode = 1;
  storage?.kill();
});
storage?.once('exit', () => {
  if (child.exitCode === null) child.kill();
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    child.kill(signal);
    storage?.kill(signal);
  });
