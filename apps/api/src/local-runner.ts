import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { SqlConnection } from "./database.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
export const runRoot = path.join(root, ".local", "runs");
const automationRoot = path.join(root, "packages", "automation");
const configuration = z.object({
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
  constructor(private readonly db: SqlConnection) {
    if (process.env["NODE_ENV"] === "production")
      throw new Error("Local runner is forbidden in production");
  }
  async start() {
    await mkdir(runRoot, { recursive: true });
    // An interrupted process is diagnosed, never silently replayed.
    await this.db.query(
      "UPDATE platform_documents SET body=body || $1::jsonb,version=version+1 WHERE kind='run' AND body->>'phase' IN ('running','provisioning','finalizing')",
      [
        JSON.stringify({
          phase: "infrastructure_error",
          reportPhase: "failed",
          diagnostic: "Development worker restarted before terminal manifest",
        }),
      ],
    );
    void this.tick();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.child?.kill();
  }
  private async tick() {
    try {
      const rebuild = (
        await this.db.query<{ id: string }>(
          `UPDATE platform_documents SET body=jsonb_set(body,'{reportPhase}','"generating"'),version=version+1 WHERE id=(SELECT id FROM platform_documents WHERE kind='run' AND body->>'reportPhase'='rebuild_requested' LIMIT 1) AND body->>'reportPhase'='rebuild_requested' RETURNING id`,
        )
      ).rows[0];
      if (rebuild) {
        await this.generateReport(rebuild.id);
        return;
      }
      const row = (
        await this.db.query<{
          body: unknown;
        }>(`UPDATE platform_documents SET body=jsonb_set(body,'{phase}','"running"'),version=version+1
        WHERE id=(SELECT id FROM platform_documents WHERE kind='run' AND body->>'phase'='queued' ORDER BY body->>'createdAt' LIMIT 1)
        AND body->>'phase'='queued' RETURNING body`)
      ).rows[0];
      if (row) await this.execute(runSchema.parse(row.body));
    } catch (error) {
      console.error(
        "Local runner failed:",
        error instanceof Error ? error.message : "Unknown failure",
      );
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => void this.tick(), 500);
    }
  }
  private async update(id: string, patch: Record<string, unknown>) {
    await this.db.query(
      "UPDATE platform_documents SET body=body || $1::jsonb,version=version+1 WHERE id=$2",
      [JSON.stringify(patch), id],
    );
    await this.db.query("INSERT INTO run_events(run_id,body) VALUES($1,$2)", [
      id,
      JSON.stringify(patch),
    ]);
  }
  private async command(
    args: string[],
    output: string,
    id: string,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: automationRoot,
        windowsHide: true,
        env: { ...process.env, RUN_OUTPUT: output },
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.child = child;
      let logs = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        logs = (logs + redact(chunk.toString())).slice(-100_000);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        logs = (logs + redact(chunk.toString())).slice(-100_000);
      });
      const timeout = setTimeout(() => child.kill(), 30 * 60_000);
      const cancel = setInterval(() => {
        void this.db
          .query<{ cancel: string | null }>(
            "SELECT body->>'cancelRequested' AS cancel FROM platform_documents WHERE id=$1",
            [id],
          )
          .then((result) => {
            if (result.rows[0]?.cancel === "true") child.kill();
          })
          .catch(() => child.kill());
      }, 500);
      const clean = () => {
        clearTimeout(timeout);
        clearInterval(cancel);
        this.child = undefined;
      };
      child.once("error", (error) => {
        clean();
        reject(error);
      });
      child.once("close", (code) => {
        clean();
        void writeFile(path.join(output, "worker.log"), logs).then(
          () => resolve(code ?? -1),
          reject,
        );
      });
    });
  }
  private async execute(run: z.infer<typeof runSchema>) {
    const output = path.join(runRoot, run.id);
    await mkdir(output, { recursive: true });
    let executionFinalized = false;
    try {
      await this.update(run.id, { startedAt: new Date().toISOString() });
      const code = await this.command(
        [
          "node_modules/@playwright/test/cli.js",
          "test",
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
      const data = resultSchema.parse(
        JSON.parse(await readFile(path.join(output, "results.json"), "utf8")),
      );
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
            status: last?.status ?? "broken",
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
      for (const id of run.selection.testIds)
        if (!results.some((result) => result.caseId === id))
          results.push({
            id,
            caseId: id,
            browser: null,
            expectedStatus: "passed",
            expectedFailure: false,
            title: id,
            status: canceled ? "canceled" : "broken",
            duration: 0,
            error: "No terminal result received",
            attempts: [],
          });
      await this.update(run.id, {
        phase: canceled
          ? "canceled"
          : code === -1
            ? "infrastructure_error"
            : "completed",
        endedAt: new Date().toISOString(),
        results,
        reportPhase: canceled ? "failed" : "generating",
      });
      executionFinalized = true;
      if (canceled) return;
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
