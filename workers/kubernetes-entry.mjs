import { access, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";

// Forced pod termination is separate from the graceful cancellation protocol.
process.once("SIGTERM", () => process.exit(143));
const exists = (file) =>
  access(file).then(
    () => true,
    () => false,
  );
async function execute() {
  while (!(await exists("/input/ready"))) {
    if (await exists("/input/cancel")) return 143;
    await delay(100);
  }
  if (await exists("/input/cancel")) return 143;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "/app/workers/entry.mjs"],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  child.stdin.on("error", () => {});
  child.stdin.end(await readFile("/input/spec.json"));
  let canceled = false;
  let finished = false;
  let force;
  const cancel = setInterval(() => {
    void exists("/input/cancel").then((requested) => {
      if (!requested || canceled || finished) return;
      canceled = true;
      child.kill("SIGTERM");
      force = setTimeout(() => child.kill("SIGKILL"), 5000);
      force.unref();
    });
  }, 100);
  try {
    return await new Promise((resolve) => {
      child.once("error", () => resolve(1));
      child.once("exit", (code) => resolve(code ?? 143));
    });
  } finally {
    finished = true;
    clearInterval(cancel);
    clearTimeout(force);
  }
}
const code = await execute();
await writeFile("/output/exit-code", String(code));
process.exitCode = code;
