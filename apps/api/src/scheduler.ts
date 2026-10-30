import { Queue, Worker, DelayedError } from "bullmq";
import { z } from "zod";
import type { SqlConnection, SqlExecutor } from "./database.ts";
import { migrate } from "./migrations.ts";
export function executionLimits() {
  const limit = (name: string, fallback: number, max: number) =>
    z.coerce
      .number()
      .int()
      .min(1)
      .max(max)
      .parse(process.env[name] ?? fallback);
  return {
    projectRuns: limit("MAX_PROJECT_RUNS", 2, 100),
    organizationRuns: limit("MAX_ORGANIZATION_RUNS", 4, 500),
    organizationWorkers: limit("MAX_ORGANIZATION_WORKERS", 8, 1000),
  };
}

export async function initializeScheduler(db: SqlConnection) {
  await migrate(db, "scheduler-baseline-v1", [
    "CREATE TABLE IF NOT EXISTS scheduler_mutex (id integer PRIMARY KEY)",
    "INSERT INTO scheduler_mutex(id) VALUES(1) ON CONFLICT DO NOTHING",
    "CREATE TABLE IF NOT EXISTS run_outbox (run_id text PRIMARY KEY REFERENCES platform_documents(id), created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz)",
  ]);
  await db.query(
    "INSERT INTO run_outbox(run_id) SELECT id FROM platform_documents WHERE kind='run' AND body->>'phase'='queued' ON CONFLICT DO NOTHING",
  );
}
export async function claimExecution(
  db: SqlConnection,
  owner: string,
  id?: string,
) {
  return db.transaction(async (tx) => {
    await tx.query("SELECT id FROM scheduler_mutex WHERE id=1 FOR UPDATE");
    const target = (
      await tx.query<{
        id: string;
        organization_id: string;
        project_id: string;
        workers: number;
      }>(
        "SELECT id,organization_id,project_id,(body->'config'->>'workers')::int AS workers FROM platform_documents WHERE kind='run' AND body->>'phase'='queued' AND ($1::text IS NULL OR id=$1) ORDER BY body->>'createdAt' LIMIT 1",
        [id ?? null],
      )
    ).rows[0];
    if (!target) return undefined;
    const active = (
      await tx.query<{ runs: string; workers: string; project_runs: string }>(
        "SELECT count(*) AS runs,COALESCE(sum((body->'config'->>'workers')::int),0) AS workers,count(*) FILTER(WHERE project_id=$2) AS project_runs FROM platform_documents WHERE organization_id=$1 AND kind='run' AND body->>'phase' IN ('running','provisioning','finalizing')",
        [target.organization_id, target.project_id],
      )
    ).rows[0];
    const limits = executionLimits();
    if (
      Number(active?.runs) >= limits.organizationRuns ||
      Number(active?.project_runs) >= limits.projectRuns ||
      Number(active?.workers) + target.workers > limits.organizationWorkers
    ) {
      await tx.query(
        "UPDATE platform_documents SET body=jsonb_set(body,'{queueReason}','\"Waiting for project or organization worker capacity\"') WHERE id=$1",
        [target.id],
      );
      return undefined;
    }
    return (
      await tx.query<{ body: Record<string, unknown> }>(
        `UPDATE platform_documents SET body=(body-'queueReason') || jsonb_build_object('phase','running','leaseOwner',$1::text,'leaseEpoch',COALESCE((body->>'leaseEpoch')::int,0)+1,'leaseExpires',now()+interval '30 seconds'),version=version+1 WHERE id=$2 AND body->>'phase'='queued' RETURNING body`,
        [owner, target.id],
      )
    ).rows[0]?.body;
  });
}
export class CapacityUnavailable extends Error {}
export async function renewLease(
  db: SqlConnection,
  id: string,
  owner: string,
  epoch: number,
) {
  const result = await db.query(
    `UPDATE platform_documents SET body=jsonb_set(body,'{leaseExpires}',to_jsonb(now()+interval '30 seconds')) WHERE id=$1 AND body->>'leaseOwner'=$2 AND (body->>'leaseEpoch')::int=$3 AND (body->>'leaseExpires')::timestamptz>now() RETURNING id`,
    [id, owner, epoch],
  );
  if (!result.rows.length) throw new Error("Execution lease lost");
}
export async function updateOwnedRun(
  db: SqlExecutor,
  id: string,
  owner: string,
  epoch: number,
  patch: Record<string, unknown>,
) {
  const result = await db.query(
    `WITH updated AS (UPDATE platform_documents SET body=body || $1::jsonb || CASE WHEN body->>'cancelRequested'='true' AND $1::jsonb->>'phase'='completed' THEN '{"phase":"canceled","reportPhase":"failed"}'::jsonb ELSE '{}'::jsonb END,version=version+1 WHERE id=$2 AND body->>'leaseOwner'=$3 AND (body->>'leaseEpoch')::int=$4 AND (body->>'leaseExpires')::timestamptz>now() AND (NOT $1::jsonb ? 'phase' OR body->>'phase' IN ('running','provisioning','finalizing')) RETURNING id,body) INSERT INTO run_events(run_id,body) SELECT id,$1::jsonb || jsonb_build_object('phase',body->>'phase','reportPhase',body->>'reportPhase') FROM updated RETURNING run_id`,
    [JSON.stringify(patch), id, owner, epoch],
  );
  if (!result.rows.length) throw new Error("Stale worker update rejected");
}
export async function recoverExpiredLeases(db: SqlConnection) {
  await db.query(
    `UPDATE platform_documents SET body=body || jsonb_build_object('phase','infrastructure_error','reportPhase','failed','endedAt',now(),'diagnostic','Worker lease expired before terminal manifest','leaseEpoch',COALESCE((body->>'leaseEpoch')::int,0)+1),version=version+1 WHERE kind='run' AND body->>'phase' IN ('running','provisioning','finalizing') AND COALESCE((body->>'leaseExpires')::timestamptz,'-infinity'::timestamptz)<now()`,
  );
  await db.query(
    `UPDATE platform_documents SET body=body || jsonb_build_object('reportPhase','failed','reportDiagnostic','Report worker lease expired','leaseEpoch',COALESCE((body->>'leaseEpoch')::int,0)+1),version=version+1 WHERE kind='run' AND body->>'phase'='completed' AND body->>'reportPhase'='generating' AND COALESCE((body->>'leaseExpires')::timestamptz,'-infinity'::timestamptz)<now()`,
  );
}

