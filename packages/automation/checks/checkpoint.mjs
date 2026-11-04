import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(path.join(tmpdir(), 'assertide-checkpoint-'));
const run = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', '--config', 'checks/checkpoint.config.ts'],
  {
    cwd,
    env: { ...process.env, RUN_OUTPUT: output },
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: true,
  },
);
assert.equal(run.status, 0, run.stdout + run.stderr);
const checkpoint = JSON.parse(
  (await readFile(path.join(output, 'attempts.ndjson'), 'utf8')).trim(),
);
const report = JSON.parse(await readFile(path.join(output, 'results.json'), 'utf8'));
const result = report.suites[0].specs[0].tests[0].results[0];
for (const filename of ['attempts.ndjson', 'results.json'])
  assert.ok((await stat(path.join(output, filename))).size < 1024 * 1024);
for (const value of [checkpoint.result, result]) {
  assert.equal(value.status, 'passed');
  assert.equal(value.attachments.length, 70);
  for (const [index, attachment] of value.attachments.entries()) {
    assert.equal(attachment.body, undefined);
    assert.ok(attachment.path.startsWith(output + path.sep));
    const bytes = await readFile(attachment.path);
    assert.equal(bytes.length, 1024 * 1024);
    assert.ok(bytes.equals(Buffer.alloc(bytes.length, index)));
  }
}
console.log('70 MiB of evidence retained with small checkpoint and JSON manifests.');
