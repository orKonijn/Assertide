import { NavigationComponent } from '../ui/components/navigation.component';
import { CatalogPage } from '../ui/pages/catalog.page';
import { HistoryPage } from '../ui/pages/history.page';
import { SuitesPage } from '../ui/pages/suites.page';
import { expect, test } from './fixtures';

test.describe('Audit recovery fixes', () => {
  let suites: SuitesPage;
  let catalog: CatalogPage;
  test.beforeEach(async ({ page, isolatedProject }) => {
    suites = new SuitesPage(page);
    catalog = new CatalogPage(page);
    const nav = new NavigationComponent(page);
    await nav.goto('/projects');
    await nav.selectProject(isolatedProject.name);
  });
  for (const status of [409, 422, 503]) {
    test(`suite save ${status} stays visible inside the dialog and preserves its draft`, async ({
      page,
    }) => {
      await suites.goto();
      await suites.fillDetails({
        name: 'Audit draft',
        description: 'Preserve this',
        owner: 'QA',
        tags: 'api',
      });
      await suites.setMember('LAB-001', true);
      await page.route('**/v1/projects/*/suites', (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({ status, json: { title: 'Controlled save failure' } })
          : route.continue(),
      );
      await suites.save();
      await expect(suites.requestError()).toContainText('Controlled save failure');
      await expect(suites.owner).toHaveValue('QA');
      await page.unroute('**/v1/projects/*/suites');
      await suites.save();
      await expect(suites.card('Audit draft')).toBeVisible();
    });
  }
  test('mobile save failure scrolls and focuses the visible error', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await suites.goto();
    await suites.fillDetails({ name: 'Mobile draft', description: '', owner: 'QA', tags: '' });
    await suites.setMember('LAB-001', true);
    await page.route('**/v1/projects/*/suites', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 503, json: { title: 'Mobile save failure' } })
        : route.continue(),
    );
    await suites.save();
    await expect(suites.requestError()).toBeFocused();
    await expect(suites.requestError()).toBeInViewport();
  });
  test('selected-only review keeps saved membership across filters and pages', async () => {
    await suites.goto();
    await suites.createWithType('api');
    await suites.reviewSelected();
    await expect(suites.membership('LAB-001')).toBeChecked();
    await suites.removeReviewedMember('LAB-001');
    await expect(suites.membership('LAB-001')).toHaveCount(0);
    await suites.fillDetails({ name: 'Review selection', description: '', owner: 'QA', tags: '' });
    await suites.save();
    await expect(suites.card('Review selection')).toContainText('64 tests');
  });
  test('mobile history shows results first and preserves filters on refresh', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const history = new HistoryPage(page);
    await history.goto();
    await expect(history.filterPanel()).not.toHaveAttribute('open');
    await expect(history.noResults()).toBeInViewport();
    await history.filter('completed', 'api');
    await expect(page).toHaveURL(/phase=completed/);
    await history.toggleFilters();
    await page.reload();
    await expect(history.filterPanel()).not.toHaveAttribute('open');
    await expect(history.filterPanel()).toContainText('2 selected');
  });
  test('metadata conflict is visible in its dialog', async ({ page }) => {
    await catalog.goto();
    await catalog.editMetadata('LAB-001');
    await page.route('**/v1/projects/*/catalog/LAB-001', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 409, json: { title: 'Metadata changed elsewhere' } })
        : route.continue(),
    );
    await catalog.saveMetadata();
    await expect(catalog.requestError()).toContainText('Metadata changed elsewhere');
  });
});
