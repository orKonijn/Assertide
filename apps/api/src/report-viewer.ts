import { createHash, randomBytes } from "node:crypto";
import express, { type Express } from "express";
import path from "node:path";
import { z } from "zod";
import { runRoot } from "./local-runner.ts";
import { PlatformService } from "./platform.ts";
import { IdentityService } from "./identity.ts";
import type { SqlConnection } from "./database.ts";

const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function mountReportViewer(
  app: Express,
  db: SqlConnection,
  identity: IdentityService,
  platform: PlatformService,
) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS report_tickets (digest text PRIMARY KEY, run_id text NOT NULL, subject text NOT NULL, expires_at timestamptz NOT NULL, redeemed boolean NOT NULL DEFAULT false)",
  );
  app.get("/v1/runs/:id/report", async (req, res) => {
    try {
      const principal = await identity.principal(req);
      if (!principal) {
        res.status(401).end();
        return;
      }
      const id = String(req.params["id"]);
      const run = await platform.get(principal, id, "run");
      if (run["reportPhase"] !== "ready") {
        res.status(409).json({ title: "Report not ready" });
        return;
      }
      const token = randomBytes(32).toString("hex");
      await db.query(
        "INSERT INTO report_tickets(digest,run_id,subject,expires_at) VALUES($1,$2,$3,now()+interval '60 seconds')",
        [digest(token), id, principal.subject],
      );
      res
        .set("Cache-Control", "no-store")
        .set("Referrer-Policy", "no-referrer")
        .redirect(`http://localhost:4012/open?ticket=${token}`);
    } catch {
      res.status(404).end();
    }
  });
  const viewer = express();
  viewer.use((_req, res, next) => {
    res
      .set("Referrer-Policy", "no-referrer")
      .set("Cache-Control", "no-store")
      .set("X-Content-Type-Options", "nosniff");
    next();
  });
  viewer.get("/open", async (req, res) => {
    const ticket = req.query["ticket"];
    if (typeof ticket !== "string" || !/^[a-f0-9]{64}$/.test(ticket)) {
      res.status(403).end();
      return;
    }
    const row = (
      await db.query<{ run_id: string }>(
        "UPDATE report_tickets SET redeemed=true,expires_at=now()+interval '15 minutes' WHERE digest=$1 AND expires_at>now() AND NOT redeemed RETURNING run_id",
        [digest(ticket)],
      )
    ).rows[0];
    if (!row) {
      res.status(403).end();
      return;
    }
    res.cookie("assertide_report", ticket, {
      httpOnly: true,
      sameSite: "lax",
      path: `/reports/${row.run_id}/`,
      maxAge: 900_000,
    });
    res.redirect(`/reports/${row.run_id}/index.html`);
  });
  viewer.use("/reports/:id", async (req, res, next) => {
    const id = String(req.params["id"]);
    const token = req.headers.cookie
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("assertide_report="))
      ?.slice("assertide_report=".length);
    if (!token || !z.uuid().safeParse(id).success) {
      res.status(403).end();
      return;
    }
    const row = (
      await db.query<{ body: unknown }>(
        `SELECT m.body FROM report_tickets t JOIN memberships m ON m.subject=t.subject
      WHERE t.digest=$1 AND t.run_id=$2 AND t.redeemed AND t.expires_at>now()`,
        [digest(token), id],
      )
    ).rows[0];
    if (!row) {
      res.status(403).end();
      return;
    }
    const membership = z
      .object({ projectIds: z.array(z.string()), organizationId: z.string() })
      .parse(row.body);
    const run = (
      await db.query<{
        project_id: string;
        organization_id: string;
        directory: string | null;
      }>(
        "SELECT project_id,organization_id,body->>'reportDirectory' AS directory FROM platform_documents WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (
      !run ||
      run.organization_id !== membership.organizationId ||
      !membership.projectIds.includes(run.project_id)
    ) {
      res.status(403).end();
      return;
    }
    const directory = run.directory ?? "report";
    if (!/^report(?:-[a-f0-9-]{36})?$/.test(directory)) {
      res.status(404).end();
      return;
    }
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    );
    express.static(path.join(runRoot, id, directory), {
      dotfiles: "deny",
      index: "index.html",
      fallthrough: false,
    })(req, res, next);
  });
  const server = viewer.listen(4012, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return server;
}
