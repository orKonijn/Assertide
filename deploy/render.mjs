import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function deployment(config) {
  const dns = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
  const namespace = config.namespace ?? 'assertide';
  if (!dns.test(namespace)) throw new Error('Invalid namespace');
  const sourceClaim = config.sourceClaim ?? 'assertide-sources';
  if (!dns.test(sourceClaim)) throw new Error('Invalid source claim');
  for (const key of ['serviceImage', 'webImage', 'workerImage']) {
    if (!/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(config[key] ?? ''))
      throw new Error(`${key} requires a registry digest`);
  }
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
      throw new Error('HTTPS origin required');
    return url;
  };
  const app = origin(config.appOrigin);
  const report = origin(config.reportOrigin);
  const vault = origin(config.vaultAddress);
  if (app.origin === report.origin) throw new Error('Reports require a separate origin');
  if (!dns.test(config.tlsSecret ?? '') || !dns.test(config.ingressClass ?? ''))
    throw new Error('TLS secret and ingress class are required');
  if (!/^[a-zA-Z0-9_-]+$/.test(config.vaultRole ?? '')) throw new Error('Vault role required');
  const items = [];
  const add = (kind, name, spec, apiVersion = 'v1') => {
    const resource = {
      apiVersion,
      kind,
      metadata: { name, namespace },
      ...spec,
    };
    items.push(resource);
    return resource;
  };
  items.push({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: namespace,
      labels: { 'pod-security.kubernetes.io/enforce': 'restricted' },
    },
  });
  add('ConfigMap', 'assertide', {
    data: {
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      REPORT_HOST: '0.0.0.0',
      APP_ORIGIN: app.origin,
      REPORT_ORIGIN: report.origin,
      LOCAL_IDENTITY: 'false',
      LOCAL_RUNNER: 'false',
      LOCAL_SANDBOX: 'false',
      ENABLE_LAB: 'false',
      WORKER_RUNTIME: 'kubernetes',
      OCI_WORKER_IMAGE: config.workerImage,
      KUBERNETES_WORKER_NAMESPACE: 'assertide-workers',
      SECRET_BACKEND: 'vault',
      VAULT_ADDR: vault.origin,
      VAULT_ROLE: config.vaultRole,
      VAULT_JWT_FILE: '/var/run/secrets/vault/token',
      WORKER_HEALTH_PORT: '4020',
      METRICS_ENABLED: 'true',
      SOURCE_ROOT: '/var/lib/assertide/sources',
    },
  });
  const securityContext = {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    capabilities: { drop: ['ALL'] },
  };
  for (const role of ['api', 'execution', 'report', 'web']) {
    const name = `assertide-${role}`;
    add('ServiceAccount', name, { automountServiceAccountToken: false });
    const web = role === 'web';
    const port = web ? 8080 : role === 'api' ? 4010 : 4020;
    const volumeMounts = [{ name: 'tmp', mountPath: '/tmp' }];
    const volumes = [{ name: 'tmp', emptyDir: { sizeLimit: '512Mi' } }];
    if (!web) {
      volumeMounts.push({ name: 'local', mountPath: '/app/.local' });
      volumes.push({ name: 'local', emptyDir: { sizeLimit: '8Gi' } });
      if (role !== 'report') {
        volumeMounts.push({
          name: 'sources',
          mountPath: '/var/lib/assertide/sources',
        });
        volumes.push({
          name: 'sources',
          persistentVolumeClaim: { claimName: sourceClaim },
        });
        volumeMounts.push({
          name: 'vault-jwt',
          mountPath: '/var/run/secrets/vault',
          readOnly: true,
        });
        volumes.push({
          name: 'vault-jwt',
          projected: {
            sources: [
              {
                serviceAccountToken: {
                  path: 'token',
                  audience: 'vault',
                  expirationSeconds: 600,
                },
              },
            ],
          },
        });
      }
    }
    const service = {
      name: role,
      image: web ? config.webImage : config.serviceImage,
      securityContext,
      ...(web
        ? {}
        : {
            args: [`/app/apps/api/src/${role === 'api' ? 'main' : 'worker-main'}.ts`],
            envFrom: [
              { configMapRef: { name: 'assertide' } },
              { secretRef: { name: `assertide-${role}-config` } },
            ],
            env: role === 'api' ? [] : [{ name: 'WORKER_ROLE', value: role }],
          }),
      ports: [
        { name: 'http', containerPort: port },
        ...(role === 'api' ? [{ name: 'reports', containerPort: 4012 }] : []),
      ],
      volumeMounts,
      resources: {
        requests: { cpu: '100m', memory: web ? '64Mi' : '512Mi' },
        limits: {
          cpu: '2',
          memory: web ? '256Mi' : '2Gi',
          'ephemeral-storage': '10Gi',
        },
      },
      startupProbe: {
        httpGet: { path: '/health', port },
        periodSeconds: 5,
        failureThreshold: 60,
      },
      livenessProbe: { httpGet: { path: '/health', port }, periodSeconds: 15 },
      readinessProbe: {
        httpGet: { path: web ? '/health' : '/ready', port },
        periodSeconds: 10,
        timeoutSeconds: 4,
      },
    };
    add(
      'Deployment',
      name,
      {
        spec: {
          replicas: role === 'report' ? 1 : 2,
          selector: { matchLabels: { app: name } },
          template: {
            metadata: { labels: { app: name } },
            spec: {
              serviceAccountName: name,
              automountServiceAccountToken: role === 'execution',
              terminationGracePeriodSeconds: 60,
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 10001,
                runAsGroup: 10001,
                fsGroup: 10001,
                seccompProfile: { type: 'RuntimeDefault' },
              },
              containers: [service],
              volumes,
            },
          },
        },
      },
      'apps/v1',
    );
    if (role === 'web' || role === 'api') {
      add('Service', name, {
        spec: {
          selector: { app: name },
          ports: [
            { name: 'http', port, targetPort: port },
            ...(role === 'api' ? [{ name: 'reports', port: 4012, targetPort: 4012 }] : []),
          ],
        },
      });
      add(
        'PodDisruptionBudget',
        name,
        { spec: { minAvailable: 1, selector: { matchLabels: { app: name } } } },
        'policy/v1',
      );
    }
  }
  items.push({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: { name: 'assertide-execution', namespace: 'assertide-workers' },
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'Role',
      name: 'assertide-execution',
    },
    subjects: [{ kind: 'ServiceAccount', name: 'assertide-execution', namespace }],
  });
  add(
    'NetworkPolicy',
    'service-ingress',
    {
      spec: {
        podSelector: {},
        policyTypes: ['Ingress'],
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: { 'kubernetes.io/metadata.name': namespace },
                },
              },
            ],
          },
        ],
      },
    },
    'networking.k8s.io/v1',
  );
  if (!dns.test(config.ingressNamespace ?? ''))
    throw new Error('Ingress controller namespace required');
  add(
    'NetworkPolicy',
    'ingress-controller',
    {
      spec: {
        podSelector: {
          matchExpressions: [
            {
              key: 'app',
              operator: 'In',
              values: ['assertide-web', 'assertide-api'],
            },
          ],
        },
        policyTypes: ['Ingress'],
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: {
                    'kubernetes.io/metadata.name': config.ingressNamespace,
                  },
                },
              },
            ],
            ports: [{ port: 8080 }, { port: 4012 }],
          },
        ],
      },
    },
    'networking.k8s.io/v1',
  );
  add(
    'Ingress',
    'assertide',
    {
      spec: {
        ingressClassName: config.ingressClass,
        tls: [
          {
            hosts: [app.hostname, report.hostname],
            secretName: config.tlsSecret,
          },
        ],
        rules: [
          [app.hostname, 'assertide-web', 8080],
          [report.hostname, 'assertide-api', 4012],
        ].map(([host, name, port]) => ({
          host,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: { service: { name, port: { number: port } } },
              },
            ],
          },
        })),
      },
    },
    'networking.k8s.io/v1',
  );
  add('ServiceAccount', 'assertide-backup', {
    automountServiceAccountToken: false,
  });
  add(
    'CronJob',
    'assertide-backup',
    {
      spec: {
        schedule: '0 2 * * *',
        timeZone: 'Etc/UTC',
        concurrencyPolicy: 'Forbid',
        startingDeadlineSeconds: 3600,
        successfulJobsHistoryLimit: 3,
        failedJobsHistoryLimit: 3,
        jobTemplate: {
          spec: {
            backoffLimit: 0,
            activeDeadlineSeconds: 3600,
            template: {
              spec: {
                serviceAccountName: 'assertide-backup',
                automountServiceAccountToken: false,
                restartPolicy: 'Never',
                securityContext: {
                  runAsNonRoot: true,
                  runAsUser: 10001,
                  runAsGroup: 10001,
                  fsGroup: 10001,
                  seccompProfile: { type: 'RuntimeDefault' },
                },
                containers: [
                  {
                    name: 'backup',
                    image: config.serviceImage,
                    args: ['/app/apps/api/scripts/scheduled-backup.ts'],
                    envFrom: [{ secretRef: { name: 'assertide-backup-config' } }],
                    securityContext,
                    resources: {
                      requests: { cpu: '100m', memory: '128Mi' },
                      limits: {
                        cpu: '1',
                        memory: '512Mi',
                        'ephemeral-storage': '20Gi',
                      },
                    },
                    volumeMounts: [{ name: 'backup', mountPath: '/tmp' }],
                  },
                ],
                volumes: [{ name: 'backup', emptyDir: { sizeLimit: '20Gi' } }],
              },
            },
          },
        },
      },
    },
    'batch/v1',
  );
  return { apiVersion: 'v1', kind: 'List', items };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(
    JSON.stringify(deployment(JSON.parse(await readFile(process.argv[2], 'utf8'))), null, 2),
  );
}
