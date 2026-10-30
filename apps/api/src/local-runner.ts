import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { randomUUID, randomBytes } from "node:crypto";
import { ociCommand, stopContainer } from "./oci-worker.ts";
import { hostname } from "node:os";
import {
  stepSchema,
  classifyResult,
  assertionValues,
} from "./result-details.ts";
import { archiveRaw, restoreRaw, rawManifest } from "./raw-storage.ts";
import {
  enrichReport,
  caseMetadata,
  toolchainSchema,
} from "./report-metadata.ts";
import type { SqlConnection } from "./database.ts";
import { verifySource } from "./source.ts";
import { stopProcessTree } from "./process-tree.ts";
import { archiveReport, expireReports } from "./report-storage.ts";
import { expireRunData } from "./retention.ts";
import {
  historyStream,
  claimHistory,
  renewHistory,
  releaseHistory,
  commitHistory,
  visibleHistory,
  historyPoint,
} from "./report-history.ts";
import { setTimeout as delay } from "node:timers/promises";
import {
  environmentSchema,
  defaultEnvironment,
  resolveSecret,
} from "./environments.ts";
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
  headed: z.boolean().default(false),
  environmentId: z.string().default("local-lab"),
  catalogRevision: z.string(),
  workers: z.number().int().min(1).max(4),
  retries: z.number().int().min(0).max(2),
  video: z.enum(["off", "retain-on-failure"]).default("off"),
  browserProjects: z
    .array(z.enum(["chromium", "firefox", "webkit"]))
    .default([]),
});
const runSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  projectId: z.uuid(),
  endedAt: z.iso.datetime().optional(),
  historyFamily: z.array(z.string()).optional(),
  workerImage: z.string().optional(),
  rawArchive: rawManifest.optional(),
  metadata: z.array(caseMetadata).default([]),
  environment: environmentSchema
    .extend({ version: z.number().optional() })
    .default(defaultEnvironment),
  selection: z.object({
    testIds: z.array(z.string().regex(/^(LAB|UI)-\d{3,8}$/)).min(1),
  }),
  config: configuration,
});
const attemptSchema = z.object({
  steps: z.array(stepSchema).default([]),
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
  let finalResults: z.infer<typeof resultSchema> | undefined;
  try {
    finalResults = resultSchema.parse(
      JSON.parse(await readFile(path.join(output, "results.json"), "utf8")),
    );
  } catch {
    /* Interrupted workers may have only checkpoints. */
  }
  {
    let checkpoint: string;
    try {
      checkpoint = await readFile(path.join(output, "attempts.ndjson"), "utf8");
    } catch {
      return finalResults ?? { suites: [] };
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
    if (finalResults) {
      for (const spec of finalResults.suites.flatMap(flatten))
        for (const test of spec.tests) {
          const checkpoint = specs.get(`${spec.title}:${test.projectName}`);
          test.results.forEach((result, index) => {
            result.steps =
              checkpoint?.tests[0]?.results[index]?.steps ?? result.steps;
          });
        }
      return finalResults;
    }
    return { suites: [{ specs: [...specs.values()], suites: [] }] };
  }
}
const flatten = (node: SuiteNode): z.infer<typeof specSchema>[] => [
  ...node.specs,
  ...node.suites.flatMap(flatten),
];
const redactDefault = (text: string) =>
  text
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[REDACTED TOKEN]",
    )
    .split(process.env["LAB_PASSWORD"] ?? "\u0000")
    .join("[REDACTED]");
const redact = redactDefault;

/** Local development runner for this repository's trusted fixtures only. Not a production isolation boundary. */
export class LocalRunner {
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private child: ChildProcess | undefined;
  private containerId: string | undefined;
  private async stopChild() {
    stopProcessTree(this.child);
    if (this.containerId) await stopContainer(this.containerId);
  }
  private nextRetentionSweep = 0;
  private readonly owner = randomUUID();
  private epoch = 0;
  private active = false;
  private operation: Promise<void> = Promise.resolve();
  private transport?: RedisTransport;
  constructor(
    private readonly db: SqlConnection,
    private readonly role: "all" | "execution" | "report" = "all",
  ) {
    if (
      process.env["NODE_ENV"] === "production" &&
      process.env["WORKER_RUNTIME"] !== "oci" &&
      role !== "report"
    )
      throw new Error("Local runner is forbidden in production");
  }
  async start() {
    await mkdir(runRoot, { recursive: true });
    await recoverExpiredLeases(this.db);
    const redis = process.env["REDIS_URL"];
    if (redis && this.role !== "report") {
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
    await this.stopChild();
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
          return this.stopChild();
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
      if (process.env["WORKER_RUNTIME"] === "oci" && this.role !== "report") {
        const orphaned = await this.db.query<{ id: string }>(
          "SELECT id FROM platform_documents WHERE kind='run' AND body->>'workerRuntime'='oci' AND body->>'workerHost'=$1 AND body->>'phase' IN ('completed','canceled','timed_out','infrastructure_error') AND NOT COALESCE((body->>'containerCleaned')::boolean,false)",
          [hostname()],
        );
        for (const run of orphaned.rows) {
          if (!(await stopContainer(run.id))) continue;
          await this.db.query(
            "UPDATE platform_documents SET body=body || '{\"containerCleaned\":true}'::jsonb WHERE id=$1",
            [run.id],
          );
        }
      }
      if (Date.now() >= this.nextRetentionSweep) {
        await expireArtifacts(this.db);
        await expireReports(this.db);
        await expireRunData(this.db);
        await this.db.query(
          "DELETE FROM run_events WHERE occurred_at < now()-interval '24 hours'",
        );
        this.nextRetentionSweep = Date.now() + 60_000;
      }
      const rebuild =
        this.role === "execution"
          ? undefined
          : (
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
      if (!this.transport && this.role !== "report") {
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
    executionEnv: Record<string, string> = {},
    isolated?: {
      snapshot: string;
      workers: number;
      input: Record<string, unknown>;
    },
  ): Promise<number> {
    const redact = (text: string) =>
      redactDefault(text)
        .split(executionEnv["LAB_PASSWORD"] || "\u0000")
        .join("[REDACTED]");
    const previous =
      (
        await this.db.query<{ log: string | null }>(
          "SELECT body->>'logTail' AS log FROM platform_documents WHERE id=$1",
          [id],
        )
      ).rows[0]?.log ?? "";
    const command = isolated
      ? ociCommand(id, isolated.snapshot, output, isolated.workers)
      : { executable: process.execPath, args };
    if (isolated) {
      await this.update(id, {
        workerImage: process.env["OCI_WORKER_IMAGE"],
        workerRuntime: "oci",
        workerHost: hostname(),
      });
      this.containerId = id;
    }
    return new Promise((resolve, reject) => {
      const child = spawn(command.executable, command.args, {
        cwd: automationRoot,
        windowsHide: true,
        detached: process.platform !== "win32",
        env: { ...process.env, ...executionEnv, RUN_OUTPUT: output },
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.stdin?.on("error", () => {});
      child.stdin?.end(isolated ? JSON.stringify(isolated.input) : undefined);
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
              return this.stopChild();
            });
        }
      };
      const liveLog = setInterval(flush, 1000);
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        void this.stopChild();
      }, 30 * 60_000);
      const cancel = setInterval(() => {
        void this.db
          .query<{ cancel: string | null }>(
            "SELECT body->>'cancelRequested' AS cancel FROM platform_documents WHERE id=$1",
            [id],
          )
          .then((result) => {
            if (result.rows[0]?.cancel === "true") return this.stopChild();
          })
          .catch(() => this.stopChild());
      }, 500);
      const clean = () => {
        clearTimeout(timeout);
        clearInterval(cancel);
        clearInterval(liveLog);
        this.child = undefined;
      };
      child.once("error", (error) => {
        clean();
        void (isolated ? stopContainer(id) : Promise.resolve()).then(() => {
          this.containerId = undefined;
          reject(error);
        });
      });
      child.once("close", (code) => {
        flush();
        clean();
        void pending
          .then(() => (isolated ? stopContainer(id) : undefined))
          .then(() => {
            this.containerId = undefined;
          })
          .then(() => writeFile(path.join(output, "worker.log"), redact(logs)))
          .then(() => resolve(timedOut ? -2 : (code ?? -1)), reject);
      });
    });
  }
  private async execute(run: z.infer<typeof runSchema>) {
    const output = path.join(runRoot, run.id);
    await mkdir(output, { recursive: true });
    let executionFinalized = false;
    let password = "";
    const redact = (text: string) =>
      redactDefault(text)
        .split(password || "\u0000")
        .join("[REDACTED]");
    try {
      if (
        run.workerImage !==
        (process.env["WORKER_RUNTIME"] === "oci"
          ? process.env["OCI_WORKER_IMAGE"]
          : undefined)
      )
        throw new Error("Frozen worker image is unavailable on this worker");
      if (run.environment.passwordRef)
        password = await resolveSecret(
          this.db,
          run.organizationId,
          run.projectId,
          run.environment.passwordRef,
        );
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
        {
          RUN_VIDEO: run.config.video,
          RUN_API_URL: run.environment.apiUrl,
          RUN_BROWSER_URL: run.environment.browserUrl,
          ...(password ? { LAB_PASSWORD: password } : {}),
        },
        process.env["WORKER_RUNTIME"] === "oci"
          ? {
              snapshot,
              workers: run.config.workers,
              input: {
                testIds: run.selection.testIds,
                workers: run.config.workers,
                retries: run.config.retries,
                projects: [
                  ...(run.selection.testIds.some((id) => id.startsWith("LAB-"))
                    ? ["api"]
                    : []),
                  ...run.config.browserProjects,
                ],
                video: run.config.video,
                headed: run.config.headed,
                password:
                  password ||
                  process.env["LAB_PASSWORD"] ||
                  randomBytes(32).toString("hex"),
                signingKey: randomBytes(32).toString("hex"),
              },
            }
          : undefined,
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
                attempt.attachments.map((attachment) => ({
                  ...attachment,
                  ...(attachment.path?.startsWith("/output/")
                    ? { path: path.join(output, attachment.path.slice(8)) }
                    : {}),
                })),
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
            quarantined:
              run.metadata.find((item) => item.id === caseId)?.quarantined ??
              false,
            parameterFingerprint: "default",
            title: spec.title,
            status:
              canceled && (!last || last.status === "interrupted")
                ? "canceled"
                : (last?.status ?? "broken"),
            duration: attempts.reduce((sum, item) => sum + item.duration, 0),
            error: redact(last?.error?.message ?? ""),
            assertion: assertionValues(redact(last?.error?.message ?? "")),
            category: classifyResult(
              canceled && (!last || last.status === "interrupted")
                ? "canceled"
                : (last?.status ?? "broken"),
              last?.error?.message ?? "",
              code !== 0 && code !== 1,
            ),
            categoryRuleVersion: 1,
            attempts: attempts.map((attempt) => ({
              status: attempt.status,
              duration: attempt.duration,
              error: redact(attempt.error?.message ?? ""),
              steps: z
                .array(stepSchema)
                .parse(JSON.parse(redact(JSON.stringify(attempt.steps)))),
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
              quarantined:
                run.metadata.find((item) => item.id === id)?.quarantined ??
                false,
              parameterFingerprint: "default",
              title: id,
              status: canceled ? "canceled" : "broken",
              duration: 0,
              error: "No terminal result received",
              assertion: undefined,
              category: canceled ? "canceled" : "infrastructure",
              categoryRuleVersion: 1,
              attempts: [],
            });
        }
      await this.update(run.id, {
        phase: canceled
          ? "canceled"
          : code === -2
            ? "timed_out"
            : code !== 0 && code !== 1
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
      const raw = path.join(output, "allure-results");
      const toolchain = toolchainSchema.parse(
        JSON.parse(
          await readFile(path.join(output, "toolchain.json"), "utf8").catch(
            (error) => {
              if (error.code !== "ENOENT") throw error;
              return JSON.stringify({
                node: "not recorded by this source revision",
                playwright: "not recorded",
                platform: "not recorded",
                architecture: "not recorded",
                browserBuilds: [],
              });
            },
          ),
        ),
      );
      await this.update(run.id, { toolchain });
      await enrichReport(raw, run, toolchain);
      for (const entry of await readdir(raw))
        if (entry.endsWith(".json")) {
          const file = path.join(raw, entry);
          await writeFile(file, redact(await readFile(file, "utf8")));
        }
      const rawArchive = await archiveRaw(run.id, raw);
      if (rawArchive) await this.update(run.id, { rawArchive });
      if (canceled || terminal?.phase === "canceled") return;
      if (this.role === "execution") {
        if (!rawArchive)
          throw new Error(
            "Separate report workers require archived raw evidence",
          );
        await this.update(run.id, { reportPhase: "rebuild_requested" });
      } else await this.generateReport(run.id);
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
    const historyOwner = randomUUID();
    let stream = "";
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      const row = (
        await this.db.query<{ body: unknown }>(
          "SELECT body FROM platform_documents WHERE id=$1",
          [id],
        )
      ).rows[0];
      const run = runSchema.parse(row?.body);
      if (run.rawArchive)
        await restoreRaw(
          id,
          path.join(output, "allure-results"),
          run.rawArchive,
          run.endedAt!,
        );
      stream = historyStream(run);
      let lease = await claimHistory(this.db, stream, historyOwner);
      const deadline = Date.now() + 30000;
      while (!lease && Date.now() < deadline && !this.stopped) {
        await delay(100);
        lease = await claimHistory(this.db, stream, historyOwner);
      }
      if (!lease)
        throw new Error(
          "Compatible report history is busy; retry report generation",
        );
      heartbeat = setInterval(() => {
        void renewHistory(this.db, stream, historyOwner).catch(() => {
          if (this.child) stopProcessTree(this.child);
        });
      }, 5000);
      const historyFile = path.join(output, "history.jsonl");
      const configFile = path.join(output, "allure.config.mjs");
      await writeFile(
        historyFile,
        visibleHistory(lease.entries, id)
          .map((entry) => JSON.stringify(entry))
          .join("\n") + "\n",
      );
      await writeFile(
        configFile,
        `export default ${JSON.stringify({ name: `Assertide ${id}`, historyPath: historyFile, appendHistory: true, historyLimit: 200, historyBaseUrl: `${process.env["APP_ORIGIN"] ?? "http://127.0.0.1:4200"}/v1/runs/${id}/report/` })};`,
      );
      const code = await this.command(
        [
          "node_modules/allure/cli.js",
          "generate",
          path.join(output, "allure-results"),
          "--config",
          configFile,
          "--output",
          path.join(output, directory),
        ],
        output,
        id,
      );
      if (code !== 0)
        throw new Error("Allure generation failed; see worker output");
      const expiresAt = await archiveReport(this.db, id, directory);
      const points = (await readFile(historyFile, "utf8"))
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => historyPoint.parse(JSON.parse(line)));
      const point = points.at(-1);
      if (!point) throw new Error("Allure history output missing");
      const entries = [
        ...lease.entries.filter(
          (entry) =>
            entry.runId !== id &&
            new Date(entry.endedAt).getTime() + 365 * 86400000 > Date.now(),
        ),
        {
          runId: id,
          endedAt: run.endedAt ?? new Date().toISOString(),
          reportExpiresAt: expiresAt,
          point,
        },
      ];
      await this.db.transaction(async (tx) => {
        await commitHistory(tx, stream, historyOwner, lease.version, entries);
        await updateOwnedRun(tx, id, this.owner, this.epoch, {
          reportPhase: "ready",
          reportDirectory: directory,
          reportExpiresAt: expiresAt,
          historyStream: stream,
          historyVersion: lease.version + 1,
          historyEntries: entries.slice(-200).length,
          reportDiagnostic: null,
        });
      });
    } catch (error) {
      await this.update(id, {
        reportPhase: "failed",
        reportDiagnostic: redact(
          error instanceof Error ? error.message : "Report generation failed",
        ),
      });
    } finally {
      clearInterval(heartbeat);
      if (stream) await releaseHistory(this.db, stream, historyOwner);
    }
  }
}
