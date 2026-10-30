import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import path from 'node:path';

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import type { SqlConnection } from './database.ts';
import type { IdentityService } from './identity.ts';
import { runRoot } from './local-runner.ts';
import { migrate } from './migrations.ts';
import { objectStore } from './object-store.ts';
import type { PlatformService } from './platform.ts';
import { mediaBundleName, reportBundleName } from './report-bundle.ts';
import { reportManifest } from './report-storage.ts';
import { serveTraceResource, traceArtifact } from './trace-viewer.ts';

const digest = (token: string): string => createHash('sha256').update(token).digest('hex');
export async function mountReportViewer(
  app: Express,
  db: SqlConnection,
  identity: IdentityService,
  platform: PlatformService,
  options: { port?: number; origin?: string } = {},
): Promise<Server<typeof IncomingMessage, typeof ServerResponse>> {
  let viewerOrigin = options.origin ?? process.env['REPORT_ORIGIN'] ?? 'http://localhost:4012';
  const reportUrl = new URL(viewerOrigin);
  if (
    reportUrl.pathname !== '/' ||
    reportUrl.search ||
    reportUrl.hash ||
    !['http:', 'https:'].includes(reportUrl.protocol)
  ) {
    throw new Error('REPORT_ORIGIN must be an HTTP origin without a path');
  }
  if (
    process.env['NODE_ENV'] === 'production' &&
    (reportUrl.protocol !== 'https:' ||
      reportUrl.hostname === new URL(process.env['APP_ORIGIN'] ?? 'http://127.0.0.1:4200').hostname)
  ) {
    throw new Error('Production report origin requires HTTPS and a separate hostname');
  }
  await migrate(db, 'viewer-baseline-v1', [
    'CREATE TABLE IF NOT EXISTS report_tickets (digest text PRIMARY KEY, run_id text NOT NULL, subject text NOT NULL, expires_at timestamptz NOT NULL, redeemed boolean NOT NULL DEFAULT false)',
    'ALTER TABLE report_tickets ADD COLUMN IF NOT EXISTS auth_digest text, ADD COLUMN IF NOT EXISTS auth_kind text, ADD COLUMN IF NOT EXISTS report_directory text, ADD COLUMN IF NOT EXISTS view_path text',
  ]);
  app.get('/v1/runs/:id/traces/:artifact', async (req, res) => {
    try {
      const principal = await identity.principal(req);
      if (!principal) {
        res.status(401).end();
        return;
      }
      const id = z.uuid().parse(req.params['id']);
      const run = await platform.get(principal, id, 'run');
      const artifact = traceArtifact(run, z.uuid().parse(req.params['artifact']));
      if (artifact.unavailableReason || new Date(artifact.expiresAt) <= new Date()) {
        res.status(410).send('Trace expired');
        return;
      }
      const binding = identity.credential(req);
      if (!binding) {
        res.status(401).end();
        return;
      }
      const token = randomBytes(32).toString('hex');
      const viewPath = `trace-viewer/index.html?trace=${encodeURIComponent(`/reports/${id}/traces/${artifact.id}.zip`)}`;
      await db.query(
        "INSERT INTO report_tickets(digest,run_id,subject,expires_at,auth_digest,auth_kind,report_directory,view_path) VALUES($1,$2,$3,now()+interval '60 seconds',$4,$5,$6,$7)",
        [
          digest(token),
          id,
          principal.subject,
          binding.digest,
          binding.kind,
          run['reportDirectory'] ?? null,
          viewPath,
        ],
      );
      await platform.audit(principal, String(run['projectId']), 'trace.opened', artifact.id);
      res
        .set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
        .redirect(`${viewerOrigin}/open?ticket=${token}`);
    } catch {
      res.status(404).end();
    }
  });
  app.get('/v1/runs/:id/report-download', async (req, res) => {
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
      const directory = z
        .string()
        .regex(/^report-[a-f0-9-]{36}$/)
        .parse(run['reportDirectory']);
      const build = (
        await db.query<{ body: unknown; expired: boolean; expires_at: string }>(
          'SELECT body,expired,expires_at FROM report_builds WHERE run_id=$1 AND directory=$2',
          [id, directory],
        )
      ).rows[0];
      if (!build) {
        res.status(409).json({ title: 'Report download is not ready' });
        return;
      }
      if (build.expired || new Date(build.expires_at) <= new Date()) {
        res.status(410).json({ title: 'Report expired' });
        return;
      }
      const manifest = reportManifest.parse(build.body);
      const name =
        manifest.downloads?.[mediaBundleName] &&
        !manifest.shortExpired &&
        manifest.shortExpiresAt &&
        new Date(manifest.shortExpiresAt) > new Date()
          ? mediaBundleName
          : reportBundleName;
      const download = manifest.downloads?.[name];
      if (!download) {
        res.status(409).json({ title: 'Rebuild this older report to enable ZIP export' });
        return;
      }
      const reference = manifest.files?.[name];
      const bytes = reference
        ? await objectStore?.get(reference)
        : await readFile(path.join(runRoot, id, directory, name));
      if (!bytes || createHash('sha256').update(bytes).digest('hex') !== download.sha256) {
        throw new Error('Report export integrity mismatch');
      }
      await platform.audit(principal, String(run['projectId']), 'report.downloaded', id);
      res
        .set({
          'X-Checksum-SHA256': download.sha256,
          'X-Report-Generation': directory,
          'X-Includes-Trace-Video': String(name === mediaBundleName),
        })
        .attachment(`assertide-${id}-${directory}.zip`)
        .type('application/zip')
        .send(bytes);
    } catch {
      res.status(404).json({ title: 'Report download unavailable' });
    }
  });
  app.get(['/v1/runs/:id/report', '/v1/runs/:id/report/{*asset}'], async (req, res) => {
    try {
      const principal = await identity.principal(req);
      if (!principal) {
        res.status(401).end();
        return;
      }
      const id = String(req.params['id']);
      const run = await platform.get(principal, id, 'run');
      if (
        run['reportPhase'] === 'expired' ||
        (typeof run['reportExpiresAt'] === 'string' &&
          new Date(run['reportExpiresAt']) <= new Date())
      ) {
        res.status(410).json({ title: 'Report expired' });
        return;
      }
      if (run['reportPhase'] !== 'ready') {
        res.status(409).json({ title: 'Report not ready' });
        return;
      }
      const token = randomBytes(32).toString('hex');
      const binding = identity.credential(req);
      if (!binding) {
        res.status(401).end();
        return;
      }
      await db.query(
        "INSERT INTO report_tickets(digest,run_id,subject,expires_at,auth_digest,auth_kind,report_directory) VALUES($1,$2,$3,now()+interval '60 seconds',$4,$5,$6)",
        [
          digest(token),
          id,
          principal.subject,
          binding.digest,
          binding.kind,
          run['reportDirectory'],
        ],
      );
      res
        .set('Cache-Control', 'no-store')
        .set('Referrer-Policy', 'no-referrer')
        .redirect(`${viewerOrigin}/open?ticket=${token}`);
    } catch {
      res.status(404).end();
    }
  });
  const viewer = express();
  viewer.use((_req, res, next) => {
    res
      .set('Referrer-Policy', 'no-referrer')
      .set('Cache-Control', 'no-store')
      .set('X-Content-Type-Options', 'nosniff');
    next();
  });
  viewer.get('/open', async (req, res) => {
    const ticket = req.query['ticket'];
    if (typeof ticket !== 'string' || !/^[a-f0-9]{64}$/.test(ticket)) {
      res.status(403).end();
      return;
    }
    const row = (
      await db.query<{ run_id: string; view_path: string | null }>(
        "UPDATE report_tickets SET redeemed=true,expires_at=now()+interval '15 minutes' WHERE digest=$1 AND expires_at>now() AND NOT redeemed RETURNING run_id,view_path",
        [digest(ticket)],
      )
    ).rows[0];
    if (!row) {
      res.status(403).end();
      return;
    }
    res.cookie('assertide_report', ticket, {
      httpOnly: true,
      sameSite: 'lax',
      secure: viewerOrigin.startsWith('https:'),
      path: `/reports/${row.run_id}/`,
      maxAge: 900_000,
    });
    res.redirect(`/reports/${row.run_id}/${row.view_path ?? 'index.html'}`);
  });
  viewer.use('/reports/:id', async (req, res, next) => {
    const id = String(req.params['id']);
    const token = req.headers.cookie
      ?.split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('assertide_report='))
      ?.slice('assertide_report='.length);
    if (!token || !z.uuid().safeParse(id).success) {
      res.status(403).end();
      return;
    }
    const row = (
      await db.query<{
        auth_digest: string | null;
        auth_kind: string | null;
        report_directory: string | null;
      }>(
        `SELECT t.auth_digest,t.auth_kind,t.report_directory FROM report_tickets t
      WHERE t.digest=$1 AND t.run_id=$2 AND t.redeemed AND t.expires_at>now()`,
        [digest(token), id],
      )
    ).rows[0];
    if (!row?.auth_digest || !['session', 'service'].includes(row.auth_kind ?? '')) {
      res.status(403).end();
      return;
    }
    const membership = await identity.resolveCredential({
      digest: row.auth_digest,
      kind: row.auth_kind as 'session' | 'service',
    });
    if (!membership) {
      res.status(403).end();
      return;
    }
    const run = (
      await db.query<{
        project_id: string;
        organization_id: string;
        directory: string | null;
        body: Record<string, unknown>;
      }>(
        "SELECT project_id,organization_id,body,body->>'reportDirectory' AS directory FROM platform_documents WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (
      !run ||
      run.organization_id !== membership.organizationId ||
      !membership.projectIds.includes(run.project_id)
    ) {
      res.status(403).end();
      return;
    }
    if (await serveTraceResource(req, res, next, id, run.body)) {
      return;
    }
    const directory = row.report_directory ?? '';
    if (!/^report(?:-[a-f0-9-]{36})?$/.test(directory)) {
      res.status(404).end();
      return;
    }
    res.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    );
    const build = (
      await db.query<{ body: unknown; expired: boolean; expires_at: string }>(
        'SELECT body,expired,expires_at FROM report_builds WHERE run_id=$1 AND directory=$2',
        [id, directory],
      )
    ).rows[0];
    if (build) {
      if (build.expired || new Date(build.expires_at) <= new Date()) {
        res.status(410).send('Report expired');
        return;
      }
      const manifest = reportManifest.parse(build.body);
      const assetName = decodeURIComponent(req.path).replace(/^\//, '') || 'index.html';
      if (
        manifest.shortLived.includes(assetName) &&
        manifest.shortExpiresAt &&
        new Date(manifest.shortExpiresAt) <= new Date()
      ) {
        res.status(410).type('text/plain').send('Trace or video expired after 14 days');
        return;
      }
      if (manifest.files) {
        const name = decodeURIComponent(req.path).replace(/^\//, '') || 'index.html';
        const reference = manifest.files[name];
        if (!reference || !objectStore) {
          res.status(404).end();
          return;
        }
        const bytes = await objectStore.get(reference);
        res.type(path.extname(name)).send(bytes);
        return;
      }
    }
    express.static(path.join(runRoot, id, directory), {
      dotfiles: 'deny',
      index: 'index.html',
      fallthrough: false,
    })(req, res, next);
  });
  viewer.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const failure = z.object({ status: z.number() }).safeParse(error);
    res
      .status(failure.success && failure.data.status === 404 ? 404 : 500)
      .type('text/plain')
      .send('Report asset unavailable');
  });
  const server = viewer.listen(
    options.port ?? Number(process.env['REPORT_PORT'] ?? 4012),
    process.env['REPORT_HOST'] ?? '127.0.0.1',
  );
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  if (options.port === 0 && !options.origin) {
    const address = server.address();
    if (address && typeof address !== 'string') {
      viewerOrigin = `http://127.0.0.1:${address.port}`;
    }
  }
  return server;
}
