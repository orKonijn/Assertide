import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
export const root = fileURLToPath(new URL("../", import.meta.url));
export function command(executable, args, cwd = root) {
  return spawn(executable, args, { cwd, stdio: "inherit", windowsHide: true });
}
export function npm(args, cwd = root) {
  if (!process.env.npm_execpath)
    throw new Error("Start this command through npm run");
  return command(process.execPath, [process.env.npm_execpath, ...args], cwd);
}
export function completed(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Command failed (${code})`)),
    );
  });
}
