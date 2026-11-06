import { createHash } from 'node:crypto';

import { z } from 'zod';

const metricNames = ['lcpMs', 'cls', 'tbtMs', 'transferBytes'] as const;
type Metric = (typeof metricNames)[number];
const measurement = z.number().finite().nonnegative();
const metrics = z.object({
  lcpMs: measurement.nullable(),
  cls: measurement.nullable(),
  tbtMs: measurement.nullable(),
  transferBytes: measurement.nullable(),
});
export const lighthouseSummarySchema = z
  .object({
    version: z.literal(1),
    toolVersion: z.string(),
    capturedAt: z.iso.datetime(),
    route: z.string().max(100),
    formFactor: z.enum(['mobile', 'desktop']),
    profile: z.string(),
    validity: z.enum([
      'valid',
      'runtime-error',
      'route-mismatch',
      'missing-browser-version',
      'missing-profile',
    ]),
    metrics,
  })
  .strict();
export type LighthouseSummary = z.infer<typeof lighthouseSummarySchema>;
const audit = z.object({
  numericValue: measurement.nullish(),
  numericUnit: z.string().optional(),
  scoreDisplayMode: z.string().optional(),
});
const reportSchema = z.object({
  gatherMode: z.literal('navigation'),
  requestedUrl: z.url(),
  finalDisplayedUrl: z.url(),
  fetchTime: z.iso.datetime(),
  lighthouseVersion: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/),
  configSettings: z.object({
    formFactor: z.enum(['mobile', 'desktop']),
    throttlingMethod: z.enum(['simulate', 'devtools', 'provided']),
    screenEmulation: z
      .object({
        width: measurement,
        height: measurement,
        deviceScaleFactor: measurement,
        mobile: z.boolean(),
        disabled: z.boolean(),
      })
      .optional(),
    throttling: z
      .object({
        rttMs: measurement,
        throughputKbps: measurement,
        cpuSlowdownMultiplier: measurement,
      })
      .optional(),
  }),
  environment: z.object({ hostUserAgent: z.string().max(2000) }),
  runtimeError: z.object({ code: z.string() }).optional(),
  audits: z.record(z.string(), audit),
});
const routes = new Set([
  '/',
  '/index.html',
  '/inventory.html',
  '/cart.html',
  '/checkout-step-one.html',
  '/checkout-step-two.html',
  '/checkout-complete.html',
]);

/** Accept only controlled-store navigation summaries. Original JSON/DOM/URLs are never retained. */
export function summarizeLighthouse(input: unknown): LighthouseSummary {
  const report = reportSchema.parse(input);
  const requested = new URL(report.requestedUrl);
  const final = new URL(report.finalDisplayedUrl);
  for (const url of [requested, final]) {
    if (
      url.origin !== 'http://127.0.0.1:4013' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !routes.has(url.pathname)
    ) {
      throw new Error('Lighthouse report is outside the approved fixture routes');
    }
  }
  const chrome = /(?:HeadlessChrome|Chrome)\/([0-9.]+)/.exec(report.environment.hostUserAgent)?.[1];
  let validity: LighthouseSummary['validity'] = 'valid';
  if (report.runtimeError) {
    validity = 'runtime-error';
  } else if (requested.pathname !== final.pathname) {
    validity = 'route-mismatch';
  } else if (!chrome) {
    validity = 'missing-browser-version';
  } else if (
    !report.configSettings.throttling &&
    report.configSettings.throttlingMethod !== 'provided'
  ) {
    validity = 'missing-profile';
  }
  const value = (id: string, unit: string): number | null => {
    const item = report.audits[id];
    return item?.numericUnit === unit && item.scoreDisplayMode !== 'error'
      ? (item.numericValue ?? null)
      : null;
  };
  return {
    version: 1,
    toolVersion: report.lighthouseVersion,
    capturedAt: report.fetchTime,
    route: requested.pathname,
    formFactor: report.configSettings.formFactor,
    profile: createHash('sha256')
      .update(JSON.stringify([report.lighthouseVersion, chrome, report.configSettings]))
      .digest('hex'),
    validity,
    metrics: {
      lcpMs: value('largest-contentful-paint', 'millisecond'),
      cls: value('cumulative-layout-shift', 'unitless'),
      tbtMs: value('total-blocking-time', 'millisecond'),
      transferBytes: value('total-byte-weight', 'byte'),
    },
  };
}
const budgetsSchema = z
  .object({ lcpMs: measurement, cls: measurement, tbtMs: measurement, transferBytes: measurement })
  .strict();
