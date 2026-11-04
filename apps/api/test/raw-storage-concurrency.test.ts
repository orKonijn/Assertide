import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

await test(
  'raw archive and restore transfer eight files concurrently and retain integrity',
  { timeout: 15000 },
  async () => {
    const objects = new Map<string, Buffer>();
    let waiting: (() => void)[] = [];
    let active = 0;
    let maximum = 0;
    async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const key = new URL(request.url!, 'http://localhost').pathname;
      if (request.method === 'PUT') {
        objects.set(key, Buffer.concat(chunks));
      }
      active++;
      maximum = Math.max(maximum, active);
      waiting.push(() => {
        active--;
        response.writeHead(200, { 'x-amz-version-id': 'fixture-version' });
        response.end(request.method === 'GET' ? objects.get(key) : '');
      });
      // A serialized implementation cannot release this barrier.
      if (waiting.length === 8) {
        const batch = waiting;
        waiting = [];
        for (const finish of batch) {
          finish();
        }
      }
    }
    const server = createServer((request, response) => {
      void handle(request, response).catch(() => response.writeHead(500).end());
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    process.env['S3_ENDPOINT'] = `http://127.0.0.1:${address.port}`;
    process.env['S3_BUCKET'] = 'controlled-fixture';
    process.env['AWS_REGION'] = 'us-east-1';
    process.env['AWS_ACCESS_KEY_ID'] = 'fixture';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'fixture';
    const { archiveRaw, restoreRaw } = await import('../src/raw-storage.ts');
    const { objectStore } = await import('../src/object-store.ts');
    const root = await mkdtemp(path.join(tmpdir(), 'assertide-batched-raw-'));
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('assertide-batched-raw-'));
    try {
      const source = path.join(root, 'source');
      await mkdir(source);
      for (let index = 0; index < 16; index++) {
        await writeFile(path.join(source, `${index}.json`), JSON.stringify({ index }));
      }
      const id = randomUUID();
      const manifest = await archiveRaw(id, source);
      assert.equal(manifest?.files.length, 16);
      await restoreRaw(id, path.join(root, 'restored'), manifest, new Date().toISOString());
      for (let index = 0; index < 16; index++) {
        assert.equal(
          await readFile(path.join(root, 'restored', `${index}.json`), 'utf8'),
          JSON.stringify({ index }),
        );
      }
      assert.equal(maximum, 8);
    } finally {
      objectStore?.client.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  },
);
