import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { deployment } from './render.mjs';

// Single-node installation. This renders resources; it never purchases infrastructure.
export function pilot(config) {
  if (config.namespace !== 'assertide') throw new Error('Pilot namespace must be assertide');
  if (config.ingressClass !== 'traefik' || config.ingressNamespace !== 'kube-system')
    throw new Error('Pilot requires the K3s Traefik ingress');
  for (const key of ['postgresImage', 'redisImage', 'vaultImage', 'keycloakImage'])
    if (!/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(config[key] ?? ''))
      throw new Error(`${key} requires a verified ARM registry digest`);
  if (!/^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/.test(config.nodeName ?? ''))
    throw new Error('Verified nodeName required');
  if (!['infrastructure', 'application'].includes(config.stage))
    throw new Error('stage must be infrastructure or application');
  if (!/^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/.test(config.storageClass ?? ''))
    throw new Error('Retained storageClass required');
  const result = deployment(config);
  const app = new URL(config.appOrigin);
  const auth = new URL(config.authOrigin);
  if (
    auth.protocol !== 'https:' ||
    auth.username ||
    auth.password ||
    auth.port ||
    auth.pathname !== '/' ||
    auth.search ||
    auth.hash ||
    app.port ||
    auth.origin === app.origin ||
    auth.origin === config.reportOrigin ||
    auth.hostname === `www.${app.hostname}` ||
    new URL(config.reportOrigin).hostname === `www.${app.hostname}`
  )
    throw new Error('Distinct HTTPS auth origin without a port required');
  const vaultHost = 'assertide-vault.assertide.svc.cluster.local';
  if (config.vaultAddress !== `https://${vaultHost}:8200`)
    throw new Error('Pilot Vault must use the private TLS service');
  const enabled = config.stage === 'application';
  const items = result.items;
  const add = (kind, name, body, apiVersion = 'v1') => {
    const resource = { apiVersion, kind, metadata: { name, namespace: 'assertide' }, ...body };
    items.push(resource);
    return resource;
  };
  const security = {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    capabilities: { drop: ['ALL'] },
  };
  const ref = (name) => ({ secretRef: { name } });
  const pvc = (name, size) =>
    add('PersistentVolumeClaim', name, {
      spec: {
        accessModes: ['ReadWriteOnce'],
        storageClassName: config.storageClass,
        resources: { requests: { storage: size } },
      },
    });
  pvc(config.sourceClaim ?? 'assertide-sources', '10Gi');
  for (const item of items) {
    if (item.kind === 'Deployment') {
      item.spec.replicas = enabled ? 1 : 0;
      item.spec.strategy = { type: 'Recreate' };
      item.spec.template.spec.nodeSelector = { 'kubernetes.io/hostname': config.nodeName };
      if (['assertide-api', 'assertide-execution'].includes(item.metadata.name)) {
        const pod = item.spec.template.spec;
        pod.volumes.push({ name: 'vault-ca', configMap: { name: 'assertide-vault-ca' } });
        pod.containers[0].volumeMounts.push({
          name: 'vault-ca',
          mountPath: '/etc/vault-ca',
          readOnly: true,
        });
        pod.containers[0].env.push({ name: 'NODE_EXTRA_CA_CERTS', value: '/etc/vault-ca/ca.crt' });
      }
    }
    if (item.kind === 'PodDisruptionBudget') item.spec.minAvailable = 0;
    if (item.kind === 'CronJob') {
      item.spec.suspend = !enabled;
      item.spec.jobTemplate.spec.template.spec.nodeSelector = {
        'kubernetes.io/hostname': config.nodeName,
      };
    }
  }
  // The source isolation manifest supplies deny-all policy and scoped worker RBAC.
  // Override its large-cluster quota: a browser job contains runner + transfer containers.
  items.push({
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: {
      name: 'worker-budget',
      namespace: 'assertide-workers',
    },
    spec: {
      hard: {
        pods: '1',
        'requests.cpu': '300m',
        'requests.memory': '576Mi',
        'limits.cpu': '3',
        'limits.memory': '2304Mi',
      },
    },
  });
  const workload = (role, image, port, uid, memory, args, env, volumes = [], mounts = []) => {
    const name = `assertide-${role}`;
    add('ServiceAccount', name, { automountServiceAccountToken: false });
    add('Service', name, {
      spec: {
        type: 'ClusterIP',
        selector: { app: name },
        ports: [{ name: 'http', port, targetPort: port }],
      },
    });
    const resource = add(
      'StatefulSet',
      name,
      {
        spec: {
          serviceName: name,
          replicas: 1,
          selector: { matchLabels: { app: name } },
          template: {
            metadata: { labels: { app: name } },
            spec: {
              serviceAccountName: name,
              automountServiceAccountToken: role === 'vault',
              nodeSelector: { 'kubernetes.io/hostname': config.nodeName },
              securityContext: {
                runAsNonRoot: true,
                runAsUser: uid,
                runAsGroup: uid,
                fsGroup: uid,
                seccompProfile: { type: 'RuntimeDefault' },
              },
              containers: [
                {
                  name: role,
                  image,
                  args,
                  envFrom: env,
                  securityContext: security,
                  ports: [{ containerPort: port }],
                  resources: {
                    requests: { cpu: '50m', memory: role === 'redirect' ? '32Mi' : '128Mi' },
                    limits: { cpu: '1', memory },
                  },
                  readinessProbe: { tcpSocket: { port }, periodSeconds: 10 },
                  volumeMounts: [{ name: 'tmp', mountPath: '/tmp' }, ...mounts],
                },
              ],
              volumes: [{ name: 'tmp', emptyDir: { sizeLimit: '128Mi' } }, ...volumes],
            },
          },
        },
      },
      'apps/v1',
    );
    return resource.spec.template.spec.containers[0];
  };
  pvc('assertide-postgres', '30Gi');
  workload(
    'postgres',
    config.postgresImage,
    5432,
    999,
    '1Gi',
    ['postgres'],
    [ref('assertide-postgres-config')],
    [
      { name: 'data', persistentVolumeClaim: { claimName: 'assertide-postgres' } },
      { name: 'socket', emptyDir: {} },
      { name: 'init', secret: { secretName: 'assertide-postgres-init' } },
    ],
    [
      { name: 'data', mountPath: '/var/lib/postgresql/data' },
      { name: 'socket', mountPath: '/var/run/postgresql' },
      { name: 'init', mountPath: '/docker-entrypoint-initdb.d', readOnly: true },
    ],
  );
  pvc('assertide-redis', '2Gi');
  workload(
    'redis',
    config.redisImage,
    6379,
    999,
    '256Mi',
    ['redis-server', '/etc/redis/redis.conf'],
    [],
    [
      { name: 'data', persistentVolumeClaim: { claimName: 'assertide-redis' } },
      { name: 'config', secret: { secretName: 'assertide-redis-config' } },
    ],
    [
      { name: 'data', mountPath: '/data' },
      { name: 'config', mountPath: '/etc/redis', readOnly: true },
    ],
  );
  pvc('assertide-vault', '2Gi');
  add('ConfigMap', 'assertide-vault-config', {
    data: {
      'vault.hcl': `
ui = false
disable_mlock = true
api_addr = "https://${vaultHost}:8200"
cluster_addr = "https://${vaultHost}:8201"
storage "raft" {
  path = "/vault/data"
  node_id = "assertide-pilot"
}
listener "tcp" {
  address = "0.0.0.0:8200"
  tls_cert_file = "/vault/tls/tls.crt"
  tls_key_file = "/vault/tls/tls.key"
  tls_min_version = "tls12"
}
`,
    },
  });
  const vault = workload(
    'vault',
    config.vaultImage,
    8200,
    100,
    '256Mi',
    ['server', '-config=/vault/config/vault.hcl'],
    [],
    [
      { name: 'data', persistentVolumeClaim: { claimName: 'assertide-vault' } },
      { name: 'config', configMap: { name: 'assertide-vault-config' } },
      { name: 'tls', secret: { secretName: 'assertide-vault-tls', defaultMode: 288 } },
    ],
    [
      { name: 'data', mountPath: '/vault/data' },
      { name: 'config', mountPath: '/vault/config', readOnly: true },
      { name: 'tls', mountPath: '/vault/tls', readOnly: true },
    ],
  );
  // Avoid the image entrypoint's optional chown/setcap operations under restricted policy.
  vault.command = ['vault'];
  vault.readinessProbe = {
    httpGet: { scheme: 'HTTPS', port: 8200, path: '/v1/sys/health' },
    periodSeconds: 10,
  };
  items.push({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRoleBinding',
    metadata: { name: 'assertide-vault-tokenreview' },
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: 'system:auth-delegator',
    },
    subjects: [{ kind: 'ServiceAccount', name: 'assertide-vault', namespace: 'assertide' }],
  });
  const keycloak = workload(
    'keycloak',
    config.keycloakImage,
    8080,
    1000,
    '1536Mi',
    ['start', '--import-realm'],
    [ref('assertide-keycloak-config')],
    [
      { name: 'data', emptyDir: { sizeLimit: '256Mi' } },
      { name: 'realm', secret: { secretName: 'assertide-keycloak-realm' } },
    ],
    [
      { name: 'data', mountPath: '/opt/keycloak/data' },
      { name: 'realm', mountPath: '/opt/keycloak/data/import', readOnly: true },
    ],
  );
  keycloak.env = [
    { name: 'KC_DB', value: 'postgres' },
    { name: 'KC_HOSTNAME', value: auth.origin },
    { name: 'KC_HTTP_ENABLED', value: 'true' },
    { name: 'KC_PROXY_HEADERS', value: 'xforwarded' },
    { name: 'KC_HEALTH_ENABLED', value: 'true' },
    { name: 'KC_HTTP_MANAGEMENT_PORT', value: '9000' },
  ];
  keycloak.readinessProbe = { httpGet: { port: 9000, path: '/health/ready' }, periodSeconds: 10 };
  // Optimized image must be prebuilt with db=postgres and health-enabled=true.
  keycloak.args = ['start', '--optimized', '--import-realm'];
  // Remove broad intra-namespace ingress inherited from the general deployment.
  const baseline = items.find(
    (item) => item.kind === 'NetworkPolicy' && item.metadata.name === 'service-ingress',
  );
  baseline.spec.ingress = [];
  const allow = (role, sources, port, ingress = false) =>
    add(
      'NetworkPolicy',
      `pilot-${role}`,
      {
        spec: {
          podSelector: { matchLabels: { app: `assertide-${role}` } },
          policyTypes: ['Ingress'],
          ingress: [
            {
              from: ingress
                ? [
                    {
                      namespaceSelector: {
                        matchLabels: {
                          'kubernetes.io/metadata.name': config.ingressNamespace,
                        },
                      },
                      podSelector: { matchLabels: { 'app.kubernetes.io/name': 'traefik' } },
                    },
                  ]
                : sources.map((source) => ({
                    podSelector: { matchLabels: { app: `assertide-${source}` } },
                  })),
              ports: [{ port }],
            },
          ],
        },
      },
      'networking.k8s.io/v1',
    );
  allow('postgres', ['api', 'execution', 'report', 'backup', 'keycloak'], 5432);
  allow('redis', ['api', 'execution'], 6379);
  allow('vault', ['api', 'execution'], 8200);
  allow('api', ['web'], 4010);
  allow('keycloak', [], 8080, true);
  // Backup pods need an identity label for the PostgreSQL ingress policy.
  items.find((i) => i.kind === 'CronJob').spec.jobTemplate.spec.template.metadata = {
    labels: { app: 'assertide-backup' },
  };
  const ingress = items.find((item) => item.kind === 'Ingress');
  add(
    'Middleware',
    'https-redirect',
    { spec: { redirectScheme: { scheme: 'https', permanent: true } } },
    'traefik.io/v1alpha1',
  );
  ingress.metadata.annotations = {
    ...ingress.metadata.annotations,
    'traefik.ingress.kubernetes.io/router.middlewares': 'assertide-https-redirect@kubernetescrd',
  };
  ingress.spec.tls[0].hosts.push(auth.hostname, `www.${app.hostname}`);
  ingress.spec.rules.push({
    host: auth.hostname,
    http: {
      paths: ['/realms/assertide', '/resources'].map((path) => ({
        path,
        pathType: 'Prefix',
        backend: { service: { name: 'assertide-keycloak', port: { number: 8080 } } },
      })),
    },
  });
  // Standard nginx redirect avoids ingress-provider-specific redirect annotations.
  add('ConfigMap', 'assertide-redirect', {
    data: {
      'default.conf': `server {
  listen 8080;
  server_name _;
  location = /health { return 200 'ok'; }
  location / { return 308 ${app.origin}$request_uri; }
}
`,
    },
  });
  const redirect = workload(
    'redirect',
    config.webImage,
    8080,
    10001,
    '64Mi',
    [],
    [],
    [{ name: 'config', configMap: { name: 'assertide-redirect' } }],
    [{ name: 'config', mountPath: '/etc/nginx/conf.d', readOnly: true }],
  );
  delete redirect.args;
  allow('redirect', [], 8080, true);
  ingress.spec.rules.push({
    host: `www.${app.hostname}`,
    http: {
      paths: [
        {
          path: '/',
          pathType: 'Prefix',
          backend: { service: { name: 'assertide-redirect', port: { number: 8080 } } },
        },
      ],
    },
  });
  return result;
}
export function bootstrapJob(config) {
  // Validate the same immutable images, namespace and host contract before bootstrapping.
  pilot(config);
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: 'assertide-bootstrap', namespace: 'assertide' },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: 300,
      template: {
        metadata: { labels: { app: 'assertide-api' } },
        spec: {
          restartPolicy: 'Never',
          automountServiceAccountToken: false,
          serviceAccountName: 'assertide-api',
          nodeSelector: { 'kubernetes.io/hostname': config.nodeName },
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 10001,
            runAsGroup: 10001,
            fsGroup: 10001,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          containers: [
            {
              name: 'bootstrap',
              image: config.serviceImage,
              args: ['/app/apps/api/scripts/bootstrap.ts', '/private/bootstrap.json'],
              envFrom: [{ secretRef: { name: 'assertide-api-config' } }],
              env: [{ name: 'APP_ORIGIN', value: config.appOrigin }],
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: { drop: ['ALL'] },
              },
              resources: {
                requests: { cpu: '100m', memory: '128Mi' },
                limits: { cpu: '1', memory: '512Mi' },
              },
              volumeMounts: [
                { name: 'input', mountPath: '/private', readOnly: true },
                { name: 'tmp', mountPath: '/tmp' },
              ],
            },
          ],
          volumes: [
            { name: 'input', secret: { secretName: 'assertide-bootstrap' } },
            { name: 'tmp', emptyDir: { sizeLimit: '64Mi' } },
          ],
        },
      },
    },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const render = process.argv[3] === '--bootstrap' ? bootstrapJob : pilot;
  console.log(JSON.stringify(render(JSON.parse(await readFile(process.argv[2], 'utf8'))), null, 2));
}
