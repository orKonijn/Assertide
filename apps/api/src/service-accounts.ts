import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import type { Express, Request, Response } from "express";
import type { IdentityService, Principal } from "./identity.ts";
import type { PlatformService } from "./platform.ts";

const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function mountServiceAccounts(
  app: Express,
  identity: IdentityService,
  platform: PlatformService,
) {
  const handle =
    (
      work: (
        req: Request,
        res: Response,
        principal: Principal,
        project: string,
      ) => Promise<void>,
    ) =>
    async (req: Request, res: Response) => {
      res.set("Cache-Control", "no-store");
      try {
        const principal = await identity.principal(req);
        if (!principal) {
          res.status(401).end();
          return;
        }
        const project = String(req.params["project"]);
        if (!principal.projectIds.includes(project)) {
          res.status(404).end();
          return;
        }
        if (
          principal.role !== "administrator" ||
          principal.machine ||
          (req.method !== "GET" && !identity.sameOrigin(req))
        ) {
          res.status(403).end();
          return;
        }
        await work(req, res, principal, project);
      } catch {
        res
          .status(500)
          .json({
            title: "Service account operation failed",
            correlationId: randomUUID(),
          });
      }
    };
  app.get(
    "/v1/projects/:project/service-accounts",
    handle(async (_req, res, principal, project) => {
      const items = (
        await platform.db.query(
          "SELECT id,name,created_at,expires_at,revoked,version FROM service_accounts WHERE organization_id=$1 AND project_id=$2 ORDER BY created_at DESC",
          [principal.organizationId, project],
        )
      ).rows;
      res.json({ items });
    }),
  );
  app.post(
    "/v1/projects/:project/service-accounts",
    handle(async (req, res, principal, project) => {
      const parsed = z
        .object({
          name: z.string().trim().min(1).max(120),
          days: z.number().int().min(1).max(90).default(30),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success) {
        res
          .status(422)
          .json({ title: "Name and expiry of 1–90 days are required" });
        return;
      }
      const token = `ast_${randomBytes(32).toString("base64url")}`;
      const id = randomUUID();
      const row = (
        await platform.db.query(
          "INSERT INTO service_accounts(id,digest,organization_id,project_id,name,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,created_at,expires_at,revoked,version",
          [
            id,
            digest(token),
            principal.organizationId,
            project,
            parsed.data.name,
            new Date(Date.now() + parsed.data.days * 86400000).toISOString(),
          ],
        )
      ).rows[0];
      await platform.audit(principal, project, "service_account.created", id);
      res.status(201).json({ ...row, token });
    }),
  );
  for (const action of ["rotate", "revoke"] as const)
    app.post(
      `/v1/projects/:project/service-accounts/:id/${action}`,
      handle(async (req, res, principal, project) => {
        const id = z.uuid().safeParse(req.params["id"]);
        const version = /^"(\d+)"$/.exec(req.get("If-Match") ?? "");
        if (!id.success || !version) {
          res
            .status(412)
            .json({
              title: "Reload service accounts before changing this credential",
            });
          return;
        }
        const token = `ast_${randomBytes(32).toString("base64url")}`;
        const row = (
          await platform.db.query(
            `UPDATE service_accounts SET version=version+1,${action === "rotate" ? "digest=$5,expires_at=now()+interval '30 days',revoked=false" : "revoked=true"} WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND version=$4 RETURNING id,name,created_at,expires_at,revoked,version`,
            [
              id.data,
              principal.organizationId,
              project,
              Number(version[1]),
              ...(action === "rotate" ? [digest(token)] : []),
            ],
          )
        ).rows[0];
        if (!row) {
          res
            .status(412)
            .json({ title: "Service account changed; reload before retrying" });
          return;
        }
        await platform.audit(
          principal,
          project,
          `service_account.${action}d`,
          id.data,
        );
        res.json({ ...row, ...(action === "rotate" ? { token } : {}) });
      }),
    );
}
