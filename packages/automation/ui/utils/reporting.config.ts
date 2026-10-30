import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';

import { Status } from 'allure-js-commons';
function git(...args: string[]): string {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unavailable';
  }
}
const dependencies = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).devDependencies as Record<string, string>;
export function reportOptions(resultsDir: string): {
  resultsDir: string;
  detail: boolean;
  suiteTitle: boolean;
  environmentInfo: {
    OS: string;
    Node: string;
    Playwright: string;
    Allure: string;
    Runtime: string;
    Environment: string;
    Commit: string;
    Branch: string;
    CI: string;
  };
  categories: { name: string; matchedStatuses: Status[] }[];
} {
  return {
    resultsDir,
    detail: false,
    suiteTitle: false,
    environmentInfo: {
      OS: `${os.platform()} ${os.release()}`,
      Node: process.version,
      Playwright: dependencies['@playwright/test']!,
      Allure: dependencies['allure']!,
      Runtime: process.env['WORKER_RUNTIME'] ?? 'local',
      Environment: 'controlled local fixtures',
      Commit: process.env['GITHUB_SHA'] ?? git('rev-parse', 'HEAD'),
      Branch: process.env['GITHUB_HEAD_REF'] ?? git('branch', '--show-current'),
      CI: process.env['GITHUB_ACTIONS'] === 'true' ? 'GitHub Actions' : 'local',
    },
    categories: [
      { name: 'Assertion failures', matchedStatuses: [Status.FAILED] },
      { name: 'Test infrastructure errors', matchedStatuses: [Status.BROKEN] },
    ],
  };
}
