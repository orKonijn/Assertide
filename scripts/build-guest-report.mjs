import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Deliberately does not read runtime results, application configuration or private evidence.
const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = await mkdtemp(path.join(tmpdir(), 'assertide-public-demo-'));
const results = path.join(scratch, 'results');
await mkdir(results);
let start = Date.UTC(2026, 9, 1, 12);
const cases = [
  ['Catalog returns available products', 'passed', 140, 'API'],
  ['Cart preserves selected quantity', 'passed', 1200, 'Browser'],
  ['Checkout displays delivery estimate', 'failed', 2100, 'Browser'],
];
for (const [index, [name, status, duration, kind]] of cases.entries()) {
  await writeFile(
    path.join(results, `demo-${index}-result.json`),
    JSON.stringify({
      uuid: `synthetic-demo-${index}`,
      historyId: `synthetic-demo-${index}`,
      name,
      fullName: `Meadow Shop synthetic demo / ${name}`,
      status,
      stage: 'finished',
      start,
      stop: start + duration,
      description:
        'SYNTHETIC DEMO ONLY. Generated illustrative results; no tests were executed and no customer data is included.',
      labels: [
        { name: 'suite', value: 'Checkout confidence' },
        { name: 'feature', value: kind },
        { name: 'tag', value: 'Synthetic demo' },
      ],
      steps: [
        { name: 'Arrange fictional sample data', status: 'passed', start, stop: start + 20 },
        {
          name: 'Inspect simulated response',
          status: 'passed',
          start: start + 20,
          stop: start + 50,
        },
        {
          name:
            status === 'failed' ? 'Delivery estimate is visible' : 'Expected value matches sample',
          status,
          start: start + 50,
          stop: start + duration,
        },
      ],
      ...(status === 'failed'
        ? {
            statusDetails: {
              message: 'Synthetic assertion: expected deliveryEstimate, received no value',
              trace:
                'Illustrative failure only. Investigate the missing response field and UI fallback.',
            },
          }
        : {}),
    }),
  );
  start += duration;
}
const config = path.join(scratch, 'allure.config.mjs');
await writeFile(
  config,
  `export default ${JSON.stringify({ name: 'Assertide · Synthetic guest demo', plugins: { awesome: { options: { singleFile: true, reportName: 'Assertide · Synthetic guest demo', groupBy: ['suite'], publish: false } } } })};`,
);
execFileSync(
  process.execPath,
  [
    path.join(root, 'packages/automation/node_modules/allure/cli.js'),
    'generate',
    results,
    '--config',
    config,
    '--output',
    path.join(scratch, 'output'),
  ],
  {
    stdio: 'inherit',
    windowsHide: true,
    cwd: scratch,
    env: {
      PATH: process.env['PATH'],
      SystemRoot: process.env['SystemRoot'],
      TEMP: tmpdir(),
      TMP: tmpdir(),
    },
  },
);
const destination = path.join(root, 'apps/web/public/demo-report');
await mkdir(destination, { recursive: true });
await copyFile(path.join(scratch, 'output/index.html'), path.join(destination, 'index.html'));
console.log('Generated public Allure report from three literal synthetic cases only.');
