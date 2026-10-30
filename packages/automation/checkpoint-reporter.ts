import {
  appendFileSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type {
  Reporter,
  TestCase,
  TestResult,
  TestStep,
  FullConfig,
} from "@playwright/test/reporter";

/** Durable completed attempts survive termination before Playwright's final report. */
export default class CheckpointReporter implements Reporter {
  onBegin(config: FullConfig) {
    const output = process.env["RUN_OUTPUT"];
    if (!output) return;
    const require = createRequire(import.meta.url);
    const lock = JSON.parse(
      readFileSync(new URL("./package-lock.json", import.meta.url), "utf8"),
    ) as { packages: Record<string, { version: string }> };
    const browserCatalog = JSON.parse(
      readFileSync(
        path.join(
          path.dirname(require.resolve("playwright-core/package.json")),
          "browsers.json",
        ),
        "utf8",
      ),
    ) as {
      browsers: { name: string; revision: string; browserVersion?: string }[];
    };
    mkdirSync(output, { recursive: true });
    writeFileSync(
      path.join(output, "toolchain.json"),
      JSON.stringify({
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        playwright: config.version,
        allure: lock.packages["node_modules/allure"]!.version,
        allureIntegration:
          lock.packages["node_modules/allure-playwright"]!.version,
        browserBuilds: browserCatalog.browsers
          .filter((browser) =>
            config.projects.some((project) => project.name === browser.name),
          )
          .map(({ name, revision, browserVersion }) => ({
            name,
            revision,
            version: browserVersion,
          })),
      }),
    );
  }
  onTestEnd(test: TestCase, result: TestResult) {
    const output = process.env["RUN_OUTPUT"];
    if (!output) return;
    mkdirSync(output, { recursive: true });
    let remaining = 2000;
    const steps = (items: TestStep[], depth = 0): unknown[] =>
      depth > 8
        ? []
        : items.flatMap((step) => {
            if (remaining-- <= 0) return [];
            return [
              {
                title: step.title.slice(0, 2000),
                category: step.category,
                duration: step.duration,
                error: step.error?.message?.slice(0, 16000),
                steps: steps(step.steps, depth + 1),
              },
            ];
          });
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
          steps: steps(result.steps),
          attachments: result.attachments.map((attachment) => ({
            ...attachment,
            body: attachment.body?.toString("base64"),
          })),
        },
      }) + "\n",
    );
  }
}
