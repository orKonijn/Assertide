import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import express from 'express';
import Provider from 'oidc-provider';
import { z } from 'zod';

import type { SqlConnection } from './database.ts';
import { migrate } from './migrations.ts';
import { allowAuthAttempt } from './registration.ts';

export async function startLocalIdentity(
  password: string,
  clientSecret: string,
  callback: string,
  db: SqlConnection,
): Promise<Server<typeof IncomingMessage, typeof ServerResponse>> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Local identity fixture is forbidden in production');
  }
  await initializeLocalRegistration(db);
  const pending = new Map<string, { subject: string; token: string; sentAt: number }>();
  const escape = (text: string): string =>
    text.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
  const frame = (title: string, body: string): string =>
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px system-ui;background:#f5f6fa;color:#182237;margin:0;padding:20px}main{max-width:480px;margin:5vh auto;background:white;padding:28px;border:1px solid #d8dfea;border-radius:16px}h1{font-size:28px}p{line-height:1.6}label{display:block;font-weight:600;margin:18px 0}input,select,button{font:inherit;box-sizing:border-box;min-height:44px;border:1px solid #58657b;border-radius:8px;padding:10px;width:100%;margin-top:8px}button{background:#5145cd;color:white;cursor:pointer}a{color:#5145cd}:focus-visible{outline:3px solid #5145cd;outline-offset:3px}@media(prefers-color-scheme:dark){body{background:#171c29;color:#ecedf7}main{background:#242d40}a{color:#c5bcff}}</style><main><h1>${title}</h1>${body}<p>Private development fixture. No real email is sent. Accounts use the generated local password; never enter a real password here.</p><a href="${new URL(callback).origin}">Back to Assertide</a></main></html>`;
  const validPassword = (value: unknown): boolean => {
    if (typeof value !== 'string') {
      return false;
    }
    const supplied = Buffer.from(value);
    const expected = Buffer.from(password);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
  const issuer = 'http://127.0.0.1:4011';
  const provider = new Provider(issuer, {
    extraParams: ['screen_hint'],
    claims: { email: ['email', 'email_verified'], profile: ['name'] },
    clients: [
      {
        client_id: 'assertide-local',
        client_secret: clientSecret,
        redirect_uris: [callback],
        response_types: ['code'],
        grant_types: ['authorization_code'],
      },
    ],
    cookies: { keys: [randomBytes(32).toString('hex')] },
    features: { devInteractions: { enabled: false } },
    interactions: {
      url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
    },
    findAccount: async (_ctx, id) => {
      const row = (
        await db.query<{ name: string; email: string; verified: boolean }>(
          'SELECT name,email,verified FROM local_fixture_accounts WHERE subject=$1',
          [id],
        )
      ).rows[0];
      return {
        accountId: id,
        claims: async () => ({
          sub: id,
          name: row?.name ?? id,
          ...(row ? { email: row.email, email_verified: row.verified } : {}),
        }),
      };
    },
  });
  const app = express();
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'strict-origin');
    res.set(
      'Content-Security-Policy',
      `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(callback).origin}; frame-ancestors 'none'`,
    );
    next();
  });
  app.get('/register', (req, res) => {
    const target = new URL('/auth', issuer);
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        target.searchParams.set(key, value);
      }
    }
    target.searchParams.set('screen_hint', 'signup');
    target.searchParams.set('prompt', 'login');
    res.redirect(target.href);
  });
  app.get('/interaction/:uid', async (req, res) => {
    try {
      const details = await provider.interactionDetails(req, res);
      if (details.uid !== String(req.params['uid'])) {
        res.status(403).end();
        return;
      }
      if (details.prompt.name === 'consent') {
        const grant = new provider.Grant({
          accountId: details.session?.accountId,
          clientId: 'assertide-local',
        });
        grant.addOIDCScope('openid profile email');
        await provider.interactionFinished(
          req,
          res,
          { consent: { grantId: await grant.save() } },
          { mergeWithLastSubmission: true },
        );
        return;
      }
      const uid = String(req.params['uid']);
      const waiting = pending.get(uid);
      if (waiting) {
        const account = (
          await db.query<{ verified: boolean }>(
            'SELECT verified FROM local_fixture_accounts WHERE subject=$1',
            [waiting.subject],
          )
        ).rows[0];
        if (account?.verified) {
          await provider.interactionFinished(
            req,
            res,
            { login: { accountId: waiting.subject } },
            { mergeWithLastSubmission: false },
          );
          pending.delete(uid);
          return;
        }
        res.send(
          frame(
            'Verify your email',
            `<p role="status">Verification pending. Open the controlled local mailbox below. Links expire after ten minutes and can be used once.</p><a href="/interaction/${encodeURIComponent(uid)}/mail">Open local test mailbox</a><form method="post"><input type="hidden" name="action" value="resend"><button>Resend verification email</button></form><p>Resend cooldown: 60 seconds.</p>`,
          ),
        );
        return;
      }
      if (details.params['screen_hint'] === 'signup') {
        res.send(
          frame(
            'Create account',
            '<p>Create a synthetic local identity and a persistent personal workspace.</p><form method="post"><input type="hidden" name="action" value="register"><label>Display name<input name="name" autocomplete="name" maxlength="120" required></label><label>Email address<input name="email" type="email" autocomplete="email" maxlength="240" required aria-describedby="email-help"></label><p id="email-help">Use a synthetic address ending in .test.</p><label>Local fixture password<input name="password" type="password" autocomplete="off" required></label><button>Create account</button></form>',
          ),
        );
        return;
      }
      const accounts = (
        await db.query<{ subject: string; email: string }>(
          'SELECT subject,email FROM local_fixture_accounts ORDER BY email LIMIT 200',
        )
      ).rows;
      res.send(
        frame(
          'Assertide local sign in',
          `<p>Choose an account for your local workspace.</p><form method="post"><label>Account <select name="account"><option>admin</option><option>operator</option><option>viewer</option>${accounts.map((a) => `<option value="${escape(a.subject)}">${escape(a.email)}</option>`).join('')}</select></label><label>Password <input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button></form>`,
        ),
      );
    } catch {
      res.status(400).send('Login session expired. Return to Assertide and try again.');
    }
  });
  app.post('/interaction/:uid', async (req, res) => {
    if (req.get('Origin') !== issuer) {
      res.status(403).end();
      return;
    }
    try {
      const interaction = await provider.interactionDetails(req, res);
      if (interaction.uid !== String(req.params['uid'])) {
        res.status(403).end();
        return;
      }
      const uid = String(req.params['uid']);
      const input = z
        .object({
          action: z.string().optional(),
          password: z.string().max(512).optional(),
          name: z.string().trim().max(120).optional(),
          email: z.string().trim().max(240).optional(),
          account: z.string().max(240).optional(),
        })
        .strict()
        .safeParse(req.body);
      if (!input.success) {
        res
          .status(422)
          .send(
            frame(
              'Check your details',
              '<p role="alert">Invalid input. Return to sign in and try again.</p>',
            ),
          );
        return;
      }
      if (!(await allowAuthAttempt(db, `fixture:${req.ip ?? 'unknown'}`, 200))) {
        res
          .status(429)
          .send(
            frame(
              'Please wait',
              '<p role="alert">Too many attempts. Try again in ten minutes.</p>',
            ),
          );
        return;
      }
      const data = input.data;
      let accountId = data.account;
      if (data.action === 'resend' && pending.has(uid)) {
        const old = pending.get(uid)!;
        if (Date.now() - old.sentAt < 60000) {
          res
            .status(429)
            .send(
              frame(
                'Please wait',
                `<p role="alert">Wait 60 seconds before requesting another email.</p><a href="/interaction/${encodeURIComponent(uid)}">Back to verification</a>`,
              ),
            );
          return;
        }
        accountId = old.subject;
      } else {
        if (!validPassword(data.password)) {
          res
            .status(401)
            .send(
              frame(
                'Unable to continue',
                '<p role="alert">Check your details or sign in to an existing account.</p>',
              ),
            );
          return;
        }
        if (data.action === 'register') {
          const email = z.email().safeParse(data.email?.toLowerCase());
          if (!email.success || !email.data.endsWith('.test') || !data.name) {
            res
              .status(422)
              .send(
                frame(
                  'Check your details',
                  '<p role="alert">Enter a display name and a synthetic .test email address. Return to Create account to retry.</p>',
                ),
              );
            return;
          }
          await db.query(
            'INSERT INTO local_fixture_accounts(subject,email,name) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING',
            [randomUUID(), email.data, data.name],
          );
          accountId = (
            await db.query<{ subject: string }>(
              'SELECT subject FROM local_fixture_accounts WHERE email=$1',
              [email.data],
            )
          ).rows[0]?.subject;
        }
      }
      if (!accountId) {
        res.status(401).end();
        return;
      }
      const account = (
        await db.query<{ verified: boolean }>(
          'SELECT verified FROM local_fixture_accounts WHERE subject=$1',
          [accountId],
        )
      ).rows[0];
      if (!account && !['admin', 'operator', 'viewer'].includes(accountId)) {
        res.status(401).end();
        return;
      }
      if (account && !account.verified) {
        const recent = (
          await db.query(
            "SELECT digest FROM local_fixture_mail WHERE subject=$1 AND sent_at>now()-interval '60 seconds'",
            [accountId],
          )
        ).rows.length;
        if (recent && !pending.has(uid)) {
          res
            .status(429)
            .send(
              frame(
                'Please wait',
                '<p role="alert">Wait 60 seconds before resuming verification.</p>',
              ),
            );
          return;
        }
        const token = randomBytes(32).toString('hex');
        await db.transaction(async (tx) => {
          await tx.query('DELETE FROM local_fixture_mail WHERE subject=$1 OR expires_at<now()', [
            accountId,
          ]);
          await tx.query(
            "INSERT INTO local_fixture_mail(digest,subject,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
            [createHash('sha256').update(token).digest('hex'), accountId],
          );
        });
        pending.set(uid, { subject: accountId, token, sentAt: Date.now() });
        for (const [key, value] of pending) {
          if (value.sentAt < Date.now() - 600000) {
            pending.delete(key);
          }
        }
        res.redirect(`/interaction/${encodeURIComponent(uid)}`);
        return;
      }
      await provider.interactionFinished(
        req,
        res,
        { login: { accountId } },
        { mergeWithLastSubmission: false },
      );
    } catch {
      res
        .status(400)
        .send(
          frame(
            'Sign-in expired',
            '<p role="alert">Return to Assertide and restart sign-in. Your account is retained.</p>',
          ),
        );
    }
  });
  app.get('/interaction/:uid/mail', async (req, res) => {
    try {
      const interaction = await provider.interactionDetails(req, res);
      if (interaction.uid !== String(req.params['uid'])) {
        res.status(403).end();
        return;
      }
    } catch {
      res.status(403).end();
      return;
    }
    const item = pending.get(String(req.params['uid']));
    if (!item) {
      res.status(404).end();
      return;
    }
    res.send(
      frame(
        'Local test mailbox',
        `<p>Synthetic verification message. This is not email delivery.</p><a href="/verify/${item.token}">Verify email address</a>`,
      ),
    );
  });
  app.get('/verify/:token', async (req, res) => {
    const token = String(req.params['token']);
    const verified = await consumeLocalVerification(db, token);
    if (!verified) {
      res
        .status(400)
        .send(
          frame(
            'Verification link expired',
            '<p role="alert">This link expired or was already used. Return to sign-in to request a fresh link.</p>',
          ),
        );
      return;
    }
    const entry = [...pending.entries()].find(([, item]) => item.token === token);
    res.send(
      frame(
        'Email verified',
        `<p role="status">Your synthetic email is verified.</p>${entry ? `<a href="/interaction/${encodeURIComponent(entry[0])}">Continue to your workspace</a>` : '<p>Sign in again to continue.</p>'}`,
      ),
    );
  });
  app.use(provider.callback());
  const server = app.listen(4011, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return server;
}

export async function initializeLocalRegistration(db: SqlConnection): Promise<void> {
  await migrate(db, 'local-registration-fixture-v1', [
    'CREATE TABLE local_fixture_accounts (subject text PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, verified boolean NOT NULL DEFAULT false)',
    'CREATE TABLE local_fixture_mail (digest text PRIMARY KEY, subject text NOT NULL REFERENCES local_fixture_accounts(subject), expires_at timestamptz NOT NULL, sent_at timestamptz NOT NULL DEFAULT now())',
  ]);
}

export async function consumeLocalVerification(db: SqlConnection, token: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const row = (
      await tx.query<{ subject: string }>(
        'DELETE FROM local_fixture_mail WHERE digest=$1 AND expires_at>now() RETURNING subject',
        [createHash('sha256').update(token).digest('hex')],
      )
    ).rows[0];
    if (!row) {
      return false;
    }
    await tx.query('UPDATE local_fixture_accounts SET verified=true WHERE subject=$1', [
      row.subject,
    ]);
    return true;
  });
}
