import { createHash, randomBytes } from 'node:crypto';

import type { Express, Request, Response } from 'express';
import * as oidc from 'openid-client';
import { z } from 'zod';

import type { SqlConnection } from './database.ts';
import { migrate } from './migrations.ts';
import { allowAuthAttempt, provisionPersonalWorkspace, safeReturnTo } from './registration.ts';

export const principalSchema = z.object({
  subject: z.string(),
  name: z.string(),
  organizationId: z.uuid(),
  role: z.enum(['viewer', 'operator', 'maintainer', 'administrator']),
  projectIds: z.array(z.uuid()),
  machine: z.boolean().optional(),
  personalWorkspace: z.boolean().optional(),
  onboardingComplete: z.boolean().optional(),
});
export type Principal = z.infer<typeof principalSchema>;
interface JsonRow extends Record<string, unknown> {
  body: unknown;
}
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const cookie = (req: Request, name: string): string | undefined =>
  req.headers.cookie
    ?.split(';')
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
  public constructor(
    private readonly db: SqlConnection,
    private readonly origin: string,
  ) {}
  public async initialize(): Promise<void> {
    await migrate(this.db, 'identity-baseline-v1', [
      'CREATE TABLE IF NOT EXISTS service_accounts (id uuid PRIMARY KEY, digest text UNIQUE NOT NULL, organization_id uuid NOT NULL, project_id uuid NOT NULL, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1)',
      'CREATE TABLE IF NOT EXISTS memberships (subject text PRIMARY KEY, body jsonb NOT NULL)',
      'ALTER TABLE memberships ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1',
      'CREATE TABLE IF NOT EXISTS sessions (digest text PRIMARY KEY, subject text NOT NULL REFERENCES memberships(subject), expires_at timestamptz NOT NULL)',
      'CREATE TABLE IF NOT EXISTS login_requests (digest text PRIMARY KEY, body jsonb NOT NULL, expires_at timestamptz NOT NULL)',
    ]);
    await migrate(this.db, 'registration-v1', [
      'CREATE TABLE auth_issuer_binding (id integer PRIMARY KEY CHECK(id=1), issuer text NOT NULL)',
      'CREATE TABLE auth_rate_limits (bucket text PRIMARY KEY, attempts integer NOT NULL, expires_at timestamptz NOT NULL)',
    ]);
  }
  public async provision(principal: Principal, replace = true): Promise<void> {
    await this.db.query(
      `INSERT INTO memberships(subject,body) VALUES($1,$2) ON CONFLICT(subject) ${replace ? 'DO UPDATE SET body=excluded.body' : 'DO NOTHING'}`,
      [principal.subject, JSON.stringify(principalSchema.parse(principal))],
    );
  }
  public async principal(req: Request): Promise<Principal | null> {
    const binding = this.credential(req);
    return binding ? this.resolveCredential(binding) : null;
  }
  public credential(req: Request): { kind: 'session' | 'service'; digest: string } | null {
    const authorization = req.get('Authorization');
    if (authorization) {
      if (!authorization.startsWith('Bearer ')) {
        return null;
      }
      return { kind: 'service', digest: hash(authorization.slice(7)) };
    }
    const token = cookie(req, 'assertide_session');
    return token ? { kind: 'session', digest: hash(token) } : null;
  }
  public async resolveCredential(binding: {
    kind: 'session' | 'service';
    digest: string;
  }): Promise<Principal | null> {
    if (binding.kind === 'service') {
      const account = (
        await this.db.query<{
          id: string;
          organization_id: string;
          project_id: string;
          name: string;
        }>(
          'SELECT id,organization_id,project_id,name FROM service_accounts WHERE digest=$1 AND NOT revoked AND expires_at>now()',
          [binding.digest],
        )
      ).rows[0];
      return account
        ? {
            subject: `service:${account.id}`,
            name: account.name,
            organizationId: account.organization_id,
            projectIds: [account.project_id],
            role: 'operator',
            machine: true,
          }
        : null;
    }
    const row = (
      await this.db.query<JsonRow>(
        'SELECT m.body FROM sessions s JOIN memberships m ON m.subject=s.subject WHERE s.digest=$1 AND s.expires_at>now()',
        [binding.digest],
      )
    ).rows[0];
    return row ? principalSchema.parse(row.body) : null;
  }
  public sameOrigin(req: Request): boolean {
    return (
      req.get('Authorization')?.startsWith('Bearer ') === true || req.get('Origin') === this.origin
    );
  }
  public async mount(
    app: Express,
    issuer: string,
    clientId: string,
    clientSecret: string,
  ): Promise<void> {
    const insecureLocal =
      process.env['NODE_ENV'] !== 'production' && new URL(issuer).hostname === '127.0.0.1';
    const config = await oidc.discovery(
      new URL(issuer),
      clientId,
      clientSecret,
      undefined,
      insecureLocal ? { execute: [oidc.allowInsecureRequests] } : undefined,
    );
    await this.db.query(
      'INSERT INTO auth_issuer_binding(id,issuer) VALUES(1,$1) ON CONFLICT(id) DO NOTHING',
      [issuer],
    );
    const binding = (
      await this.db.query<{ issuer: string }>('SELECT issuer FROM auth_issuer_binding WHERE id=1')
    ).rows[0];
    if (binding?.issuer !== issuer) {
      throw new Error('Issuer migration requires explicit identity mapping');
    }
    const registration = process.env['ACCOUNT_REGISTRATION'] === 'true';
    const endpoint = process.env['OIDC_REGISTRATION_ENDPOINT'];
    if (
      registration &&
      (!endpoint ||
        new URL(endpoint).origin !== new URL(issuer).origin ||
        (new URL(endpoint).protocol !== 'https:' && !insecureLocal) ||
        new URL(endpoint).search ||
        new URL(endpoint).hash ||
        new URL(endpoint).username ||
        new URL(endpoint).password)
    ) {
      throw new Error('A trusted provider registration endpoint is required');
    }
    const callback = `${this.origin}/auth/callback`;
    const cookieOptions = {
      httpOnly: true,
      secure: this.origin.startsWith('https:'),
      sameSite: 'lax' as const,
      path: '/',
    };
    const failure = (res: Response, status: number, title: string): void => {
      res.status(status).json({ status, title });
    };
    app.use('/auth', (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      res.set('Referrer-Policy', 'no-referrer');
      next();
    });
    app.get('/auth/options', (_req, res) => {
      res.json({ registration, verificationRequired: true });
    });
    app.get(['/auth/login', '/auth/register'], async (req, res) => {
      try {
        if (await this.principal(req)) {
          res.redirect('/');
          return;
        }
        if (req.path === '/auth/register' && !registration) {
          res.redirect('/access?reason=registration-unavailable');
          return;
        }
        if (
          !(await allowAuthAttempt(
            this.db,
            req.ip ?? 'unknown',
            insecureLocal && process.env['LOCAL_IDENTITY'] === 'true' ? 200 : 20,
          ))
        ) {
          res.set('Retry-After', '600');
          res.redirect('/access?reason=rate-limit');
          return;
        }
        const id = randomBytes(32).toString('hex');
        const verifier = oidc.randomPKCECodeVerifier();
        const state = oidc.randomState();
        const nonce = oidc.randomNonce();
        const requested = typeof req.query['returnTo'] === 'string' ? req.query['returnTo'] : '/';
        const returnTo = safeReturnTo(requested, this.origin);
        await this.db.query(
          "INSERT INTO login_requests(digest,body,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
          [hash(id), JSON.stringify({ verifier, state, nonce, returnTo })],
        );
        res.cookie('assertide_login', id, {
          ...cookieOptions,
          maxAge: 600_000,
        });
        const authorization = oidc.buildAuthorizationUrl(config, {
          redirect_uri: callback,
          scope: 'openid profile email',
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
          code_challenge_method: 'S256',
          state,
          nonce,
        });
        if (req.path === '/auth/register' && endpoint) {
          const hosted = new URL(endpoint);
          hosted.search = authorization.search;
          res.redirect(hosted.href);
        } else {
          res.redirect(authorization.href);
        }
      } catch {
        res.redirect('/access?reason=provider');
      }
    });
    app.get('/auth/callback', async (req, res) => {
      res.clearCookie('assertide_login', cookieOptions);
      try {
        const id = cookie(req, 'assertide_login');
        if (!id) {
          res.redirect('/access?reason=expired');
          return;
        }
        const row = (
          await this.db.query<JsonRow>(
            'DELETE FROM login_requests WHERE digest=$1 AND expires_at>now() RETURNING body',
            [hash(id)],
          )
        ).rows[0];
        if (!row) {
          res.redirect('/access?reason=expired');
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
        const claims = tokens.claims();
        const subject = claims?.sub;
        if (!subject) {
          res.redirect('/access?reason=login');
          return;
        }
        let member = (
          await this.db.query<JsonRow>('SELECT body FROM memberships WHERE subject=$1', [subject])
        ).rows[0];
        const profile =
          (!member && registration) ||
          (member && principalSchema.parse(member.body).personalWorkspace)
            ? await oidc.fetchUserInfo(config, tokens.access_token, subject)
            : claims;
        if (!member && registration) {
          if (profile?.email_verified !== true || typeof profile['email'] !== 'string') {
            res.redirect('/access?reason=verification');
            return;
          }
          try {
            const principal = await provisionPersonalWorkspace(
              this.db,
              subject,
              typeof profile['name'] === 'string' ? profile['name'] : 'Your account',
              true,
            );
            member = { body: principal };
          } catch {
            res.redirect('/access?reason=provisioning');
            return;
          }
        }
        if (!member) {
          res.redirect('/access?reason=membership');
          return;
        }
        const principal = principalSchema.parse(member.body);
        if (principal.personalWorkspace && profile?.email_verified !== true) {
          res.redirect('/access?reason=verification');
          return;
        }
        const session = randomBytes(32).toString('hex');
        await this.db.query(
          "INSERT INTO sessions(digest,subject,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [hash(session), subject],
        );
        const previous = cookie(req, 'assertide_session');
        if (previous) {
          await this.db.query('DELETE FROM sessions WHERE digest=$1', [hash(previous)]);
        }
        res.cookie('assertide_session', session, {
          ...cookieOptions,
          maxAge: 3_600_000,
        });
        let destination = safeReturnTo(pending.returnTo, this.origin);
        const runId = /^\/runs\/([^/?]+)/.exec(destination)?.[1];
        if (runId) {
          const run = (
            await this.db.query<{ project_id: string }>(
              "SELECT project_id FROM platform_documents WHERE id=$1 AND organization_id=$2 AND kind='run'",
              [runId, principal.organizationId],
            )
          ).rows[0];
          if (!run || !principal.projectIds.includes(run.project_id)) {
            destination = '/access?reason=destination';
          }
        }
        res.redirect(
          principal.personalWorkspace && !principal.onboardingComplete
            ? `/onboarding?returnTo=${encodeURIComponent(destination)}`
            : destination,
        );
      } catch {
        res.redirect('/access?reason=login');
      }
    });
    app.post('/auth/logout', async (req, res) => {
      if (!this.sameOrigin(req)) {
        failure(res, 403, 'Origin rejected');
        return;
      }
      const token = cookie(req, 'assertide_session');
      if (token) {
        await this.db.query('DELETE FROM sessions WHERE digest=$1', [hash(token)]);
      }
      res.clearCookie('assertide_session', cookieOptions).status(204).end();
    });
    app.post('/v1/onboarding', async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const principal = await this.principal(req);
      if (!principal) {
        failure(res, 401, 'Authentication required');
        return;
      }
      if (principal.machine || !principal.personalWorkspace || !this.sameOrigin(req)) {
        failure(res, 403, 'Access denied');
        return;
      }
      const input = z.object({ complete: z.boolean() }).strict().safeParse(req.body);
      if (!input.success) {
        failure(res, 422, 'Choose an onboarding status');
        return;
      }
      await this.db.query(
        "UPDATE memberships SET body=jsonb_set(body,'{onboardingComplete}',$2::jsonb),version=version+1 WHERE subject=$1",
        [principal.subject, JSON.stringify(input.data.complete)],
      );
      res.status(204).end();
    });
    app.get('/v1/me', async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const principal = await this.principal(req);
      if (!principal) {
        failure(res, 401, 'Authentication required');
        return;
      }
      const binding = this.credential(req);
      const session =
        binding?.kind === 'session'
          ? (
              await this.db.query<{ expires_at: Date | string }>(
                'SELECT expires_at FROM sessions WHERE digest=$1',
                [binding.digest],
              )
            ).rows[0]
          : undefined;
      res.json({
        ...principal,
        ...(session ? { sessionExpiresAt: new Date(session.expires_at).toISOString() } : {}),
      });
    });
  }
}
