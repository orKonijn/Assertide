import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

/** Durable completed attempts survive termination before Playwright's final report. */
export default class CheckpointReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    const output = process.env["RUN_OUTPUT"];
    if (!output) return;
    mkdirSync(output, { recursive: true });
    appendFileSync(
      path.join(output, "attempts.ndjson"),
      JSON.stringify({
        title: test.title,
        projectName: test.parent.project()?.name ?? "api",
        expectedStatus: test.expectedStatus,
        result: {
          status: result.status,
          duration: result.duration,
          error: result.error,
          attachments: result.attachments.map((attachment) => ({
            ...attachment,
            body: attachment.body?.toString("base64"),
          })),
        },
      }) + "\n",
    );
  }
}
