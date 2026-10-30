import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  kubernetesCommand,
  workerJob,
  workerNamespace,
  jobName,
  deleteWorkerJob,
} from "../src/kubernetes-worker.ts";
import { prepareSource, verifySource, catalogRevision } from "../src/source.ts";

test(
  "Kubernetes worker executes fixtures, blocks egress and removes canceled Jobs",
  { skip: process.env["TEST_KUBERNETES"] !== "true", timeout: 300000 },
  async () => {
    const invoke = (executable: string, args: string[], input?: string) =>
      new Promise<{ code: number; log: string }>((resolve, reject) => {
        const child = spawn(executable, args, {
          stdio: ["pipe", "pipe", "pipe"],
        });
        let log = "";
        child.stdout.on("data", (chunk) => {
          log += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          log += String(chunk);
        });
        child.stdin.on("error", () => {});
        child.stdin.end(input);
        child.once("error", reject);
        child.once("close", (code) => resolve({ code: code ?? -1, log }));
      });
    const kube = (args: string[], input?: string) =>
      invoke("kubectl", ["-n", workerNamespace(), ...args], input);
    const id = randomUUID();
    const output = await mkdtemp(path.join(tmpdir(), "assertide-kube-"));
    assert.equal(path.dirname(output), path.resolve(tmpdir()));
    try {
      const probe = workerJob(id, 1, process.env["OCI_WORKER_IMAGE"]!);
      probe.spec.template.spec.containers = [
        probe.spec.template.spec.containers[0]!,
      ];
      probe.spec.template.spec.containers[0]!.command = [
        "node",
        "--input-type=module",
        "-e",
        `import assert from 'node:assert/strict'; import {writeFile,access} from 'node:fs/promises'; assert.notEqual(process.getuid(),0); assert.equal(process.env.VAULT_TOKEN,undefined); await assert.rejects(access('/var/run/secrets/kubernetes.io/serviceaccount/token')); await assert.rejects(writeFile('/app/forbidden','x')); await assert.rejects(writeFile('/source/forbidden','x')); await assert.rejects(fetch('http://1.1.1.1',{signal:AbortSignal.timeout(2000)})); console.log('isolation verified');`,
      ];
      assert.equal(
        (await kube(["create", "-f", "-"], JSON.stringify(probe))).code,
        0,
      );
      const wait = await kube([
        "wait",
        "--for=condition=complete",
        `job/${jobName(id)}`,
        "--timeout=110s",
      ]);
      assert.equal(wait.code, 0, wait.log);
      assert.match(
        (await kube(["logs", `job/${jobName(id)}`])).log,
        /isolation verified/,
      );
      await deleteWorkerJob(id);
      await prepareSource();
      const command = kubernetesCommand(
        randomUUID(),
        await verifySource(catalogRevision),
        output,
        1,
      );
      const result = await invoke(
        command.executable,
        command.args,
        JSON.stringify({
          testIds: ["LAB-001", "LAB-002", "UI-001"],
          workers: 1,
          retries: 0,
          projects: ["api", "chromium", "firefox", "webkit"],
          headed: true,
          video: "off",
          password: randomBytes(24).toString("hex"),
          signingKey: randomBytes(32).toString("hex"),
        }),
      );
      assert.equal(result.code, 0, result.log);
      const results = JSON.parse(
        await readFile(path.join(output, "results.json"), "utf8"),
      );
      assert.equal(results.stats.expected, 5);
      assert.equal(results.stats.unexpected, 0);
      const cancelId = randomUUID();
      try {
        const sleeping = workerJob(
          cancelId,
          1,
          process.env["OCI_WORKER_IMAGE"]!,
        );
        assert.equal(
          (await kube(["create", "-f", "-"], JSON.stringify(sleeping))).code,
          0,
        );
        assert.equal(
          (
            await kube([
              "wait",
              "--for=jsonpath={.status.ready}=1",
              `job/${jobName(cancelId)}`,
              "--timeout=110s",
            ])
          ).code,
          0,
        );
        assert.equal(await deleteWorkerJob(cancelId), true);
        const deleted = await kube([
          "wait",
          "--for=delete",
          `job/${jobName(cancelId)}`,
          "--timeout=30s",
        ]);
        assert.ok(
          deleted.code === 0 || /NotFound|not found/.test(deleted.log),
          deleted.log,
        );
        const absent = await kube([
          "get",
          "job",
          jobName(cancelId),
          "--ignore-not-found",
          "-o",
          "name",
        ]);
        assert.equal(absent.code, 0, absent.log);
        assert.equal(absent.log.trim(), "");
      } finally {
        await deleteWorkerJob(cancelId);
      }
    } finally {
      await deleteWorkerJob(id);
      await rm(output, { recursive: true, force: true });
    }
  },
);
