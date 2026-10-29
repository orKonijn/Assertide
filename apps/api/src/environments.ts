import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import type { Express, Request, Response } from "express";
import type { SqlConnection } from "./database.ts";
import type { IdentityService, Principal } from "./identity.ts";
import type { PlatformService } from "./platform.ts";

export const environmentSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
    apiUrl: z.literal("http://127.0.0.1:4010/lab/v1/"),
    browserUrl: z.literal("http://127.0.0.1:4013"),
    maxWorkers: z.number().int().min(1).max(4),
    maxRetries: z.number().int().min(0).max(2),
    browsers: z
      .array(z.enum(["chromium", "firefox", "webkit"]))
      .min(1)
      .max(3),
    allowVideo: z.boolean(),
    passwordRef: z
      .object({ id: z.uuid(), version: z.number().int().positive() })
      .strict()
      .optional(),
  })
  .strict();
export const defaultEnvironment = environmentSchema.parse({
  id: "local-lab",
  name: "Local Lab sandbox",
  enabled: true,
  apiUrl: "http://127.0.0.1:4010/lab/v1/",
  browserUrl: "http://127.0.0.1:4013",
  maxWorkers: 4,
  maxRetries: 2,
  browsers: ["chromium", "firefox", "webkit"],
  allowVideo: true,
});
export async function initializeEnvironments(db: SqlConnection) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS secret_versions (id uuid NOT NULL, version integer NOT NULL, organization_id uuid NOT NULL, project_id uuid NOT NULL, name text NOT NULL, ciphertext text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(id,version))",
  );
}
function key() {
  const value = process.env["SECRET_ENCRYPTION_KEY"];
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new Error("Secret encryption is not configured");
  return Buffer.from(value, "hex");
}
function aad(org: string, project: string, id: string, version: number) {
  return Buffer.from(`${org}:${project}:${id}:${version}`);
}
export async function resolveSecret(
  db: SqlConnection,
  org: string,
  project: string,
  reference: { id: string; version: number },
) {
  const row = (
    await db.query<{ ciphertext: string }>(
      "SELECT ciphertext FROM secret_versions WHERE id=$1 AND version=$2 AND organization_id=$3 AND project_id=$4",
      [reference.id, reference.version, org, project],
    )
  ).rows[0];
  if (!row) throw new Error("The referenced credential is unavailable");
  const bytes = Buffer.from(row.ciphertext, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    bytes.subarray(0, 12),
  );
  decipher.setAAD(aad(org, project, reference.id, reference.version));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
export async function listEnvironments(
  db: SqlConnection,
  org: string,
  project: string,
) {
  const rows = (
    await db.query<{ body: unknown; version: number }>(
      "SELECT body,version FROM platform_documents WHERE organization_id=$1 AND project_id=$2 AND kind='environment' ORDER BY id",
      [org, project],
    )
  ).rows;
  const items = rows.map((row) => ({
    ...environmentSchema.parse(row.body),
    version: row.version,
  }));
  if (!items.some((item) => item.id === "local-lab"))
    items.unshift({ ...defaultEnvironment, version: 0 });
  return items;
}
export function mountEnvironments(
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
          principal.machine ||
          principal.role !== "administrator" ||
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
            title: "Environment operation failed",
            correlationId: randomUUID(),
          });
      }
    };
  app.post(
    "/v1/projects/:project/environments",
    handle(async (req, res, principal, project) => {
      const input = environmentSchema.safeParse(req.body);
      if (!input.success) {
        res
          .status(422)
          .json({
            title:
              "Only the approved local sandbox destinations and worker limits are permitted",
          });
        return;
      }
      const version = /^"(\d+)"$/.exec(req.get("If-Match") ?? "");
      if (!version) {
        res.status(412).json({ title: "Reload environments before saving" });
        return;
      }
      const env = input.data;
      if (env.passwordRef) {
        const found = await platform.db.query(
          "SELECT id FROM secret_versions WHERE id=$1 AND version=$2 AND organization_id=$3 AND project_id=$4",
          [
            env.passwordRef.id,
            env.passwordRef.version,
            principal.organizationId,
            project,
          ],
        );
        if (!found.rows.length) {
          res
            .status(422)
            .json({
              title: "Credential reference is unavailable in this project",
            });
          return;
        }
      }
      const id = `${project}:environment:${env.id}`;
      const saved =
        Number(version[1]) === 0
          ? await platform.db.query<{ version: number }>(
              "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'environment',$4) ON CONFLICT DO NOTHING RETURNING version",
              [id, principal.organizationId, project, JSON.stringify(env)],
            )
          : await platform.db.query<{ version: number }>(
              "UPDATE platform_documents SET body=$4,version=version+1 WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND version=$5 RETURNING version",
              [
                id,
                principal.organizationId,
                project,
                JSON.stringify(env),
                Number(version[1]),
              ],
            );
      if (!saved.rows[0]) {
        res
          .status(412)
          .json({ title: "Environment changed; reload before saving" });
        return;
      }
      await platform.audit(principal, project, "environment.updated", env.id);
      res.json({ ...env, version: saved.rows[0].version });
    }),
  );
  app.get(
    "/v1/projects/:project/secrets",
    handle(async (_req, res, principal, project) => {
      const items = (
        await platform.db.query(
          "SELECT DISTINCT ON (id) id,name,version,created_at FROM secret_versions WHERE organization_id=$1 AND project_id=$2 ORDER BY id,version DESC",
          [principal.organizationId, project],
        )
      ).rows;
      res.json({ items });
    }),
  );
  app.post(
    "/v1/projects/:project/secrets",
    handle(async (req, res, principal, project) => {
      const input = z
        .object({
          id: z.uuid().optional(),
          name: z.string().trim().min(1).max(120),
          value: z.string().min(1).max(8192),
        })
        .strict()
        .safeParse(req.body);
      if (!input.success) {
        res
          .status(422)
          .json({ title: "A credential name and value are required" });
        return;
      }
      const encryptionKey = key();
      const id = input.data.id ?? randomUUID();
      const match = /^"(\d+)"$/.exec(req.get("If-Match") ?? "");
      const previous = (
        await platform.db.query<{ version: number }>(
          "SELECT version FROM secret_versions WHERE id=$1 AND organization_id=$2 AND project_id=$3 ORDER BY version DESC LIMIT 1",
          [id, principal.organizationId, project],
        )
      ).rows[0];
      if (
        input.data.id &&
        (!previous || !match || previous.version !== Number(match[1]))
      ) {
        res
          .status(412)
          .json({ title: "Credential changed; reload before rotating" });
        return;
      }
      const version = (previous?.version ?? 0) + 1;
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
      cipher.setAAD(aad(principal.organizationId, project, id, version));
      const encrypted = Buffer.concat([
        cipher.update(input.data.value, "utf8"),
        cipher.final(),
      ]);
      const ciphertext = Buffer.concat([
        nonce,
        cipher.getAuthTag(),
        encrypted,
      ]).toString("base64");
      const saved = await platform.db.query(
        "INSERT INTO secret_versions(id,version,organization_id,project_id,name,ciphertext) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",
        [
          id,
          version,
          principal.organizationId,
          project,
          input.data.name,
          ciphertext,
        ],
      );
      if (!saved.rows.length) {
        res
          .status(412)
          .json({ title: "Credential changed; reload before rotating" });
        return;
      }
      await platform.audit(principal, project, "secret.version_created", id);
      res.status(201).json({ id, version, name: input.data.name });
    }),
  );
}
