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
  test('anonymous direct access stays at sign-in', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL: 'http://127.0.0.1:4200',
    });
    try {
      const about = new AboutPage(await context.newPage());
      await about.goto('#inside');
      await expect(about.signIn).toBeVisible();
      await expect(about.title).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
