import { createHash, randomBytes } from "node:crypto";
import * as oidc from "openid-client";
import { z } from "zod";
import type { Express, Request, Response } from "express";
import type { SqlConnection } from "./database.ts";

export const principalSchema = z.object({
  subject: z.string(),
  name: z.string(),
  organizationId: z.uuid(),
  role: z.enum(["viewer", "operator", "maintainer", "administrator"]),
  projectIds: z.array(z.uuid()),
});
export type Principal = z.infer<typeof principalSchema>;
interface JsonRow extends Record<string, unknown> {
  body: unknown;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const cookie = (req: Request, name: string) =>
  req.headers.cookie
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
const loginSchema = z.object({
  verifier: z.string(),
  state: z.string(),
  nonce: z.string(),
  returnTo: z.string(),
});

export class IdentityService {
  constructor(
    private readonly db: SqlConnection,
    private readonly origin: string,
  ) {}
  async initialize() {
    await this.db.query(
      "CREATE TABLE IF NOT EXISTS memberships (subject text PRIMARY KEY, body jsonb NOT NULL)",
    );
    await this.db.query(
      "CREATE TABLE IF NOT EXISTS sessions (digest text PRIMARY KEY, subject text NOT NULL REFERENCES memberships(subject), expires_at timestamptz NOT NULL)",
    );
    await this.db.query(
      "CREATE TABLE IF NOT EXISTS login_requests (digest text PRIMARY KEY, body jsonb NOT NULL, expires_at timestamptz NOT NULL)",
    );
  }
  async provision(principal: Principal) {
    await this.db.query(
      "INSERT INTO memberships(subject,body) VALUES($1,$2) ON CONFLICT(subject) DO UPDATE SET body=excluded.body",
      [principal.subject, JSON.stringify(principalSchema.parse(principal))],
    );
  }
  async principal(req: Request): Promise<Principal | null> {
    const token = cookie(req, "assertide_session");
    if (!token) return null;
    const row = (
      await this.db.query<JsonRow>(
        "SELECT m.body FROM sessions s JOIN memberships m ON m.subject=s.subject WHERE s.digest=$1 AND s.expires_at>now()",
        [hash(token)],
      )
    ).rows[0];
    return row ? principalSchema.parse(row.body) : null;
  }
  sameOrigin(req: Request): boolean {
    return req.get("Origin") === this.origin;
  }
  async mount(
    app: Express,
    issuer: string,
    clientId: string,
    clientSecret: string,
  ) {
    const insecureLocal =
      process.env["NODE_ENV"] !== "production" &&
      new URL(issuer).hostname === "127.0.0.1";
    const config = await oidc.discovery(
      new URL(issuer),
      clientId,
      clientSecret,
      undefined,
      insecureLocal ? { execute: [oidc.allowInsecureRequests] } : undefined,
    );
    const callback = `${this.origin}/auth/callback`;
    const cookieOptions = {
      httpOnly: true,
      secure: this.origin.startsWith("https:"),
      sameSite: "lax" as const,
      path: "/",
    };
    const failure = (res: Response, status: number, title: string) => {
      res.status(status).json({ status, title });
    };
    app.get("/auth/login", async (req, res) => {
      try {
        const id = randomBytes(32).toString("hex");
        const verifier = oidc.randomPKCECodeVerifier();
        const state = oidc.randomState();
        const nonce = oidc.randomNonce();
        const requested =
          typeof req.query["returnTo"] === "string"
            ? req.query["returnTo"]
            : "/";
        const target = new URL(requested, this.origin);
        const returnTo =
          target.origin === this.origin ? target.pathname + target.search : "/";
        await this.db.query(
          "INSERT INTO login_requests(digest,body,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
          [hash(id), JSON.stringify({ verifier, state, nonce, returnTo })],
        );
        res.cookie("assertide_login", id, {
          ...cookieOptions,
          maxAge: 600_000,
        });
        res.redirect(
          oidc.buildAuthorizationUrl(config, {
            redirect_uri: callback,
            scope: "openid profile",
            code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
            code_challenge_method: "S256",
            state,
            nonce,
          }).href,
        );
      } catch {
        failure(res, 503, "Identity provider unavailable");
      }
    });
    app.get("/auth/callback", async (req, res) => {
      res.clearCookie("assertide_login", cookieOptions);
      try {
        const id = cookie(req, "assertide_login");
        if (!id) {
          failure(res, 401, "Login session expired");
          return;
        }
        const row = (
          await this.db.query<JsonRow>(
            "DELETE FROM login_requests WHERE digest=$1 AND expires_at>now() RETURNING body",
            [hash(id)],
          )
        ).rows[0];
        if (!row) {
          failure(res, 401, "Login session expired");
          return;
        }
        const pending = loginSchema.parse(row.body);
        const tokens = await oidc.authorizationCodeGrant(
          config,
          new URL(req.originalUrl, this.origin),
          {
            pkceCodeVerifier: pending.verifier,
            expectedState: pending.state,
            expectedNonce: pending.nonce,
            idTokenExpected: true,
          },
        );
        const subject = tokens.claims()?.sub;
        if (
          !subject ||
          !(
            await this.db.query(
              "SELECT subject FROM memberships WHERE subject=$1",
              [subject],
            )
          ).rows.length
        ) {
          failure(res, 403, "No organization membership");
          return;
        }
        const session = randomBytes(32).toString("hex");
        await this.db.query(
          "INSERT INTO sessions(digest,subject,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [hash(session), subject],
        );
        res.cookie("assertide_session", session, {
          ...cookieOptions,
          maxAge: 3_600_000,
        });
        res.redirect(pending.returnTo);
      } catch {
        failure(res, 401, "Unable to complete login");
      }
    });
    app.post("/auth/logout", async (req, res) => {
      if (!this.sameOrigin(req)) {
        failure(res, 403, "Origin rejected");
        return;
      }
      const token = cookie(req, "assertide_session");
      if (token)
        await this.db.query("DELETE FROM sessions WHERE digest=$1", [
          hash(token),
        ]);
      res.clearCookie("assertide_session", cookieOptions).status(204).end();
    });
    app.get("/v1/me", async (req, res) => {
      res.set("Cache-Control", "no-store");
      const principal = await this.principal(req);
      if (!principal) {
        failure(res, 401, "Authentication required");
        return;
      }
      res.json(principal);
    });
  }
}
