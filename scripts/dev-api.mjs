import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = new URL('../.local/', import.meta.url);
await mkdir(directory, { recursive: true });
const secretsFile = new URL('credentials.json', directory);
let credentials;
try {
  credentials = JSON.parse(await readFile(secretsFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  credentials = {
    password: randomBytes(18).toString('base64url'),
    clientSecret: randomBytes(32).toString('hex'),
    signingKey: randomBytes(32).toString('hex'),
  };
  await writeFile(secretsFile, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
}
console.log(
  'Local accounts: admin, operator, viewer. Read the generated password from .local/credentials.json.',
);
if (!credentials.encryptionKey) {
  credentials.encryptionKey = randomBytes(32).toString('hex');
  await writeFile(secretsFile, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
  });
}
const separate = process.env.SEPARATE_WORKERS === 'true';
if (separate && (!process.env.DATABASE_URL || !process.env.S3_BUCKET))
  throw new Error('Separate workers require PostgreSQL and object storage');
const options = {
  cwd: `${root}/apps/api`,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    LOCAL_IDENTITY: 'true',
    LOCAL_RUNNER: separate ? 'false' : 'true',
    LOCAL_SANDBOX: 'true',
    LOCAL_PASSWORD: credentials.password,
    OIDC_CLIENT_SECRET: credentials.clientSecret,
    ENABLE_LAB: 'true',
    LAB_PASSWORD: credentials.password,
    LAB_SIGNING_KEY: credentials.signingKey,
    SECRET_ENCRYPTION_KEY: credentials.encryptionKey,
    LOCAL_DATABASE_PATH: `${root}/.local/database`,
  },
};
const children = [];
let stopping = false;
const stop = (signal = 'SIGTERM') => {
  stopping = true;
  for (const child of children) child.kill(signal);
};
const start = (entry, extra = {}) => {
  const child = spawn(process.execPath, ['--import', 'tsx', entry], {
    ...options,
    env: { ...options.env, ...extra },
  });
  children.push(child);
  child.on('error', () => {
    process.exitCode = 1;
    stop();
  });
  child.on('exit', (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
  return child;
};
start('src/main.ts');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
if (separate) {
  const deadline = Date.now() + 30000;
  let ready = false;
  while (!stopping && Date.now() < deadline) {
    try {
      ready = (
        await fetch('http://127.0.0.1:4010/health', {
          signal: AbortSignal.timeout(500),
        })
      ).ok;
    } catch {
      // A refused connection is expected before the local service starts.
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready || stopping) {
    stop();
    process.exitCode = 1;
  } else
    for (const role of ['execution', 'report'])
      start('src/worker-main.ts', {
        WORKER_ROLE: role,
        OIDC_CLIENT_SECRET: '',
        LOCAL_PASSWORD: '',
      });
}
