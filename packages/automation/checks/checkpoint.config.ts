import { defineConfig } from '@playwright/test';
const output = process.env['RUN_OUTPUT'];
if (!output) {
  throw new Error('Checkpoint probe requires private disposable storage');
}
export default defineConfig({
  testDir: '.',
  testMatch: 'checkpoint.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [['../checkpoint-reporter.ts'], ['json', { outputFile: `${output}/results.json` }]],
  outputDir: `${output}/evidence`,
});
