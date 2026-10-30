import { NavigationComponent } from '../ui/components/navigation.component';
import { expect, test } from '../ui/fixtures/base.fixture';
import { CatalogPage } from '../ui/pages/catalog.page';
import { ExecutionPage } from '../ui/pages/execution.page';
import { LoginPage } from '../ui/pages/login.page';
import { TestData as D } from '../ui/types/test-data';
import { saveAccessibilityEvidence, violations } from '../ui/utils/accessibility.utils';
import { localPassword } from '../ui/utils/credentials.utils';
import { PlatformApi } from '../ui/utils/platform-api.utils';
import { fitsViewport, viewport } from '../ui/utils/viewport.utils';
test.describe('Accessible application navigation', () => {
  let login: LoginPage;
  let catalog: CatalogPage;
  let execution: ExecutionPage;
  let navigation: NavigationComponent;
  test.beforeEach(({ page }) => {
    login = new LoginPage(page);
    catalog = new CatalogPage(page);
    execution = new ExecutionPage(page);
    navigation = new NavigationComponent(page);
  });

  test('application routes pass automated WCAG checks in light/dark desktop and mobile states', async ({
    page,
  }) => {
    test.setTimeout(180000);
    const evidence: {
      route: string;
      theme: string;
      width: number;
      violations: unknown[];
    }[] = [];
    const inspect = async (route: string, theme: string, width: number): Promise<void> => {
      await expect(navigation.heading).toBeVisible();
      const failures = await violations(page);
      evidence.push({ route, theme, width, violations: failures });
      expect.soft(failures, `${route} ${theme} ${width}px`).toEqual([]);
      expect.soft(await fitsViewport(page), `${route} horizontal overflow`).toBe(true);
    };
    await login.goto();
    await inspect('login', 'light', 1280);
    await login.openSso();
    await inspect('SSO sign in', 'light', 1280);
    await viewport(page, 'mobile');
    await inspect('SSO sign in', 'light', 390);
    await viewport(page, 'desktop');
    await login.signIn(await localPassword());
    await expect(page).toHaveURL(D.origin + '/');
    const api = new PlatformApi(page.request);
    const created = await api.launch([...D.apiIds, ...D.uiIds]);
    await execution.goto(created.id);
    await expect(execution.status).toHaveText(/queued|running|provisioning/);
    await inspect('Live monitor', 'light', 1440);
    const completed = await api.waitForCompletion(created.id);
    const routes = [
      '/',
      '/projects',
      '/suites',
      '/explorer',
      '/runs',
      '/reports',
      '/api',
      '/settings',
      `/runs/${completed.id}?result=${encodeURIComponent(completed.results[0]!.id)}`,
    ];
    for (const theme of ['light', 'dark'] as const) {
      await navigation.setTheme(theme);
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 844 });
        for (const route of routes) {
          await navigation.goto(route);
          await inspect(route, theme, width);
          if (route === '/explorer') {
            await catalog.select([D.login]);
            await inspect('Run configuration', theme, width);
          }
        }
      }
    }
    await saveAccessibilityEvidence(evidence);
  });
  test('keyboard skip link, mobile menu escape and reduced motion remain usable', async ({
    page,
  }) => {
    await login.login(await localPassword(), 'admin', '/explorer');
    await expect(page).toHaveURL(/\/explorer$/);
    await page.reload();
    await expect(catalog.heading).toBeVisible();
    await navigation.press('Tab');
    await expect(navigation.skip).toBeFocused();
    await navigation.press('Enter');
    await expect(navigation.content).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    const menu = navigation.menu;
    await menu.focus();
    await navigation.press('Enter');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');

    await expect(navigation.closeMenu).toBeFocused();
    await navigation.press('Shift+Tab');
    await expect(navigation.signOut).toBeFocused();
    await navigation.press('Tab');
    await expect(navigation.closeMenu).toBeFocused();
    expect(await violations(page)).toEqual([]);
    await navigation.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
    expect(await navigation.reducedMotionDuration()).toBe('0s');
  });
});
