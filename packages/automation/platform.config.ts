import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./platform",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  webServer: [
    {
      command: "node ../../scripts/dev-api.mjs",
      url: "http://127.0.0.1:4010/health",
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
    },
    {
      command:
        "npm --prefix ../../apps/web start -- --host 127.0.0.1 --proxy-config proxy.conf.json",
      url: "http://127.0.0.1:4200",
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:4200",
    trace: "off",
    screenshot: "only-on-failure",
  },
});
