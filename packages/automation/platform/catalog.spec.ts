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
  test('selection survives refresh, remains project scoped and can be cleared', async ({
    page,
    api,
    isolatedProject,
  }) => {
    await catalog.selection(D.lifecycle).check();
    await expect(catalog.selectedCount).toHaveText('1 tests selected');
    await page.reload();
    await expect(catalog.restoredSelection).toBeVisible();
    await expect(catalog.selection(D.lifecycle)).toBeChecked();
    const other = await api.createProject('Draft isolation ' + crypto.randomUUID());
    await page.reload();
    const navigation = new NavigationComponent(page);
    await navigation.selectProject(other.name);
    await catalog.goto();
    await expect(catalog.selectedCount).toHaveText('0 tests selected');
    await navigation.selectProject(isolatedProject.name);
    await catalog.goto();
    await expect(catalog.selection(D.lifecycle)).toBeChecked();
    await catalog.clearSelection.click();
    await page.reload();
    await expect(catalog.selectedCount).toHaveText('0 tests selected');
    await expect(catalog.selection(D.lifecycle)).not.toBeChecked();
  });
  test('sort remains readable at narrow and intermediate widths in both themes', async ({
    page,
  }) => {
    const navigation = new NavigationComponent(page);
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await navigation.setTheme(theme);
      for (const width of [320, 360, 390, 430, 768, 875]) {
        await page.setViewportSize({ width, height: 900 });
        await catalog.sortBy('id-asc');
        const box = await catalog.sortControl.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(170);
        expect(box!.height).toBeLessThanOrEqual(64);
      }
    }
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
