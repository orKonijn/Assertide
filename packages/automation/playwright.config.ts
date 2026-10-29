import { defineConfig } from "@playwright/test";
import path from "node:path";
const output = process.env["RUN_OUTPUT"] ?? "test-results";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 30_000,
  retries: 0,
  workers: 1,
  outputDir: path.join(output, "evidence"),
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(output, "results.json") }],
    ["allure-playwright", { resultsDir: path.join(output, "allure-results") }],
  ],
  use: { baseURL: "http://127.0.0.1:4010/lab/v1/", trace: "off" },
});
