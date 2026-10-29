import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./platform",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4200",
    trace: "off",
    screenshot: "only-on-failure",
  },
});
