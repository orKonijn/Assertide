import { execFileSync } from "node:child_process";
import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const destination = fileURLToPath(
  new URL("../.local/targets/swag-store", import.meta.url),
);
const revision = "ad62bb2d7950bc5747af46a75aa1fb1bd6b8622a";
try {
  await access(`${destination}/.git`);
} catch {
  execFileSync(
    "git",
    ["clone", "https://github.com/saucelabs/sample-app-web.git", destination],
    { stdio: "inherit" },
  );
}
const actual = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: destination,
  encoding: "utf8",
}).trim();
if (actual !== revision)
  execFileSync("git", ["checkout", "--detach", revision], {
    cwd: destination,
    stdio: "inherit",
  });
let source = await readFile(`${destination}/src/index.jsx`, "utf8");
source = source
  .replace(
    'import { BacktraceClient, ErrorBoundary } from "@backtrace/react";',
    "",
  )
  .replace(/BacktraceClient\.initialize\([\s\S]*?\n\}\);/, "")
  .replaceAll("<ErrorBoundary>", "<React.Fragment>")
  .replaceAll("</ErrorBoundary>", "</React.Fragment>");
await writeFile(`${destination}/src/index.jsx`, source);
for (const page of ["Login", "Inventory"]) {
  const file = `${destination}/src/pages/${page}.jsx`;
  const contents = await readFile(file, "utf8");
  await writeFile(
    file,
    contents.replace(
      'import { BacktraceClient } from "@backtrace/react";',
      "const BacktraceClient = { instance: { send: () => undefined } }; // Telemetry disabled in the local fixture.",
    ),
  );
}
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const itemPath = `${destination}/src/pages/InventoryItem.jsx`;
await writeFile(
  itemPath,
  (await readFile(itemPath, "utf8")).replace(
    'import { ErrorBoundary } from "@backtrace/react";',
    "class ErrorBoundary extends React.Component { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? this.props.fallback : this.props.children; } } // Local error boundary without telemetry.",
  ),
);
if (!process.argv.includes("--skip-install"))
  execFileSync(npm, ["ci", "--ignore-scripts"], {
    cwd: destination,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
execFileSync(npm, ["run", "build"], {
  cwd: destination,
  stdio: "inherit",
  shell: process.platform === "win32",
});
console.log(
  `Prepared local Sauce Labs fixture at ${revision}; telemetry initialization removed. MIT license preserved in fixture checkout.`,
);
