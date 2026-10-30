import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { once } from "node:events";
import path from "node:path";
import { z } from "zod";
import {
  workerJob,
  workerNamespace,
  jobName,
  deleteWorkerJob,
} from "./kubernetes-worker.ts";

const [id, snapshot, output, workers] = process.argv.slice(2) as [
  string,
  string,
  string,
  string,
];
const namespace = workerNamespace();
function kubectl(args: string[]) {
  return spawn(
    "kubectl",
    [
      "--namespace",
      namespace,
      ...(args[0] === "logs"
        ? ["--request-timeout=0"]
        : ["--request-timeout=120s"]),
      ...args,
    ],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
}
async function command(args: string[], input?: string) {
  const child = kubectl(args);
  let result = "";
  child.stdin.on("error", () => {});
  child.stdin.end(input);
  child.stdout.on("data", (chunk) => {
    result += String(chunk);
    if (result.length > 1024 * 1024) child.kill();
  });
  child.stderr.resume();
  const [code] = await once(child, "close");
  if (code !== 0) throw new Error("Kubernetes operation failed");
  return result;
}
let input = "";
for await (const chunk of process.stdin) {
  input += String(chunk);
  if (input.length > 65536) throw new Error("Worker input exceeds policy");
}
const manifest = workerJob(
  id,
  Number(workers),
  process.env["OCI_WORKER_IMAGE"] ?? "",
);
let stage = "provisioning";
try {
  await command(["create", "-f", "-"], JSON.stringify(manifest));
  await command([
    "wait",
    "--for=jsonpath={.status.ready}=1",
    "job",
    jobName(id),
    "--timeout=110s",
  ]);
  const pod = z
    .object({
      items: z
        .array(
          z.object({
            metadata: z.object({ name: z.string().regex(/^[a-z0-9-]+$/) }),
          }),
        )
        .length(1),
    })
    .parse(
      JSON.parse(
        await command([
          "get",
          "pods",
          "-l",
          `job-name=${jobName(id)}`,
          "-o",
          "json",
        ]),
      ),
    ).items[0]!.metadata.name;
  const transfer = (mode: string) => [
    "exec",
    "-i",
    pod,
    "-c",
    "transfer",
    "--",
    "node",
    "/app/workers/kubernetes-transfer.mjs",
    mode,
  ];
  stage = "source transfer";
  const importer = kubectl(transfer("import"));
  const imported = once(importer, "close");
  importer.stdout.resume();
  importer.stderr.resume();
  importer.stdin.on("error", () => {});
  let sourceBytes = 0;
  async function source(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      if (entry.isSymbolicLink())
        throw new Error("Source symlinks are prohibited");
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await source(full);
        continue;
      }
      const data = await readFile(full);
      const line =
        JSON.stringify({
          name: path.relative(snapshot, full).split(path.sep).join("/"),
          data: data.toString("base64"),
        }) + "\n";
      sourceBytes += line.length;
      if (sourceBytes > 64 * 1024 * 1024)
        throw new Error("Source exceeds policy");
      if (!importer.stdin.write(line)) await once(importer.stdin, "drain");
    }
  }
  await source(snapshot);
  importer.stdin.end(JSON.stringify({ spec: JSON.parse(input) }) + "\n");
  input = "";
  if ((await imported)[0] !== 0) throw new Error("Source transfer failed");
  stage = "execution";
  // Logs follow ends when the worker container terminates, independently of transfer.
  const logs = kubectl([
    "logs",
    "-f",
    pod,
    "-c",
    "worker",
    "--pod-running-timeout=110s",
  ]);
  logs.stdin.end();
  logs.stdout.pipe(process.stdout);
  logs.stderr.pipe(process.stderr);
  if ((await once(logs, "close"))[0] !== 0)
    throw new Error("Worker log stream failed");
  stage = "artifact transfer";
  const exporter = kubectl(transfer("export"));
  const exported = once(exporter, "close");
  exporter.stdin.end();
  exporter.stderr.resume();
  let total = 0;
  for await (const line of createInterface({
    input: exporter.stdout,
    crlfDelay: Infinity,
  })) {
    total += line.length;
    if (total > 720 * 1024 * 1024) {
      exporter.kill();
      throw new Error("Output exceeds policy");
    }
    const item = z
      .object({
        name: z.string().regex(/^[a-zA-Z0-9_./ -]+$/),
        data: z.string().max(90 * 1024 * 1024),
      })
      .parse(JSON.parse(line));
    if (
      item.name.split("/").some((p) => !p || p === "." || p === "..") ||
      path.isAbsolute(item.name)
    )
      throw new Error("Invalid output path");
    const target = path.join(output, item.name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(item.data, "base64"), { flag: "wx" });
  }
  if ((await exported)[0] !== 0) throw new Error("Output transfer failed");
  const code = Number(await readFile(path.join(output, "exit-code"), "utf8"));
  await command(transfer("done"));
  process.exitCode = z.number().int().min(0).max(255).parse(code);
} catch {
  console.error(
    `Kubernetes ${stage} failed; inspect cluster events with an administrator`,
  );
  process.exitCode = 1;
} finally {
  if (!(await deleteWorkerJob(id))) {
    console.error("Worker Job cleanup failed");
    process.exitCode = 1;
  }
}
