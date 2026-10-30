import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ociCommand, stopContainer } from "../src/oci-worker.ts";
import { prepareSource, verifySource, catalogRevision } from "../src/source.ts";

test("OCI policy rejects mutable image references", () => {
  assert.throws(
    () => ociCommand(randomUUID(), ".", ".", 1, "worker:latest"),
    /immutable/,
  );
});
test(
  "OCI worker executes isolated fixtures and enforces filesystem, identity and network policy",
  { skip: !process.env["OCI_WORKER_IMAGE"], timeout: 120000 },
  async () => {
    await prepareSource();
    const snapshot = await verifySource(catalogRevision);
    const output = await mkdtemp(path.join(tmpdir(), "assertide-oci-"));
    if (
      path.dirname(output) !== path.resolve(tmpdir()) ||
      !path.basename(output).startsWith("assertide-oci-")
    )
      throw new Error("Unsafe cleanup path");
    const id = randomUUID();
    const invoke = (args: string[], input?: unknown) =>
      new Promise<{ code: number; log: string }>((resolve, reject) => {
        const child = spawn("docker", args, {
          stdio: ["pipe", "pipe", "pipe"],
        });
        let log = "";
        child.stdout.on("data", (chunk) => (log += chunk));
        child.stderr.on("data", (chunk) => (log += chunk));
        child.stdin.on("error", () => {});
        child.stdin.end(input ? JSON.stringify(input) : undefined);
        child.once("error", reject);
        child.once("close", (code) => resolve({ code: code ?? -1, log }));
      });
    try {
      const command = ociCommand(id, snapshot, output, 1);
      const probe = [...command.args];
      const image = probe.pop()!;
      probe.push(
        "--entrypoint",
        "node",
        image,
        "--input-type=module",
        "-e",
        `import assert from 'node:assert/strict'; import {writeFile} from 'node:fs/promises'; assert.notEqual(process.getuid(),0); assert.equal(process.env.AWS_SECRET_ACCESS_KEY,undefined); await assert.rejects(writeFile('/app/forbidden','x')); await assert.rejects(writeFile('/source/forbidden','x')); await assert.rejects(fetch('https://example.com',{signal:AbortSignal.timeout(1500)})); console.log('isolation verified');`,
      );
      const isolation = await invoke(probe);
      assert.equal(isolation.code, 0, isolation.log);
      assert.match(isolation.log, /isolation verified/);
      const result = await invoke(command.args, {
        testIds: ["LAB-001", "LAB-002", "UI-001"],
        workers: 1,
        retries: 0,
        projects: ["api", "chromium"],
        video: "off",
        password: randomBytes(24).toString("hex"),
        signingKey: randomBytes(32).toString("hex"),
      });
      assert.equal(result.code, 0, result.log);
      const results = JSON.parse(
        await readFile(path.join(output, "results.json"), "utf8"),
      ) as { stats: { expected: number; unexpected: number } };
      assert.equal(results.stats.expected, 3);
      assert.equal(results.stats.unexpected, 0);
      const headed = await invoke(command.args, {
        testIds: ["UI-001"],
        workers: 1,
        retries: 0,
        projects: ["chromium"],
        headed: true,
        video: "off",
        password: randomBytes(24).toString("hex"),
        signingKey: randomBytes(32).toString("hex"),
      });
      assert.equal(headed.code, 0, headed.log);
      const headedResults = JSON.parse(
        await readFile(path.join(output, "results.json"), "utf8"),
      );
      assert.equal(headedResults.stats.expected, 1);
      assert.equal(headedResults.stats.unexpected, 0);
      const inspect = await invoke(["inspect", `assertide-worker-${id}`]);
      assert.notEqual(inspect.code, 0, "container must be removed");
      const sleeper = [...command.args];
      const pinned = sleeper.pop()!;
      sleeper.push(
        "--entrypoint",
        "node",
        pinned,
        "-e",
        "setInterval(()=>{},1000)",
      );
      const sleeping = invoke(sleeper);
      for (let attempt = 0; attempt < 50; attempt++) {
        if ((await invoke(["inspect", `assertide-worker-${id}`])).code === 0)
          break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await stopContainer(id);
      await sleeping;
      assert.notEqual(
        (await invoke(["inspect", `assertide-worker-${id}`])).code,
        0,
      );
    } finally {
      await stopContainer(id);
      await rm(output, { recursive: true, force: true });
    }
  },
);
