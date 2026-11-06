import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { accessibilityCheckpoint, accessibilityCoverage } from '../src/accessibility.ts';
import { captureAttachments } from '../src/artifacts.ts';

const checkpoint = {
  version: 1,
  state: 'final',
  status: 'checked',
  engine: '4.14.0',
  viewport: { width: 1280, height: 720 },
  violations: [
    {
      id: 'label',
      impact: 'critical',
      description: 'Inputs need labels',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.14/label',
      nodes: 2,
    },
  ],
  incomplete: 1,
  truncated: false,
};

await test('accessibility coverage never substitutes an earlier attempt or API-only result', () => {
  const scan = accessibilityCheckpoint.parse(checkpoint);
  const results = [
    { id: 'UI-001:chromium', browser: 'chromium', attempts: [{}, {}] },
    { id: 'LAB-001', browser: null, attempts: [{}] },
  ];
  assert.deepEqual(
    accessibilityCoverage(results, [{ resultId: results[0]!.id, attempt: 1, accessibility: scan }]),
    [{ resultId: results[0]!.id, attempt: 2, checkpoint: null }],
  );
  const artifact = { resultId: results[0]!.id, attempt: 2, accessibility: scan };
  assert.equal(accessibilityCoverage(results, [artifact])[0]?.checkpoint?.violations[0]?.nodes, 2);
  assert.equal(
    accessibilityCoverage(results, [{ ...artifact, unavailableReason: 'rejected' }])[0]?.checkpoint,
    null,
  );
  assert.equal(accessibilityCoverage(results, [artifact, artifact])[0]?.checkpoint, null);
});

await test('import validates bounded accessibility evidence and rejects unsafe rule links', async () => {
  const id = randomUUID();
  await mkdir(fileURLToPath(new URL(`../../../.local/runs/${id}/`, import.meta.url)), {
    recursive: true,
  });
  const attachment = (data: unknown): { name: string; contentType: string; body: string } => ({
    name: 'accessibility-checkpoint.json',
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(data)).toString('base64'),
  });
  const [valid, invalid] = await captureAttachments(
    id,
    'UI-001:chromium',
    1,
    [
      attachment(checkpoint),
      attachment({
        ...checkpoint,
        violations: [{ ...checkpoint.violations[0], helpUrl: 'javascript:alert(1)' }],
      }),
    ],
    (value) => value,
  );
  assert.equal(valid?.accessibility?.status, 'checked');
  assert.ok(invalid?.unavailableReason);
  assert.equal(invalid?.accessibility, undefined);
  assert.equal(
    accessibilityCheckpoint.safeParse({
      ...checkpoint,
      violations: Array.from({ length: 101 }, () => checkpoint.violations[0]),
    }).success,
    false,
  );
});
