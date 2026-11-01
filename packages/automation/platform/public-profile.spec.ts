import { NavigationComponent } from '../ui/components/navigation.component';
import { expect, test } from '../ui/fixtures/base.fixture';
import { GuestPage } from '../ui/pages/guest.page';
import { PublicProfilePage } from '../ui/pages/public-profile.page';
import { WelcomePage } from '../ui/pages/welcome.page';
import { violations } from '../ui/utils/accessibility.utils';
import { fitsViewport } from '../ui/utils/viewport.utils';

test.describe('Public project introduction', () => {
  test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' });
  let profile: PublicProfilePage;
  test.beforeEach(async ({ page }) => {
    profile = new PublicProfilePage(page);
    await profile.availability(false);
  });
  test('creator is public in both themes and mobile sizes, even when identity is unavailable', async ({
    page,
  }) => {
    await profile.availability(false, 502);
    await profile.goto();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark'] as const) {
        await new NavigationComponent(page).setTheme(theme);
        await profile.goto();
        await expect(profile.creator).toBeVisible();
        await expect(profile.source).toHaveAttribute(
          'href',
          'https://github.com/orKonijn/Assertide',
        );
        expect(await fitsViewport(page)).toBe(true);
        expect(await violations(page)).toEqual([]);
        if (process.env['CAPTURE_RECRUITER_EVIDENCE'] === 'true') {
          await page.screenshot({
            path: `../../docs/changelog/assets/unreleased/public-creator-${width}-${theme}.png`,
            fullPage: false,
          });
        }
      }
    }
  });
  test('disabled registration does not advertise signup and guest survives a creator visit', async ({
    page,
  }) => {
    const welcome = new WelcomePage(page);
    const guest = new GuestPage(page);
    await welcome.goto();
    await expect(welcome.guest).toBeEnabled();
    await expect(welcome.create).toHaveCount(0);
    await profile.openFromWelcome();
    await expect(profile.creator).toBeVisible();
    await welcome.goto();
    await guest.enter();
    await expect(guest.chart()).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await profile.openFromGuest();
    await expect(profile.creator).toBeVisible();
    await profile.returnToDemo();
    await expect(guest.chart()).toBeVisible();
    await guest.leave();
    await profile.openRegistration();
    await expect(profile.unavailable).toBeVisible();
  });
});
