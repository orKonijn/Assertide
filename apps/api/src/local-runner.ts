import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { SqlConnection } from "./database.ts";
import { verifySource } from "./source.ts";
import { stopProcessTree } from "./process-tree.ts";
import {
  claimExecution,
  renewLease,
  updateOwnedRun,
  recoverExpiredLeases,
  RedisTransport,
  CapacityUnavailable,
} from "./scheduler.ts";
import {
  attachmentSchema,
  captureAttachments,
  expireArtifacts,
  type Artifact,
} from "./artifacts.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
export const runRoot = path.join(root, ".local", "runs");
const automationRoot = path.join(root, "packages", "automation");
const configuration = z.object({
  catalogRevision: z.string(),
  workers: z.number().int().min(1).max(4),
  retries: z.number().int().min(0).max(2),
  browserProjects: z
    .array(z.enum(["chromium", "firefox", "webkit"]))
    .default([]),
});
const runSchema = z.object({
  id: z.uuid(),
  selection: z.object({
    testIds: z.array(z.string().regex(/^(LAB|UI)-\d{3}$/)).min(1),
  }),
  config: configuration,
});
const attemptSchema = z.object({
  attachments: z.array(attachmentSchema).default([]),
  status: z.string(),
  duration: z.number(),
  error: z.object({ message: z.string().optional() }).optional(),
});
const specSchema = z.object({
  title: z.string(),
  tests: z.array(
    z.object({
      projectName: z.string().default("api"),
      expectedStatus: z.string().default("passed"),
      results: z.array(attemptSchema),
    }),
  ),
});
interface SuiteNode {
  specs: z.infer<typeof specSchema>[];
  suites: SuiteNode[];
}
const suiteSchema: z.ZodType<SuiteNode> = z.object({
  specs: z.array(specSchema).default([]),
  suites: z.lazy(() => z.array(suiteSchema)).default([]),
});
const resultSchema = z.object({ suites: z.array(suiteSchema) });
const checkpointSchema = z.object({
  title: z.string(),
  projectName: z.string(),
  expectedStatus: z.string(),
  result: attemptSchema,
});
async function readResults(output: string) {
  try {
    return resultSchema.parse(
      JSON.parse(await readFile(path.join(output, "results.json"), "utf8")),
    );
  } catch {
    let checkpoint = "";
    try {
      checkpoint = await readFile(path.join(output, "attempts.ndjson"), "utf8");
    } catch {
      return { suites: [] };
    }
    const specs = new Map<string, z.infer<typeof specSchema>>();
    for (const line of checkpoint.split("\n").slice(0, -1)) {
      const entry = checkpointSchema.parse(JSON.parse(line));
      const key = `${entry.title}:${entry.projectName}`;
      const existing = specs.get(key);
      if (existing) existing.tests[0]!.results.push(entry.result);
      else
        specs.set(key, {
          title: entry.title,
          tests: [
            {
              projectName: entry.projectName,
              expectedStatus: entry.expectedStatus,
              results: [entry.result],
            },
          ],
        });
    }
    return { suites: [{ specs: [...specs.values()], suites: [] }] };
  }
}
const flatten = (node: SuiteNode): z.infer<typeof specSchema>[] => [
  ...node.specs,
  ...node.suites.flatMap(flatten),
];
const redact = (text: string) =>
  text
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[REDACTED TOKEN]",
    )
    .split(process.env["LAB_PASSWORD"] ?? "\u0000")
    .join("[REDACTED]");

