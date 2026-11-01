import { NavigationComponent } from '../ui/components/navigation.component';
import { expect, test } from '../ui/fixtures/base.fixture';
import { GuestPage } from '../ui/pages/guest.page';
import { RegistrationPage } from '../ui/pages/registration.page';
import { WelcomePage } from '../ui/pages/welcome.page';
import { violations } from '../ui/utils/accessibility.utils';
import { fitsViewport, fitsViewportHeight } from '../ui/utils/viewport.utils';

test.describe('Welcome screen', () => {
  test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' });
  let welcome: WelcomePage;
  test.beforeEach(({ page }) => {
    welcome = new WelcomePage(page);
  });
  test('account and guest actions remain readable in both themes and service states', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const navigation = new NavigationComponent(page);
    for (const failed of [false, true]) {
      await welcome.mockAvailability(failed);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['light', 'dark'] as const) {
          await welcome.goto();
          await navigation.setTheme(theme);
          await expect(welcome.heading).toBeVisible();
          await expect(welcome.signIn).toHaveAttribute('href', '/auth/login?returnTo=%2F');
          await expect(welcome.create).toHaveAttribute('href', '/register');
          if (failed) {
            await expect(welcome.guest).toBeDisabled();
            await expect(welcome.notice).toBeVisible();
          } else {
            await expect(welcome.guest).toBeEnabled();
          }
          expect(await fitsViewport(page)).toBe(true);
          expect(await violations(page)).toEqual([]);
          if (process.env['CAPTURE_WELCOME_EVIDENCE'] === 'true') {
            await page.screenshot({
              path: `../../docs/changelog/assets/unreleased/welcome-${failed ? 'unavailable' : 'ready'}-${width}-${theme}.png`,
              fullPage: true,
            });
          }
        }
      }
    }
  });
  test('retry recovers account availability and theme works with keyboard', async ({ page }) => {
    await welcome.mockAvailability(true);
    await welcome.goto();
    await expect(welcome.guest).toBeDisabled();
    await welcome.mockAvailability(false);
    await welcome.retryOptions();
    await welcome.retryConnection();
    await expect(welcome.notice).toHaveCount(0);
    await expect(welcome.guest).toBeEnabled();
    await welcome.themeByKeyboard();
    await expect(welcome.heading).toBeVisible();
    const guest = new GuestPage(page);
    await guest.enterByKeyboard();
    await expect(guest.chart()).toBeVisible();
  });
  test('registration retains a compact mobile layout', async ({ page }) => {
    await welcome.mockAvailability(false);
    await page.setViewportSize({ width: 390, height: 844 });
    const registration = new RegistrationPage(page);
    await registration.goto();
    await expect(registration.heading).toBeVisible();
    expect(await fitsViewport(page)).toBe(true);
    expect(await fitsViewportHeight(page)).toBe(true);
    expect(await violations(page)).toEqual([]);
  });
});
