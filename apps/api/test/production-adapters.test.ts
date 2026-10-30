import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { workerJob } from '../src/kubernetes-worker.ts';
import { validateProduction } from '../src/production-config.ts';
import { VaultTransit } from '../src/vault.ts';

await test('production startup refuses development identity, insecure origins and mutable workers', () => {
  const env = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://configured',
    REDIS_URL: 'redis://configured',
    S3_BUCKET: 'private',
    OIDC_CLIENT_ID: 'client',
    OIDC_CLIENT_SECRET: 'secret',
    OIDC_ISSUER: 'https://id.example.test',
    APP_ORIGIN: 'https://app.example.test',
    REPORT_ORIGIN: 'https://reports.example.test',
    WORKER_RUNTIME: 'kubernetes',
    OCI_WORKER_IMAGE: `registry/worker@sha256:${'a'.repeat(64)}`,
  };
  assert.doesNotThrow(() => validateProduction(env));
  assert.throws(
    () =>
      validateProduction({
        ...env,
        S3_ENDPOINT: 'http://objects.example.test',
      }),
    /HTTPS/,
  );
  assert.throws(() => validateProduction({ ...env, LOCAL_IDENTITY: 'true' }), /cannot be enabled/);
  assert.throws(
    () => validateProduction({ ...env, APP_ORIGIN: 'http://app.example.test' }),
    /HTTPS/,
  );
  assert.throws(() => validateProduction({ ...env, REPORT_ORIGIN: env.APP_ORIGIN }), /separate/);
  assert.throws(() => validateProduction({ ...env, OCI_WORKER_IMAGE: 'worker:latest' }));
});

await test('Kubernetes Jobs enforce isolation and reject mutable images', () => {
  const id = 'a22b7a5e-b59d-4eee-8e64-e77b674d9808';
  assert.throws(() => workerJob(id, 1, 'worker:latest'));
  assert.throws(() => workerJob(id, 5, `worker@sha256:${'a'.repeat(64)}`));
  const job = workerJob(id, 2, `registry/worker@sha256:${'a'.repeat(64)}`);
  const pod = job.spec.template.spec;
  assert.equal(pod.automountServiceAccountToken, false);
  assert.equal(job.spec.backoffLimit, 0);
  assert.equal(pod.terminationGracePeriodSeconds, 5);
  assert.equal(job.spec.activeDeadlineSeconds, 1800);
  assert.equal(pod.securityContext.runAsNonRoot, true);
  assert.equal(pod.containers[0]!.volumeMounts.find((v) => v.name === 'source')!.readOnly, true);
  for (const container of pod.containers) {
    assert.equal(container.securityContext.readOnlyRootFilesystem, true);
    assert.equal(container.securityContext.allowPrivilegeEscalation, false);
    assert.deepEqual(container.securityContext.capabilities.drop, ['ALL']);
  }
  assert.doesNotMatch(JSON.stringify(job), /hostPath|hostNetwork|VAULT_|DATABASE_URL|password/);
});

await test('Vault uses workload login, context binding, cached tokens and sanitized failures', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'assertide-vault-'));
  const jwt = path.join(directory, 'token');
  await writeFile(jwt, 'test-jwt');
  let logins = 0;
  let denied = false;
  const server = createServer((request, response) => {
    void (async (): Promise<void> => {
      let body = '';
      for await (const chunk of request) {
        body += String(chunk);
      }
      const input = JSON.parse(body) as Record<string, string>;
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/v1/auth/kubernetes/login') {
        logins++;
        assert.equal(input['jwt'], 'test-jwt');
        assert.equal(input['role'], 'assertide');
        response.end(
          JSON.stringify({
            auth: { client_token: 'private-token', lease_duration: 300 },
          }),
        );
      } else if (denied) {
        response.statusCode = 403;
        response.end(JSON.stringify({ errors: ['private diagnostic'] }));
      } else {
        assert.equal(request.headers['x-vault-token'], 'private-token');
        assert.equal(input['context'], Buffer.from('org:project:id:1').toString('base64'));
        response.end(
          JSON.stringify({
            data: request.url?.includes('/encrypt/')
              ? { ciphertext: 'vault:v1:encrypted' }
              : { plaintext: Buffer.from('credential').toString('base64') },
          }),
        );
      }
    })().catch((error: unknown) =>
      response.destroy(error instanceof Error ? error : new Error(String(error))),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const env = {
    NODE_ENV: 'test',
    VAULT_ADDR: `http://127.0.0.1:${address.port}`,
    VAULT_JWT_FILE: jwt,
    VAULT_ROLE: 'assertide',
  };
  try {
    const vault = new VaultTransit(env);
    const context = Buffer.from('org:project:id:1');
    assert.equal(await vault.transform('encrypt', 'credential', context), 'vault:v1:encrypted');
    assert.equal(await vault.transform('decrypt', 'vault:v1:encrypted', context), 'credential');
    assert.equal(logins, 1);
    denied = true;
    await assert.rejects(
      vault.transform('encrypt', 'credential', context),
      /^Error: Vault operation failed$/,
    );
    denied = false;
    await vault.transform('encrypt', 'credential', context);
    assert.equal(logins, 2);
    await assert.rejects(
      new VaultTransit({ ...env, NODE_ENV: 'production' }).transform(
        'encrypt',
        'credential',
        context,
      ),
      /HTTPS/,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

await test(
  'real Vault Kubernetes authentication and derived-key isolation',
  { skip: process.env['TEST_VAULT'] !== 'true' },
  async () => {
    const vault = new VaultTransit();
    const context = Buffer.from('org-a:project-a:credential:1');
    const ciphertext = await vault.transform('encrypt', 'integration-credential', context);
    assert.match(ciphertext, /^vault:v\d+:/);
    assert.equal(await vault.transform('decrypt', ciphertext, context), 'integration-credential');
    await assert.rejects(
      vault.transform('decrypt', ciphertext, Buffer.from('org-b:project-a:credential:1')),
      /Vault operation failed/,
    );
    await assert.rejects(
      new VaultTransit({ ...process.env, VAULT_ROLE: 'nonexistent' }).transform(
        'encrypt',
        'value',
        context,
      ),
      /Vault operation failed/,
    );
  },
);
