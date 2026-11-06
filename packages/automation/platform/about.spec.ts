import { AboutPage } from '../ui/pages/about.page';
import { expect, test } from './fixtures';

test.describe('About Assertide', () => {
  let about: AboutPage;
  test.beforeEach(({ page }) => {
    about = new AboutPage(page);
  });
  test('secondary navigation, direct links, refresh and technical detail', async () => {
    await about.openFromNavigation();
    await expect(about.title).toBeVisible();
    await expect(about.creator).toBeVisible();
    await about.openInside();
    await expect(about.inside).toBeFocused();
    await about.goto('#inside');
    await about.reload();
    await expect(about.inside).toBeFocused();
    await about.expandArchitecture();
    await expect(about.architecture).toContainText('BullMQ');
    for (const width of [390, 768, 1280]) {
      for (const theme of ['light', 'dark'] as const) {
        await about.viewport(width, theme);
        expect(await about.overflows()).toBe(false);
      }
    }
  });
  test('anonymous visitors can inspect the public About page while private projects require sign-in', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL: 'http://127.0.0.1:4200',
    });
    try {
      const about = new AboutPage(await context.newPage());
      await about.goto('#inside');
      await expect(about.title).toBeVisible();
      await expect(about.creator).toBeVisible();
      await expect(about.inside).toBeFocused();
      expect((await context.request.get('/v1/projects')).status()).toBe(401);
    } finally {
      await context.close();
    }
  });
});
