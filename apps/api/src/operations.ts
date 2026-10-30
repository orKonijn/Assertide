import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { Redis } from "ioredis";
import type { Express } from "express";
import type { SqlConnection } from "./database.ts";
import type { IdentityService } from "./identity.ts";
import { objectStore } from "./object-store.ts";
import { executionLimits } from "./scheduler.ts";
import { vaultHealth } from "./vault.ts";

export async function readiness(db: SqlConnection) {
  const checks: Record<string, () => Promise<unknown>> = {
    database: () => db.query("SELECT 1"),
  };
  if (process.env["SECRET_BACKEND"] === "vault") checks["vault"] = vaultHealth;
  const store = objectStore;
  if (store)
    checks["storage"] = () =>
      store.client.send(new HeadBucketCommand({ Bucket: store.bucket }), {
        abortSignal: AbortSignal.timeout(2000),
      });
  if (process.env["REDIS_URL"])
    checks["queue"] = async () => {
      const redis = new Redis(process.env["REDIS_URL"]!, {
        lazyConnect: true,
        connectTimeout: 1500,
        commandTimeout: 1500,
        enableOfflineQueue: false,
        retryStrategy: () => null,
        maxRetriesPerRequest: 0,
      });
      redis.on("error", () => {});
      try {
        await redis.connect();
        await redis.ping();
      } finally {
        redis.disconnect();
      }
    };
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, probe]) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          probe(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("timeout")), 2500);
          }),
        ]);
        return [name, "ok"];
      } catch {
        return [name, "unavailable"];
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return {
    status: entries.every(([, state]) => state === "ok")
      ? "ready"
      : "unavailable",
    checkedAt: new Date().toISOString(),
    dependencies: Object.fromEntries(entries),
  };
}
export function mountOperations(
  app: Express,
  db: SqlConnection,
  identity: IdentityService,
) {
  let cached: ReturnType<typeof readiness> | undefined;
  let until = 0;
  const check = () => {
    if (!cached || Date.now() > until) {
      cached = readiness(db);
      until = Date.now() + 5000;
    }
    return cached;
  };
  if (process.env["METRICS_ENABLED"] === "true") {
    // Internal service endpoint: intentionally absent from the public web proxy.
    app.get("/internal/metrics", async (_req, res) => {
      try {
        const row = (
          await db.query<{
            queued: string;
            oldest_seconds: string;
            expired: string;
            report_failures: string;
          }>(
            "SELECT count(*) FILTER(WHERE body->>'phase'='queued') AS queued,COALESCE(EXTRACT(EPOCH FROM now()-min((body->>'createdAt')::timestamptz) FILTER(WHERE body->>'phase'='queued')),0) AS oldest_seconds,count(*) FILTER(WHERE body->>'phase' IN ('running','provisioning','finalizing') AND (body->>'leaseExpires')::timestamptz<now()) AS expired,count(*) FILTER(WHERE body->>'reportPhase'='failed') AS report_failures FROM platform_documents WHERE kind='run'",
          )
        ).rows[0];
        const values = {
          queued: row?.queued,
          queue_oldest_seconds: row?.oldest_seconds,
          expired_leases: row?.expired,
          failed_reports: row?.report_failures,
        };
        const lines = Object.entries(values).flatMap(([name, raw]) => {
          const value = Number(raw ?? 0);
          if (!Number.isFinite(value)) throw new Error("Invalid metric");
          return [
            `# TYPE assertide_${name} gauge`,
            `assertide_${name} ${Math.max(0, value)}`,
          ];
        });
        res
          .set("Cache-Control", "no-store")
          .type("text/plain")
          .send(lines.join("\n") + "\n");
      } catch {
        res.status(503).end();
      }
    });
  }
  app.get("/ready", async (_req, res) => {
    const state = await check();
    res
      .set("Cache-Control", "no-store")
      .status(state.status === "ready" ? 200 : 503)
      .json({ status: state.status });
  });
  app.get("/v1/operations", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const principal = await identity.principal(req);
    if (!principal) {
      res.status(401).end();
      return;
    }
    if (principal.role !== "administrator" || principal.machine) {
      res.status(403).end();
      return;
    }
    const state = await check();
    const rows = await db.query<{
      phase: string;
      count: string;
      workers: string;
    }>(
      "SELECT body->>'phase' AS phase,count(*) AS count,COALESCE(sum((body->'config'->>'workers')::int),0) AS workers FROM platform_documents WHERE kind='run' AND organization_id=$1 AND project_id=ANY($2::uuid[]) GROUP BY body->>'phase'",
      [principal.organizationId, principal.projectIds],
    );
    const conditions = await db.query<{
      oldest: string | null;
      expired: string;
      failed_reports: string;
    }>(
      "SELECT min(body->>'createdAt') FILTER(WHERE body->>'phase'='queued') AS oldest,count(*) FILTER(WHERE body->>'phase' IN ('running','provisioning','finalizing') AND (body->>'leaseExpires')::timestamptz<now()) AS expired,count(*) FILTER(WHERE body->>'reportPhase'='failed') AS failed_reports FROM platform_documents WHERE kind='run' AND organization_id=$1 AND project_id=ANY($2::uuid[])",
      [principal.organizationId, principal.projectIds],
    );
    const condition = conditions.rows[0];
    res.json({
      ...state,
      scope: "Authorized projects",
      phases: rows.rows.map((row) => ({
        phase: row.phase,
        count: Number(row.count),
        workers: Number(row.workers),
      })),
      oldestQueuedAt: condition?.oldest ?? null,
      expiredLeases: Number(condition?.expired ?? 0),
      failedReports: Number(condition?.failed_reports ?? 0),
      retentionDays: { traceVideo: 14, rawReports: 30, resultsAudit: 365 },
      quota: executionLimits(),
    });
  });
}
