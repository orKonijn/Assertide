import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

export function jobName(id: string): string {
  return `assertide-worker-${z.uuid().parse(id)}`;
}
export function workerNamespace(): string {
  return z
    .string()
    .regex(/^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/)
    .parse(process.env['KUBERNETES_WORKER_NAMESPACE'] ?? 'assertide-workers');
}
export function workerJob(
  id: string,
  workers: number,
  image: string,
): {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace: string; labels: { 'app.kubernetes.io/name': string } };
  spec: {
    backoffLimit: number;
    activeDeadlineSeconds: number;
    ttlSecondsAfterFinished: number;
    template: {
      metadata: { labels: { 'app.kubernetes.io/name': string } };
      spec: {
        restartPolicy: string;
        terminationGracePeriodSeconds: number;
        automountServiceAccountToken: boolean;
        securityContext: {
          runAsNonRoot: boolean;
          runAsUser: number;
          runAsGroup: number;
          fsGroup: number;
          seccompProfile: { type: string };
        };
        containers: {
          name: string;
          image: string;
          command: string[];
          securityContext: {
            allowPrivilegeEscalation: boolean;
            readOnlyRootFilesystem: boolean;
            capabilities: { drop: string[] };
          };
          resources: {
            requests: { cpu: string; memory: string };
            limits: { cpu: string; memory: string; 'ephemeral-storage': string };
          };
          volumeMounts: (
            | { name: string; mountPath: string; readOnly: boolean }
            | { name: string; mountPath: string; readOnly?: never }
          )[];
        }[];
        volumes: (
          | { name: string; emptyDir: { sizeLimit: string; medium?: never } }
          | { name: string; emptyDir: { medium: string; sizeLimit: string } }
        )[];
      };
    };
  };
} {
  z.number().int().min(1).max(4).parse(workers);
  z.string()
    .regex(/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/)
    .parse(image);
  const securityContext = {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    capabilities: { drop: ['ALL'] },
  };
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName(id),
      namespace: workerNamespace(),
      labels: { 'app.kubernetes.io/name': 'assertide-worker' },
    },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: 1800,
      ttlSecondsAfterFinished: 300,
      template: {
        metadata: { labels: { 'app.kubernetes.io/name': 'assertide-worker' } },
        spec: {
          restartPolicy: 'Never',
          terminationGracePeriodSeconds: 5,
          automountServiceAccountToken: false,
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 10001,
            runAsGroup: 10001,
            fsGroup: 10001,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          containers: [
            {
              name: 'worker',
              image,
              command: ['node', '/app/workers/kubernetes-entry.mjs'],
              securityContext,
              resources: {
                requests: { cpu: '250m', memory: '512Mi' },
                limits: {
                  cpu: String(workers),
                  memory: '2Gi',
                  'ephemeral-storage': '4Gi',
                },
              },
              volumeMounts: [
                { name: 'source', mountPath: '/source', readOnly: true },
                { name: 'input', mountPath: '/input', readOnly: true },
                { name: 'output', mountPath: '/output' },
                { name: 'tmp', mountPath: '/tmp' },
                { name: 'shm', mountPath: '/dev/shm' },
              ],
            },
            {
              name: 'transfer',
              image,
              command: ['node', '/app/workers/kubernetes-transfer.mjs', 'wait'],
              securityContext,
              resources: {
                requests: { cpu: '50m', memory: '64Mi' },
                limits: {
                  cpu: '1',
                  memory: '256Mi',
                  'ephemeral-storage': '4Gi',
                },
              },
              volumeMounts: [
                { name: 'source', mountPath: '/source' },
                { name: 'input', mountPath: '/input' },
                { name: 'output', mountPath: '/output', readOnly: true },
              ],
            },
          ],
          volumes: [
            { name: 'source', emptyDir: { sizeLimit: '64Mi' } },
            { name: 'input', emptyDir: { medium: 'Memory', sizeLimit: '1Mi' } },
            { name: 'output', emptyDir: { sizeLimit: '3Gi' } },
            { name: 'tmp', emptyDir: { sizeLimit: '1Gi' } },
            { name: 'shm', emptyDir: { medium: 'Memory', sizeLimit: '512Mi' } },
          ],
        },
      },
    },
  };
}
export function kubernetesCommand(
  id: string,
  snapshot: string,
  output: string,
  workers: number,
): { executable: string; args: string[] } {
  return {
    executable: process.execPath,
    args: [
      '--import',
      fileURLToPath(new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url)),
      fileURLToPath(new URL('./kubernetes-bridge.ts', import.meta.url)),
      id,
      snapshot,
      output,
      String(workers),
    ],
  };
}
export async function deleteWorkerJob(id: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const child = spawn(
      'kubectl',
      [
        '--namespace',
        workerNamespace(),
        '--request-timeout=20s',
        'delete',
        'job',
        jobName(id),
        '--ignore-not-found',
        '--wait=false',
        '--cascade=foreground',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 25000);
    child.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export async function cancelWorkerJob(id: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const child = spawn(
      'kubectl',
      [
        '--namespace',
        workerNamespace(),
        '--request-timeout=5s',
        'exec',
        `job/${jobName(id)}`,
        '-c',
        'transfer',
        '--',
        'node',
        '/app/workers/kubernetes-transfer.mjs',
        'cancel',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 6000);
    child.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}
