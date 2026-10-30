import { defineConfig } from "@playwright/test";
import { reportOptions } from "../ui/utils/reporting.config";
process.env["PLAYWRIGHT_NO_COPY_PROMPT"] = "1";
const output = process.env["REPORT_PROBE_OUTPUT"];
if (!output) throw new Error("Probe requires a disposable output directory");
export default defineConfig({
  testDir: ".",
  testMatch: "reporting.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 10000,
  outputDir: `${output}/evidence`,
  reporter: [
    ["json", { outputFile: `${output}/results.json` }],
    ["allure-playwright", reportOptions(`${output}/allure-results`)],
  ],
  use: { trace: "off", video: "off", screenshot: "off" },
});
