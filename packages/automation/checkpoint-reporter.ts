import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type {
  FullConfig,
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';

/** Durable completed attempts survive termination before Playwright's final report. */
export default class CheckpointReporter implements Reporter {
  public onTestBegin(test: TestCase, result: TestResult): void {
    if (process.env['RUN_OUTPUT'] && process.env['RUN_PERFORMANCE'] !== 'true') {
      process.stdout.write(
        '\nASSERTIDE_PROGRESS ' +
          JSON.stringify({
            id: `${test.title.split(' ')[0]}:${test.parent.project()?.name ?? 'api'}`,
            outcome: 'running',
            title: test.title.slice(0, 300),
            startedAt: result.startTime.toISOString(),
            retry: result.retry,
          }) +
          '\n',
      );
    }
  }
  public onBegin(config: FullConfig): void {
    const output = process.env['RUN_OUTPUT'];
    if (!output) {
      return;
    }
    const require = createRequire(import.meta.url);
    const lock = JSON.parse(
      readFileSync(new URL('./package-lock.json', import.meta.url), 'utf8'),
    ) as { packages: Record<string, { version: string }> };
    const browserCatalog = JSON.parse(
      readFileSync(
        path.join(path.dirname(require.resolve('playwright-core/package.json')), 'browsers.json'),
        'utf8',
      ),
    ) as {
      browsers: { name: string; revision: string; browserVersion?: string }[];
    };
    mkdirSync(output, { recursive: true });
    writeFileSync(
      path.join(output, 'toolchain.json'),
      JSON.stringify({
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        playwright: config.version,
        allure: lock.packages['node_modules/allure']!.version,
        allureIntegration: lock.packages['node_modules/allure-playwright']!.version,
        browserBuilds: browserCatalog.browsers
          .filter((browser) => config.projects.some((project) => project.name === browser.name))
          .map(({ name, revision, browserVersion }) => ({
            name,
            revision,
            version: browserVersion,
          })),
      }),
    );
  }
  public onTestEnd(test: TestCase, result: TestResult): void {
    const output = process.env['RUN_OUTPUT'];
    if (!output) {
      return;
    }
    if (process.env['RUN_PERFORMANCE'] !== 'true') {
      const caseId = test.title.split(' ')[0];
      const project = test.parent.project()?.name ?? 'api';
      let outcome = result.status === test.expectedStatus ? 'passed' : 'failed';
      if (result.status === 'skipped' || result.status === 'interrupted') {
        outcome = 'other';
      } else if (result.status !== test.expectedStatus && result.retry < test.retries) {
        outcome = 'retrying';
      }
      process.stdout.write(
        '\nASSERTIDE_PROGRESS ' +
          JSON.stringify({
            id: `${caseId}:${project}`,
            outcome,
          }) +
          '\n',
      );
    }
    mkdirSync(output, { recursive: true });
    // Keep binary evidence out of both this checkpoint and later JSON reporters.
    // Reporter ordering in playwright.config.ts makes every reporter use the same files.
    for (const attachment of result.attachments) {
      if (!attachment.body) {
        continue;
      }
      const directory = path.join(output, 'evidence', 'attachments');
      mkdirSync(directory, { recursive: true });
      const filename = path.join(directory, randomUUID());
      writeFileSync(filename, attachment.body, { flag: 'wx', mode: 0o600 });
      attachment.path = filename;
      delete attachment.body;
    }
    let remaining = 2000;
    const steps = (items: TestStep[], depth = 0): unknown[] =>
      depth > 8
        ? []
        : items.flatMap((step) => {
            if (remaining-- <= 0) {
              return [];
            }
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
      path.join(output, 'attempts.ndjson'),
      JSON.stringify({
        title: test.title,
        projectName: test.parent.project()?.name ?? 'api',
        expectedStatus: test.expectedStatus,
        result: {
          status: result.status,
          duration: result.duration,
          error: result.error,
          steps: steps(result.steps),
          attachments: result.attachments.map((attachment) => ({
            ...attachment,
            body: attachment.body?.toString('base64'),
          })),
        },
      }) + '\n',
    );
  }
}