/** PostgreSQL outbox is authoritative; Redis is a redeliverable transport. */
export class RedisTransport {
  private readonly queue: Queue;
  private readonly worker: Worker;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private pumping: Promise<void> = Promise.resolve();
  constructor(
    private readonly db: SqlConnection,
    url: string,
    processRun: (id: string) => Promise<void>,
    name = "assertide-executions",
  ) {
    const parsed = new URL(url);
    if (!["redis:", "rediss:"].includes(parsed.protocol))
      throw new Error("Invalid Redis protocol");
    const connection = {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: decodeURIComponent(parsed.username) || undefined,
      password: decodeURIComponent(parsed.password) || undefined,
      db: Number(parsed.pathname.slice(1) || 0),
      ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    };
    this.queue = new Queue(name, {
      connection: { ...connection, maxRetriesPerRequest: 1 },
      defaultJobOptions: {
        attempts: 10,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { age: 86400, count: 10000 },
        removeOnFail: { age: 86400 * 7 },
      },
    });
    this.worker = new Worker(
      name,
      async (job, token) => {
        try {
          await processRun(z.object({ runId: z.uuid() }).parse(job.data).runId);
        } catch (error) {
          if (!(error instanceof CapacityUnavailable)) throw error;
          await job.moveToDelayed(Date.now() + 1000, token);
          throw new DelayedError();
        }
      },
      {
        connection: { ...connection, maxRetriesPerRequest: null },
        concurrency: 1,
      },
    );
    this.queue.on("error", () =>
      console.error("Queue transport unavailable; outbox retained"),
    );
    this.worker.on("error", () =>
      console.error("Worker transport unavailable; reconnecting"),
    );
  }
  async start() {
    await Promise.all([
      this.queue.waitUntilReady(),
      this.worker.waitUntilReady(),
    ]);
    this.schedule();
  }
  private schedule() {
    this.pumping = this.publish()
      .catch(() => {
        console.error("Outbox publication delayed; will retry");
      })
      .finally(() => {
        if (!this.stopped) this.timer = setTimeout(() => this.schedule(), 1000);
      });
  }
  async publish() {
    const rows = (
      await this.db.query<{ run_id: string }>(
        `SELECT o.run_id FROM run_outbox o JOIN platform_documents d ON d.id=o.run_id WHERE d.body->>'phase'='queued' AND (o.published_at IS NULL OR o.published_at<now()-interval '60 seconds') ORDER BY o.created_at LIMIT 100`,
      )
    ).rows;
    for (const row of rows) {
      await this.queue.add(
        "execute",
        { runId: row.run_id },
        { jobId: row.run_id },
      );
      await this.db.query(
        "UPDATE run_outbox SET published_at=now() WHERE run_id=$1",
        [row.run_id],
      );
    }
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.pumping;
    await this.worker.close();
    await this.queue.close();
  }
}
