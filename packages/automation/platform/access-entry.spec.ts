import { NavigationComponent } from '../ui/components/navigation.component';
import { expect, test } from '../ui/fixtures/base.fixture';
import { GuestPage } from '../ui/pages/guest.page';
import { RegistrationPage } from '../ui/pages/registration.page';
import { captureAccessEvidence } from '../ui/utils/access-evidence.utils';
import { violations } from '../ui/utils/accessibility.utils';
import { fitsViewport, fitsViewportHeight, viewport } from '../ui/utils/viewport.utils';

test.describe('Accessible registration and guest entry', () => {
  test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' });
  let registration: RegistrationPage;
  let guest: GuestPage;
  let navigation: NavigationComponent;
  test.beforeEach(({ page }) => {
    registration = new RegistrationPage(page);
    guest = new GuestPage(page);
    navigation = new NavigationComponent(page);
  });
  test('registration and sample reports fit mobile and desktop in both themes', async ({
    page,
  }) => {
    test.setTimeout(120000);
    for (const size of ['mobile', 'desktop'] as const) {
      await viewport(page, size);
      const width = size === 'mobile' ? 390 : 1440;
      for (const theme of ['light', 'dark'] as const) {
        await registration.goto();
        await navigation.setTheme(theme);
        await expect(registration.heading).toBeVisible();
        expect(await fitsViewport(page)).toBe(true);
        expect(await fitsViewportHeight(page)).toBe(true);
        expect(await violations(page)).toEqual([]);
        await captureAccessEvidence(page, `registration-compact-${width}-${theme}`);
        await guest.enterByKeyboard();
        await expect(guest.chart()).toBeVisible();
        expect(await fitsViewport(page)).toBe(true);
        expect(await violations(page)).toEqual([]);
        await captureAccessEvidence(page, `guest-overview-${width}-${theme}`);
        await guest.keyboardOpenReports();
        await expect(guest.evidence()).toBeVisible();
        expect(await fitsViewport(page)).toBe(true);
        expect(await violations(page)).toEqual([]);
        await captureAccessEvidence(page, `guest-workspace-${width}-${theme}`);
        await guest.leave();
      }
    }
  });
});
