import { mkdir, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const runtime = process.argv[2] ?? 'local';
if (!['local', 'oci', 'kubernetes'].includes(runtime))
  throw new Error('Expected local, oci or kubernetes runtime');
const output = path.join(root, '.local/platform', runtime);
const results = path.join(output, 'allure-results');
try {
  await access(results);
} catch {
  console.log(`No ${runtime} platform results to render`);
  process.exit(0);
}
const history = path.join(root, '.local/platform-history');
await mkdir(history, { recursive: true });
const config = path.join(output, 'allure.config.mjs');
await writeFile(
  config,
  `export default ${JSON.stringify({ name: `Assertide UI / ${runtime}`, historyPath: path.join(history, `${runtime}.jsonl`), appendHistory: true, historyLimit: 30, plugins: { awesome: { options: { groupBy: ['feature', 'story'], appendTitlePath: false } } } })};`,
);
const cli = fileURLToPath(new URL('../node_modules/allure/cli.js', import.meta.url));
const result = spawnSync(
  process.execPath,
  [
    cli,
    'generate',
    results,
    '--config',
    config,
    '--output',
    path.join(output, 'allure-report'),
    '--clean',
  ],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
