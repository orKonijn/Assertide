import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pilot, bootstrapJob } from './pilot.mjs';

const config = {
  namespace: 'assertide',
  stage: 'infrastructure',
  nodeName: 'pilot-node',
  storageClass: 'assertide-retain',
  ...Object.fromEntries(
    ['service', 'web', 'worker', 'postgres', 'redis', 'vault', 'keycloak'].map((name) => [
      `${name}Image`,
      `registry/${name}@sha256:${'a'.repeat(64)}`,
    ]),
  ),
  appOrigin: 'https://assertide.com',
  reportOrigin: 'https://reports.assertide.com',
  authOrigin: 'https://auth.assertide.com',
  vaultAddress: 'https://assertide-vault.assertide.svc.cluster.local:8200',
  vaultRole: 'assertide',
  ingressClass: 'traefik',
  ingressNamespace: 'kube-system',
  tlsSecret: 'assertide-tls',
};
const find = (items, kind, name) => items.find((i) => i.kind === kind && i.metadata.name === name);

test('bootstrap has no retries or account token and consumes private input', () => {
  const job = bootstrapJob(config);
  assert.equal(job.spec.backoffLimit, 0);
  assert.equal(job.spec.template.spec.automountServiceAccountToken, false);
  assert.deepEqual(job.spec.template.spec.containers[0].args, [
    '/app/apps/api/scripts/bootstrap.ts',
    '/private/bootstrap.json',
  ]);
  assert.equal(job.spec.template.spec.volumes[0].secret.secretName, 'assertide-bootstrap');
  for (const item of pilot(config).items.filter((i) => i.kind === 'StatefulSet')) {
    const resources = item.spec.template.spec.containers[0].resources;
    const mib = (v) => parseInt(v) * (v.endsWith('Gi') ? 1024 : 1);
    assert.ok(mib(resources.requests.memory) <= mib(resources.limits.memory));
  }
});

test('pilot stages keep the app stopped until dependencies are configured', () => {
  for (const stage of ['infrastructure', 'application']) {
    const { items } = pilot({ ...config, stage });
    const active = stage === 'application';
    const app = items.filter((i) => i.kind === 'Deployment');
    assert.equal(app.length, 4);
    for (const d of app) {
      assert.equal(d.spec.replicas, active ? 1 : 0);
      assert.equal(d.spec.strategy.type, 'Recreate');
      assert.deepEqual(d.spec.template.spec.nodeSelector, {
        'kubernetes.io/hostname': 'pilot-node',
      });
      assert.equal(
        d.spec.template.spec.automountServiceAccountToken,
        d.metadata.name === 'assertide-execution',
      );
    }
    assert.equal(find(items, 'CronJob', 'assertide-backup').spec.suspend, !active);
    assert.equal(
      items.some((i) => i.kind === 'Secret'),
      false,
    );
  }
});

test('pilot retains private dependency networking and restricted identities', () => {
  const { items } = pilot(config);
  assert.equal(items.filter((i) => i.kind === 'StatefulSet').length, 5);
  for (const item of items.filter((i) => i.kind === 'Service'))
    assert.ok(!item.spec.type || item.spec.type === 'ClusterIP');
  for (const item of items.filter((i) => i.kind === 'StatefulSet')) {
    const pod = item.spec.template.spec;
    assert.equal(pod.securityContext.runAsNonRoot, true);
    assert.equal(pod.automountServiceAccountToken, item.metadata.name === 'assertide-vault');
    assert.equal(pod.containers[0].securityContext.readOnlyRootFilesystem, true);
    assert.equal(pod.nodeSelector['kubernetes.io/hostname'], config.nodeName);
  }
  assert.deepEqual(find(items, 'NetworkPolicy', 'service-ingress').spec.ingress, []);
  const postgres = find(items, 'NetworkPolicy', 'pilot-postgres');
  assert.deepEqual(
    postgres.spec.ingress[0].from.map((f) => f.podSelector.matchLabels.app),
    ['api', 'execution', 'report', 'backup', 'keycloak'].map((r) => `assertide-${r}`),
  );
  const vault = find(items, 'NetworkPolicy', 'pilot-vault');
  assert.deepEqual(
    vault.spec.ingress[0].from.map((f) => f.podSelector.matchLabels.app),
    ['assertide-api', 'assertide-execution'],
  );
  const quota = find(items, 'ResourceQuota', 'worker-budget');
  assert.equal(quota.spec.hard.pods, '1');
  assert.equal(quota.spec.hard['limits.memory'], '2304Mi');
  assert.equal(quota.metadata.namespace, 'assertide-workers');
  for (const claim of items.filter((i) => i.kind === 'PersistentVolumeClaim')) {
    assert.equal(claim.spec.storageClassName, 'assertide-retain');
    assert.deepEqual(claim.spec.accessModes, ['ReadWriteOnce']);
  }
});

test('login admin routes stay private and TLS covers all public origins', () => {
  const { items } = pilot(config);
  const ingress = find(items, 'Ingress', 'assertide');
  assert.deepEqual(ingress.spec.tls[0].hosts, [
    'assertide.com',
    'reports.assertide.com',
    'auth.assertide.com',
    'www.assertide.com',
  ]);
  const auth = ingress.spec.rules.find((r) => r.host === 'auth.assertide.com');
  assert.deepEqual(
    auth.http.paths.map((p) => p.path),
    ['/realms/assertide', '/resources'],
  );
  assert.equal(JSON.stringify(ingress).includes('assertide-vault'), false);
  const redirect = find(items, 'ConfigMap', 'assertide-redirect');
  assert.match(redirect.data['default.conf'], /return 308 https:\/\/assertide.com\$request_uri/);
  const keycloak = find(items, 'StatefulSet', 'assertide-keycloak').spec.template.spec
    .containers[0];
  assert.ok(keycloak.args.includes('--optimized'));
  assert.ok(!keycloak.args.includes('start-dev'));
  for (const role of ['api', 'execution']) {
    const pod = find(items, 'Deployment', `assertide-${role}`).spec.template.spec;
    const ca = pod.volumes.find((v) => v.name === 'vault-ca');
    assert.equal(ca.configMap.name, 'assertide-vault-ca');
    assert.ok(pod.containers[0].env.some((e) => e.name === 'NODE_EXTRA_CA_CERTS'));
    // Client workloads must not receive the Vault server private key.
    assert.equal(JSON.stringify(pod).includes('assertide-vault-tls'), false);
  }
});

test('unsafe and incomplete pilot inputs are rejected', () => {
  for (const change of [
    { stage: 'ready' },
    { nodeName: '' },
    { storageClass: '' },
    { namespace: 'other' },
    { ingressClass: 'nginx' },
    { postgresImage: 'postgres:latest' },
    { keycloakImage: 'keycloak:latest' },
    { vaultAddress: 'http://vault:8200' },
    { vaultAddress: 'https://public.example.com' },
    { authOrigin: config.appOrigin },
    { authOrigin: 'http://auth.assertide.com' },
    { authOrigin: 'https://auth.assertide.com/path' },
  ])
    assert.throws(() => pilot({ ...config, ...change }));
});
