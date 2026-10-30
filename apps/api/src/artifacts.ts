import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Express } from 'express';
import { z } from 'zod';

import type { SqlConnection } from './database.ts';
import type { IdentityService } from './identity.ts';
import { objectReference, objectStore } from './object-store.ts';
import type { PlatformService } from './platform.ts';

const runs = fileURLToPath(new URL('../../../.local/runs/', import.meta.url));
export const attachmentSchema = z.object({
  name: z.string(),
  contentType: z.string(),
  path: z.string().optional(),
  body: z.string().optional(),
});
export const artifactSchema = z.object({
  id: z.uuid(),
  resultId: z.string(),
  attempt: z.number().int().positive(),
  name: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  redactionPolicy: z.string(),
  unavailableReason: z.string().optional(),
  object: objectReference.optional(),
  exchange: z
    .object({
      method: z.string(),
      path: z.string(),
      status: z.number().optional(),
      durationMs: z.number(),
    })
    .optional(),
});
export type Artifact = z.infer<typeof artifactSchema>;
const allowed = new Set([
  'image/png',
  'video/webm',
  'application/zip',
  'application/json',
  'text/plain',
]);
export async function captureAttachments(
  runId: string,
  resultId: string,
  attempt: number,
  attachments: z.infer<typeof attachmentSchema>[],
  redact: (text: string) => string,
): Promise<Artifact[]> {
  z.uuid().parse(runId);
  const directory = path.join(runs, runId);
  const root = await realpath(directory);
  await mkdir(path.join(directory, 'artifacts'), { recursive: true });
  const artifacts: Artifact[] = [];
  for (const attachment of attachments) {
    if (!allowed.has(attachment.contentType)) {
      continue;
    }
    const id = randomUUID();
    const now = new Date();
    const item: Artifact = {
      id,
      resultId,
      attempt,
      name: attachment.name.slice(0, 200),
      contentType: attachment.contentType,
      size: 0,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() +
          (attachment.contentType === 'application/zip' || attachment.contentType === 'video/webm'
            ? 14
            : 30) *
            86400000,
      ).toISOString(),
      redactionPolicy:
        attachment.contentType === 'application/json' || attachment.contentType === 'text/plain'
          ? 'Fixture secrets and JWTs removed'
          : 'Trusted browser sandbox only; API traces disabled',
    };
    try {
      let bytes: Buffer;
      if (attachment.path) {
        const source = await realpath(attachment.path);
        const relative = path.relative(root, source);
        if (
          relative.startsWith('..') ||
          path.isAbsolute(relative) ||
          (await stat(source)).size > 50_000_000
        ) {
          throw new Error('Attachment rejected by storage policy');
        }
        bytes = await readFile(source);
      } else {
        bytes = Buffer.from(attachment.body ?? '', 'base64');
      }
      if (bytes.length > 50_000_000) {
        throw new Error('Attachment exceeds size limit');
      }
      if (['application/json', 'text/plain'].includes(attachment.contentType)) {
        bytes = Buffer.from(redact(bytes.toString('utf8')));
      }
      if (attachment.name === 'api-exchange.json' || attachment.name === 'api-transport.json') {
        const exchange = z
          .object({
            request: z.object({ method: z.string(), path: z.string() }),
            response: z.object({ status: z.number() }).optional(),
            durationMs: z.number(),
          })
          .safeParse(JSON.parse(bytes.toString('utf8')));
        if (exchange.success) {
          item.exchange = {
            ...exchange.data.request,
            status: exchange.data.response?.status,
            durationMs: exchange.data.durationMs,
          };
        }
      }
      await writeFile(path.join(directory, 'artifacts', id), bytes, {
        flag: 'wx',
      });
      item.size = bytes.length;
      if (objectStore) {
        item.object = await objectStore.put(
          `runs/${runId}/artifacts/${id}`,
          bytes,
          item.contentType,
        );
        await unlink(path.join(directory, 'artifacts', id));
      }
    } catch {
      item.unavailableReason = 'Attachment missing or rejected by storage policy';
    }
    artifacts.push(item);
  }
  return artifacts;
}
export async function expireArtifacts(db: SqlConnection, now = new Date()): Promise<void> {
  const rows = (
    await db.query<{ id: string; artifacts: unknown }>(
      `SELECT id,body->'artifacts' AS artifacts FROM platform_documents WHERE kind='run' AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(body->'artifacts','[]'::jsonb)) a WHERE (a->>'expiresAt')::timestamptz<$1 AND NOT a ? 'unavailableReason') LIMIT 100`,
      [now.toISOString()],
    )
  ).rows;
  for (const row of rows) {
    if (!z.uuid().safeParse(row.id).success) {
      continue;
    }
    const artifacts = z.array(artifactSchema).parse(row.artifacts);
    for (const item of artifacts) {
      if (!item.unavailableReason && new Date(item.expiresAt) <= now) {
        if (item.object) {
          if (!objectStore) {
            throw new Error('Object store required to expire remote evidence');
          }
          await objectStore.deleteVersions(item.object.key, true);
        }
        try {
          await unlink(path.join(runs, row.id, 'artifacts', item.id));
        } catch (error) {
          if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
            throw error;
          }
        }
        item.unavailableReason = 'Expired under evidence retention policy';
      }
    }
    await db.query(
      "UPDATE platform_documents SET body=jsonb_set(body,'{artifacts}',$1::jsonb),version=version+1 WHERE id=$2",
      [JSON.stringify(artifacts), row.id],
    );
  }
}
export function mountArtifacts(
  app: Express,
  identity: IdentityService,
  platform: PlatformService,
): void {
  app.get('/v1/runs/:id/artifacts/:artifact', async (req, res) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    try {
      const principal = await identity.principal(req);
      if (!principal) {
        res.status(401).end();
        return;
      }
      const id = z.uuid().parse(req.params['id']);
      const run = await platform.get(principal, id, 'run');
      const artifact = z
        .array(artifactSchema)
        .parse(run['artifacts'] ?? [])
        .find((item) => item.id === req.params['artifact']);
      if (!artifact) {
        res.status(404).end();
        return;
      }
      if (artifact.unavailableReason || new Date(artifact.expiresAt) <= new Date()) {
        res.status(410).json({ title: artifact.unavailableReason ?? 'Evidence expired' });
        return;
      }
      const file = path.join(runs, id, 'artifacts', artifact.id);
      const remote = artifact.object ? await objectStore?.get(artifact.object) : undefined;
      if (artifact.object && !remote) {
        throw new Error('Object store unavailable');
      }
      if (!remote) {
        await stat(file);
      }
      await platform.audit(principal, String(run['projectId']), 'artifact.downloaded', artifact.id);
      if (remote) {
        res.attachment(artifact.name).type(artifact.contentType).send(remote);
        return;
      }
      res
        .attachment(artifact.name)
        .type(artifact.contentType)
        .sendFile(file, { dotfiles: 'allow' }, (error) => {
          if (error && !res.headersSent) {
            res.status(404).end();
          }
        });
    } catch {
      if (!res.headersSent) {
        res.status(404).end();
      }
    }
  });
}
