import { NavigationComponent } from '../ui/components/navigation.component';
import { CatalogPage } from '../ui/pages/catalog.page';
import { ExecutionPage } from '../ui/pages/execution.page';
import { expect, test } from './fixtures';

test.describe('Run accessibility coverage', () => {
  let catalog: CatalogPage;
  let execution: ExecutionPage;
  test.beforeEach(async ({ page, isolatedProject }) => {
    const navigation = new NavigationComponent(page);
    await navigation.goto('/projects');
    await navigation.selectProject(isolatedProject.name);
    catalog = new CatalogPage(page);
    execution = new ExecutionPage(page);
  });
  test('an opted-in browser run retains advisory final-state coverage after reload', async ({
    api,
    page,
  }) => {
    await catalog.goto();
    await catalog.select(['UI-001']);
    await catalog.checkAccessibility();
    await catalog.startExecution();
    await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
    const run = await api.waitForCompletion(execution.id());
    expect(run.results[0]?.status).toBe('passed');
    await page.reload();
    await expect(execution.accessibilityReview()).toContainText('1 / 1');
    await expect(execution.accessibilityReview()).toContainText('Advisory');
    await execution.openAccessibilityState('UI-001:chromium');
    await expect(execution.accessibilityReview()).toContainText('axe 4.');
    await expect(execution.accessibilityReview()).not.toContainText('Not checked');
    expect(run.artifacts.some((item) => item.name === 'accessibility-checkpoint.json')).toBe(true);
  });
});
