import type { Express } from 'express';
import { z } from 'zod';

import {
  nearestRankP95,
  type ResultState,
  summarizeHistory,
} from '../../../packages/domain/execution.ts';
import { calendar, organizationCalendar } from './calendar.ts';
import type { IdentityService } from './identity.ts';
import type { PlatformService } from './platform.ts';

const resultSchema = z.object({
  id: z.string().default('unknown'),
  caseId: z.string().optional(),
  browser: z.string().nullable().default(null),
  status: z.string(),
  expectedFailure: z.boolean().default(false),
  quarantined: z.boolean().default(false),
  parameterFingerprint: z.string().default('default'),
  attempts: z
    .array(
      z.object({
        status: z.string(),
        duration: z.number().nonnegative().optional(),
      }),
    )
    .default([]),
});
const completedSchema = z.object({
  results: z.array(resultSchema).default([]),
  endedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().optional(),
  config: z
    .object({
      environmentId: z.string().default('unknown'),
      video: z.string().default('off'),
    })
    .default({ environmentId: 'unknown', video: 'off' }),
  artifacts: z
    .array(
      z.object({
        resultId: z.string().optional(),
        attempt: z.number().optional(),
        name: z.string().default(''),
        expiresAt: z.iso.datetime().optional(),
        unavailableReason: z.string().optional(),
        exchange: z
          .object({
            durationMs: z.number().nonnegative(),
            status: z.number().optional(),
            method: z.string().default('unknown'),
            path: z.string().default('unknown'),
          })
          .optional(),
      }),
    )
    .default([]),
});
const normalize = (status: string): ResultState => {
  if (status === 'timedOut') {
    return 'failed';
  }
  if (status === 'interrupted') {
    return 'canceled';
  }
  return ['passed', 'failed', 'broken', 'skipped', 'canceled'].includes(status)
    ? (status as ResultState)
    : 'incomplete';
};
export function calculateAnalytics(
  input: unknown[],
  browser = 'all',
  timeZone = 'UTC',
): {
  quarantined: number;
  expectedFailures: number;
  runCount: number;
  evidence: {
    rate: number | null;
    eligibleAttempts: number;
    completeAttempts: number;
    missing: number;
    expired: number;
    unavailable: number;
    videoDisabledRuns: number;
  };
  endpoints: {
    samples: number;
    p95Ms: number | null;
    smallSample: boolean;
    method: string;
    path: string;
    transportFailures: number;
  }[];
  duration: { samples: number; averageMs: number | null; p95Ms: number | null };
  apiLatency: {
    samples: number;
    p95Ms: number | null;
    smallSample: boolean;
    transportFailures: number;
  };
  testDuration: { samples: number; medianMs: number | null; p95Ms: number | null };
  instability: {
    samples: number;
    failed: number;
    caseId: string;
    browser: string;
    environment: string;
    parameterFingerprint: string;
  }[];
  trends: {
    total: number;
    executed: number;
    excluded: number;
    passed: number;
    failed: number;
    broken: number;
    firstAttemptPassed: number;
    recovered: number;
    finalPassRate: number | null;
    firstAttemptPassRate: number | null;
    recoveredFlakyRate: number | null;
    day: string;
  }[];
  browsers: {
    total: number;
    executed: number;
    excluded: number;
    passed: number;
    failed: number;
    broken: number;
    firstAttemptPassed: number;
    recovered: number;
    finalPassRate: number | null;
    firstAttemptPassRate: number | null;
    recoveredFlakyRate: number | null;
    name: string;
  }[];
  failures: { caseId: string; count: number; samples: number; rate: number }[];
  total: number;
  executed: number;
  excluded: number;
  passed: number;
  failed: number;
  broken: number;
  firstAttemptPassed: number;
  recovered: number;
  finalPassRate: number | null;
  firstAttemptPassRate: number | null;
  recoveredFlakyRate: number | null;
} {
  const dates = calendar(timeZone);
  const runs = input
    .map((value) => completedSchema.parse(value))
    .map((run) => ({
      ...run,
      results: run.results.filter(
        (result) => browser === 'all' || (result.browser ?? 'api') === browser,
      ),
    }))
    .filter((run) => run.results.length)
    .map((run) => ({
      ...run,
      artifacts: run.artifacts.filter(
        (artifact) =>
          !artifact.resultId || run.results.some((result) => result.id === artifact.resultId),
      ),
    }));
  const summarize = (
    results: z.infer<typeof resultSchema>[],
  ): {
    total: number;
    executed: number;
    excluded: number;
    passed: number;
    failed: number;
    broken: number;
    firstAttemptPassed: number;
    recovered: number;
    finalPassRate: number | null;
    firstAttemptPassRate: number | null;
    recoveredFlakyRate: number | null;
  } =>
    summarizeHistory([
      {
        phase: 'completed',
        instances: results.map((result) => ({
          state: normalize(result.status),
          expectedFailure: result.expectedFailure,
          quarantined: result.quarantined,
          attempts: result.attempts.map((attempt) => normalize(attempt.status)),
        })),
      },
    ]);
  const results = runs.flatMap((run) => run.results);
  const days = [...new Set(runs.map((run) => dates.day(run.endedAt)))].sort();
  const durations = runs.flatMap((run) =>
    run.startedAt ? [Math.max(0, Date.parse(run.endedAt) - Date.parse(run.startedAt))] : [],
  );
  const latency =
    browser === 'all' || browser === 'api'
      ? runs.flatMap((run) =>
          run.artifacts.flatMap((item) =>
            item.exchange?.status ? [item.exchange.durationMs] : [],
          ),
        )
      : [];
  const failures = new Map<string, number>();
  const evidence = {
    eligibleAttempts: 0,
    completeAttempts: 0,
    missing: 0,
    expired: 0,
    unavailable: 0,
    videoDisabledRuns: runs.filter(
      (run) => run.config.video === 'off' && run.results.some((result) => result.browser),
    ).length,
  };
  const endpoints = new Map<
    string,
    {
      method: string;
      path: string;
      durations: number[];
      transportFailures: number;
    }
  >();
  for (const run of runs) {
    if (browser === 'all' || browser === 'api') {
      for (const artifact of run.artifacts) {
        if (!artifact.exchange) {
          continue;
        }
        const exchange = artifact.exchange;
        const route = exchange.path
          .split('?')[0]!
          .replace(/\/[a-f0-9]{8}-[a-f0-9-]{27,}/gi, '/:id')
          .replace(/\/\d+(?=\/|$)/g, '/:id');
        const key = `${exchange.method} ${route}`;
        const group = endpoints.get(key) ?? {
          method: exchange.method,
          path: route,
          durations: [],
          transportFailures: 0,
        };
        if (exchange.status) {
          group.durations.push(exchange.durationMs);
        } else {
          group.transportFailures++;
        }
        endpoints.set(key, group);
      }
    }
    for (const result of run.results) {
      if (result.expectedFailure || result.quarantined) {
        continue;
      }
      result.attempts.forEach((attempt, index) => {
        if (!['failed', 'timedOut', 'broken'].includes(attempt.status)) {
          return;
        }
        evidence.eligibleAttempts++;
        const required = result.browser
          ? ['screenshot', 'trace', ...(run.config.video === 'retain-on-failure' ? ['video'] : [])]
          : ['api'];
        let complete = true;
        for (const name of required) {
          const candidates = run.artifacts.filter(
            (artifact) =>
              artifact.resultId === result.id &&
              artifact.attempt === index + 1 &&
              (name === 'api' ? artifact.name.startsWith('api-') : artifact.name === name),
          );
          if (
            candidates.some(
              (item) =>
                !item.unavailableReason &&
                (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()),
            )
          ) {
            continue;
          }
          complete = false;
          if (
            candidates.some((item) => item.expiresAt && Date.parse(item.expiresAt) <= Date.now())
          ) {
            evidence.expired++;
          } else if (candidates.length) {
            evidence.unavailable++;
          } else {
            evidence.missing++;
          }
        }
        if (complete) {
          evidence.completeAttempts++;
        }
      });
    }
  }
  const exposure = new Map<string, number>();
  const eligible = results.filter(
    (result) =>
      !result.expectedFailure &&
      !result.quarantined &&
      ['passed', 'failed', 'broken', 'timedOut'].includes(result.status),
  );
  for (const result of eligible) {
    const key = result.caseId ?? result.id.split(':')[0]!;
    exposure.set(key, (exposure.get(key) ?? 0) + 1);
  }
  const durationSamples = eligible
    .filter(
      (result) =>
        result.attempts.length &&
        result.attempts.every((attempt) => attempt.duration !== undefined),
    )
    .map((result) => result.attempts.reduce((sum, attempt) => sum + attempt.duration!, 0))
    .sort((a, b) => a - b);
  const identities = new Map<
    string,
    {
      caseId: string;
      browser: string;
      environment: string;
      parameterFingerprint: string;
      statuses: string[];
    }
  >();
  for (const run of [...runs].sort((a, b) => b.endedAt.localeCompare(a.endedAt))) {
    for (const result of run.results) {
      if (
        result.expectedFailure ||
        result.quarantined ||
        !['passed', 'failed', 'broken', 'timedOut'].includes(result.status)
      ) {
        continue;
      }
      const caseId = result.caseId ?? result.id.split(':')[0]!;
      const key = JSON.stringify([
        caseId,
        result.browser,
        run.config.environmentId,
        result.parameterFingerprint,
      ]);
      const item = identities.get(key) ?? {
        caseId,
        browser: result.browser ?? 'api',
        environment: run.config.environmentId,
        parameterFingerprint: result.parameterFingerprint,
        statuses: [],
      };
      if (item.statuses.length < 10) {
        item.statuses.push(result.status);
      }
      identities.set(key, item);
    }
  }
  for (const result of results) {
    if (
      !result.expectedFailure &&
      !result.quarantined &&
      ['failed', 'broken', 'timedOut'].includes(result.status)
    ) {
      const key = result.caseId ?? result.id.split(':')[0]!;
      failures.set(key, (failures.get(key) ?? 0) + 1);
    }
  }
  return {
    ...summarize(results),
    quarantined: results.filter((result) => result.quarantined).length,
    expectedFailures: results.filter((result) => result.expectedFailure).length,
    runCount: runs.length,
    evidence: {
      ...evidence,
      rate: evidence.eligibleAttempts
        ? evidence.completeAttempts / evidence.eligibleAttempts
        : null,
    },
    endpoints: [...endpoints.values()]
      .map(({ durations, ...group }) => ({
        ...group,
        samples: durations.length,
        p95Ms: nearestRankP95(durations),
        smallSample: durations.length < 20,
      }))
      .sort((a, b) => b.samples - a.samples),
    duration: {
      samples: durations.length,
      averageMs: durations.length
        ? durations.reduce((sum, value) => sum + value, 0) / durations.length
        : null,
      p95Ms: nearestRankP95(durations),
    },
    apiLatency: {
      samples: latency.length,
      p95Ms: nearestRankP95(latency),
      smallSample: latency.length < 20,
      transportFailures:
        browser === 'all' || browser === 'api'
          ? runs
              .flatMap((run) => run.artifacts)
              .filter((item) => item.exchange && !item.exchange.status).length
          : 0,
    },
    testDuration: {
      samples: durationSamples.length,
      medianMs: durationSamples.length
        ? (durationSamples[Math.floor((durationSamples.length - 1) / 2)]! +
            durationSamples[Math.floor(durationSamples.length / 2)]!) /
          2
        : null,
      p95Ms: nearestRankP95(durationSamples),
    },
    instability: [...identities.values()]
      .filter(
        (item) =>
          item.statuses.length >= 5 &&
          item.statuses.includes('passed') &&
          item.statuses.some((status) => status !== 'passed'),
      )
      .map(({ statuses, ...item }) => ({
        ...item,
        samples: statuses.length,
        failed: statuses.filter((status) => status !== 'passed').length,
      })),
    trends: days.map((day) => ({
      day,
      ...summarize(
        runs.filter((run) => dates.day(run.endedAt) === day).flatMap((run) => run.results),
      ),
    })),
    browsers: [...new Set(results.map((result) => result.browser ?? 'api'))].sort().map((name) => ({
      name,
      ...summarize(results.filter((result) => (result.browser ?? 'api') === name)),
    })),
    failures: [...failures]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([caseId, count]) => ({
        caseId,
        count,
        samples: exposure.get(caseId) ?? 0,
        rate: count / (exposure.get(caseId) || 1),
      })),
  };
}
export function mountAnalytics(
  app: Express,
  identity: IdentityService,
  service: PlatformService,
): void {
  app.get('/v1/projects/:id/analytics', async (req, res) => {
    try {
      const principal = await identity.principal(req);
      if (!principal) {
        res.status(401).end();
        return;
      }
      const projectId = String(req.params['id']);
      service.authorize(principal, projectId);
      const filter = z
        .object({
          days: z.coerce.number().int().min(1).max(365).default(7),
          from: z.iso.date().optional(),
          to: z.iso.date().optional(),
          environment: z
            .string()
            .regex(/^[a-z][a-z0-9-]{0,63}$/)
            .optional(),
          suite: z.uuid().optional(),
          status: z.enum(['all', 'passed', 'failed', 'broken', 'skipped']).default('all'),
          browser: z.enum(['all', 'api', 'chromium', 'firefox', 'webkit']).default('all'),
        })
        .safeParse(req.query);
      if (!filter.success) {
        res.status(422).json({ title: 'Invalid analytics filters' });
        return;
      }
      const now = new Date();
      const to = filter.data.to
        ? organizationCalendar.start(
            new Date(Date.parse(filter.data.to) + 86400_000).toISOString().slice(0, 10),
          )
        : now;
      const from = filter.data.from
        ? organizationCalendar.start(filter.data.from)
        : new Date(to.getTime() - filter.data.days * 86400_000);
      const width = to.getTime() - from.getTime();
      if (width <= 0 || width > 366 * 86400_000 || from > now) {
        res.status(422).json({
          title: 'Choose an ordered history range of at most 366 days',
        });
        return;
      }
      const previousFrom = new Date(from.getTime() - width);
      const rows = (
        await service.db.query<{ body: unknown }>(
          "WITH matching AS (SELECT DISTINCT run_id FROM analytics_instances WHERE organization_id=$1 AND project_id=$2 AND ended_at >= $3 AND ended_at < $4 AND ($5::text IS NULL OR environment_id=$5)) SELECT jsonb_strip_nulls(jsonb_build_object('results',(SELECT jsonb_agg(i.result ORDER BY i.ordinal) FROM analytics_instances i WHERE i.run_id=p.id),'endedAt',p.body->'endedAt','startedAt',p.body->'startedAt','config',p.body->'config','artifacts',p.body->'artifacts')) AS body FROM matching m JOIN platform_documents p ON p.id=m.run_id WHERE ($6::text IS NULL OR p.body->'config'->'suite'->>'id'=$6)",
          [
            principal.organizationId,
            projectId,
            previousFrom.toISOString(),
            to.toISOString(),
            filter.data.environment ?? null,
            filter.data.suite ?? null,
          ],
        )
      ).rows;
      const records = rows
        .map((row) => completedSchema.parse(row.body))
        .map((run) => ({
          ...run,
          results: run.results.filter(
            (result) =>
              filter.data.status === 'all' || normalize(result.status) === filter.data.status,
          ),
        }));
      const current = records.filter((run) => Date.parse(run.endedAt) >= from.getTime());
      const previous = records.filter((run) => Date.parse(run.endedAt) < from.getTime());
      const summary = calculateAnalytics(
        current,
        filter.data.browser,
        organizationCalendar.timeZone,
      );
      const baseline = calculateAnalytics(
        previous,
        filter.data.browser,
        organizationCalendar.timeZone,
      );
      const identities = (values: typeof records): Set<string> =>
        new Set(
          values.flatMap((run) =>
            run.results
              .filter(
                (result) =>
                  filter.data.browser === 'all' ||
                  (result.browser ?? 'api') === filter.data.browser,
              )
              .map((result) =>
                JSON.stringify([
                  result.caseId ?? result.id,
                  result.browser,
                  run.config.environmentId,
                  result.parameterFingerprint,
                ]),
              ),
          ),
        );
      const currentIds = identities(current),
        previousIds = identities(previous);
      res.set('Cache-Control', 'no-store').json({
        ...summary,
        timeZone: organizationCalendar.timeZone,
        dataAsOf: now.toISOString(),
        generatedAt: now.toISOString(),
        comparison: {
          from: previousFrom.toISOString(),
          to: from.toISOString(),
          ...baseline,
          finalPassRateChange:
            summary.finalPassRate === null || baseline.finalPassRate === null
              ? null
              : summary.finalPassRate - baseline.finalPassRate,
          missingPriorIdentities: [...currentIds].filter((id) => !previousIds.has(id)).length,
          missingCurrentIdentities: [...previousIds].filter((id) => !currentIds.has(id)).length,
        },
        from: from.toISOString(),
        to: to.toISOString(),
        filters: filter.data,
        definitions: {
          executed:
            'Passed + failed + broken final instances; excludes expected failures, quarantined, skipped, canceled and incomplete',
          finalPassRate: 'Final passed / executed',
          firstAttemptPassRate: 'First-attempt passed / executed',
          recoveredFlakyRate: 'Passed after an earlier failure / executed',
          duration: 'Wall-clock elapsed time of completed runs containing matching instances',
          apiLatency:
            'Nearest-rank p95 of recorded non-authentication completed HTTP exchanges; transport failures counted separately',
          instability:
            'Case/browser/environment identities with both pass and failure across the last 10 eligible runs in the selected window, minimum 5; a candidate signal, not a root-cause diagnosis',
          comparison:
            'Identical filters over the preceding equal-length UTC interval; percentage-point change, with unmatched identity counts disclosed',
        },
      });
    } catch {
      res.status(404).json({ title: 'Analytics unavailable for this project' });
    }
  });
}