export const controlledPerformanceBudgets = {
  lcpMs: 2500,
  cls: 0.1,
  tbtMs: 200,
  transferBytes: 1_000_000,
} as const;
export const performanceCheckpoint = z.discriminatedUnion('status', [
  z
    .object({
      version: z.literal(1),
      status: z.literal('measured'),
      samples: z.array(lighthouseSummarySchema).length(3),
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      status: z.literal('unavailable'),
      reason: z.enum(['measurement-failed', 'profile-not-supported', 'target-not-approved']),
    })
    .strict(),
]);
export type PerformanceCheckpoint = z.infer<typeof performanceCheckpoint>;
export function importPerformanceCheckpoint(input: unknown): PerformanceCheckpoint {
  const envelope = z
    .discriminatedUnion('status', [
      z
        .object({
          version: z.literal(1),
          status: z.literal('measured'),
          reports: z.array(z.unknown()).length(3),
        })
        .strict(),
      z
        .object({
          version: z.literal(1),
          status: z.literal('unavailable'),
          reason: z.enum(['measurement-failed', 'profile-not-supported', 'target-not-approved']),
        })
        .strict(),
    ])
    .parse(input);
  return envelope.status === 'unavailable'
    ? envelope
    : performanceCheckpoint.parse({
        version: 1,
        status: 'measured',
        samples: envelope.reports.map((input) => {
          const report = reportSchema.parse(input);
          const screen = report.configSettings.screenEmulation;
          const throttle = report.configSettings.throttling;
          if (
            report.requestedUrl !== 'http://127.0.0.1:4013/inventory.html' ||
            report.configSettings.formFactor !== 'desktop' ||
            report.configSettings.throttlingMethod !== 'simulate' ||
            throttle?.rttMs !== 40 ||
            throttle.throughputKbps !== 10_240 ||
            throttle.cpuSlowdownMultiplier !== 1 ||
            screen?.width !== 1350 ||
            screen.height !== 940 ||
            screen.deviceScaleFactor !== 1 ||
            screen.mobile ||
            screen.disabled
          ) {
            throw new Error('Unsupported benchmark measurement profile');
          }
          return summarizeLighthouse(input);
        }),
      });
}
export function performanceCoverage(
  results: readonly { id: string; browser: string | null; attempts: readonly unknown[] }[],
  artifacts: readonly {
    resultId: string;
    attempt: number;
    unavailableReason?: string | undefined;
    performance?: PerformanceCheckpoint | undefined;
  }[],
): {
  resultId: string;
  checkpoint: PerformanceCheckpoint | null;
  decisions: PerformanceDecision[];
}[] {
  return results
    .filter((result) => result.browser === 'chromium')
    .map((result) => {
      const matching = artifacts.filter(
        (item) =>
          item.resultId === result.id &&
          item.attempt === result.attempts.length &&
          !item.unavailableReason &&
          item.performance,
      );
      const checkpoint = matching.length === 1 ? matching[0]!.performance! : null;
      return {
        resultId: result.id,
        checkpoint,
        decisions:
          checkpoint?.status === 'measured'
            ? evaluateLighthouseBudgets(checkpoint.samples, controlledPerformanceBudgets)
            : [],
      };
    });
}
export interface PerformanceDecision {
  metric: Metric;
  status: 'pass' | 'fail' | 'inconclusive';
  samples: number;
  median: number | null;
  minimum: number | null;
  maximum: number | null;
  limit: number;
  reason:
    | 'absolute-budget'
    | 'insufficient-samples'
    | 'invalid-measurement'
    | 'incompatible-profile'
    | 'duplicate-samples'
    | 'high-variability'
    | 'missing-metric';
}

/** Laboratory-only, advisory evaluator. It never changes functional outcomes or invents field INP. */
export function evaluateLighthouseBudgets(
  reports: readonly LighthouseSummary[],
  input: unknown,
): PerformanceDecision[] {
  const budgets = budgetsSchema.parse(input);
  let invalid: PerformanceDecision['reason'] | null = null;
  if (reports.length !== 3) {
    invalid = 'insufficient-samples';
  } else if (reports.some((report) => report.validity !== 'valid')) {
    invalid = 'invalid-measurement';
  } else if (new Set(reports.map((report) => report.route + ':' + report.profile)).size !== 1) {
    invalid = 'incompatible-profile';
  } else if (new Set(reports.map((report) => report.capturedAt)).size !== reports.length) {
    invalid = 'duplicate-samples';
  }
  return metricNames.map((metric) => {
    const values = reports
      .map((report) => report.metrics[metric])
      .filter((value) => value !== null)
      .sort((a, b) => a - b);
    const minimum = values[0] ?? null;
    const maximum = values.at(-1) ?? null;
    const median = values.length === 3 ? values[1]! : null;
    let reason: PerformanceDecision['reason'] | null = invalid;
    if (!reason && values.length !== reports.length) {
      reason = 'missing-metric';
    }
    if (
      !reason &&
      ['lcpMs', 'tbtMs'].includes(metric) &&
      minimum !== null &&
      maximum !== null &&
      median !== null &&
      maximum - minimum > Math.max(1, median) * 0.2
    ) {
      reason = 'high-variability';
    }
    let status: PerformanceDecision['status'] = 'inconclusive';
    if (!reason && median !== null) {
      const observed = metric === 'transferBytes' ? maximum! : median;
      status = observed > budgets[metric] ? 'fail' : 'pass';
    }
    return {
      metric,
      status,
      samples: values.length,
      median,
      minimum,
      maximum,
      limit: budgets[metric],
      reason: reason ?? 'absolute-budget',
    };
  });
}
