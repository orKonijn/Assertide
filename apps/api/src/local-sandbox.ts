import { access } from 'node:fs/promises';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

import express from 'express';
export async function startLocalSandbox(): Promise<
  Server<typeof IncomingMessage, typeof ServerResponse>
> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Local sandbox is not a production service');
  }
  const root = fileURLToPath(new URL('../../../.local/targets/swag-store/build/', import.meta.url));
  await access(root);
  const app = express();
  app.use((_req, res, next) => {
    res.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
    );
    next();
  });
  app.use(express.static(root));
  app.get(/.*/, (_req, res) => res.sendFile('index.html', { root, dotfiles: 'allow' }));
  const server = app.listen(4013, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return server;
}
