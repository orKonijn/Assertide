import { completed, npm, root } from './commands.mjs';
await completed(
  npm(
    ['exec', '--', 'playwright', 'test', '--config', 'platform.config.ts'],
    `${root}/packages/automation`,
  ),
);
