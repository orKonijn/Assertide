import { NavigationComponent } from '../ui/components/navigation.component';
import { expect, test } from '../ui/fixtures/base.fixture';
import { CatalogPage } from '../ui/pages/catalog.page';
import { LoginPage } from '../ui/pages/login.page';
import { TestData as D } from '../ui/types/test-data';
import { localPassword } from '../ui/utils/credentials.utils';
import { fitsViewport, viewport } from '../ui/utils/viewport.utils';
test.describe('SSO authentication', () => {
  let login: LoginPage;
  let catalog: CatalogPage;
  let navigation: NavigationComponent;
  test.beforeEach(({ page }) => {
    login = new LoginPage(page);
    catalog = new CatalogPage(page);
    navigation = new NavigationComponent(page);
  });
  test('administrator signs in and sees the real catalog on desktop and mobile', async ({
    page,
    diagnostics,
  }) => {
    const password = await localPassword();
    diagnostics.secrets.push(password);
    await login.login(password);
    await expect(navigation.heading).toHaveText('Quality at a glance');
    await catalog.goto();
    await expect(catalog.selection(D.lifecycle)).toBeVisible();
    await expect(catalog.cases).toHaveCount(10);
    await navigation.setTheme('dark');
    await viewport(page, 'mobile');
    await expect(navigation.menu).toBeVisible();
    expect(await fitsViewport(page)).toBe(true);
    expect(diagnostics.errors).toEqual([]);
  });
});
