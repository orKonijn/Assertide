import { NavigationComponent } from '../ui/components/navigation.component';
import { expect, test } from '../ui/fixtures/base.fixture';
import { GuestPage } from '../ui/pages/guest.page';
import { GuestAllurePage } from '../ui/pages/guest-allure.page';
import { LoginPage } from '../ui/pages/login.page';
import { RegistrationPage } from '../ui/pages/registration.page';
import { captureAccessEvidence } from '../ui/utils/access-evidence.utils';
import { localPassword } from '../ui/utils/credentials.utils';
import { viewport } from '../ui/utils/viewport.utils';

test.describe('Read-only guest demo', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  let demo: GuestPage;
  test.beforeEach(async ({ page }) => {
    demo = new GuestPage(page);
    await demo.goto();
    await demo.enter();
  });
  test('explores synthetic workflows without protected data access or real mutations', async ({
    page,
  }) => {
    await expect(demo.label).toBeVisible();
    await expect(demo.chart()).toBeVisible();
    await expect(demo.trendTable()).toContainText('Sep 27');
    await demo.selectDay('Sep 29');
    await expect(demo.dayStatus()).toContainText('Sep 29');
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/v1/') && !request.url().endsWith('/me')) {
        requests.push(request.method());
      }
    });
    await demo.simulate();
    await expect(demo.simulationStatus()).toContainText('No real tests ran');
    for (const section of [
      'Projects',
      'Test suites',
      'Test explorer',
      'Executions',
      'API examples',
      'Reports',
    ]) {
      await demo.open(section);
      await expect(demo.heading).toHaveText(section);
    }
    await expect(demo.evidence()).toContainText('2 passed');
    const reportPage = await demo.openAllure();
    const report = new GuestAllurePage(reportPage);
    await viewport(reportPage, 'desktop');
    await expect(report.content()).toContainText('Synthetic guest demo');
    await captureAccessEvidence(reportPage, 'guest-allure-1440-light');
    await report.openFailure();
    await expect(report.content()).toContainText('Synthetic assertion: expected deliveryEstimate');
    await reportPage.close();
    expect(requests).toEqual([]);
    await demo.restrict('Download report');
    await expect(demo.restriction).toBeVisible();
    expect((await page.request.get('/v1/projects')).status()).toBe(401);
    expect(
      (
        await page.request.post('/v1/projects/00000000-0000-4000-8000-000000000010/runs', {
          data: {},
          headers: { Origin: 'http://127.0.0.1:4200' },
        })
      ).status(),
    ).toBe(401);
  });
  test('refresh retains expiry and leaving clears the demo across tabs', async ({ context }) => {
    const expiry = await demo.guestState();
    await demo.reload();
    await expect(demo.label).toBeVisible();
    expect(await demo.guestState()).toBe(expiry);
    const secondPage = await context.newPage();
    const second = new GuestPage(secondPage);
    await second.goto();
    await expect(second.label).toBeVisible();
    await demo.leave();
    await expect(second.label).toHaveCount(0);
    await secondPage.close();
  });
  test('expiry removes the demo and conversion clears guest preferences', async ({ page }) => {
    await demo.expire();
    await expect(demo.expired).toBeVisible();
    await demo.enter();
    await demo.createAccount();
    const registration = new RegistrationPage(page);
    await expect(registration.heading).toBeVisible();
    expect(await demo.guestState()).toBeNull();
  });
  test('existing sign-in takes priority over guest preferences and clears demo state', async ({
    page,
    context,
  }) => {
    const secondPage = await context.newPage();
    const login = new LoginPage(secondPage);
    await login.goto();
    await login.openSso();
    await login.signIn(await localPassword());
    await expect.poll(async () => (await secondPage.request.get('/v1/me')).status()).toBe(200);
    const navigation = new NavigationComponent(page);
    await navigation.notifyVisibility();
    await expect(demo.label).toHaveCount(0);
    expect(await demo.guestState()).toBeNull();
    expect((await page.request.get('/v1/me')).status()).toBe(200);
    await secondPage.close();
  });
});
