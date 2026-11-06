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
    await catalog.select(['UI-001']);
    await catalog.checkPerformance();
    await catalog.checkAccessibility();
    await catalog.startExecution();
    await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
    const run = await api.waitForCompletion(execution.id(), 210_000);
    expect(run.results[0]?.status).toBe('passed');
    await page.reload();
    await expect(execution.accessibilityReview()).toContainText('1 / 1');
    await expect(execution.performanceReview()).toContainText('Lighthouse 13.6.0');
    await expect(execution.performanceReview()).toContainText('3 samples');
    await expect(execution.performanceReview()).toContainText('Transferred bytes');
    await expect(execution.performanceReview()).not.toContainText('Not measured');
    await expect(execution.performanceReview()).not.toContainText('missing metric');
    await expect(execution.performanceReview()).not.toContainText('invalid measurement');
  });
  test('incompatible benchmark settings explain recovery before launch', async () => {
    await catalog.goto();
    await catalog.select(['UI-001']);
    await catalog.checkPerformance();
    await catalog.configureBenchmark('firefox', 2, 1);
    await expect(catalog.performanceIssue()).toBeVisible();
    await expect(catalog.startButtons.first()).toBeDisabled();
    await expect(catalog.startButtons.last()).toBeDisabled();
    await catalog.configureBenchmark('chromium', 1, 0);
    await expect(catalog.performanceIssue()).not.toBeVisible();
    await expect(catalog.startButtons.first()).toBeEnabled();
    await catalog.select(['UI-002']);
    await expect(catalog.performanceIssue()).toBeVisible();
    await expect(catalog.startButtons.first()).toBeDisabled();
    await catalog.uncheckPerformance();
    await expect(catalog.performanceIssue()).not.toBeVisible();
    await expect(catalog.startButtons.first()).toBeEnabled();
  });
});
