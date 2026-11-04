import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run only into ignored, access-restricted storage; nothing sensitive goes to stdout.
export function prepareSecrets(input) {
  const origin = (value) => {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error('HTTPS origins required');
    return url.origin;
  };
  const appOrigin = origin(input.appOrigin);
  const authOrigin = origin(input.authOrigin);
  if (appOrigin === authOrigin) throw new Error('Distinct identity origin required');
  if (!input.ownerName || typeof input.ownerName !== 'string' || input.ownerName.length > 120)
    throw new Error('Owner display name required');
  if (typeof input.ownerEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.ownerEmail))
    throw new Error('Owner email required');
  const s3 = input.storage;
  if (
    !s3 ||
    !['region', 'bucket', 'backupBucket'].every(
      (key) => typeof s3[key] === 'string' && /^[a-z0-9][a-z0-9.-]+$/.test(s3[key]),
    ) ||
    s3.bucket === s3.backupBucket
  )
    throw new Error('Storage region and distinct evidence/backup buckets required');
  const endpoint = origin(s3.endpoint);
  const backupWriteMode = s3.backupWriteMode ?? 'conditional';
  if (!['conditional', 'unique-versioned'].includes(backupWriteMode))
    throw new Error('Unsupported backup write mode');
  const secrets = [];
  const secret = (name, data) =>
    secrets.push({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name, namespace: 'assertide' },
      type: 'Opaque',
      stringData: data,
    });
  const password = () => randomBytes(32).toString('hex');
  const dbPasswords = Object.fromEntries(
    ['api', 'execution', 'report', 'backup', 'keycloak'].map((r) => [r, password()]),
  );
  const redisPassword = password();
  const clientSecret = password();
  const ownerPassword = password();
  const masterPassword = password();
  const subject = randomUUID();
  const bootstrap = {
    organizationId: randomUUID(),
    projectId: randomUUID(),
    projectName: 'Assertide',
    subject,
    name: input.ownerName,
  };
  const dbUrl = (role) =>
    `postgresql://assertide_${role}:${dbPasswords[role]}@assertide-postgres:5432/assertide`;
  for (const role of ['api', 'execution', 'report', 'backup']) {
    const credential = s3.credentials?.[role];
    if (
      !credential ||
      typeof credential.accessKeyId !== 'string' ||
      !credential.accessKeyId ||
      typeof credential.secretAccessKey !== 'string' ||
      !credential.secretAccessKey
    )
      throw new Error(`Scoped ${role} storage credentials required`);
    const data = {
      DATABASE_URL: dbUrl(role),
      AWS_REGION: s3.region,
      S3_ENDPOINT: endpoint,
      S3_SSE: 'AES256',
      AWS_ACCESS_KEY_ID: credential.accessKeyId,
      AWS_SECRET_ACCESS_KEY: credential.secretAccessKey,
    };
    if (role === 'backup') {
      data.BACKUP_S3_BUCKET = s3.backupBucket;
      data.BACKUP_WRITE_MODE = backupWriteMode;
    } else data.S3_BUCKET = s3.bucket;
    if (role === 'api' || role === 'execution')
      data.REDIS_URL = `redis://:${redisPassword}@assertide-redis:6379`;
    if (role === 'api')
      Object.assign(data, {
        OIDC_ISSUER: `${authOrigin}/realms/assertide`,
        OIDC_CLIENT_ID: 'assertide',
        OIDC_CLIENT_SECRET: clientSecret,
      });
    secret(`assertide-${role}-config`, data);
  }
  secret('assertide-postgres-config', {
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: password(),
    POSTGRES_DB: 'postgres',
    PGDATA: '/var/lib/postgresql/data/pgdata',
  });
  const sql = [
    ...Object.entries(dbPasswords).map(
      ([role, value]) => `CREATE ROLE assertide_${role} LOGIN PASSWORD '${value}';`,
    ),
    'CREATE DATABASE assertide OWNER assertide_api;',
    'CREATE DATABASE keycloak OWNER assertide_keycloak;',
    '\\connect assertide',
    'REVOKE ALL ON DATABASE assertide FROM PUBLIC;',
    'REVOKE CREATE ON SCHEMA public FROM PUBLIC;',
    'GRANT CONNECT ON DATABASE assertide TO assertide_api, assertide_execution, assertide_report, assertide_backup;',
    'GRANT USAGE ON SCHEMA public TO assertide_execution, assertide_report, assertide_backup;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE assertide_api IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO assertide_execution, assertide_report;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE assertide_api IN SCHEMA public GRANT SELECT ON TABLES TO assertide_backup;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE assertide_api IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO assertide_execution, assertide_report;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE assertide_api IN SCHEMA public GRANT SELECT ON SEQUENCES TO assertide_backup;',
    '\\connect keycloak',
    'REVOKE ALL ON DATABASE keycloak FROM PUBLIC;',
  ];
  secret('assertide-postgres-init', { '01-roles.sql': `${sql.join('\n')}\n` });
  secret('assertide-redis-config', {
    'redis.conf': `bind 0.0.0.0\nprotected-mode yes\nport 6379\nrequirepass ${redisPassword}\nappendonly yes\nappendfsync everysec\ndir /data\nmaxmemory 192mb\nmaxmemory-policy noeviction\n`,
  });
  secret('assertide-keycloak-config', {
    KC_DB_URL: 'jdbc:postgresql://assertide-postgres:5432/keycloak',
    KC_DB_USERNAME: 'assertide_keycloak',
    KC_DB_PASSWORD: dbPasswords.keycloak,
    KC_BOOTSTRAP_ADMIN_USERNAME: 'bootstrap-admin',
    KC_BOOTSTRAP_ADMIN_PASSWORD: masterPassword,
  });
  secret('assertide-keycloak-realm', {
    'assertide-realm.json': JSON.stringify({
      realm: 'assertide',
      enabled: true,
      sslRequired: 'external',
      loginTheme: 'assertide',
      registrationAllowed: false,
      resetPasswordAllowed: false,
      loginWithEmailAllowed: true,
      bruteForceProtected: true,
      users: [
        {
          id: subject,
          username: input.ownerEmail,
          email: input.ownerEmail,
          enabled: true,
          emailVerified: false,
          firstName: input.ownerName,
          requiredActions: ['UPDATE_PASSWORD'],
          credentials: [{ type: 'password', value: ownerPassword, temporary: true }],
        },
      ],
      clients: [
        {
          clientId: 'assertide',
          enabled: true,
          protocol: 'openid-connect',
          publicClient: false,
          secret: clientSecret,
          standardFlowEnabled: true,
          directAccessGrantsEnabled: false,
          serviceAccountsEnabled: false,
          redirectUris: [`${appOrigin}/auth/callback`],
          webOrigins: [appOrigin],
          attributes: { 'pkce.code.challenge.method': 'S256' },
          defaultClientScopes: ['profile', 'email'],
        },
      ],
    }),
  });
  return {
    manifest: { apiVersion: 'v1', kind: 'List', items: secrets },
    bootstrap,
    initialLogin: {
      origin: authOrigin,
      username: input.ownerEmail,
      temporaryPassword: ownerPassword,
      bootstrapAdministrator: 'bootstrap-admin',
      bootstrapAdministratorPassword: masterPassword,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    // Fixed ignored parent prevents accidental writes into a published source directory.
    const target = resolve('.local/pilot-secrets');
    const prepared = prepareSecrets(JSON.parse(await readFile(process.argv[2], 'utf8')));
    // Refuse to overwrite any prior credentials: existing databases won't re-run init scripts.
    await mkdir(resolve('.local'), { recursive: true, mode: 0o700 });
    await mkdir(target, { mode: 0o700 });
    for (const [name, value] of Object.entries(prepared))
      await writeFile(resolve(target, `${name}.json`), JSON.stringify(value, null, 2), {
        mode: 0o600,
        flag: 'wx',
      });
    console.log(
      'Private pilot setup files prepared under .local/pilot-secrets; keep them out of Git.',
    );
  } catch {
    // Parser errors can include input fragments. Never print them for private configuration.
    console.error(
      'Pilot preparation failed. Check private input, directory permissions, and whether output already exists. Existing credentials were not replaced.',
    );
    process.exitCode = 1;
  }
}
