import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(path.join(tmpdir(), 'assertide-report-probe-'));
const run = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', '--config', 'checks/reporting.config.ts'],
  {
    cwd,
    env: { ...process.env, REPORT_PROBE_OUTPUT: output },
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: true,
  },
);
assert.equal(run.status, 1, 'Synthetic diagnostic failure must fail');
const directory = path.join(output, 'allure-results');
const files = await readdir(directory);
const results = await Promise.all(
  files
    .filter((file) => file.endsWith('-result.json'))
    .map(async (file) => JSON.parse(await readFile(path.join(directory, file), 'utf8'))),
);
const result = results.find((result) => result.status === 'failed');
assert.equal(result.status, 'failed');
for (const label of ['epic', 'feature', 'story', 'suite', 'severity', 'owner', 'tag'])
  assert.ok(
    result.labels.some((item) => item.name === label),
    `Missing ${label}`,
  );
assert.ok(result.testCaseId);
assert.ok(result.description.includes('Goal:'));
const flatten = (steps) => steps.flatMap((step) => [step, ...flatten(step.steps ?? [])]);
const steps = flatten(result.steps);
for (const passed of results.filter((result) => result.status === 'passed')) {
  const images = [
    ...passed.attachments,
    ...flatten(passed.steps).flatMap((step) => step.attachments ?? []),
  ].filter((item) => item.type === 'image/png');
  if (passed.name.includes('sensitive pages')) assert.equal(images.length, 0);
  else {
    assert.ok(images.some((item) => item.name === 'final-state.png'));
    const workflowSteps = flatten(passed.steps).filter(
      (step) => step.name === 'Verify protected diagnostic page',
    );
    assert.equal(workflowSteps.length, 2);
    for (const step of workflowSteps) {
      assert.ok(
        flatten([step])
          .flatMap((child) => child.attachments ?? [])
          .some((item) => item.name === 'step-state.png' && item.type === 'image/png'),
        'Screenshot must belong to its individual workflow step',
      );
    }
    for (const image of images)
      assert.ok((await stat(path.join(directory, image.source))).size > 0);
  }
}
assert.equal(results.filter((result) => result.status === 'passed').length, 2);
assert.ok(steps.some((step) => step.name === 'Inspect protected diagnostic boundary'));
const attachments = [...result.attachments, ...steps.flatMap((step) => step.attachments ?? [])];
assert.ok(
  flatten([steps.find((step) => step.name === 'Inspect protected diagnostic boundary')])
    .flatMap((step) => step.attachments ?? [])
    .some((item) => item.name === 'step-state.png'),
  'Failed workflow steps also retain their screenshot',
);
for (const name of ['failure-context.json', 'failure-state.png']) {
  const attachment = attachments.find((item) => item.name === name);
  assert.ok(attachment, `Missing ${name}`);
  assert.ok((await stat(path.join(directory, attachment.source))).size > 0);
}
for (const file of files.filter((file) => /\.(json|txt|md|properties)$/.test(file))) {
  const text = await readFile(path.join(directory, file), 'utf8');
  assert.ok(!text.includes('synthetic-canary-should-never-appear'), `Credential leak in ${file}`);
  assert.ok(!text.includes('# Page snapshot'), `Unfiltered DOM snapshot in ${file}`);
}
assert.ok(!attachments.some((item) => ['trace', 'video'].includes(item.name)));
console.log(
  `Verified successful-test screenshots, sensitive-page opt-out, failed-test metadata, workflow steps, masked screenshot, sanitized URL and redaction. Evidence: ${output}`,
);
