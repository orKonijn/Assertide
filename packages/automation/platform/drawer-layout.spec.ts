import { NavigationComponent } from '../ui/components/navigation.component';
import { expect, test } from './fixtures';

test.describe('Drawer viewport layout', () => {
  let navigation: NavigationComponent;
  test.beforeEach(({ page }) => {
    navigation = new NavigationComponent(page);
  });
  test('keeps account actions in view and restores keyboard focus', async ({ page }) => {
    for (const size of [
      { width: 390, height: 640 },
      { width: 820, height: 700 },
    ]) {
      await page.setViewportSize(size);
      await navigation.goto('/about');
      await expect(navigation.heading).toHaveText('About Assertide');
      await navigation.openMenuWithKeyboard();
      await expect(navigation.closeMenu).toBeFocused();
      await expect(navigation.signOut).toBeInViewport({ ratio: 1 });
      await expect(navigation.closeMenu).toBeInViewport({ ratio: 1 });
      await navigation.press('Escape');
      await expect(navigation.menu).toBeFocused();
      await navigation.openMenuWithKeyboard();
      await navigation.dismissFromOutside();
      await expect(navigation.menu).toBeFocused();
      await expect(navigation.dialog).toHaveCount(0);
    }
  });
});
