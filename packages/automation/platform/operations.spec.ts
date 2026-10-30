import { OperationsPage } from '../ui/pages/operations.page';
import { screenshot } from '../ui/utils/allure.utils';
import { fitsViewport, viewport } from '../ui/utils/viewport.utils';
import { expect, test } from './fixtures';
test.describe('Service operations', () => {
  let operations: OperationsPage;
  test.beforeEach(async ({ page }) => {
    operations = new OperationsPage(page);
    await operations.goto();
  });
  test('health, capacity and retention remain usable on desktop and mobile', async ({ page }) => {
    await expect(operations.status).toContainText('ready');
    await expect(operations.card).toContainText('database: ok');
    await expect(operations.card).toContainText('trace/video 14 days');
    await operations.refresh();
    await expect(operations.refreshButton).toBeEnabled();
    await screenshot(page, 'service-health', operations.card);
    await viewport(page, 'mobile');
    expect(await fitsViewport(page)).toBe(true);
  });
});
