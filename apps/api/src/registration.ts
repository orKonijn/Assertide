import { createHash, randomUUID } from 'node:crypto';

import type { SqlConnection } from './database.ts';
import type { Principal } from './identity.ts';
import { principalSchema } from './identity.ts';

export function safeReturnTo(input: unknown, origin: string): string {
  if (typeof input !== 'string' || input.length > 2000) {
    return '/';
  }
  try {
    const url = new URL(input, origin);
    if (url.origin !== origin || url.username || url.password) {
      return '/';
    }
    if (
      !/^\/(?:projects|suites|explorer|runs(?:\/[a-zA-Z0-9-]+)?|reports|api|settings|about|onboarding)?$/.test(
        url.pathname,
      )
    ) {
      return '/';
    }
    return url.pathname + url.search;
  } catch {
    return '/';
  }
}

/** Atomic membership + initial project. No email/domain-based organization lookup. */
export async function provisionPersonalWorkspace(
  db: SqlConnection,
  subject: string,
  name: string,
  verified: boolean,
): Promise<Principal> {
  if (!verified) {
    throw new Error('Verified identity required');
  }
  return db.transaction(async (tx) => {
    const projectId = randomUUID();
    const principal: Principal = {
      subject,
      name: name.trim().slice(0, 120) || 'Your account',
      organizationId: randomUUID(),
      projectIds: [projectId],
      role: 'administrator',
      personalWorkspace: true,
      onboardingComplete: false,
    };
    const inserted = await tx.query(
      'INSERT INTO memberships(subject,body) VALUES($1,$2) ON CONFLICT(subject) DO NOTHING RETURNING subject',
      [subject, JSON.stringify(principal)],
    );
    if (inserted.rows.length) {
      await tx.query(
        "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1::text,$2,$1::uuid,'project',$3)",
        [
          projectId,
          principal.organizationId,
          JSON.stringify({
            id: projectId,
            name: 'Personal project',
            description:
              'Your empty personal project. Configure an approved source and environment before execution.',
            owner: subject,
            createdAt: new Date().toISOString(),
          }),
        ],
      );
      return principal;
    }
    const existing = (
      await tx.query<{ body: unknown }>('SELECT body FROM memberships WHERE subject=$1', [subject])
    ).rows[0];
    return principalSchema.parse(existing?.body);
  });
}

/** Shared database rate limit: bounded buckets; no IP address or tokens retained. */
export async function allowAuthAttempt(
  db: SqlConnection,
  address: string,
  limit = 20,
): Promise<boolean> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('Invalid authentication rate limit');
  }
  const bucket = createHash('sha256')
    .update(`${Math.floor(Date.now() / 600_000)}:${address}`)
    .digest('hex');
  await db.query('DELETE FROM auth_rate_limits WHERE expires_at<now()');
  const row = (
    await db.query<{ attempts: number }>(
      "INSERT INTO auth_rate_limits(bucket,attempts,expires_at) VALUES($1,1,now()+interval '10 minutes') ON CONFLICT(bucket) DO UPDATE SET attempts=LEAST(auth_rate_limits.attempts+1,$2) RETURNING attempts",
      [bucket, limit + 1],
    )
  ).rows[0];
  return !!row && row.attempts <= limit;
}
