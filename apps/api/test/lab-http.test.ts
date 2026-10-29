import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { connectDatabase } from '../src/database.ts';
import { LabService, mountLab } from '../src/lab.ts';

test('HTTP contract: auth, CRUD, ETags, malformed payloads and media types', async () => {
  const db = await connectDatabase();
  const password = randomBytes(20).toString('hex');
  const lab = new LabService(db, password, randomBytes(32).toString('hex'));
  await lab.initialize();
  const app = express();
  app.use(express.json());
  mountLab(app, lab);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${origin}/lab/v1/orders`)).status, 401);
    const login = await fetch(`${origin}/lab/v1/auth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'operator-a', password }) });
    assert.equal(login.status, 200);
    const token = z.object({ access_token: z.string() }).parse(await login.json());
    const headers = { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() };
    const create = await fetch(`${origin}/lab/v1/orders`, { method: 'POST', headers, body: JSON.stringify({ sku: 'DEMO', quantity: 2, status: 'draft' }) });
    assert.equal(create.status, 201);
    assert.equal(create.headers.get('ETag'), '"1"');
    const location = create.headers.get('Location');
    assert.ok(location);
    const read = await fetch(origin + location, { headers });
    assert.equal(read.status, 200);
    const update = await fetch(origin + location, { method: 'PATCH', headers: { ...headers, 'If-Match': '"1"' }, body: JSON.stringify({ quantity: 4 }) });
    assert.equal(update.status, 200);
    assert.equal(update.headers.get('ETag'), '"2"');
    const malformed = await fetch(`${origin}/lab/v1/orders`, { method: 'POST', headers, body: '{' });
    assert.equal(malformed.status, 400);
    assert.match(malformed.headers.get('Content-Type') ?? '', /application\/problem\+json/);
    const wrongMedia = await fetch(`${origin}/lab/v1/orders`, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(wrongMedia.status, 415);
    const deletion = await fetch(origin + location, { method: 'DELETE', headers: { ...headers, 'If-Match': '"2"' } });
    assert.equal(deletion.status, 204);
    assert.equal((await fetch(origin + location, { headers })).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.close();
  }
});
