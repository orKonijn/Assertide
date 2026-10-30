import { z } from "zod";

export function validateProduction(env: NodeJS.ProcessEnv = process.env) {
  if (env["NODE_ENV"] !== "production") return;
  for (const name of [
    "LOCAL_IDENTITY",
    "LOCAL_RUNNER",
    "LOCAL_SANDBOX",
    "ENABLE_LAB",
  ])
    if (env[name] === "true")
      throw new Error(`${name} cannot be enabled in production`);
  for (const name of [
    "DATABASE_URL",
    "REDIS_URL",
    "S3_BUCKET",
    "OIDC_CLIENT_ID",
    "OIDC_CLIENT_SECRET",
  ])
    if (!env[name]) throw new Error(`${name} is required in production`);
  for (const name of ["APP_ORIGIN", "REPORT_ORIGIN", "OIDC_ISSUER"]) {
    const url = new URL(env[name] ?? "");
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error(`${name} requires HTTPS`);
  }
  if (
    new URL(env["APP_ORIGIN"]!).origin === new URL(env["REPORT_ORIGIN"]!).origin
  )
    throw new Error("Report origin must be separate from the application");
  z.enum(["oci", "kubernetes"]).parse(env["WORKER_RUNTIME"]);
  z.string()
    .regex(/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/)
    .parse(env["OCI_WORKER_IMAGE"]);
}