/** Local development runner for this repository's trusted fixtures only. Not a production isolation boundary. */
export class LocalRunner {
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private child: ChildProcess | undefined;
  private nextRetentionSweep = 0;
  private readonly owner = randomUUID();
  private epoch = 0;
  private active = false;
  private operation: Promise<void> = Promise.resolve();
  private transport?: RedisTransport;
  constructor(private readonly db: SqlConnection) {
    if (process.env["NODE_ENV"] === "production")
      throw new Error("Local runner is forbidden in production");
  }
  async start() {
    await mkdir(runRoot, { recursive: true });
    await recoverExpiredLeases(this.db);
    const redis = process.env["REDIS_URL"];
    if (redis) {
      this.transport = new RedisTransport(this.db, redis, async (id) => {
        while (this.active && !this.stopped)
          await new Promise((resolve) => setTimeout(resolve, 100));
        if (this.stopped) throw new Error("Worker stopping");
        this.active = true;
        try {
          const body = await claimExecution(this.db, this.owner, id);
          if (!body) {
            const phase = (
              await this.db.query<{ phase: string }>(
                "SELECT body->>'phase' AS phase FROM platform_documents WHERE id=$1",
                [id],
              )
            ).rows[0]?.phase;
            if (phase === "queued")
              throw new CapacityUnavailable("Capacity unavailable");
          }
          if (body)
            await this.withLease(body, () =>
              this.execute(runSchema.parse(body)),
            );
        } finally {
          this.active = false;
        }
      });
      await this.transport.start();
    }
    this.operation = this.tick();
  }
  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    stopProcessTree(this.child);
    await this.transport?.close();
    await this.operation;
  }
  private scheduleTick() {
    if (!this.stopped)
      this.timer = setTimeout(() => {
        this.operation = this.tick();
      }, 500);
  }
  private async withLease(
    body: Record<string, unknown>,
    work: () => Promise<void>,
  ) {
    const id = z.uuid().parse(body["id"]);
    this.epoch = z.number().int().positive().parse(body["leaseEpoch"]);
    const epoch = this.epoch;
    let renewal = Promise.resolve();
    const heartbeat = setInterval(() => {
      renewal = renewal
        .then(() => renewLease(this.db, id, this.owner, epoch))
        .catch(() => {
          stopProcessTree(this.child);
        });
    }, 5000);
    try {
      await work();
    } finally {
      clearInterval(heartbeat);
      await renewal;
    }
  }
  private async tick() {
    if (this.active) {
      this.scheduleTick();
      return;
    }
    this.active = true;
    try {
      await recoverExpiredLeases(this.db);
      if (Date.now() >= this.nextRetentionSweep) {
        await expireArtifacts(this.db);
        await this.db.query(
          "DELETE FROM run_events WHERE occurred_at < now()-interval '24 hours'",
        );
        this.nextRetentionSweep = Date.now() + 60_000;
      }
      const rebuild = (
        await this.db.query<{ body: Record<string, unknown> }>(
          `UPDATE platform_documents SET body=body || jsonb_build_object('reportPhase','generating','leaseOwner',$1::text,'leaseEpoch',COALESCE((body->>'leaseEpoch')::int,0)+1,'leaseExpires',now()+interval '30 seconds'),version=version+1 WHERE id=(SELECT id FROM platform_documents WHERE kind='run' AND body->>'reportPhase'='rebuild_requested' LIMIT 1) AND body->>'reportPhase'='rebuild_requested' RETURNING body`,
          [this.owner],
        )
      ).rows[0];
      if (rebuild) {
        await this.withLease(rebuild.body, () =>
          this.generateReport(String(rebuild.body["id"])),
        );
        return;
      }
      if (!this.transport) {
        const body = await claimExecution(this.db, this.owner);
        if (body)
          await this.withLease(body, () => this.execute(runSchema.parse(body)));
      }
    } catch (error) {
      console.error(
        "Local runner failed:",
        error instanceof Error ? error.message : "Unknown failure",
      );
    } finally {
      this.active = false;
      this.scheduleTick();
    }
  }
  private async update(id: string, patch: Record<string, unknown>) {
    await updateOwnedRun(this.db, id, this.owner, this.epoch, patch);
  }
  private async command(
    args: string[],
    output: string,
    id: string,
  ): Promise<number> {
    const previous =
      (
        await this.db.query<{ log: string | null }>(
          "SELECT body->>'logTail' AS log FROM platform_documents WHERE id=$1",
          [id],
        )
      ).rows[0]?.log ?? "";
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: automationRoot,
        windowsHide: true,
        detached: process.platform !== "win32",
        env: { ...process.env, RUN_OUTPUT: output },
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.child = child;
      let logs = previous;
      let sent = "";
      let pending = Promise.resolve();
      child.stdout?.on("data", (chunk: Buffer) => {
        logs = (logs + chunk.toString()).slice(-100_000);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        logs = (logs + chunk.toString()).slice(-100_000);
      });
      const flush = () => {
        const complete = redact(logs.slice(0, logs.lastIndexOf("\n") + 1));
        if (complete !== sent) {
          sent = complete;
          pending = pending
            .then(() => this.update(id, { logTail: complete }))
            .catch(() => {
              stopProcessTree(child);
            });
        }
      };
      const liveLog = setInterval(flush, 1000);
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        stopProcessTree(child);
      }, 30 * 60_000);
      const cancel = setInterval(() => {
        void this.db
          .query<{ cancel: string | null }>(
            "SELECT body->>'cancelRequested' AS cancel FROM platform_documents WHERE id=$1",
            [id],
          )
          .then((result) => {
            if (result.rows[0]?.cancel === "true") stopProcessTree(child);
          })
          .catch(() => stopProcessTree(child));
      }, 500);
      const clean = () => {
        clearTimeout(timeout);
        clearInterval(cancel);
        clearInterval(liveLog);
        this.child = undefined;
      };
      child.once("error", (error) => {
        clean();
        reject(error);
      });
      child.once("close", (code) => {
        flush();
        clean();
        void pending
          .then(() => writeFile(path.join(output, "worker.log"), redact(logs)))
          .then(() => resolve(timedOut ? -2 : (code ?? -1)), reject);
      });
    });
  }
  private async execute(run: z.infer<typeof runSchema>) {
    const output = path.join(runRoot, run.id);
    await mkdir(output, { recursive: true });
    let executionFinalized = false;
    try {
      await this.update(run.id, { startedAt: new Date().toISOString() });
      const snapshot = await verifySource(run.config.catalogRevision);
      const code = await this.command(
        [
          "node_modules/@playwright/test/cli.js",
          "test",
          "--config",
          path.join(snapshot, "playwright.config.ts"),
          "--grep",
          `(${run.selection.testIds.join("|")}) `,
          "--workers",
          String(run.config.workers),
          "--retries",
          String(run.config.retries),
          ...[
            ...(run.selection.testIds.some((id) => id.startsWith("LAB-"))
              ? ["api"]
              : []),
            ...run.config.browserProjects,
          ].flatMap((project) => ["--project", project]),
        ],
        output,
        run.id,
      );
      const canceled =
        (
          await this.db.query<{ cancel: string | null }>(
            "SELECT body->>'cancelRequested' AS cancel FROM platform_documents WHERE id=$1",
            [run.id],
          )
        ).rows[0]?.cancel === "true";
      const data = await readResults(output);
      const artifacts: Artifact[] = [];
      for (const spec of data.suites.flatMap(flatten))
        for (const test of spec.tests) {
          const caseId = spec.title.split(" ")[0] ?? spec.title;
          const resultId =
            test.projectName === "api"
              ? caseId
              : `${caseId}:${test.projectName}`;
          for (const [index, attempt] of test.results.entries())
            artifacts.push(
              ...(await captureAttachments(
                run.id,
                resultId,
                index + 1,
                attempt.attachments,
                redact,
              )),
            );
        }
      const results = data.suites.flatMap(flatten).flatMap((spec) =>
        spec.tests.map((test) => {
          const attempts = test.results;
          const last = attempts.at(-1);
          const caseId = spec.title.split(" ")[0] ?? spec.title;
          return {
            id:
              test.projectName === "api"
                ? caseId
                : `${caseId}:${test.projectName}`,
            caseId,
            browser: test.projectName === "api" ? null : test.projectName,
            expectedStatus: test.expectedStatus,
            expectedFailure: test.expectedStatus === "failed",
            title: spec.title,
            status:
              canceled && (!last || last.status === "interrupted")
                ? "canceled"
                : (last?.status ?? "broken"),
            duration: attempts.reduce((sum, item) => sum + item.duration, 0),
            error: redact(last?.error?.message ?? ""),
            attempts: attempts.map((attempt) => ({
              status: attempt.status,
              duration: attempt.duration,
              error: redact(attempt.error?.message ?? ""),
            })),
          };
        }),
      );
      for (const caseId of run.selection.testIds)
        for (const project of caseId.startsWith("UI-")
          ? run.config.browserProjects
          : ["api"]) {
          const id = project === "api" ? caseId : `${caseId}:${project}`;
          if (!results.some((result) => result.id === id))
            results.push({
              id,
              caseId,
              browser: project === "api" ? null : project,
              expectedStatus: "passed",
              expectedFailure: false,
              title: id,
              status: canceled ? "canceled" : "broken",
              duration: 0,
              error: "No terminal result received",
              attempts: [],
            });
        }
      await this.update(run.id, {
        phase: canceled
          ? "canceled"
          : code === -2
            ? "timed_out"
            : code === -1
              ? "infrastructure_error"
              : "completed",
        endedAt: new Date().toISOString(),
        results,
        artifacts,
        reportPhase: canceled ? "failed" : "generating",
      });
      executionFinalized = true;
      const terminal = (
        await this.db.query<{ phase: string }>(
          "SELECT body->>'phase' AS phase FROM platform_documents WHERE id=$1",
          [run.id],
        )
      ).rows[0];
      if (canceled || terminal?.phase === "canceled") return;
      const raw = path.join(output, "allure-results");
      for (const entry of await readdir(raw))
        if (entry.endsWith(".json")) {
          const file = path.join(raw, entry);
          await writeFile(file, redact(await readFile(file, "utf8")));
        }
      await this.generateReport(run.id);
    } catch (error) {
      const diagnostic = redact(
        error instanceof Error ? error.message : "Worker failed",
      );
      await this.update(
        run.id,
        executionFinalized
          ? { reportPhase: "failed", reportDiagnostic: diagnostic }
          : {
              phase: "infrastructure_error",
              reportPhase: "failed",
              diagnostic,
              endedAt: new Date().toISOString(),
            },
      );
    }
  }
  private async generateReport(id: string) {
    const output = path.join(runRoot, id);
    const directory = `report-${randomUUID()}`;
    try {
      const code = await this.command(
        [
          "node_modules/allure/cli.js",
          "generate",
          path.join(output, "allure-results"),
          "--output",
          path.join(output, directory),
        ],
        output,
        id,
      );
      await this.update(
        id,
        code === 0
          ? { reportPhase: "ready", reportDirectory: directory }
          : { reportPhase: "failed" },
      );
    } catch (error) {
      await this.update(id, {
        reportPhase: "failed",
        reportDiagnostic: redact(
          error instanceof Error ? error.message : "Report generation failed",
        ),
      });
    }
  }
}
