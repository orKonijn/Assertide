import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketVersioningCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const endpoint = process.env['S3_ENDPOINT'];
if (!endpoint || !process.env['TEST_DATABASE_URL']) {
  throw new Error('Isolated database and object store required');
}
const client = new S3Client({ endpoint, forcePathStyle: true });
const bucket = `assertide-backup-${randomUUID()}`;
await client.send(new CreateBucketCommand({ Bucket: bucket }));
await client.send(
  new PutBucketVersioningCommand({
    Bucket: bucket,
    VersioningConfiguration: { Status: 'Enabled' },
  }),
);
const localCredentials = JSON.parse(
  await readFile(new URL('../../../.local/credentials.json', import.meta.url), 'utf8'),
) as { encryptionKey: string };
assert.match(localCredentials.encryptionKey, /^[a-f0-9]{64}$/);
const child = spawn(
  process.execPath,
  ['--import', 'tsx', fileURLToPath(new URL('../scripts/scheduled-backup.ts', import.meta.url))],
  {
    env: {
      ...process.env,
      BACKUP_S3_BUCKET: bucket,
      SECRET_ENCRYPTION_KEY: localCredentials.encryptionKey,
      DATABASE_URL: process.env['TEST_DATABASE_URL'],
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let log = '';
child.stdout.on('data', (data) => {
  log += String(data);
});
child.stderr.on('data', (data) => {
  log += String(data);
});
const code = await new Promise<number | null>((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', resolve);
});
assert.equal(code, 0, log);
const objects = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
assert.equal(objects.Contents?.length, 2);
const dump = objects.Contents?.find((item) => item.Key?.endsWith('.dump'));
assert.ok(dump?.Key);
const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: dump.Key }));
assert.equal(head.ServerSideEncryption, 'AES256');
assert.ok(head.VersionId);
const downloaded = await client.send(
  new GetObjectCommand({
    Bucket: bucket,
    Key: dump.Key,
    VersionId: head.VersionId,
  }),
);
const bytes = await downloaded.Body!.transformToByteArray();
assert.equal(createHash('sha256').update(bytes).digest('hex'), head.Metadata?.['sha256']);
const sidecar = await client.send(
  new GetObjectCommand({ Bucket: bucket, Key: `${dump.Key}.json` }),
);
assert.equal(JSON.parse(await sidecar.Body!.transformToString()).sha256, head.Metadata?.['sha256']);
console.log('Scheduled PostgreSQL backup verified in encrypted versioned object storage');
client.destroy();
