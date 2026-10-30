import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateAnalytics } from '../src/analytics.ts';

await test('quarantine is explicit and parameter identities cannot create false instability', () => {
  const runs = Array.from({ length: 5 }, (_, index) => ({
    endedAt: `2026-10-${20 + index}T10:00:00Z`,
    results: [
      {
        id: 'case:a',
        caseId: 'case',
        status: 'passed',
        parameterFingerprint: 'a',
        attempts: [{ status: 'passed' }],
      },
      {
        id: 'case:b',
        caseId: 'case',
        status: 'failed',
        parameterFingerprint: 'b',
        attempts: [{ status: 'failed' }],
      },
      { id: 'quarantine', status: 'failed', quarantined: true },
    ],
  }));
  const summary = calculateAnalytics(runs);
  assert.equal(summary.executed, 10);
  assert.equal(summary.quarantined, 5);
  assert.equal(summary.finalPassRate, 0.5);
  assert.deepEqual(summary.instability, []);
});

await test('analytics keeps API browserless, honors denominators and uses recorded request latency', () => {
  const runs = [
    {
      startedAt: '2026-10-29T10:00:00Z',
      endedAt: '2026-10-29T10:00:10Z',
      results: [
        { id: 'LAB-001', status: 'passed', attempts: [{ status: 'passed' }] },
        {
          id: 'UI-001:chromium',
          browser: 'chromium',
          status: 'passed',
          attempts: [{ status: 'failed' }, { status: 'passed' }],
        },
        {
          id: 'UI-002:firefox',
          browser: 'firefox',
          status: 'failed',
          attempts: [{ status: 'failed' }],
        },
        { id: 'UI-003:chromium', browser: 'chromium', status: 'skipped' },
        {
          id: 'UI-004:chromium',
          browser: 'chromium',
          status: 'failed',
          expectedFailure: true,
        },
      ],
      artifacts: [10, 20, 30, 40].map((durationMs) => ({
        exchange: { durationMs, status: 200 },
      })),
    },
  ];
  const all = calculateAnalytics(runs);
  assert.equal(all.executed, 3);
  assert.equal(all.finalPassRate, 2 / 3);
  assert.equal(all.firstAttemptPassRate, 1 / 3);
  assert.equal(all.recoveredFlakyRate, 1 / 3);
  assert.equal(all.apiLatency.p95Ms, 40);
  assert.equal(all.duration.averageMs, 10000);
  assert.deepEqual(all.failures, [{ caseId: 'UI-002', count: 1, samples: 1, rate: 1 }]);
  assert.equal(calculateAnalytics(runs, 'api').executed, 1);
  assert.equal(calculateAnalytics(runs, 'chromium').executed, 1);
  assert.equal(calculateAnalytics(runs, 'chromium').apiLatency.samples, 0);
  assert.equal(calculateAnalytics([]).finalPassRate, null);
});

await test('instability requires five comparable runs and latency excludes transport failures', () => {
  const runs = Array.from({ length: 5 }, (_, index) => ({
    endedAt: `2026-10-${20 + index}T10:00:00Z`,
    config: { environmentId: 'qa' },
    results: [
      {
        id: 'LAB-001',
        status: index === 0 ? 'failed' : 'passed',
        attempts: [{ status: 'passed', duration: 100 + index }],
      },
    ],
    artifacts: [{ exchange: { durationMs: 5000 } }, { exchange: { durationMs: 50, status: 500 } }],
  }));
  assert.equal(calculateAnalytics(runs.slice(1)).instability.length, 0);
  const summary = calculateAnalytics(runs);
  assert.deepEqual(summary.instability, [
    {
      caseId: 'LAB-001',
      browser: 'api',
      environment: 'qa',
      parameterFingerprint: 'default',
      samples: 5,
      failed: 1,
    },
  ]);
  assert.equal(summary.apiLatency.p95Ms, 50);
  assert.equal(summary.apiLatency.transportFailures, 5);
  assert.equal(summary.testDuration.medianMs, 102);
  assert.equal(summary.testDuration.p95Ms, 104);
});

await test('evidence completeness retains retry failures and distinguishes missing, expired and unavailable items', () => {
  const summary = calculateAnalytics([
    {
      endedAt: '2026-01-01T10:00:00Z',
      config: { environmentId: 'qa', video: 'retain-on-failure' },
      results: [
        {
          id: 'UI-001:chromium',
          browser: 'chromium',
          status: 'passed',
          attempts: [{ status: 'failed' }, { status: 'passed' }],
        },
        { id: 'LAB-001', status: 'failed', attempts: [{ status: 'failed' }] },
      ],
      artifacts: [
        {
          resultId: 'UI-001:chromium',
          attempt: 1,
          name: 'trace',
          expiresAt: '2000-01-01T00:00:00Z',
        },
        {
          resultId: 'UI-001:chromium',
          attempt: 1,
          name: 'video',
          unavailableReason: 'Upload failed',
        },
        {
          resultId: 'LAB-001',
          attempt: 1,
          name: 'api-exchange.json',
          exchange: {
            method: 'GET',
            path: '/orders/42',
            status: 500,
            durationMs: 17,
          },
        },
      ],
    },
  ]);
  assert.deepEqual(summary.evidence, {
    eligibleAttempts: 2,
    completeAttempts: 1,
    rate: 0.5,
    missing: 1,
    expired: 1,
    unavailable: 1,
    videoDisabledRuns: 0,
  });
  assert.deepEqual(summary.endpoints, [
    {
      method: 'GET',
      path: '/orders/:id',
      samples: 1,
      p95Ms: 17,
      transportFailures: 0,
      smallSample: true,
    },
  ]);
});
