import { defineConfig } from '@playwright/test';

import config from './playwright.config';

export default defineConfig(config, {
  globalSetup: './checks/regression-setup.ts',
  webServer: {
    command: 'node ../../scripts/dev-api.mjs',
    url: 'http://127.0.0.1:4010/health',
    reuseExistingServer: !process.env['CI'],
    timeout: 60000,
  },
});
