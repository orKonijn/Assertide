import { randomUUID } from 'node:crypto';

import type { Express, Request, Response } from 'express';
import { z } from 'zod';

import { type IdentityService, type Principal, principalSchema } from './identity.ts';
import type { PlatformService } from './platform.ts';
import { failureResponse } from './request-context.ts';

const projectInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).default(''),
  })
  .strict();
const memberInput = principalSchema
  .pick({ subject: true, name: true, role: true, projectIds: true })
  .extend({
    subject: z.string().trim().min(1).max(240),
    name: z.string().trim().min(1).max(120),
    projectIds: z.array(z.uuid()).max(200),
  })
  .strict();
class Conflict extends Error {}

export function mountAdministration(
  app: Express,
  identity: IdentityService,
  platform: PlatformService,
): void {
  const handle =
    (work: (req: Request, res: Response, principal: Principal) => Promise<void>) =>
    async (req: Request, res: Response) => {
      res.set('Cache-Control', 'no-store');
      try {
        const principal = await identity.principal(req);
        if (!principal) {
          res.status(401).end();
          return;
        }
        if (
          principal.machine ||
          principal.role !== 'administrator' ||
          (req.method !== 'GET' && !identity.sameOrigin(req))
        ) {
          res.status(403).end();
          return;
        }
        await work(req, res, principal);
      } catch (error) {
        failureResponse(
          res,
          error,
          'administration',
          error instanceof Conflict ? error.message : 'Administration operation failed',
          error instanceof Conflict ? 412 : 500,
        );
      }
    };
  app.post(
    '/v1/projects',
    handle(async (req, res, principal) => {
      const input = projectInput.safeParse(req.body);
      if (!input.success) {
        res.status(422).json({ title: 'A project name is required' });
        return;
      }
      const id = randomUUID();
      const body = {
        id,
        ...input.data,
        owner: principal.subject,
        createdAt: new Date().toISOString(),
      };
      await platform.db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1::text,$2,$1::uuid,'project',$3)",
          [id, principal.organizationId, JSON.stringify(body)],
        );
        await tx.query(
          "UPDATE memberships SET body=jsonb_set(body,'{projectIds}',(body->'projectIds') || $2::jsonb),version=version+1 WHERE subject=$1",
          [principal.subject, JSON.stringify([id])],
        );
      });
      await platform.audit(principal, id, 'project.created', id);
      res.status(201).json({ ...body, version: 1 });
    }),
  );
  app.patch(
    '/v1/projects/:id',
    handle(async (req, res, principal) => {
      const id = String(req.params['id']);
      if (!principal.projectIds.includes(id)) {
        res.status(404).end();
        return;
      }
      const input = projectInput.safeParse(req.body);
      const match = /^"(\d+)"$/.exec(req.get('If-Match') ?? '');
      if (!input.success) {
        res.status(422).json({ title: 'A project name is required' });
        return;
      }
      if (!match) {
        throw new Conflict('Reload the project before saving');
      }
      const row = (
        await platform.db.query<{
          body: Record<string, unknown>;
          version: number;
        }>(
          "UPDATE platform_documents SET body=body || $4::jsonb,version=version+1 WHERE id=$1 AND organization_id=$2 AND kind='project' AND version=$3 RETURNING body,version",
          [id, principal.organizationId, Number(match[1]), JSON.stringify(input.data)],
        )
      ).rows[0];
      if (!row) {
        throw new Conflict('Project changed; reload before saving');
      }
      await platform.audit(principal, id, 'project.updated', id);
      res.json({ ...row.body, version: row.version });
    }),
  );
  app.get(
    '/v1/members',
    handle(async (_req, res, principal) => {
      const rows = (
        await platform.db.query<{ body: unknown; version: number }>(
          "SELECT body,version FROM memberships WHERE body->>'organizationId'=$1 ORDER BY subject",
          [principal.organizationId],
        )
      ).rows;
      res.json({
        items: rows.map((row) => ({
          ...principalSchema.parse(row.body),
          version: row.version,
        })),
      });
    }),
  );
  app.post(
    '/v1/members',
    handle(async (req, res, principal) => {
      const input = memberInput.safeParse(req.body);
      if (!input.success) {
        res.status(422).json({
          title: 'A subject, name, role and project list are required',
        });
        return;
      }
      if (input.data.subject === principal.subject) {
        res.status(403).json({ title: 'Another administrator must change your own access' });
        return;
      }
      if (input.data.projectIds.some((id) => !principal.projectIds.includes(id))) {
        res.status(403).json({ title: 'You can grant only projects you administer' });
        return;
      }
      const member = {
        ...input.data,
        projectIds: [...new Set(input.data.projectIds)],
        organizationId: principal.organizationId,
      };
      const match = /^"(\d+)"$/.exec(req.get('If-Match') ?? '');
      const version = await platform.db.transaction(async (tx) => {
        const administrators = await tx.query<{ subject: string }>(
          "SELECT subject FROM memberships WHERE body->>'organizationId'=$1 AND body->>'role'='administrator' ORDER BY subject FOR UPDATE",
          [principal.organizationId],
        );
        if (!administrators.rows.some((row) => row.subject === principal.subject)) {
          throw new Conflict('Your access changed; sign in again');
        }
        if (
          member.role !== 'administrator' &&
          administrators.rows.length === 1 &&
          administrators.rows[0]?.subject === member.subject
        ) {
          throw new Conflict('The organization must retain an administrator');
        }
        const existing = (
          await tx.query<{ body: unknown; version: number }>(
            'SELECT body,version FROM memberships WHERE subject=$1 FOR UPDATE',
            [member.subject],
          )
        ).rows[0];
        if (existing) {
          const previous = principalSchema.parse(existing.body);
          if (
            previous.organizationId !== principal.organizationId ||
            !match ||
            Number(match[1]) !== existing.version
          ) {
            throw new Conflict('Membership changed or unavailable; reload before saving');
          }
          await tx.query('UPDATE memberships SET body=$2,version=version+1 WHERE subject=$1', [
            member.subject,
            JSON.stringify(member),
          ]);
          return existing.version + 1;
        }
        if (match) {
          throw new Conflict('Membership no longer exists');
        }
        const inserted = await tx.query(
          'INSERT INTO memberships(subject,body) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING subject',
          [member.subject, JSON.stringify(member)],
        );
        if (!inserted.rows.length) {
          throw new Conflict('Membership changed; reload before saving');
        }
        return 1;
      });
      for (const project of principal.projectIds) {
        await platform.audit(principal, project, 'membership.updated', member.subject);
      }
      res.status(version === 1 ? 201 : 200).json({ ...member, version });
    }),
  );
}
