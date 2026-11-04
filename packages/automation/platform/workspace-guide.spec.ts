import { NavigationComponent } from '../ui/components/navigation.component';
import { WorkspaceGuidePage } from '../ui/pages/workspace-guide.page';
import { expect, test } from './fixtures';
test.describe('Workspace getting started guide', () => {
  let guide: WorkspaceGuidePage;
  let navigation: NavigationComponent;
  test.beforeEach(async ({ page }) => {
    guide = new WorkspaceGuidePage(page);
    navigation = new NavigationComponent(page);
    await navigation.goto('/');
  });
  test('guide is available from navigation and returns to the workspace', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await guide.open();
    await expect(guide.title).toBeVisible();
    await expect(guide.steps).toHaveCount(4);
    await expect(guide.link).toHaveAttribute('aria-current', 'page');
    await guide.explorer.click();
    await expect(page).toHaveURL(/\/explorer$/);
    await guide.open();
    await guide.finish();
    await expect(page).toHaveURL(/\/$/);
  });
  test('mobile guide navigation closes the drawer and keeps content accessible', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await navigation.openMenuWithKeyboard();
    await guide.open();
    await expect(guide.title).toBeVisible();
    await expect(navigation.dialog).not.toBeVisible();
    await expect(guide.explorer).toBeVisible();
  });
});
