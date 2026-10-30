import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { z } from 'zod';

import { connectDatabase } from './database.ts';
const metadataSchema = z.object({
  format: z.literal(1),
  createdAt: z.iso.datetime(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().positive(),
  encryptionKeyFingerprint: z.string().nullable(),
});
const keyFingerprint = (): string | null =>
  process.env['SECRET_ENCRYPTION_KEY']
    ? createHash('sha256').update(process.env['SECRET_ENCRYPTION_KEY']).digest('hex')
    : null;
async function hash(file: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) {
    if (!Buffer.isBuffer(chunk)) {
      throw new TypeError('Expected a binary backup chunk');
    }
    digest.update(chunk);
  }
  return digest.digest('hex');
}
async function pgTool(name: 'pg_dump' | 'pg_restore', url: string, file: string): Promise<void> {
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('PostgreSQL URL required');
  }
  const env = {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    PGSSLMODE: parsed.searchParams.get('sslmode') ?? 'prefer',
  };
  const args =
    name === 'pg_dump'
      ? ['--format=custom', '--no-owner', '--no-privileges']
      : [
          '--dbname',
          env.PGDATABASE,
          '--no-owner',
          '--no-privileges',
          '--exit-on-error',
          '--single-transaction',
        ];
  const container = process.env['PG_TOOL_CONTAINER'];
  if (container && !/^[a-f0-9]{12,64}$/.test(container)) {
    throw new Error('Invalid PostgreSQL tool container ID');
  }
  const child = spawn(
    container ? 'docker' : name,
    container
      ? [
          'exec',
          ...(name === 'pg_restore' ? ['-i'] : []),
          ...['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE'].flatMap(
            (key) => ['--env', key],
          ),
          container,
          name,
          ...args,
        ]
      : args,
    { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
  );
  child.stderr.resume(); // Database tool errors may contain private SQL; do not echo them.
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', () => reject(new Error(`${name} could not start`)));
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${name} failed with exit code ${code}`)),
    );
  });
  const transfer =
    name === 'pg_dump'
      ? pipeline(child.stdout, createWriteStream(file, { flags: 'wx', mode: 0o600 }))
      : pipeline(createReadStream(file), child.stdin);
  if (name === 'pg_dump') {
    child.stdin.end();
  } else {
    child.stdout.resume();
  }
  await Promise.all([done, transfer]);
}
export async function backupDatabase(
  url: string,
  file: string,
): Promise<{
  format: 1;
  createdAt: string;
  sha256: string;
  bytes: number;
  encryptionKeyFingerprint: string | null;
}> {
  const db = await connectDatabase(url);
  try {
    const present = (await db.query("SELECT to_regclass('public.secret_versions') AS name"))
      .rows[0]?.['name'];
    if (
      present &&
      !keyFingerprint() &&
      (await db.query("SELECT id FROM secret_versions WHERE ciphertext NOT LIKE 'vault:%' LIMIT 1"))
        .rows.length
    ) {
      throw new Error(
        'Back up the secret encryption key separately before backing up encrypted credentials',
      );
    }
  } finally {
    await db.close();
  }
  const target = path.resolve(file);
  await mkdir(path.dirname(target), { recursive: true });
  await pgTool('pg_dump', url, target);
  const metadata = metadataSchema.parse({
    format: 1,
    createdAt: new Date().toISOString(),
    sha256: await hash(target),
    bytes: (await stat(target)).size,
    encryptionKeyFingerprint: keyFingerprint(),
  });
  await writeFile(`${target}.json`, JSON.stringify(metadata, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  return metadata;
}
export async function restoreDatabase(
  url: string,
  file: string,
): Promise<{
  format: 1;
  createdAt: string;
  sha256: string;
  bytes: number;
  encryptionKeyFingerprint: string | null;
}> {
  const target = path.resolve(file);
  const metadata = metadataSchema.parse(JSON.parse(await readFile(`${target}.json`, 'utf8')));
  if ((await hash(target)) !== metadata.sha256 || (await stat(target)).size !== metadata.bytes) {
    throw new Error('Backup integrity check failed');
  }
  if (metadata.encryptionKeyFingerprint && metadata.encryptionKeyFingerprint !== keyFingerprint()) {
    throw new Error('Restore requires the matching secret encryption key');
  }
  const db = await connectDatabase(url);
  try {
    const count = (
      await db.query<{ count: string }>(
        "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S')",
      )
    ).rows[0]?.count;
    if (Number(count) !== 0) {
      throw new Error('Restore target must be an empty database');
    }
  } finally {
    await db.close();
  }
  await pgTool('pg_restore', url, target);
  return metadata;
}
