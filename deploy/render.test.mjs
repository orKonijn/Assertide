import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deployment } from './render.mjs';
const config = {
  serviceImage: `registry/service@sha256:${'a'.repeat(64)}`,
  webImage: `registry/web@sha256:${'b'.repeat(64)}`,
  workerImage: `registry/worker@sha256:${'c'.repeat(64)}`,
  appOrigin: 'https://app.example.test',
  reportOrigin: 'https://reports.example.test',
  vaultAddress: 'https://vault.example.test',
  vaultRole: 'assertide',
  ingressClass: 'nginx',
  ingressNamespace: 'ingress-nginx',
  tlsSecret: 'assertide-tls',
};
test('deployment renders separate origins, scoped identity, probes and immutable images', () => {
  const result = deployment(config);
  const deployments = result.items.filter((item) => item.kind === 'Deployment');
  assert.equal(deployments.length, 4);
  for (const item of deployments) {
    const pod = item.spec.template.spec;
    assert.equal(pod.automountServiceAccountToken, item.metadata.name === 'assertide-execution');
    assert.equal(pod.securityContext.runAsNonRoot, true);
    const source = pod.volumes.find((volume) => volume.name === 'sources');
    if (['assertide-api', 'assertide-execution'].includes(item.metadata.name))
      assert.equal(source.persistentVolumeClaim.claimName, 'assertide-sources');
    else assert.equal(source, undefined);
    assert.ok(pod.containers[0].readinessProbe);
    assert.match(pod.containers[0].image, /@sha256:/);
  }
  const binding = result.items.find((item) => item.kind === 'RoleBinding');
  assert.equal(binding.metadata.namespace, 'assertide-workers');
  assert.equal(binding.subjects[0].name, 'assertide-execution');
  assert.equal(result.items.find((item) => item.kind === 'Ingress').spec.rules.length, 2);
  assert.equal(
    result.items.some((item) => item.kind === 'Secret'),
    false,
  );
  assert.throws(() => deployment({ ...config, serviceImage: 'image:latest' }), /digest/);
  assert.throws(() => deployment({ ...config, reportOrigin: config.appOrigin }), /separate/);
  assert.throws(() => deployment({ ...config, vaultAddress: 'http://vault.test' }), /HTTPS/);
});
