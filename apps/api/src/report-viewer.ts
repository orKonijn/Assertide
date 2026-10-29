import { createHash, randomBytes } from "node:crypto";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import path from "node:path";
import { z } from "zod";
import { runRoot } from "./local-runner.ts";
import { PlatformService } from "./platform.ts";
import { IdentityService } from "./identity.ts";
import type { SqlConnection } from "./database.ts";
import { objectStore } from "./object-store.ts";
import { reportManifest } from "./report-storage.ts";

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
  await db.query(
    "ALTER TABLE report_tickets ADD COLUMN IF NOT EXISTS auth_digest text, ADD COLUMN IF NOT EXISTS auth_kind text, ADD COLUMN IF NOT EXISTS report_directory text",
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
      if (
        run["reportPhase"] === "expired" ||
        (typeof run["reportExpiresAt"] === "string" &&
          new Date(run["reportExpiresAt"]) <= new Date())
      ) {
        res.status(410).json({ title: "Report expired" });
        return;
      }
      if (run["reportPhase"] !== "ready") {
        res.status(409).json({ title: "Report not ready" });
        return;
      }
      const token = randomBytes(32).toString("hex");
      const binding = identity.credential(req);
      if (!binding) {
        res.status(401).end();
        return;
      }
      await db.query(
        "INSERT INTO report_tickets(digest,run_id,subject,expires_at,auth_digest,auth_kind,report_directory) VALUES($1,$2,$3,now()+interval '60 seconds',$4,$5,$6)",
        [
          digest(token),
          id,
          principal.subject,
          binding.digest,
          binding.kind,
          run["reportDirectory"],
        ],
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
      await db.query<{
        auth_digest: string | null;
        auth_kind: string | null;
        report_directory: string | null;
      }>(
        `SELECT t.auth_digest,t.auth_kind,t.report_directory FROM report_tickets t
      WHERE t.digest=$1 AND t.run_id=$2 AND t.redeemed AND t.expires_at>now()`,
        [digest(token), id],
      )
    ).rows[0];
    if (
      !row?.auth_digest ||
      !["session", "service"].includes(row.auth_kind ?? "")
    ) {
      res.status(403).end();
      return;
    }
    const membership = await identity.resolveCredential({
      digest: row.auth_digest,
      kind: row.auth_kind as "session" | "service",
    });
    if (!membership) {
      res.status(403).end();
      return;
    }
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
    const directory = row.report_directory ?? "";
    if (!/^report(?:-[a-f0-9-]{36})?$/.test(directory)) {
      res.status(404).end();
      return;
    }
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    );
    const build = (
      await db.query<{ body: unknown; expired: boolean; expires_at: string }>(
        "SELECT body,expired,expires_at FROM report_builds WHERE run_id=$1 AND directory=$2",
        [id, directory],
      )
    ).rows[0];
    if (build) {
      if (build.expired || new Date(build.expires_at) <= new Date()) {
        res.status(410).send("Report expired");
        return;
      }
      const manifest = reportManifest.parse(build.body);
      if (manifest.files) {
        const name =
          decodeURIComponent(req.path).replace(/^\//, "") || "index.html";
        const reference = manifest.files[name];
        if (!reference || !objectStore) {
          res.status(404).end();
          return;
        }
        const bytes = await objectStore.get(reference);
        res.type(path.extname(name)).send(bytes);
        return;
      }
    }
    express.static(path.join(runRoot, id, directory), {
      dotfiles: "deny",
      index: "index.html",
      fallthrough: false,
    })(req, res, next);
  });
  viewer.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const failure = z.object({ status: z.number() }).safeParse(error);
      res
        .status(failure.success && failure.data.status === 404 ? 404 : 500)
        .type("text/plain")
        .send("Report asset unavailable");
    },
  );
  const server = viewer.listen(4012, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return server;
}
