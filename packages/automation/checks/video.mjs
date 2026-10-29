import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, stat, rm, readdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const output = await mkdtemp(path.join(tmpdir(), "assertide-video-"));
try {
  // Chromium blocks port 1 before sending a request. This produces a deterministic
  // failed attempt without contacting an external target or changing test code.
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--project",
      "chromium",
      "--grep",
      "UI-001 ",
    ],
    {
      cwd,
      env: {
        ...process.env,
        RUN_VIDEO: "retain-on-failure",
        RUN_BROWSER_URL: "http://127.0.0.1:1",
        RUN_OUTPUT: output,
      },
      encoding: "utf8",
      timeout: 60000,
      windowsHide: true,
    },
  );
  assert.equal(
    result.status,
    1,
    "The intentionally blocked target must fail its attempt",
  );
  const report = JSON.parse(
    await readFile(path.join(output, "results.json"), "utf8"),
  );
  const flatten = (suite) => [
    ...(suite.specs ?? []),
    ...(suite.suites ?? []).flatMap(flatten),
  ];
  const tests = report.suites.flatMap(flatten).flatMap((spec) => spec.tests);
  assert.equal(tests.length, 1);
  const attempt = tests[0].results.at(-1);
  assert.equal(attempt.status, "failed");
  assert.match(attempt.error.message, /ERR_UNSAFE_PORT/);
  for (const name of ["video", "trace", "screenshot"]) {
    const attachment = attempt.attachments.find((item) => item.name === name);
    assert.ok(attachment?.path, `Missing ${name} evidence`);
    assert.ok((await stat(attachment.path)).size > 0, `Empty ${name} evidence`);
  }
  console.log(
    "Verified non-empty failure video, trace and screenshot from the configured browser worker.",
  );
  const files = async (directory) => {
    const items = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) items.push(...(await files(filename)));
      else items.push(filename);
    }
    return items;
  };
  const generate = (destination) =>
    spawnSync(
      process.execPath,
      [
        "node_modules/allure/cli.js",
        "generate",
        path.join(output, "allure-results"),
        "--output",
        destination,
      ],
      { cwd, encoding: "utf8", timeout: 60000, windowsHide: true },
    );
  const reportDirectory = path.join(output, "report");
  assert.equal(generate(reportDirectory).status, 0);
  const reportFiles = await files(reportDirectory);
  assert.ok(
    reportFiles.some((name) => name.endsWith(".webm")),
    "Allure must store video separately for retention",
  );
  assert.ok(
    reportFiles.some((name) => name.endsWith(".zip")),
    "Allure must store traces separately for retention",
  );
  for (const name of await files(path.join(output, "allure-results")))
    if (/\.(webm|zip)$/.test(name)) await unlink(name);
  assert.equal(
    generate(path.join(output, "report-with-expired-evidence")).status,
    0,
    "Report rebuilding must tolerate expired video/trace attachments",
  );
  console.log(
    "Verified separate Allure video/trace assets and rebuilding after their expiry.",
  );
} finally {
  assert.equal(path.dirname(path.resolve(output)), path.resolve(tmpdir()));
  assert.ok(path.basename(output).startsWith("assertide-video-"));
  await rm(output, { recursive: true, force: true });
}
