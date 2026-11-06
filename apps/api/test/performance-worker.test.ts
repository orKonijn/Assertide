import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { z } from 'zod';

import { cancelWorkerJob, deleteWorkerJob, kubernetesCommand } from '../src/kubernetes-worker.ts';
import {
  controlledPerformanceBudgets,
  evaluateLighthouseBudgets,
  importPerformanceCheckpoint,
} from '../src/lighthouse-results.ts';
import { ociCommand, stopContainer } from '../src/oci-worker.ts';
import { catalogRevision, prepareSource, verifySource } from '../src/source.ts';

function attachmentPaths(value: unknown, name: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => attachmentPaths(item, name));
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  const found = z.object({ name: z.literal(name), path: z.string() }).safeParse(value);
  return found.success
    ? [found.data.path]
    : Object.values(value).flatMap((item) => attachmentPaths(item, name));
}

for (const runtime of ['oci', 'kubernetes'] as const) {
  await test(
    `${runtime} worker retains three valid sanitized Lighthouse samples without changing the functional result`,
    {
      skip:
        runtime === 'kubernetes'
          ? process.env['TEST_KUBERNETES'] !== 'true'
          : !process.env['OCI_WORKER_IMAGE'] || process.env['TEST_KUBERNETES'] === 'true',
      timeout: 240_000,
    },
    async (context) => {
      await prepareSource();
      const output = await mkdtemp(path.join(tmpdir(), 'assertide-performance-'));
      const cancelOutput = await mkdtemp(path.join(tmpdir(), 'assertide-performance-cancel-'));
      assert.equal(path.dirname(output), path.resolve(tmpdir()));
      assert.ok(path.basename(output).startsWith('assertide-performance-'));
      assert.equal(path.dirname(cancelOutput), path.resolve(tmpdir()));
      assert.ok(path.basename(cancelOutput).startsWith('assertide-performance-cancel-'));
      const id = randomUUID();
      const cancelId = randomUUID();
      const input = JSON.stringify({
        testIds: ['UI-001'],
        workers: 1,
        retries: 0,
        projects: ['chromium'],
        video: 'off',
        performance: true,
        password: randomBytes(24).toString('hex'),
        signingKey: randomBytes(32).toString('hex'),
      });
      const cleanup = async (runId: string): Promise<boolean> =>
        runtime === 'kubernetes' ? deleteWorkerJob(runId) : stopContainer(runId);
      const invoke = (
        command: { executable: string; args: string[] },
        cancel?: () => Promise<boolean>,
      ): Promise<{ code: number; canceled: boolean }> =>
        new Promise((resolve, reject) => {
          const child = spawn(command.executable, command.args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            signal: context.signal,
          });
          let tail = '';
          let cancellation: Promise<boolean> | undefined;
          child.stdout.on('data', (chunk) => {
            tail = (tail + String(chunk)).slice(-4096);
            if (cancel && !cancellation && tail.includes('Lighthouse: sample 1/3 recorded.')) {
              cancellation = cancel();
              void cancellation.catch(reject);
            }
          });
          child.stderr.resume();
          child.stdin.on('error', () => {});
          child.stdin.end(input);
          child.once('error', reject);
          child.once('close', (status) => {
            void Promise.resolve(cancellation ?? false)
              .then((canceled) => resolve({ code: status ?? -1, canceled }))
              .catch(reject);
          });
        });
      try {
        const command = (runtime === 'oci' ? ociCommand : kubernetesCommand)(
          id,
          await verifySource(catalogRevision),
          output,
          1,
        );
        // Fixture credentials enter over stdin; raw worker diagnostics are never echoed on failure.
        const completed = await invoke(command);
        assert.equal(completed.code, 0, 'Isolated performance worker failed');
        const results: unknown = JSON.parse(
          await readFile(path.join(output, 'results.json'), 'utf8'),
        );
        const stats = z
          .object({ stats: z.object({ expected: z.literal(1), unexpected: z.literal(0) }) })
          .parse(results);
        assert.equal(stats.stats.expected, 1);
        assert.equal(
          attachmentPaths(results, 'final-state.png').length,
          1,
          'Functional screenshot must be retained before releasing its browser',
        );
        const attachments = attachmentPaths(results, 'performance-checkpoint.json');
        assert.equal(attachments.length, 1);
        const file = path.join(output, path.relative('/output', attachments[0]!));
        assert.ok(path.resolve(file).startsWith(path.resolve(output) + path.sep));
        const raw = await readFile(file, 'utf8');
        assert.ok(Buffer.byteLength(raw) < 100_000);
        for (const forbidden of [
          'fullPageScreenshot',
          'localStorage',
          'password',
          'PRIVATE_DOM_CANARY',
        ]) {
          assert.ok(!raw.includes(forbidden));
        }
        const checkpoint = importPerformanceCheckpoint(JSON.parse(raw));
        assert.equal(checkpoint.status, 'measured');
        if (checkpoint.status !== 'measured') {
          throw new Error('Lighthouse collection unavailable');
        }
        assert.equal(checkpoint.samples.length, 3);
        assert.ok(checkpoint.samples.every((sample) => sample.validity === 'valid'));
        const decisions = evaluateLighthouseBudgets(
          checkpoint.samples,
          controlledPerformanceBudgets,
        );
        assert.equal(decisions.length, 4);
        assert.ok(decisions.every((decision) => decision.samples === 3));
        assert.ok(
          decisions.every(
            (decision) => !['missing-metric', 'invalid-measurement'].includes(decision.reason),
          ),
        );
        const canceled = await invoke(
          (runtime === 'oci' ? ociCommand : kubernetesCommand)(
            cancelId,
            await verifySource(catalogRevision),
            cancelOutput,
            1,
          ),
          () => (runtime === 'kubernetes' ? cancelWorkerJob(cancelId) : cleanup(cancelId)),
        );
        assert.ok(
          canceled.canceled,
          `Cancellation must be observed during an actual Lighthouse collection (worker exit ${canceled.code})`,
        );
        assert.notEqual(canceled.code, 0);
        if (runtime === 'kubernetes') {
          assert.notEqual(
            canceled.code,
            2,
            'Cooperative cancellation must retain the artifact-transfer path',
          );
        }
        console.log(
          JSON.stringify({
            verification: 'isolated-lighthouse',
            runtime,
            samples: 3,
            functional: 'passed',
            cancellation: 'passed',
            metrics: decisions.map(({ metric, status }) => ({ metric, status })),
          }),
        );
      } finally {
        await cleanup(id);
        await cleanup(cancelId);
        await rm(output, { recursive: true, force: true });
        await rm(cancelOutput, { recursive: true, force: true });
      }
    },
  );
}
