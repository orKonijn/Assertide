import { ExecutionPage } from '../ui/pages/execution.page';
import { TestData as D, Timeouts } from '../ui/types/test-data';
import { expect, test } from './fixtures';
test.describe('Execution cancellation', () => {
  let execution: ExecutionPage;
  test.beforeEach(({ page }) => {
    execution = new ExecutionPage(page);
  });
  test('cancellation stops the worker tree and preserves completed attempts', async ({ api }) => {
    const run = await api.launch(D.uiIds);
    await execution.goto(run.id);
    await expect
      .poll(async () => (await api.run(run.id)).logTail ?? '', {
        timeout: Timeouts.cancellation,
        intervals: [100],
      })
      .toContain(D.login);
    await execution.cancel();
    await expect(execution.status).toHaveText('canceled', {
      timeout: Timeouts.cancellation,
    });
    const final = await api.run(run.id);
    expect(final.results).toHaveLength(12);
    expect(final.results.some((result) => result.status === 'passed')).toBe(true);
    expect(final.results.some((result) => result.status === 'canceled')).toBe(true);
  });
});
