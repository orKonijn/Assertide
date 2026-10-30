import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { artifactSchema } from './artifacts.ts';
import { objectStore } from './object-store.ts';
const assets = fileURLToPath(
  new URL(
    '../../../packages/automation/node_modules/playwright-core/lib/vite/traceViewer/',
    import.meta.url,
  ),
);
const runs = fileURLToPath(new URL('../../../.local/runs/', import.meta.url));
export function traceArtifact(
  body: Record<string, unknown>,
  id: string,
): {
  id: string;
  resultId: string;
  attempt: number;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
  expiresAt: string;
  redactionPolicy: string;
  unavailableReason?: string | undefined;
  object?: { key: string; sha256: string; version?: string | undefined } | undefined;
  exchange?:
    { method: string; path: string; durationMs: number; status?: number | undefined } | undefined;
} {
  const artifact = z
    .array(artifactSchema)
    .parse(body['artifacts'] ?? [])
    .find(
      (item) => item.id === id && item.contentType === 'application/zip' && item.name === 'trace',
    );
  if (!artifact) {
    throw new Error('Trace unavailable');
  }
  return artifact;
}
export async function serveTraceResource(
  req: Request,
  res: Response,
  next: NextFunction,
  id: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  if (req.path === '/auth-status') {
    res.status(204).end();
    return true;
  }
  if (req.path.startsWith('/traces/')) {
    const match = /^\/traces\/([a-f0-9-]{36})\.zip$/.exec(req.path);
    if (!match) {
      res.status(404).end();
      return true;
    }
    const artifact = traceArtifact(body, z.uuid().parse(match[1]));
    if (artifact.unavailableReason || new Date(artifact.expiresAt) <= new Date()) {
      res.status(410).send('Trace expired');
      return true;
    }
    const bytes = artifact.object
      ? await objectStore?.get(artifact.object)
      : await readFile(path.join(runs, id, 'artifacts', artifact.id));
    if (!bytes) {
      throw new Error('Trace storage unavailable');
    }
    res.type('application/zip').send(bytes);
    return true;
  }
  if (!req.path.startsWith('/trace-viewer/')) {
    return false;
  }
  res.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' blob:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  );
  const name = req.path.slice('/trace-viewer/'.length);
  if (name === 'access-guard.js') {
    res
      .type('application/javascript')
      .send(
        `const check=async()=>{try{const response=await fetch('/reports/${id}/auth-status',{cache:'no-store'});if(response.status!==204){document.body.replaceChildren();for(const registration of await navigator.serviceWorker.getRegistrations())if(registration.scope.includes('/reports/${id}/'))await registration.unregister();location.replace('/reports/${id}/auth-status');}}catch{document.body.replaceChildren();location.replace('/reports/${id}/auth-status');}};setInterval(check,2000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});`,
      );
    return true;
  }
  if (name === '' || name === 'index.html') {
    const html = await readFile(path.join(assets, 'index.html'), 'utf8');
    res
      .type('html')
      .send(html.replace('</head>', '<script src="./access-guard.js" defer></script></head>'));
    return true;
  }
  const original = req.url;
  req.url = req.url.slice('/trace-viewer'.length);
  express.static(assets, { dotfiles: 'deny', fallthrough: false })(req, res, (error) => {
    req.url = original;
    next(error);
  });
  return true;
}
