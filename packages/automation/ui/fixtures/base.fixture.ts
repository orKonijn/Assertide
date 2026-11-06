import { expect, test as base } from '@playwright/test';

import {
  failureContext,
  metadata,
  redact,
  resetSecrets,
  screenshot,
  setStepScreenshotPage,
} from '../utils/allure.utils';
import { captureRunAccessibility } from '../utils/run-accessibility.utils';
import { captureRunPerformance } from '../utils/run-performance.utils';
export const test = base.extend<{
  diagnostics: { errors: string[]; secrets: string[] };
  sensitive: boolean;
}>({
  sensitive: [false, { option: true }],
  diagnostics: [
    async ({ page, browser, browserName, sensitive }, use, info) => {
      resetSecrets();
      setStepScreenshotPage(sensitive ? undefined : page);
      const errors: string[] = [];
      const secrets: string[] = [];
      const consoleErrors: string[] = [];
      const capture = (value: string): void => {
        if (consoleErrors.length < 20) {
          consoleErrors.push(redact(value, secrets));
        }
      };
      page.on('pageerror', (error) => {
        errors.push(redact(error.message, secrets));
      });
      page.on('console', (message) => {
        if (message.type() === 'error') {
          capture(message.text());
        }
      });
      await metadata(info, `${browserName} ${browser.version()}`);
      try {
        await use({ errors, secrets });
        await captureRunAccessibility(page, info, sensitive);
        if (info.status === 'passed' && !sensitive && !page.isClosed()) {
          await screenshot(page, 'final-state.png');
        }
        await failureContext(page, info, sensitive ? [] : [...errors, ...consoleErrors], secrets);
        await captureRunPerformance(page, info, sensitive);
      } finally {
        setStepScreenshotPage();
      }
    },
    { auto: true, ...(process.env['RUN_PERFORMANCE'] === 'true' ? { timeout: 180_000 } : {}) },
  ],
});
export { expect };
