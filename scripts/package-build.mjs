import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = `${root}/.local/build`;
await access(`${root}/apps/web/dist/assertide-web/browser/index.html`);
await mkdir(directory, { recursive: true });
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
execFileSync(
  "git",
  [
    "archive",
    "--format=tar",
    `--output=${directory}/source.tar`,
    "HEAD",
    "apps/api",
    "apps/web",
    "packages/domain",
    "packages/automation",
    "workers",
    "scripts",
    "package.json",
    "package-lock.json",
    "README.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    "eslint.config.mjs",
    ".dockerignore",
    ".gitignore",
    "docs",
  ],
  { cwd: root, stdio: "inherit", windowsHide: true },
);
const archived = execFileSync("tar", ["-tf", `${directory}/source.tar`], {
  encoding: "utf8",
}).split(/\r?\n/);
for (const required of [
  "apps/web/package-lock.json",
  "apps/web/angular.json",
  "eslint.config.mjs",
  "apps/api/src/main.ts",
  "packages/automation/playwright.config.ts",
])
  if (!archived.includes(required))
    throw new Error(`Build archive missing ${required}`);
if (
  archived.some(
    (name) =>
      name.split("/").includes(".local") || name.endsWith("/credentials.json"),
  )
)
  throw new Error("Private runtime data must never enter the build archive");
await writeFile(
  `${directory}/build.json`,
  JSON.stringify(
    {
      revision,
      builtAt: new Date().toISOString(),
      node: process.version,
      workerImage: process.env.OCI_WORKER_IMAGE ?? null,
      release: false,
    },
    null,
    2,
  ),
);
execFileSync(
  "tar",
  [
    "-czf",
    `${directory}/assertide-build.tgz`,
    "-C",
    `${root}/apps/web/dist/assertide-web`,
    "browser",
    "-C",
    directory,
    "source.tar",
    "build.json",
  ],
  { stdio: "inherit", windowsHide: true },
);
const digest = createHash("sha256")
  .update(await readFile(`${directory}/assertide-build.tgz`))
  .digest("hex");
await writeFile(`${directory}/SHA256SUMS`, `${digest}  assertide-build.tgz\n`);
console.log(
  `Packaged verified-build inputs at .local/build/assertide-build.tgz (${revision}). This is not a product release.`,
);
