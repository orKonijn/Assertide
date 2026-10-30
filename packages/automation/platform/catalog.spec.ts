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
  test('sorting applies before pagination and preserves selection', async ({
    api,
    isolatedProject,
    page,
  }) => {
    const items = (await api.catalog(isolatedProject.id)).items;
    await catalog.selection(D.lifecycle).check();
    await catalog.goToPage(2);
    await catalog.sortBy('id-desc');
    const descending = [...items].sort((a, b) =>
      b.id.localeCompare(a.id, undefined, { numeric: true }),
    );
    await expect(catalog.cases.first()).toHaveAttribute(
      'aria-label',
      'Select ' + descending[0]!.id,
    );
    await catalog.goToPage(2);
    await expect(catalog.cases.first()).toHaveAttribute(
      'aria-label',
      'Select ' + descending[10]!.id,
    );
    await catalog.sortBy('title-asc');
    const titled = [...items].sort(
      (a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }) ||
        a.id.localeCompare(b.id, undefined, { numeric: true }),
    );
    await expect(catalog.cases.first()).toHaveAttribute('aria-label', 'Select ' + titled[0]!.id);
    await page.reload();
    await expect(catalog.cases.first()).toHaveAttribute('aria-label', 'Select ' + titled[0]!.id);
    await catalog.sortBy('id-asc');
    await catalog.selection(D.lifecycle).check();
    await catalog.sortBy('priority-desc');
    await catalog.search(D.lifecycle);
    await expect(catalog.selection(D.lifecycle)).toBeChecked();
  });
  test('pagination preserves selection and select all includes every page', async ({
    api,
    isolatedProject,
  }) => {
    const items = (await api.catalog(isolatedProject.id)).items;
    await expect(catalog.cases).toHaveCount(10);
    await expect(catalog.startButtons).toHaveCount(2);
    await expect(catalog.startButtons.first()).toBeDisabled();
    await catalog.selection(D.lifecycle).check();
    await catalog.goToPage(2);
    await expect(catalog.cases).toHaveCount(10);
    await catalog.goToPage(1);
    await expect(catalog.selection(D.lifecycle)).toBeChecked();
    await catalog.selectAll();
    await expect(catalog.selectedCount).toHaveText(
      `${items.filter((item) => item.enabled).length} tests selected`,
    );
    await catalog.deselectAll();
    await expect(catalog.selectedCount).toHaveText('0 tests selected');
    await expect(catalog.startButtons.first()).toBeDisabled();
    await catalog.selectAll();
    await catalog.goToPage(3);
    await expect(catalog.cases).toHaveCount(Math.min(10, items.length - 20));
    await expect(catalog.startButtons.first()).toBeEnabled();
    await catalog.search(D.lifecycle);
    await expect(catalog.cases).toHaveCount(1);
    await expect(catalog.selection(D.lifecycle)).toBeChecked();
  });
});
