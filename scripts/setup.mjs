import { command, completed, npm, root } from './commands.mjs';
if (Number(process.versions.node.split('.')[0]) !== 24)
  throw new Error('Install Node.js 24 before setup');
for (const port of [4010, 4200]) {
  let running = false;
  try {
    await fetch(`http://127.0.0.1:${port}`, {
      signal: AbortSignal.timeout(500),
    });
    running = true;
  } catch {
    // A refused connection is expected before the local service starts.
  }
  if (running)
    throw new Error(
      'Stop Assertide with Ctrl+C before running setup; running services lock installed dependencies on Windows.',
    );
}
for (const directory of ['apps/api', 'apps/web', 'packages/automation'])
  await completed(npm(['ci'], `${root}/${directory}`));
await completed(command(process.execPath, ['scripts/setup-sandbox.mjs']));
await completed(
  npm(
    ['exec', '--', 'playwright', 'install', 'chromium', 'firefox', 'webkit'],
    `${root}/packages/automation`,
  ),
);
console.log(
  'Setup complete. Run npm start, then open http://127.0.0.1:4200. Local sign-in is configured automatically.',
);
