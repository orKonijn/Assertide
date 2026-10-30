import { readFile, cp, mkdir, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { z } from '/app/apps/api/node_modules/zod/index.js';
import { startWorkerFixtures } from '/app/apps/api/src/worker-fixture.ts';
import path from 'node:path';

let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 65536) throw new Error('Worker input exceeds policy');
}
const spec = z
  .object({
    testIds: z.array(z.string().regex(/^(LAB|UI)-\d{3,8}$/)).min(1),
    workers: z.number().int().min(1).max(4),
    retries: z.number().int().min(0).max(2),
    projects: z
      .array(z.enum(['api', 'chromium', 'firefox', 'webkit']))
      .min(1)
      .max(4),
    video: z.enum(['off', 'retain-on-failure']),
    headed: z.boolean().default(false),
    password: z.string().min(12),
    signingKey: z.string().min(32),
  })
  .strict()
  .parse(JSON.parse(input));
const lock = await readFile('/source/package-lock.json');
const expected = (await readFile('/app/automation-lock.sha256', 'utf8')).trim();
if (createHash('sha256').update(lock).digest('hex') !== expected)
  throw new Error('Approved source dependencies do not match the immutable worker image');
const work = '/tmp/automation';
await mkdir(work, { recursive: true });
await cp('/source', work, {
  recursive: true,
  filter: (source) => path.basename(source) !== 'node_modules',
});
await symlink('/app/packages/automation/node_modules', `${work}/node_modules`, 'dir');
const close = await startWorkerFixtures(spec.password, spec.signingKey);
const args = [
  '/app/packages/automation/node_modules/@playwright/test/cli.js',
  'test',
  '--config',
  `${work}/playwright.config.ts`,
  '--grep',
  `(${spec.testIds.join('|')}) `,
  '--workers',
  String(spec.workers),
  '--retries',
  String(spec.retries),
  ...spec.projects.flatMap((project) => ['--project', project]),
  ...(spec.headed ? ['--headed'] : []),
];
const child = spawn(
  spec.headed ? 'xvfb-run' : process.execPath,
  spec.headed
    ? ['--auto-servernum', '--server-args=-screen 0 1280x720x24', process.execPath, ...args]
    : args,
  {
    cwd: work,
    stdio: 'inherit',
    env: {
      PATH: process.env.PATH,
      HOME: '/tmp',
      NODE_ENV: 'development',
      PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
      RUN_OUTPUT: '/output',
      RUN_VIDEO: spec.video,
      RUN_API_URL: 'http://127.0.0.1:4010/lab/v1/',
      RUN_BROWSER_URL: 'http://127.0.0.1:4013',
      LAB_PASSWORD: spec.password,
      LAB_SIGNING_KEY: spec.signingKey,
      CI: 'true',
    },
  },
);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code) => resolve(code ?? 137));
});
await close();
process.exitCode = code;
