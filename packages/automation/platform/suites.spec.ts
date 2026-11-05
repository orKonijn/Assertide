import { NavigationComponent } from '../ui/components/navigation.component';
import { NotificationsComponent } from '../ui/components/notifications.component';
import { SuitesPage } from '../ui/pages/suites.page';
import { TestData as D } from '../ui/types/test-data';
import { uniqueName } from '../ui/utils/test-data.utils';
import { expect, test } from './fixtures';
test.describe('Saved suites', () => {
  let suites: SuitesPage;
  let notifications: NotificationsComponent;
  test.beforeEach(async ({ page, isolatedProject }) => {
    suites = new SuitesPage(page);
    notifications = new NotificationsComponent(page);
    await suites.goto();
    await new NavigationComponent(page).selectProject(isolatedProject.name);
    await suites.goto();
  });
  test('suite dialog selects matching types across pages and dismisses with Escape', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await suites.createWithType('api');
    const before = await suites.filterLayout();
    expect(Math.abs(before.searchTop - before.typeTop)).toBeLessThanOrEqual(1);
    expect(before.searchHeight).toBe(before.typeHeight);
    await suites.fillDetails({ name: 'Draft only', description: '', owner: 'Fixture', tags: '' });
    const after = await suites.filterLayout();
    expect(Math.abs(before.panelHeight - after.panelHeight)).toBeLessThanOrEqual(1);
    await expect(suites.dialog()).toContainText('65 selected');
    await page.keyboard.press('Escape');
    await expect(suites.dialog()).not.toBeVisible();
  });
  test('selected-only with an empty draft explains how to choose tests', async () => {
    await suites.openBuilder();
    await suites.showSelectedOnly();
    await expect(suites.emptySelection()).toBeVisible();
    await suites.showAllTests();
    await expect(suites.membership('LAB-001')).not.toBeChecked();
    await expect(suites.dialog()).toContainText('0 selected');
  });
  test('bulk selection works even when the selected-only review is empty', async () => {
    await suites.openBuilder();
    await suites.showSelectedOnly();
    await suites.selectMatchingTests();
    await expect(suites.membership('LAB-001')).toBeChecked();
    await expect(suites.emptySelection()).toHaveCount(0);
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
    await expect(suites.card(name)).toContainText('2 tests');
    await expect(suites.card(name)).toContainText('Revision 2');
    await expect(notifications.badge).toHaveText('2');
    await expect(notifications.history).not.toBeVisible();
    await notifications.openHistory();
    await expect(notifications.history).toContainText('Changes saved.');
    await expect(notifications.badge).toHaveCount(0);
    await notifications.dismissOutside();
    await expect(notifications.history).not.toBeVisible();
    await notifications.openHistory();
    await notifications.dismissWithEscape();
    await expect(notifications.history).not.toBeVisible();
    await notifications.openHistory();
    await expect(notifications.history).toContainText('Changes saved.');
    await page.reload();
    await expect(suites.card(name)).toContainText('Updated contract checks');
  });
});
