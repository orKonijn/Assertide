import { Queue, Worker } from "bullmq";
import { z } from "zod";
import type { SqlConnection } from "./database.ts";

export async function initializeScheduler(db: SqlConnection) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS run_outbox (run_id text PRIMARY KEY REFERENCES platform_documents(id), created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz)",
  );
  await db.query(
    "INSERT INTO run_outbox(run_id) SELECT id FROM platform_documents WHERE kind='run' AND body->>'phase'='queued' ON CONFLICT DO NOTHING",
  );
}
export async function claimExecution(
  db: SqlConnection,
  owner: string,
  id?: string,
) {
  const row = (
    await db.query<{ body: Record<string, unknown> }>(
      `UPDATE platform_documents SET body=body || jsonb_build_object('phase','running','leaseOwner',$1::text,'leaseEpoch',COALESCE((body->>'leaseEpoch')::int,0)+1,'leaseExpires',now()+interval '30 seconds'),version=version+1 WHERE id=COALESCE($2::text,(SELECT id FROM platform_documents WHERE kind='run' AND body->>'phase'='queued' ORDER BY body->>'createdAt' LIMIT 1)) AND body->>'phase'='queued' RETURNING body`,
      [owner, id ?? null],
    )
  ).rows[0];
  return row?.body;
}
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
  db: SqlConnection,
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
      async (job) => {
        await processRun(z.object({ runId: z.uuid() }).parse(job.data).runId);
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
