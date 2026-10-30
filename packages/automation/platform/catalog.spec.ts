import { NavigationComponent } from '../ui/components/navigation.component';
import { CatalogPage } from '../ui/pages/catalog.page';
import { TestData as D } from '../ui/types/test-data';
import { expect, test } from './fixtures';
test.describe('Catalog metadata', () => {
  let catalog: CatalogPage;
  test.beforeEach(async ({ page, isolatedProject }) => {
    catalog = new CatalogPage(page);
    await catalog.goto();
    await new NavigationComponent(page).selectProject(isolatedProject.name);
    await catalog.goto();
  });
  test('disabled quarantine policy survives reload and remains searchable', async ({ page }) => {
    await catalog.editMetadata(D.latency);
    await catalog.updateMetadata({
      module: 'API performance',
      owner: 'Performance team',
      quarantined: true,
      enabled: false,
    });
    await expect(catalog.selection(D.latency)).toBeDisabled();
    await page.reload();
    await expect(catalog.selection(D.latency)).toBeDisabled();
    await catalog.search('API performance');
    await expect(catalog.editButton(D.latency)).toBeVisible();
    await expect(catalog.selection(D.lifecycle)).toHaveCount(0);
    await catalog.editMetadata(D.latency);
    await expect(catalog.quarantined).toBeChecked();
  });
});
