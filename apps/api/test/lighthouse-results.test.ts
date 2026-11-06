import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { captureAttachments } from '../src/artifacts.ts';
import {
  evaluateLighthouseBudgets,
  executionPerformanceCoverage,
  performanceCoverage,
  summarizeLighthouse,
} from '../src/lighthouse-results.ts';
import { objectStore } from '../src/object-store.ts';

const report = (second: number, lcp = 2000): unknown => ({
  gatherMode: 'navigation',
  requestedUrl: 'http://127.0.0.1:4013/inventory.html',
  finalDisplayedUrl: 'http://127.0.0.1:4013/inventory.html',
  fetchTime: `2026-11-06T10:00:0${second}.000Z`,
  lighthouseVersion: '12.8.0',
  configSettings: {
    formFactor: 'desktop',
    throttlingMethod: 'simulate',
    throttling: { rttMs: 40, throughputKbps: 10_240, cpuSlowdownMultiplier: 1 },
    screenEmulation: {
      width: 1350,
      height: 940,
      deviceScaleFactor: 1,
      mobile: false,
      disabled: false,
    },
  },
  environment: { hostUserAgent: 'HeadlessChrome/130.0.0.0' },
  audits: {
    'largest-contentful-paint': { numericValue: lcp, numericUnit: 'millisecond' },
    'cumulative-layout-shift': { numericValue: 0.05, numericUnit: 'unitless' },
    'total-blocking-time': { numericValue: 100, numericUnit: 'millisecond' },
    'total-byte-weight': { numericValue: 200_000, numericUnit: 'byte' },
  },
  fullPageScreenshot: { screenshot: { data: 'PRIVATE_DOM_CANARY' } },
});
const budgets = { lcpMs: 2500, cls: 0.1, tbtMs: 200, transferBytes: 250_000 };
await test('Lighthouse normalization omits raw content and advisory gates retain sample validity', () => {
  const samples = [1, 2, 3].map((second) => summarizeLighthouse(report(second)));
  assert.ok(!JSON.stringify(samples).includes('PRIVATE_DOM_CANARY'));
  assert.ok(!JSON.stringify(samples).includes('http://'));
  assert.ok(
    evaluateLighthouseBudgets(samples, budgets).every((decision) => decision.status === 'pass'),
  );
  assert.ok(
    evaluateLighthouseBudgets(samples.slice(0, 1), budgets).every(
      (decision) => decision.status === 'inconclusive',
    ),
  );
  assert.equal(
    evaluateLighthouseBudgets([samples[0]!, samples[0]!, samples[0]!], budgets)[0]?.reason,
    'duplicate-samples',
  );
  assert.equal(
    evaluateLighthouseBudgets(
      [samples[0]!, samples[1]!, { ...samples[2]!, profile: 'other' }],
      budgets,
    )[0]?.reason,
    'incompatible-profile',
  );
  assert.equal(
    evaluateLighthouseBudgets(
      [1, 2, 3].map((second) => summarizeLighthouse(report(second, 3000))),
      budgets,
    )[0]?.status,
    'fail',
  );
  assert.equal(
    evaluateLighthouseBudgets(
      [samples[0]!, samples[1]!, summarizeLighthouse(report(3, 4000))],
      budgets,
    )[0]?.reason,
    'high-variability',
  );
  assert.equal(
    evaluateLighthouseBudgets(
      samples.map((sample) => ({ ...sample, metrics: { ...sample.metrics, lcpMs: null } })),
      budgets,
    )[0]?.reason,
    'missing-metric',
  );
  assert.equal(
    evaluateLighthouseBudgets(
      samples.map((sample) => ({ ...sample, validity: 'runtime-error' })),
      budgets,
    )[0]?.reason,
    'invalid-measurement',
  );
  const changed = { ...samples[2]!, metrics: { ...samples[2]!.metrics, transferBytes: 300_000 } };
  assert.equal(
    evaluateLighthouseBudgets([samples[0]!, samples[1]!, changed], budgets)[3]?.status,
    'fail',
  );
});

await test('Lighthouse boundaries reject external or credential-bearing routes and do not pass redirects', () => {
  const input = report(1);
  assert.ok(input && typeof input === 'object');
  assert.throws(() => summarizeLighthouse({ ...input, requestedUrl: 'https://external.test/' }));
  assert.throws(() =>
    summarizeLighthouse({
      ...input,
      requestedUrl: 'http://127.0.0.1:4013/inventory.html?token=canary',
    }),
  );
  assert.equal(
    summarizeLighthouse({ ...input, finalDisplayedUrl: 'http://127.0.0.1:4013/' }).validity,
    'route-mismatch',
  );
  assert.equal(
    summarizeLighthouse({
      ...input,
      runtimeError: { code: 'NO_DOCUMENT_REQUEST', message: 'PRIVATE_ERROR' },
    }).validity,
    'runtime-error',
  );
});

await test('performance evidence import retains only bounded metrics and requires unique final-attempt evidence', async () => {
  const id = randomUUID();
  const root = fileURLToPath(new URL(`../../../.local/runs/${id}/`, import.meta.url));
  await mkdir(root, { recursive: true });
  const attachment = (input: unknown): { name: string; contentType: string; body: string } => ({
    name: 'performance-checkpoint.json',
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(input)).toString('base64'),
  });
  const [valid, invalid] = await captureAttachments(
    id,
    'UI-001:chromium',
    1,
    [
      attachment({
        version: 1,
        status: 'measured',
        reports: [1, 2, 3].map((second) => report(second)),
      }),
      attachment({ version: 1, status: 'measured', reports: [report(1)] }),
    ],
    (value) => value,
  );
  assert.equal(valid?.performance?.status, 'measured');
  assert.ok(valid);
  assert.equal(valid.unavailableReason, undefined);
  const bytes = (
    valid.object && objectStore
      ? await objectStore.get(valid.object)
      : await readFile(`${root}/artifacts/${valid.id}`)
  ).toString('utf8');
  assert.ok(!bytes.includes('PRIVATE_DOM_CANARY'));
  assert.ok(!bytes.includes('requestedUrl'));
  assert.ok(invalid?.unavailableReason);
  const results = [{ id: 'UI-001:chromium', browser: 'chromium', attempts: [{}] }];
  assert.equal(performanceCoverage(results, [valid])[0]?.decisions.length, 4);
  const runArtifact = { ...valid, resultId: 'catalog-benchmark' };
  assert.equal(executionPerformanceCoverage([valid])[0]?.checkpoint, null);
  assert.equal(executionPerformanceCoverage([valid, runArtifact])[0]?.decisions.length, 4);
  assert.equal(executionPerformanceCoverage([runArtifact, runArtifact])[0]?.checkpoint, null);
  assert.equal(executionPerformanceCoverage([{ ...runArtifact, attempt: 2 }])[0]?.checkpoint, null);
  assert.equal(performanceCoverage(results, [valid, valid])[0]?.checkpoint, null);
  assert.equal(
    performanceCoverage([{ ...results[0]!, attempts: [{}, {}] }], [valid])[0]?.checkpoint,
    null,
  );
});
