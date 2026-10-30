import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, ".local", "targets", "minio");
const binary = path.join(
  root,
  ".local",
  "tools",
  process.platform === "win32" ? "minio.exe" : "minio",
);
const revision = "7aac2a2c5b7c882e68c1ce017d8256be2feea27f";
const run = (command, args, cwd = root) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`)),
    );
  });
await mkdir(path.dirname(source), { recursive: true });
await mkdir(path.dirname(binary), { recursive: true });
try {
  await access(path.join(source, ".git"));
} catch {
  await run("git", [
    "clone",
    "--filter=blob:none",
    "--no-checkout",
    "https://github.com/minio/minio.git",
    source,
  ]);
}
await run("git", ["checkout", "--detach", revision], source);
const go =
  process.env.GO_BINARY ??
  (process.platform === "win32"
    ? path.join(root, ".local", "tools", "go", "bin", "go.exe")
    : "go");
await run(go, ["build", "-o", binary, "."], source);
console.log(
  "Pinned MinIO development fixture built. Its upstream AGPL license remains in the local source checkout.",
);
