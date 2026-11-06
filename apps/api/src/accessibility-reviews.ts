import { createHash, randomUUID } from 'node:crypto';

import { z } from 'zod';

import { accessibilityCheckpoint } from './accessibility.ts';
import type { Principal } from './identity.ts';
import type { PlatformService } from './platform.ts';

export class AccessibilityReviewError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const exceptionInput = z
  .object({ reason: z.string().trim().min(10).max(2000), expiresAt: z.iso.datetime() })
  .strict();
const reviewInput = z
  .object({
    owner: z.string().trim().max(120),
    status: z.enum(['open', 'investigating']),
    note: z.string().trim().max(2000),
    exception: exceptionInput.nullable().optional(),
  })
  .strict();
const reviewSchema = reviewInput.omit({ exception: true }).extend({
  exception: exceptionInput
    .extend({ approvedBy: z.string(), approvedAt: z.iso.datetime() })
    .nullable(),
  projectId: z.uuid(),
  lastReviewedRun: z.string(),
  findingId: z.string(),
  updatedBy: z.string(),
  updatedAt: z.iso.datetime(),
});
const coverageSchema = z.array(
  z.object({ resultId: z.string(), checkpoint: accessibilityCheckpoint.nullable() }),
);
export function accessibilityFindings(
  run: Record<string, unknown>,
  resultId: string,
): {
  id: string;
  ruleId: string;
  kind: 'violation' | 'manual';
  description: string;
}[] {
  const row = coverageSchema
    .parse(run['accessibility'] ?? [])
    .find((item) => item.resultId === resultId);
  if (row?.checkpoint?.status !== 'checked') {
    return [];
  }
  const checkpoint = row.checkpoint;
  const environment = z.object({ environmentId: z.string() }).parse(run['config']).environmentId;
  return (['violation', 'manual'] as const).flatMap((kind) =>
    (kind === 'violation' ? checkpoint.violations : checkpoint.reviewRules).map((rule) => ({
      id: createHash('sha256')
        .update(
          JSON.stringify([
            1,
            environment,
            resultId,
            checkpoint.engine,
            checkpoint.state,
            kind,
            rule.id,
          ]),
        )
        .digest('hex'),
      ruleId: rule.id,
      kind,
      description: rule.description,
    })),
  );
}
function recordId(principal: Principal, project: string, finding: string): string {
  return `accessibility-review:${principal.organizationId}:${project}:${finding}`;
}
export async function readAccessibilityReviews(
  platform: PlatformService,
  principal: Principal,
  run: Record<string, unknown>,
  resultId: string,
): Promise<unknown[]> {
  const project = String(run['projectId']);
  const findings = accessibilityFindings(run, resultId);
  if (!findings.length) {
    return [];
  }
  const rows = await platform.db.query<{ id: string; body: unknown; version: number }>(
    "SELECT id,body,version FROM platform_documents WHERE organization_id=$1 AND project_id=$2 AND kind='accessibility-review' AND id=ANY($3::text[])",
    [
      principal.organizationId,
      project,
      findings.map((finding) => recordId(principal, project, finding.id)),
    ],
  );
  return findings.map((finding) => {
    const row = rows.rows.find((value) => value.id === recordId(principal, project, finding.id));
    const review = row
      ? reviewSchema.parse(row.body)
      : { owner: '', status: 'open', note: '', exception: null, updatedBy: '', updatedAt: null };
    let exceptionState = 'none';
    if (review.exception) {
      exceptionState =
        new Date(review.exception.expiresAt).getTime() > Date.now() ? 'active' : 'expired';
    }
    return { ...finding, ...review, version: row?.version ?? 0, exceptionState };
  });
}
export async function saveAccessibilityReview(
  platform: PlatformService,
  principal: Principal,
  run: Record<string, unknown>,
  resultId: string,
  finding: string,
  input: unknown,
  match: string | undefined,
): Promise<void> {
  const project = String(run['projectId']);
  platform.authorize(principal, project, 'operator');
  if (principal.machine) {
    throw new AccessibilityReviewError(403, 'Human review is required');
  }
  const parsed = reviewInput.safeParse(input);
  if (!parsed.success || !match || !/^"\d+"$/.test(match)) {
    throw new AccessibilityReviewError(
      422,
      'Owner, review status and current version are required',
    );
  }
  if (!accessibilityFindings(run, resultId).some((item) => item.id === finding)) {
    throw new AccessibilityReviewError(404, 'Recorded accessibility finding not found');
  }
  const version = Number(match.slice(1, -1));
  const value = parsed.data;
  if (value.exception !== undefined && principal.role !== 'administrator') {
    throw new AccessibilityReviewError(403, 'Administrator approval is required for exceptions');
  }
  const id = recordId(principal, project, finding);
  await platform.db.transaction(async (tx) => {
    const current = (
      await tx.query<{ body: unknown; version: number }>(
        "SELECT body,version FROM platform_documents WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND kind='accessibility-review' FOR UPDATE",
        [id, principal.organizationId, project],
      )
    ).rows[0];
    if ((current?.version ?? 0) !== version) {
      throw new AccessibilityReviewError(412, 'Review changed; reload before saving');
    }
    const previous = current ? reviewSchema.parse(current.body).exception : null;
    let exception = previous;
    const sameException =
      value.exception !== undefined &&
      JSON.stringify(value.exception) ===
        JSON.stringify(
          previous ? { reason: previous.reason, expiresAt: previous.expiresAt } : null,
        );
    if (value.exception !== undefined && !sameException) {
      if (value.exception) {
        const remaining = new Date(value.exception.expiresAt).getTime() - Date.now();
        if (remaining <= 0 || remaining > 30 * 86400000) {
          throw new AccessibilityReviewError(422, 'Exceptions must expire within the next 30 days');
        }
        exception = {
          ...value.exception,
          approvedBy: principal.subject,
          approvedAt: new Date().toISOString(),
        };
      } else {
        exception = null;
      }
    }
    const now = new Date().toISOString();
    const body = {
      owner: value.owner,
      status: value.status,
      note: value.note,
      exception,
      updatedBy: principal.subject,
      updatedAt: now,
      projectId: project,
      lastReviewedRun: String(run['id']),
      findingId: finding,
    };
    const saved = current
      ? await tx.query(
          'UPDATE platform_documents SET body=$2,version=version+1 WHERE id=$1 AND version=$3 RETURNING id',
          [id, JSON.stringify(body), version],
        )
      : await tx.query(
          "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'accessibility-review',$4) ON CONFLICT DO NOTHING RETURNING id",
          [id, principal.organizationId, project, JSON.stringify(body)],
        );
    if (!saved.rows.length) {
      throw new AccessibilityReviewError(412, 'Review changed; reload before saving');
    }
    const auditId = randomUUID();
    await tx.query(
      "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'audit',$4)",
      [
        auditId,
        principal.organizationId,
        project,
        JSON.stringify({
          id: auditId,
          projectId: project,
          actor: principal.subject,
          action: 'accessibility.reviewed',
          resourceId: finding,
          occurredAt: now,
        }),
      ],
    );
  });
}
