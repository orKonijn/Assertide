import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import expressParser from "express";
import type { Express } from "express";
import { connectDatabase } from "./database.ts";
import { LabService, mountLab } from "./lab.ts";
import { IdentityService } from "./identity.ts";
import { startLocalIdentity } from "./local-identity.ts";
import { PlatformService, mountPlatform } from "./platform.ts";
import { LocalRunner } from "./local-runner.ts";
import { mountReportViewer } from "./report-viewer.ts";
import { mountLiveEvents } from "./live.ts";
import { mountAnalytics } from "./analytics.ts";
import { startLocalSandbox } from "./local-sandbox.ts";
import { mountArtifacts } from "./artifacts.ts";
import { mountServiceAccounts } from "./service-accounts.ts";
import { mountAdministration } from "./administration.ts";
import { mountEnvironments } from "./environments.ts";
import { mountOperations } from "./operations.ts";
import { requestContext } from "./request-context.ts";

@Module({})
class AppModule {}

const db = await connectDatabase(process.env["DATABASE_URL"]);
const app = await NestFactory.create(AppModule);
const express: Express = app.getHttpAdapter().getInstance();
express.use(requestContext);
express.use((req, res, next) => {
  if (
    !req.path.startsWith("/lab/v1/") &&
    (req.get("X-Lab-Fault") || req.get("X-Lab-Fixture"))
  ) {
    res.status(400).json({
      status: 400,
      title: "Fixture headers are restricted to the Lab",
    });
    return;
  }
  next();
});
express.use(expressParser.json({ limit: "64kb" }));
const appOrigin = process.env["APP_ORIGIN"] ?? "http://127.0.0.1:4200";
const identity = new IdentityService(db, appOrigin);
await identity.initialize();
const platform = new PlatformService(db);
await platform.initialize();
let localIdentity: Awaited<ReturnType<typeof startLocalIdentity>> | undefined;
if (process.env["LOCAL_IDENTITY"] === "true") {
  const password = process.env["LOCAL_PASSWORD"];
  const secret = process.env["OIDC_CLIENT_SECRET"];
  if (!password || password.length < 12 || !secret || secret.length < 32)
    throw new Error("Local identity credentials must be generated first");
  localIdentity = await startLocalIdentity(
    password,
    secret,
    `${appOrigin}/auth/callback`,
  );
  await platform.seedLocal();
  for (const [subject, role] of [
    ["admin", "administrator"],
    ["operator", "operator"],
    ["viewer", "viewer"],
  ] as const) {
    await identity.provision(
      {
        subject,
        name: subject,
        role,
        organizationId: "00000000-0000-4000-8000-000000000001",
        projectIds: ["00000000-0000-4000-8000-000000000010"],
      },
      false,
    );
  }
  await identity.mount(
    express,
    "http://127.0.0.1:4011",
    "assertide-local",
    secret,
  );
} else if (
  process.env["OIDC_ISSUER"] &&
  process.env["OIDC_CLIENT_ID"] &&
  process.env["OIDC_CLIENT_SECRET"]
) {
  await identity.mount(
    express,
    process.env["OIDC_ISSUER"],
    process.env["OIDC_CLIENT_ID"],
    process.env["OIDC_CLIENT_SECRET"],
  );
}
mountPlatform(express, platform, identity);
mountAdministration(express, identity, platform);
mountEnvironments(express, identity, platform);
mountOperations(express, db, identity);
mountLiveEvents(express, identity, platform);
mountAnalytics(express, identity, platform);
mountArtifacts(express, identity, platform);
mountServiceAccounts(express, identity, platform);
const reportViewer =
  process.env["DISABLE_REPORT_VIEWER"] !== "true"
    ? await mountReportViewer(express, db, identity, platform)
    : undefined;
if (process.env["ENABLE_LAB"] === "true") {
  if (process.env["NODE_ENV"] === "production")
    throw new Error("Lab must run separately from production");
  const password = process.env["LAB_PASSWORD"];
  const signingKey = process.env["LAB_SIGNING_KEY"];
  if (!password || !signingKey)
    throw new Error("LAB_PASSWORD and LAB_SIGNING_KEY required");
  const lab = new LabService(db, password, signingKey);
  await lab.initialize();
  mountLab(express, lab);
}
express.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
await app.listen(Number(process.env["PORT"] ?? 4010), "127.0.0.1");
const runner =
  process.env["LOCAL_RUNNER"] === "true" ? new LocalRunner(db) : undefined;
await runner?.start();
const sandbox =
  process.env["LOCAL_SANDBOX"] === "true"
    ? await startLocalSandbox()
    : undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    sandbox?.close();
    reportViewer?.close();
    localIdentity?.close();
    void (runner?.stop() ?? Promise.resolve())
      .then(() => app.close())
      .then(() => db.close());
  });
