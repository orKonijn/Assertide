import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
export default async function setup() {
  const runtime = process.env["WORKER_RUNTIME"] ?? "local";
  if (!["local", "oci", "kubernetes"].includes(runtime))
    throw new Error("Unsupported platform runtime");
  const root = path.resolve("../../.local/platform", runtime);
  const results = path.resolve(root, "allure-results");
  if (path.dirname(results) !== root)
    throw new Error("Invalid report output path");
  await rm(results, { recursive: true, force: true });
  await mkdir(results, { recursive: true });
  const repository = process.env["GITHUB_REPOSITORY"];
  const run = process.env["GITHUB_RUN_ID"];
  const executor =
    repository && run
      ? {
          name: "GitHub Actions",
          type: "github",
          buildName: `${runtime} / ${run}`,
          buildUrl: `https://github.com/${repository}/actions/runs/${run}`,
          buildOrder: Number(run),
        }
      : { name: "Local verification", type: "local", buildName: runtime };
  await writeFile(
    path.join(results, "executor.json"),
    JSON.stringify(executor, null, 2),
  );
}
