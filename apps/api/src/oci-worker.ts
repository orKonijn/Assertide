import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
export function workerName(id: string) {
  return `assertide-worker-${z.uuid().parse(id)}`;
}
export function ociCommand(
  id: string,
  snapshot: string,
  output: string,
  workers: number,
  image = process.env["OCI_WORKER_IMAGE"],
) {
  if (
    !image ||
    !/^(?:sha256:[a-f0-9]{64}|[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64})$/.test(
      image,
    )
  )
    throw new Error("OCI_WORKER_IMAGE must be an immutable image ID or digest");
  if (process.platform !== "linux")
    throw new Error("OCI execution requires a Linux Docker worker host");
  const uid = process.getuid?.() ?? 10001;
  const gid = process.getgid?.() ?? 10001;
  if (uid === 0)
    throw new Error("Run the worker supervisor as a non-root account");
  return {
    executable: "docker",
    args: [
      "run",
      "--rm",
      "-i",
      "--init",
      "--name",
      workerName(id),
      "--label",
      `io.assertide.run=${id}`,
      "--network",
      "none",
      "--read-only",
      "--user",
      `${uid}:${gid}`,
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "256",
      "--cpus",
      String(workers),
      "--memory",
      "2g",
      "--memory-swap",
      "2g",
      "--shm-size",
      "512m",
      "--tmpfs",
      "/tmp:rw,nosuid,size=512m",
      "--mount",
      `type=bind,src=${path.resolve(snapshot)},dst=/source,readonly`,
      "--mount",
      `type=bind,src=${path.resolve(output)},dst=/output`,
      image,
    ],
  };
}
export async function stopContainer(id: string) {
  const name = workerName(id);
  await new Promise<void>((resolve) => {
    const child = spawn("docker", ["rm", "--force", name], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", () => resolve());
    child.once("exit", () => resolve());
  });
}
