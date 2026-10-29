import { z } from "zod";
import type { Express } from "express";
import { IdentityService } from "./identity.ts";
import { PlatformService } from "./platform.ts";
import {
  summarizeHistory,
  nearestRankP95,
  type ResultState,
} from "../../../packages/domain/execution.ts";

const resultSchema = z.object({
  id: z.string().default("unknown"),
  caseId: z.string().optional(),
  browser: z.string().nullable().default(null),
  status: z.string(),
  expectedFailure: z.boolean().default(false),
  attempts: z.array(z.object({ status: z.string() })).default([]),
});
const completedSchema = z.object({
  results: z.array(resultSchema).default([]),
  endedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().optional(),
  artifacts: z
    .array(
      z.object({
        exchange: z.object({ durationMs: z.number().nonnegative() }).optional(),
      }),
    )
    .default([]),
});
const normalize = (status: string): ResultState => {
  if (status === "timedOut") return "failed";
  if (status === "interrupted") return "canceled";
  return ["passed", "failed", "broken", "skipped", "canceled"].includes(status)
    ? (status as ResultState)
    : "incomplete";
};
export function calculateAnalytics(input: unknown[], browser = "all") {
  const runs = input
    .map((value) => completedSchema.parse(value))
    .map((run) => ({
      ...run,
      results: run.results.filter(
        (result) => browser === "all" || (result.browser ?? "api") === browser,
      ),
    }))
    .filter((run) => run.results.length);
  const summarize = (results: z.infer<typeof resultSchema>[]) =>
    summarizeHistory([
      {
        phase: "completed",
        instances: results.map((result) => ({
          state: normalize(result.status),
          expectedFailure: result.expectedFailure,
          attempts: result.attempts.map((attempt) => normalize(attempt.status)),
        })),
      },
    ]);
  const results = runs.flatMap((run) => run.results);
  const days = [...new Set(runs.map((run) => run.endedAt.slice(0, 10)))].sort();
  const durations = runs.flatMap((run) =>
    run.startedAt
      ? [Math.max(0, Date.parse(run.endedAt) - Date.parse(run.startedAt))]
      : [],
  );
  const latency =
    browser === "all" || browser === "api"
      ? runs.flatMap((run) =>
          run.artifacts.flatMap((item) =>
            item.exchange ? [item.exchange.durationMs] : [],
          ),
        )
      : [];
  const failures = new Map<string, number>();
  for (const result of results)
    if (
      !result.expectedFailure &&
      ["failed", "broken", "timedOut"].includes(result.status)
    ) {
      const key = result.caseId ?? result.id.split(":")[0]!;
      failures.set(key, (failures.get(key) ?? 0) + 1);
    }
  return {
    ...summarize(results),
    runCount: runs.length,
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
      smallSample: latency.length < 30,
    },
    trends: days.map((day) => ({
      day,
      ...summarize(
        runs
          .filter((run) => run.endedAt.startsWith(day))
          .flatMap((run) => run.results),
      ),
    })),
    browsers: [...new Set(results.map((result) => result.browser ?? "api"))]
      .sort()
      .map((name) => ({
        name,
        ...summarize(
          results.filter((result) => (result.browser ?? "api") === name),
        ),
      })),
    failures: [...failures]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([caseId, count]) => ({ caseId, count })),
  };
}
export function mountAnalytics(
  app: Express,
  identity: IdentityService,
  service: PlatformService,
) {
  app.get("/v1/projects/:id/analytics", async (req, res) => {
    try {
      const principal = await identity.principal(req);
      if (!principal) {
        res.status(401).end();
        return;
      }
      const projectId = String(req.params["id"]);
      service.authorize(principal, projectId);
      const filter = z
        .object({
          days: z.coerce.number().int().min(1).max(365).default(7),
          browser: z
            .enum(["all", "api", "chromium", "firefox", "webkit"])
            .default("all"),
        })
        .safeParse(req.query);
      if (!filter.success) {
        res.status(422).json({ title: "Invalid analytics filters" });
        return;
      }
      const to = new Date();
      const from = new Date(to.getTime() - filter.data.days * 86400_000);
      const rows = (
        await service.db.query<{ body: unknown }>(
          "SELECT body FROM platform_documents WHERE organization_id=$1 AND project_id=$2 AND kind='run' AND body->>'phase'='completed' AND (body->>'endedAt')::timestamptz BETWEEN $3 AND $4",
          [
            principal.organizationId,
            projectId,
            from.toISOString(),
            to.toISOString(),
          ],
        )
      ).rows;
      const summary = calculateAnalytics(
        rows.map((row) => row.body),
        filter.data.browser,
      );
      res.set("Cache-Control", "no-store").json({
        ...summary,
        dataAsOf: to.toISOString(),
        from: from.toISOString(),
        to: to.toISOString(),
        filters: filter.data,
        definitions: {
          executed:
            "Passed + failed + broken final instances; excludes skipped, canceled and incomplete",
          finalPassRate: "Final passed / executed",
          firstAttemptPassRate: "First-attempt passed / executed",
          recoveredFlakyRate: "Passed after an earlier failure / executed",
          duration:
            "Wall-clock elapsed time of completed runs containing matching instances",
          apiLatency:
            "Nearest-rank p95 of recorded non-authentication API exchanges, including HTTP and transport failures",
        },
      });
    } catch {
      res.status(404).json({ title: "Analytics unavailable for this project" });
    }
  });
}
