import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { prepareSecrets } from './pilot-secrets.mjs';

const input = {
  appOrigin: 'https://assertide.com',
  authOrigin: 'https://auth.assertide.com',
  ownerName: 'Pilot owner',
  ownerEmail: 'owner@example.test',
  storage: {
    region: 'us-west-004',
    endpoint: 'https://s3.us-west-004.example.test',
    bucket: 'private-evidence',
    backupBucket: 'private-backups',
    credentials: Object.fromEntries(
      ['api', 'execution', 'report', 'backup'].map((role) => [
        role,
        { accessKeyId: `fixture-${role}`, secretAccessKey: `fixture-secret-${role}` },
      ]),
    ),
  },
};

test('production identity bootstrap matches the realm user and exact callback', () => {
  const prepared = prepareSecrets(input);
  const get = (name) =>
    prepared.manifest.items.find((item) => item.metadata.name === name).stringData;
  const realm = JSON.parse(get('assertide-keycloak-realm')['assertide-realm.json']);
  assert.equal(prepared.bootstrap.subject, realm.users[0].id);
  assert.deepEqual(realm.clients[0].redirectUris, ['https://assertide.com/auth/callback']);
  assert.equal(realm.clients[0].secret, get('assertide-api-config').OIDC_CLIENT_SECRET);
  assert.equal(realm.clients[0].directAccessGrantsEnabled, false);
  assert.equal(realm.registrationAllowed, false);
  assert.equal(realm.users[0].credentials[0].temporary, true);
  assert.notEqual(prepareSecrets(input).bootstrap.subject, prepared.bootstrap.subject);
  const backup = get('assertide-backup-config');
  assert.equal(backup.BACKUP_S3_BUCKET, input.storage.backupBucket);
  assert.equal(backup.BACKUP_WRITE_MODE, 'conditional');
  const compatible = prepareSecrets({
    ...input,
    storage: { ...input.storage, backupWriteMode: 'unique-versioned' },
  });
  assert.equal(
    compatible.manifest.items.find((item) => item.metadata.name === 'assertide-backup-config')
      .stringData.BACKUP_WRITE_MODE,
    'unique-versioned',
  );
  assert.throws(() =>
    prepareSecrets({ ...input, storage: { ...input.storage, backupWriteMode: 'unchecked' } }),
  );
  assert.equal(backup.OIDC_CLIENT_SECRET, undefined);
  assert.equal(backup.REDIS_URL, undefined);
  assert.equal(get('assertide-report-config').AWS_ACCESS_KEY_ID, 'fixture-report');
  const sql = get('assertide-postgres-init')['01-roles.sql'];
  assert.match(sql, /GRANT SELECT ON TABLES TO assertide_backup/);
  assert.doesNotMatch(sql, /GRANT .*INSERT.*TO assertide_backup/);
  for (const item of prepared.manifest.items) {
    assert.equal(item.metadata.namespace, 'assertide');
    assert.ok(Object.values(item.stringData).every((value) => typeof value === 'string'));
  }
});

test('rejects insecure origins and missing or ambiguous storage credentials', () => {
  assert.throws(() => prepareSecrets({ ...input, appOrigin: 'http://assertide.com' }));
  assert.throws(() => prepareSecrets({ ...input, authOrigin: input.appOrigin }));
  assert.throws(() => prepareSecrets({ ...input, storage: { ...input.storage, region: {} } }));
  assert.throws(() =>
    prepareSecrets({ ...input, storage: { ...input.storage, backupBucket: input.storage.bucket } }),
  );
  assert.throws(() => prepareSecrets({ ...input, storage: { ...input.storage, credentials: {} } }));
});

test('CLI keeps secrets out of stdout and refuses credential replacement', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'assertide-pilot-'));
  try {
    const config = join(directory, 'input.json');
    await writeFile(config, JSON.stringify(input));
    const run = () =>
      spawnSync(
        process.execPath,
        [fileURLToPath(new URL('./pilot-secrets.mjs', import.meta.url)), config],
        { cwd: directory, encoding: 'utf8' },
      );
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.doesNotMatch(first.stdout, /fixture-secret|temporaryPassword|postgresql/);
    const path = join(directory, '.local/pilot-secrets/manifest.json');
    const original = await readFile(path, 'utf8');
    assert.notEqual(run().status, 0);
    assert.equal(await readFile(path, 'utf8'), original);
    await writeFile(config, 'fixture-secret-malformed-json');
    const invalid = run();
    assert.notEqual(invalid.status, 0);
    assert.doesNotMatch(invalid.stderr + invalid.stdout, /fixture-secret/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
