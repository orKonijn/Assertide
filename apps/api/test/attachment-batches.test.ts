import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PutObjectCommand } from '@aws-sdk/client-s3';

// No real provider requests: the SDK boundary is held below to observe backpressure.
process.env['S3_BUCKET'] = 'controlled-attachment-test';
const { captureRunAttachments } = await import('../src/artifacts.ts');
const { objectStore } = await import('../src/object-store.ts');

await test(
  'run attachments upload in bounded batches across cases, retaining ownership and redaction after a failed upload',
  { timeout: 10000 },
  async (t) => {
    assert.ok(objectStore);
    const id = randomUUID();
    const directory = fileURLToPath(new URL(`../../../.local/runs/${id}/`, import.meta.url));
    await mkdir(directory, { recursive: true });
    let active = 0;
    let peak = 0;
    let started = 0;
    let release: () => void = () => {};
    let filled: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstBatch = new Promise<void>((resolve) => {
      filled = resolve;
    });
    const uploaded: string[] = [];
    t.mock.method(objectStore.client, 'send', async (command: PutObjectCommand) => {
      assert.ok(command instanceof PutObjectCommand);
      assert.ok(Buffer.isBuffer(command.input.Body));
      const body = command.input.Body.toString();
      assert.ok(!body.includes('fixture-secret'));
      uploaded.push(body);
      active++;
      peak = Math.max(peak, active);
      started++;
      if (started === 8) {
        filled();
      }
      try {
        await gate;
        if (body.includes('case-4')) {
          throw new Error('Controlled storage failure');
        }
        return { VersionId: 'fixture-version' };
      } finally {
        active--;
      }
    });
    const batches = Array.from({ length: 19 }, (_, index) => ({
      resultId: `LAB-${index}`,
      attempt: (index % 2) + 1,
      attachments: [
        {
          name: `case-${index}.json`,
          contentType: 'application/json',
          body: Buffer.from(
            JSON.stringify({ marker: `case-${index}`, token: 'fixture-secret' }),
          ).toString('base64'),
        },
      ],
    }));
    const capturing = captureRunAttachments(id, batches, (value) =>
      value.replaceAll('fixture-secret', '[REDACTED]'),
    );
    try {
      await firstBatch;
      assert.equal(active, 8);
      assert.equal(started, 8, 'later batches must wait for the current uploads');
    } finally {
      release();
    }
    const artifacts = await capturing;
    assert.equal(peak, 8);
    assert.equal(active, 0);
    assert.equal(uploaded.length, 19);
    assert.equal(artifacts.length, 19);
    for (const [index, artifact] of artifacts.entries()) {
      assert.equal(artifact.resultId, batches[index]!.resultId);
      assert.equal(artifact.attempt, batches[index]!.attempt);
      assert.equal(artifact.name, `case-${index}.json`);
      if (index === 4) {
        assert.ok(artifact.unavailableReason);
        assert.equal(artifact.object, undefined);
        assert.ok(
          !(await readFile(path.join(directory, 'artifacts', artifact.id), 'utf8')).includes(
            'fixture-secret',
          ),
        );
      } else {
        assert.equal(artifact.unavailableReason, undefined);
        assert.equal(artifact.object?.version, 'fixture-version');
        assert.equal(artifact.object?.key, `runs/${id}/artifacts/${artifact.id}`);
      }
    }
  },
);
