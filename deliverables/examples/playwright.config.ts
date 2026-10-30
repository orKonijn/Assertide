import { defineConfig, devices } from '@playwright/test';

// Local targets are intentional defaults. Public execution requires an explicit target override.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results',
  reporter: [['list'], ['allure-playwright', { resultsDir: 'allure-results' }]],
  use: { testIdAttribute: 'data-test', screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'off' },
  projects: [
    ...(['chromium', 'firefox', 'webkit'] as const).map(browser => ({
      name: browser,
      testMatch: /ui\/.*\.spec\.ts/,
      use: {
        ...(browser === 'chromium' ? devices['Desktop Chrome'] : browser === 'firefox' ? devices['Desktop Firefox'] : devices['Desktop Safari']),
        baseURL: process.env.UI_BASE_URL ?? 'http://127.0.0.1:3000',
      },
    })),
    { name: 'api', testMatch: /api\/.*\.spec\.ts/, use: { baseURL: process.env.API_BASE_URL ?? 'http://127.0.0.1:4011' } },
  ],
});
