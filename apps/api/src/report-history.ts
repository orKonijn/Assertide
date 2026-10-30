import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { SqlConnection, SqlExecutor } from './database.ts';
import { migrate } from './migrations.ts';
export const historyPoint = z
  .object({
    uuid: z.string(),
    timestamp: z.number(),
    testResults: z.record(z.string(), z.unknown()),
  })
  .passthrough();
const entrySchema = z.object({
  runId: z.uuid(),
  endedAt: z.iso.datetime(),
  reportExpiresAt: z.iso.datetime(),
  point: historyPoint,
});
export type HistoryEntry = z.infer<typeof entrySchema>;
export async function readHistory(
  db: SqlConnection,
  stream: string,
): Promise<
  {
    runId: string;
    endedAt: string;
    reportExpiresAt: string;
    point: {
      [x: string]: unknown;
      uuid: string;
      timestamp: number;
      testResults: Record<string, unknown>;
    };
  }[]
> {
  const row = (
    await db.query<{ body: unknown }>('SELECT body FROM report_history WHERE stream=$1', [stream])
  ).rows[0];
  return row ? z.array(entrySchema).parse(row.body) : [];
}
export async function initializeHistory(db: SqlConnection): Promise<void> {
  await migrate(db, 'history-baseline-v1', [
    "CREATE TABLE IF NOT EXISTS report_history (stream text PRIMARY KEY,version integer NOT NULL DEFAULT 0,body jsonb NOT NULL DEFAULT '[]'::jsonb,owner uuid,lease_expires timestamptz)",
  ]);
}
export function historyStream(run: {
  organizationId: string;
  projectId: string;
  config: { environmentId: string; browserProjects: string[] };
  selection: { testIds: string[] };
  historyFamily?: string[] | undefined;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        organization: run.organizationId,
        project: run.projectId,
        lineage: 'approved-local-source',
        environment: run.config.environmentId,
        selection: [...(run.historyFamily ?? run.selection.testIds)].sort(),
        browsers: [...run.config.browserProjects].sort(),
        contract: 1,
      }),
    )
    .digest('hex');
}
export async function claimHistory(
  db: SqlConnection,
  stream: string,
  owner: string,
): Promise<
  | {
      version: number;
      entries: {
        runId: string;
        endedAt: string;
        reportExpiresAt: string;
        point: {
          [x: string]: unknown;
          uuid: string;
          timestamp: number;
          testResults: Record<string, unknown>;
        };
      }[];
    }
  | undefined
> {
  const row = (
    await db.query<{ version: number; body: unknown }>(
      "INSERT INTO report_history(stream,owner,lease_expires) VALUES($1,$2,now()+interval '60 seconds') ON CONFLICT(stream) DO UPDATE SET owner=$2,lease_expires=now()+interval '60 seconds' WHERE report_history.lease_expires IS NULL OR report_history.lease_expires<now() RETURNING version,body",
      [stream, owner],
    )
  ).rows[0];
  return row ? { version: row.version, entries: z.array(entrySchema).parse(row.body) } : undefined;
}
export async function renewHistory(
  db: SqlConnection,
  stream: string,
  owner: string,
): Promise<void> {
  const result = await db.query(
    "UPDATE report_history SET lease_expires=now()+interval '60 seconds' WHERE stream=$1 AND owner=$2 AND lease_expires>now() RETURNING stream",
    [stream, owner],
  );
  if (!result.rows.length) {
    throw new Error('Report history lease lost');
  }
}
export async function releaseHistory(
  db: SqlConnection,
  stream: string,
  owner: string,
): Promise<void> {
  await db.query(
    'UPDATE report_history SET owner=NULL,lease_expires=NULL WHERE stream=$1 AND owner=$2',
    [stream, owner],
  );
}
export async function commitHistory(
  db: SqlExecutor,
  stream: string,
  owner: string,
  version: number,
  entries: HistoryEntry[],
): Promise<void> {
  const result = await db.query(
    'UPDATE report_history SET body=$4,version=version+1,owner=NULL,lease_expires=NULL WHERE stream=$1 AND owner=$2 AND version=$3 AND lease_expires>now() RETURNING version',
    [stream, owner, version, JSON.stringify(entries.slice(-200))],
  );
  if (!result.rows.length) {
    throw new Error('Stale report history update rejected');
  }
}
export function visibleHistory(
  entries: HistoryEntry[],
  runId: string,
  now = new Date(),
): {
  [x: string]: unknown;
  uuid: string;
  timestamp: number;
  testResults: Record<string, unknown>;
}[] {
  return entries
    .filter(
      (entry) =>
        entry.runId !== runId && new Date(entry.endedAt).getTime() + 365 * 86400000 > now.getTime(),
    )
    .map((entry) => {
      if (new Date(entry.reportExpiresAt) > now) {
        return entry.point;
      }
      const clearLinks = (value: unknown): unknown => {
        if (Array.isArray(value)) {
          return value.map(clearLinks);
        }
        if (!value || typeof value !== 'object') {
          return value;
        }
        return Object.fromEntries(
          Object.entries(value).map(([key, child]) => {
            if (key === 'url') {
              return [key, ''];
            }
            if (key === 'reportLinks') {
              return [key, []];
            }
            return [key, clearLinks(child)];
          }),
        );
      };
      return historyPoint.parse(clearLinks(entry.point));
    });
}
