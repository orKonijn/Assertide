import { reportOptions } from './ui/utils/reporting.config';
// Suppress automatic DOM snapshots: form values can include one-time credentials.
process.env['PLAYWRIGHT_NO_COPY_PROMPT'] = '1';
import { defineConfig } from '@playwright/test';
const output = `../../.local/platform/${process.env['WORKER_RUNTIME'] ?? 'local'}`;
export default defineConfig({
  globalSetup: './ui/utils/platform-setup.ts',
  outputDir: `${output}/test-results`,
  reporter: [
    ['list'],
    ['json', { outputFile: `${output}/results.json` }],
    ['allure-playwright', reportOptions(`${output}/allure-results`)],
  ],
  testDir: './platform',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  webServer: [
    {
      command: 'node ../../scripts/dev-api.mjs',
      url: 'http://127.0.0.1:4010/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
    },
    {
      command:
        'npm --prefix ../../apps/web start -- --host 127.0.0.1 --proxy-config proxy.conf.json',
      url: 'http://127.0.0.1:4200',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
  ],
  use: {
    actionTimeout: 10000,
    navigationTimeout: 15000,
    baseURL: 'http://127.0.0.1:4200',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
