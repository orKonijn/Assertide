import { NavigationComponent } from '../ui/components/navigation.component';
import { expect, test } from '../ui/fixtures/base.fixture';
import { CatalogPage } from '../ui/pages/catalog.page';
import { LoginPage } from '../ui/pages/login.page';
import { localPassword } from '../ui/utils/credentials.utils';
test.describe('Session authorization', () => {
  let login: LoginPage;
  let catalog: CatalogPage;
  let navigation: NavigationComponent;
  test.beforeEach(({ page }) => {
    login = new LoginPage(page);
    catalog = new CatalogPage(page);
    navigation = new NavigationComponent(page);
  });
  test('unauthenticated API and report assets disclose no evidence', async ({ request }) => {
    expect((await request.get('/v1/projects')).status()).toBe(401);
    expect(
      (await request.get('/v1/runs/00000000-0000-4000-8000-000000000000/events')).status(),
    ).toBe(401);
    expect(
      (
        await request.get(
          'http://localhost:4012/reports/00000000-0000-4000-8000-000000000000/index.html',
        )
      ).status(),
    ).toBe(403);
  });
  test('viewer cannot launch, forged origin is rejected and logout expires access', async ({
    page,
  }) => {
    const password = await localPassword();
    await login.goto('/');
    await login.openSso();
    await login.signIn(password, 'viewer');
    await expect(navigation.heading).toBeVisible();
    const project = '00000000-0000-4000-8000-000000000010';
    const config = {
      catalogRevision: 'local-lab-v1',
      selection: { testIds: ['LAB-001'] },
      environmentId: 'local-lab',
      browserProjects: [],
      workers: 1,
      retries: 0,
      headed: false,
      video: 'off',
    };
    const launch = await page.request.post(`/v1/projects/${project}/runs`, {
      headers: {
        Origin: 'http://127.0.0.1:4200',
        'Idempotency-Key': crypto.randomUUID(),
      },
      data: config,
    });
    expect(launch.status()).toBe(403);
    expect(
      (
        await page.request.post('/auth/logout', {
          headers: { Origin: 'https://untrusted.invalid' },
          data: {},
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.get('/v1/projects/00000000-0000-4000-8000-000000000099/catalog')
      ).status(),
    ).toBe(404);
    await login.signOut();
    await expect(login.signInLink).toBeVisible();
    expect((await page.request.get('/v1/me')).status()).toBe(401);
  });

  test('idle session revocation clears protected content and preserves the return URL', async ({
    page,
  }) => {
    const password = await localPassword();
    await login.goto('/explorer?query=LAB');
    await login.openSso();
    await login.signIn(password);
    await expect(catalog.heading).toBeVisible();
    const identity = await (await page.request.get('/v1/me')).json();
    expect(Date.parse(identity.sessionExpiresAt)).toBeGreaterThan(Date.now());
    await page.request.post('/auth/logout', {
      headers: { Origin: 'http://127.0.0.1:4200' },
      data: {},
    });
    await navigation.notifyVisibility();
    await expect(login.signInLink).toBeVisible();
    await expect(catalog.heading).toHaveCount(0);
    await expect(login.signInLink).toHaveAttribute('href', /returnTo=%2Fexplorer%3Fquery%3DLAB/);
  });
});
