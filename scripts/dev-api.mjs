import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = new URL("../.local/", import.meta.url);
await mkdir(directory, { recursive: true });
const secretsFile = new URL("credentials.json", directory);
let credentials;
try {
  credentials = JSON.parse(await readFile(secretsFile, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  credentials = {
    password: randomBytes(18).toString("base64url"),
    clientSecret: randomBytes(32).toString("hex"),
    signingKey: randomBytes(32).toString("hex"),
  };
  await writeFile(secretsFile, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
}
console.log(
  "Local accounts: admin, operator, viewer. Read the generated password from .local/credentials.json.",
);
const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
  cwd: `${root}/apps/api`,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    LOCAL_IDENTITY: "true",
    LOCAL_RUNNER: "true",
    LOCAL_PASSWORD: credentials.password,
    OIDC_CLIENT_SECRET: credentials.clientSecret,
    ENABLE_LAB: "true",
    LAB_PASSWORD: credentials.password,
    LAB_SIGNING_KEY: credentials.signingKey,
    LOCAL_DATABASE_PATH: `${root}/.local/database`,
  },
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
