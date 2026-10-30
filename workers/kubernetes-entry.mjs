import { access, readFile, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { spawn } from "node:child_process";

// PID 1 needs an explicit signal handler; container shutdown reaps its children.
process.once("SIGTERM", () => process.exit(143));

// A bounded readiness poll: the transfer process publishes input atomically.
while (
  !(await access("/input/ready").then(
    () => true,
    () => false,
  ))
)
  await setTimeout(100);
const child = spawn(
  process.execPath,
  ["--import", "tsx", "/app/workers/entry.mjs"],
  { stdio: ["pipe", "inherit", "inherit"] },
);
child.stdin.on("error", () => {});
child.stdin.end(await readFile("/input/spec.json"));
const code = await new Promise((resolve) => {
  child.once("error", () => resolve(1));
  child.once("exit", (code) => resolve(code ?? 1));
});
await writeFile("/output/exit-code", String(code));
process.exitCode = code;
