import { NavigationComponent } from '../ui/components/navigation.component';
import { ApiWorkspacePage } from '../ui/pages/api-workspace.page';
import { CatalogPage } from '../ui/pages/catalog.page';
import { ExecutionPage } from '../ui/pages/execution.page';
import { RunWorkflowsPage } from '../ui/pages/run-workflows.page';
import { TestData as D } from '../ui/types/test-data';
import { fitsViewport, viewport } from '../ui/utils/viewport.utils';
import { expect, test } from './fixtures';
test.describe('Explorer and investigation workflows', () => {
  let catalog: CatalogPage;
  let workflows: RunWorkflowsPage;
  test.beforeEach(async ({ page, isolatedProject }) => {
    catalog = new CatalogPage(page);
    workflows = new RunWorkflowsPage(page);
    await catalog.goto();
    await new NavigationComponent(page).selectProject(isolatedProject.name);
    await catalog.goto();
  });
  test('saved views restore filters and grouping without clearing selected cases', async ({
    page,
  }) => {
    await catalog.select([D.lifecycle]);
    await catalog.search(D.lifecycle);
    await workflows.group('feature');
    await workflows.history('never');
    await expect(catalog.selection(D.lifecycle)).toBeVisible();
    await workflows.saveView('Never run API');
    await workflows.clearFilters();
    await workflows.group('none');
    await page.reload();
    await workflows.restoreView('Never run API');
    await expect(workflows.historyFilter()).toHaveValue('never');
    await expect(workflows.grouping()).toHaveValue('feature');
    await expect(catalog.selection(D.lifecycle)).toBeChecked();
    await catalog.openConfiguration();
    await expect(workflows.configuration()).toContainText('Not enough history');
    await viewport(page, 'mobile');
    expect(await fitsViewport(page)).toBe(true);
    await workflows.closeConfiguration();
    await expect(catalog.startButtons.first()).toBeFocused();
  });
  test('recorded outcomes populate history, support comparison and open private API evidence', async ({
    page,
    api,
    isolatedProject,
  }) => {
    const prior = await api.completed([D.lifecycle], isolatedProject.id);
    const run = await api.completed([D.lifecycle], isolatedProject.id);
    await catalog.goto();
    await catalog.search(D.lifecycle);
    await workflows.history('never');
    await expect(catalog.cases).toHaveCount(0);
    await workflows.clearFilters();
    await catalog.search(D.lifecycle);
    await expect(catalog.cases).toHaveCount(1);
    const execution = new ExecutionPage(page);
    await execution.goto(run.id);
    await workflows.filter('Passed');
    await execution.openResult(D.lifecycle);
    await expect(workflows.panel()).toBeVisible();
    await workflows.inspectApi();
    await expect(workflows.panel()).toContainText('"method": "POST"');
    await viewport(page, 'mobile');
    expect(await fitsViewport(page)).toBe(true);
    await workflows.closePanel();
    await expect(execution.outcome(D.lifecycle, 'passed')).toBeFocused();
    await workflows.openComparison();
    await expect(workflows.comparison()).toContainText(prior.id.slice(0, 8));
  });
  test('API workspace refreshes an active run into finalized evidence without reselection', async ({
    page,
    api,
    isolatedProject,
  }) => {
    const catalogData = await api.catalog(isolatedProject.id);
    const run = await api.launch(
      catalogData.items.filter((item) => item.id.startsWith('LAB-')).map((item) => item.id),
      isolatedProject.id,
    );
    const workspace = new ApiWorkspacePage(page);
    await workspace.goto();
    await workspace.selectExecution(run.id);
    await api.waitForCompletion(run.id);
    await expect(workspace.executionOption(run.id)).toContainText('completed', { timeout: 15000 });
    await expect(workspace.exchanges).toHaveCount(10);
    await workspace.openFirstExchange();
    await expect(workspace.evidence).toContainText('"request":');
    const evidence = await workspace.evidence.innerText();
    await workflows.refreshWorkspace();
    await expect(workspace.evidence).toHaveText(evidence);
  });
});
