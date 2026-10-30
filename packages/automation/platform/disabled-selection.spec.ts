import { NavigationComponent } from '../ui/components/navigation.component';
import { ApiWorkspacePage } from '../ui/pages/api-workspace.page';
import { ExecutionPage } from '../ui/pages/execution.page';
import { SuitesPage } from '../ui/pages/suites.page';
import { TestData as D } from '../ui/types/test-data';
import { expect, test } from './fixtures';
test.describe('Disabled selection policies', () => {
  test.setTimeout(90000);
  let suites: SuitesPage;
  let workspace: ApiWorkspacePage;
  let execution: ExecutionPage;
  test.beforeEach(async ({ page, isolatedProject }) => {
    suites = new SuitesPage(page);
    workspace = new ApiWorkspacePage(page);
    execution = new ExecutionPage(page);
    await suites.goto();
    await new NavigationComponent(page).selectProject(isolatedProject.name);
  });
  test('disabled saved members can be removed and remaining members run', async ({
    page,
    api,
    isolatedProject,
  }) => {
    const name = isolatedProject.name;
    await api.createSuite(isolatedProject.id, {
      name,
      testIds: [D.lifecycle, D.unauthorized],
    });
    await api.setEnabled(isolatedProject.id, [D.lifecycle], false);
    await suites.goto();
    await suites.edit(name);
    await expect(suites.membership(D.lifecycle)).toBeChecked();
    await expect(suites.membership(D.lifecycle)).toBeEnabled();
    await suites.setMember(D.lifecycle, false);
    await expect(suites.membership(D.lifecycle)).toBeDisabled();
    await suites.save();
    await expect(suites.card(name)).toContainText(/1 tests .* revision 2/);
    await suites.run(name);
    await expect(page).toHaveURL(/\/runs\/[^/]+$/);
    expect((await api.waitForCompletion(execution.id())).selection.testIds).toEqual([
      D.unauthorized,
    ]);
  });
  test('API launch excludes disabled cases', async ({ page, api, isolatedProject }) => {
    await api.setEnabled(isolatedProject.id, [D.lifecycle], false);
    const enabledApiIds = (await api.catalog(isolatedProject.id)).items
      .filter((item) => item.kind === 'api' && item.enabled)
      .map((item) => item.id);
    await workspace.goto();
    await expect(workspace.executableCount(enabledApiIds.length)).toBeVisible();
    await workspace.runSuite();
    await expect(page).toHaveURL(/\/runs\/[^/]+$/);
    const run = await api.waitForCompletion(execution.id());
    expect([...run.selection.testIds].sort()).toEqual([...enabledApiIds].sort());
    expect(run.selection.testIds).not.toContain(D.lifecycle);
  });
  test('empty executable selection disables launch', async ({ api, isolatedProject }) => {
    const apiIds = (await api.catalog(isolatedProject.id)).items
      .filter((item) => item.kind === 'api')
      .map((item) => item.id);
    await api.setEnabled(isolatedProject.id, apiIds, false);
    await workspace.goto();
    await expect(workspace.executableCount(0)).toBeVisible();
    await expect(workspace.runButton).toBeDisabled();
  });
});
