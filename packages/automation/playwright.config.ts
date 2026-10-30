import { reportOptions } from './ui/utils/reporting.config';
// Suppress automatic DOM snapshots: form values can include one-time credentials.
process.env['PLAYWRIGHT_NO_COPY_PROMPT'] = '1';
import path from 'node:path';

import { defineConfig } from '@playwright/test';
const output = process.env['RUN_OUTPUT'] ?? '../../.local/automation-results';
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  timeout: 30_000,
  retries: 0,
  workers: 1,
  outputDir: path.join(output, 'evidence'),
  reporter: [
    ['./checkpoint-reporter.ts'],
    ['list'],
    ['json', { outputFile: path.join(output, 'results.json') }],
    ['allure-playwright', reportOptions(path.join(output, 'allure-results'))],
  ],
  use: {
    baseURL: process.env['RUN_API_URL'] ?? 'http://127.0.0.1:4010/lab/v1/',
    trace: 'off',
  },
  projects: [
    { name: 'api', testMatch: 'lab*.spec.ts' },
    ...(['chromium', 'firefox', 'webkit'] as const).map((browserName) => ({
      name: browserName,
      testMatch: 'store*.spec.ts',
      use: {
        browserName,
        baseURL: process.env['RUN_BROWSER_URL'] ?? 'http://127.0.0.1:4013',
        testIdAttribute: 'data-test',
        trace: 'retain-on-failure' as const,
        screenshot: 'only-on-failure' as const,
        video:
          process.env['RUN_VIDEO'] === 'retain-on-failure'
            ? ('retain-on-failure' as const)
            : ('off' as const),
      },
    })),
  ],
});
