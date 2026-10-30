import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const file = path.join(root, ".local", "credentials.json");
const credentials = JSON.parse(await readFile(file, "utf8"));
if (!credentials.objectStoreAccessKey) {
  credentials.objectStoreAccessKey = randomBytes(12).toString("hex");
  credentials.objectStoreSecretKey = randomBytes(32).toString("hex");
  await writeFile(file, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}
const directory = path.join(root, ".local", "objects");
await mkdir(directory, { recursive: true });
const child = spawn(
  path.join(
    root,
    ".local",
    "tools",
    process.platform === "win32" ? "minio.exe" : "minio",
  ),
  [
    "server",
    directory,
    "--address",
    "127.0.0.1:9000",
    "--console-address",
    "127.0.0.1:9001",
  ],
  {
    env: {
      ...process.env,
      MINIO_ROOT_USER: credentials.objectStoreAccessKey,
      MINIO_ROOT_PASSWORD: credentials.objectStoreSecretKey,
      MINIO_BROWSER: "off",
    },
    stdio: "ignore",
    windowsHide: true,
  },
);
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
