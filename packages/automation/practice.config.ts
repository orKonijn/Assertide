import { reportOptions } from "./ui/utils/reporting.config";
// Suppress automatic DOM snapshots: form values can include one-time credentials.
process.env["PLAYWRIGHT_NO_COPY_PROMPT"] = "1";
import { defineConfig } from "@playwright/test";
if (process.env["ASSERTIDE_PUBLIC_PRACTICE"] !== "true")
  throw new Error(
    "Public practice is manual opt-in: set ASSERTIDE_PUBLIC_PRACTICE=true",
  );
if (process.env["CI"])
  throw new Error("Public practice is not a repeated CI gate");
const output = `../../.local/practice/${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
export default defineConfig({
  testDir: "./practice",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  maxFailures: 1,
  timeout: 45_000,
  outputDir: `${output}/evidence`,
  reporter: [
    ["list"],
    ["json", { outputFile: `${output}/results.json` }],
    ["allure-playwright", reportOptions(`${output}/allure-results`)],
  ],
  use: {
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
});
