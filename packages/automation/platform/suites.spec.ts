import { NotificationsComponent } from '../ui/components/notifications.component';
import { SuitesPage } from '../ui/pages/suites.page';
import { TestData as D, Timeouts } from '../ui/types/test-data';
import { uniqueName } from '../ui/utils/test-data.utils';
import { expect, test } from './fixtures';
test.describe('Saved suites', () => {
  let suites: SuitesPage;
  let notifications: NotificationsComponent;
  test.beforeEach(async ({ page }) => {
    suites = new SuitesPage(page);
    notifications = new NotificationsComponent(page);
    await suites.goto();
  });
  test('metadata and membership survive editing and reload', async ({ page }) => {
    const name = uniqueName('Regression');
    await suites.fillDetails({
      name,
      description: 'Saved contract checks',
      owner: 'Quality team',
      tags: 'regression, api',
    });
    await suites.setMember(D.lifecycle, true);
    await suites.save();
    await suites.edit(name);
    await expect(suites.owner).toHaveValue('Quality team');
    await suites.updateDescription('Updated contract checks');
    await suites.setMember(D.unauthorized, true);
    await suites.save();
    await expect(suites.card(name)).toContainText('2 tests · revision 2');
    await expect(notifications.toast).toContainText('Changes saved.');
    await notifications.openHistory();
    await expect(notifications.history).toContainText('Changes saved.');
    await expect(notifications.toast).toHaveCount(0, {
      timeout: Timeouts.toast,
    });
    await expect(notifications.history).toContainText('Changes saved.');
    await page.reload();
    await expect(suites.card(name)).toContainText('Updated contract checks');
  });
});
