import { z } from "zod";
import type { Express } from "express";
import { IdentityService } from "./identity.ts";
import { PlatformService } from "./platform.ts";
import {
  summarizeHistory,
  type ResultState,
} from "../../../packages/domain/execution.ts";

const resultSchema = z.object({
  status: z.string(),
  expectedFailure: z.boolean().default(false),
  attempts: z.array(z.object({ status: z.string() })).default([]),
});
const completedSchema = z.object({
  results: z.array(resultSchema).default([]),
  endedAt: z.iso.datetime(),
});
const normalize = (status: string): ResultState => {
  if (status === "timedOut") return "failed";
  if (status === "interrupted") return "canceled";
  return ["passed", "failed", "broken", "skipped", "canceled"].includes(status)
    ? (status as ResultState)
    : "incomplete";
};
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
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 86400_000);
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
      const runs = rows.map((row) => completedSchema.parse(row.body));
      const summary = summarizeHistory(
        runs.map((run) => ({
          phase: "completed",
          instances: run.results.map((result) => ({
            state: normalize(result.status),
            expectedFailure: result.expectedFailure,
            attempts: result.attempts.map((attempt) =>
              normalize(attempt.status),
            ),
          })),
        })),
      );
      res
        .set("Cache-Control", "no-store")
        .json({
          ...summary,
          dataAsOf: to.toISOString(),
          from: from.toISOString(),
          to: to.toISOString(),
          runCount: runs.length,
          definitions: {
            executed:
              "Passed + failed + broken final instances; excludes skipped, canceled and incomplete",
            finalPassRate: "Final passed / executed",
            firstAttemptPassRate: "First-attempt passed / executed",
            recoveredFlakyRate: "Passed after an earlier failure / executed",
          },
        });
    } catch {
      res.status(404).json({ title: "Analytics unavailable for this project" });
    }
  });
}
