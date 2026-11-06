import { NavigationComponent } from '../ui/components/navigation.component';
import { CatalogPage } from '../ui/pages/catalog.page';
import { ExecutionPage } from '../ui/pages/execution.page';
import { expect, test } from './fixtures';

test.describe('Run performance budgets', () => {
  let catalog: CatalogPage;
  let execution: ExecutionPage;
  test.beforeEach(async ({ page, isolatedProject }) => {
    const navigation = new NavigationComponent(page);
    await navigation.goto('/projects');
    await navigation.selectProject(isolatedProject.name);
    catalog = new CatalogPage(page);
    execution = new ExecutionPage(page);
  });
  test('an opted-in catalog benchmark retains three sanitized Lighthouse samples and advisory budgets', async ({
    page,
    api,
  }) => {
    test.setTimeout(240_000);
    await catalog.goto();
    await catalog.select(['UI-002', 'UI-003', 'LAB-001']);
    await catalog.configureBenchmark('chromium', 1, 2);
    await catalog.checkPerformance();
    await catalog.checkAccessibility();
    await catalog.startExecution();
    await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
    const run = await api.waitForCompletion(execution.id(), 210_000);
    expect(run.results).toHaveLength(3);
    expect(run.results.every((item) => item.status === 'passed')).toBe(true);
    expect(
      run.artifacts?.filter((item) => item.name === 'performance-checkpoint.json'),
    ).toHaveLength(1);
    expect(run.logTail?.match(/Lighthouse: sample 1\/3 recorded\./g)).toHaveLength(1);
    expect(run.logTail?.match(/Lighthouse: sample 3\/3 recorded\./g)).toHaveLength(1);
    await page.reload();
    await expect(execution.accessibilityReview()).toContainText('2 / 2');
    await expect(execution.performanceReview()).toContainText('Lighthouse 13.6.0');
    await expect(execution.performanceReview()).toContainText('3 samples');
    await expect(execution.performanceReview()).toContainText('Transferred bytes');
    await expect(execution.performanceReview()).not.toContainText('Not measured');
    await expect(execution.performanceReview()).not.toContainText('missing metric');
    await expect(execution.performanceReview()).not.toContainText('invalid measurement');
    await api.waitForReport(execution.id());
  });
  test('multiple selections, browsers, workers and retries remain available with one benchmark', async () => {
    await catalog.goto();
    await catalog.select(['UI-002', 'LAB-001']);
    await catalog.checkPerformance();
    await catalog.configureBenchmark('firefox', 2, 2);
    await expect(catalog.performanceIssue()).not.toBeVisible();
    await expect(catalog.startButtons.first()).toBeEnabled();
    await expect(catalog.startButtons.last()).toBeEnabled();
  });
  test('canceling the separate benchmark preserves completed functional results', async ({
    page,
    api,
  }) => {
    test.setTimeout(240_000);
    await catalog.goto();
    await catalog.select(['UI-002', 'LAB-001']);
    await catalog.configureBenchmark('chromium', 1, 1);
    await catalog.checkPerformance();
    await catalog.startExecution();
    await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
    const id = execution.id();
    await expect
      .poll(async () => (await api.run(id)).performancePhase, {
        timeout: 120_000,
        intervals: [100, 250],
      })
      .toBe('running');
    await execution.cancel();
    await expect.poll(async () => (await api.run(id)).phase, { timeout: 60_000 }).toBe('canceled');
    const run = await api.run(id);
    expect(run.results).toHaveLength(2);
    expect(run.results.every((item) => item.status === 'passed')).toBe(true);
    await page.reload();
    await expect(execution.performanceReview()).toContainText('Not measured');
  });
});
