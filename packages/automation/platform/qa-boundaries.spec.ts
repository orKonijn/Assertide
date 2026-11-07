import { NavigationComponent } from '../ui/components/navigation.component';
import { ApiWorkspacePage } from '../ui/pages/api-workspace.page';
import { ExecutionPage } from '../ui/pages/execution.page';
import { HistoryPage } from '../ui/pages/history.page';
import { ReportsPage } from '../ui/pages/reports.page';
import { SuitesPage } from '../ui/pages/suites.page';
import { ApiRoutes } from '../ui/types/routes';
import { TestData } from '../ui/types/test-data';
import {
  configureLaunchEnvironments,
  PaginatedHistoryFixture,
} from '../ui/utils/qa-boundaries.utils';
import { fitsViewport, viewport } from '../ui/utils/viewport.utils';
import { expect, test } from './fixtures';

test.describe('Approved launch environments', () => {
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
  for (const entry of ['suite', 'api'] as const) {
    test(`${entry} launch completes in an explicitly selected alternate environment`, async ({
      page,
      api,
      isolatedProject,
    }) => {
      await configureLaunchEnvironments(api, isolatedProject.id);
      await api.createSuite(isolatedProject.id, {
        name: isolatedProject.name,
        testIds: [TestData.lifecycle],
      });
      const launch = entry === 'suite' ? suites : workspace;
      await launch.goto();
      await launch.selectEnvironment('qa-alternate');
      await viewport(page, 'mobile');
      expect(await fitsViewport(page)).toBe(true);
      if (entry === 'suite') {
        await suites.run(isolatedProject.name);
      } else {
        await workspace.runSuite();
      }
      await expect(page).toHaveURL(/\/runs\/[^/]+$/);
      const run = await api.waitForCompletion(execution.id());
      expect(run.results.every((result) => result.status === 'passed')).toBe(true);
      expect(await api.get(ApiRoutes.run(run.id))).toMatchObject({
        environment: { id: 'qa-alternate' },
        config: { environmentId: 'qa-alternate' },
      });
    });
  }
  test('no enabled environment explains recovery and disables both launch actions', async ({
    api,
    isolatedProject,
  }) => {
    await configureLaunchEnvironments(api, isolatedProject.id, false);
    await api.createSuite(isolatedProject.id, {
      name: isolatedProject.name,
      testIds: [TestData.lifecycle],
    });
    await suites.goto();
    await expect(suites.unavailable).toBeVisible();
    await expect(suites.runButton(isolatedProject.name)).toBeDisabled();
    await workspace.goto();
    await expect(workspace.unavailable).toBeVisible();
    await expect(workspace.runButton).toBeDisabled();
  });
});

test.describe('Paginated execution evidence', () => {
  let history: HistoryPage;
  let reports: ReportsPage;
  let workspace: ApiWorkspacePage;
  let fixture: PaginatedHistoryFixture;
  test.beforeEach(async ({ page, isolatedProject }) => {
    history = new HistoryPage(page);
    reports = new ReportsPage(page);
    workspace = new ApiWorkspacePage(page);
    await history.goto();
    await new NavigationComponent(page).selectProject(isolatedProject.name);
    fixture = new PaginatedHistoryFixture(isolatedProject.id);
    await fixture.install(page);
  });
  test('report continuation retries safely, reaches old reports and refresh resets its cursor', async () => {
    await reports.goto();
    await expect(reports.rows).toHaveCount(50);
    fixture.failNextPage = true;
    await reports.loadOlder();
    await expect(reports.error).toContainText('Controlled temporary history failure');
    await expect(reports.rows).toHaveCount(50);
    await reports.loadOlder();
    await expect(reports.rows).toHaveCount(100);
    await reports.loadOlder();
    await expect(reports.rows).toHaveCount(101);
    await expect(reports.older).toHaveCount(0);
    await reports.refresh.click();
    await expect(reports.rows).toHaveCount(50);
    expect(fixture.requests.at(-1)?.has('cursor')).toBe(false);
  });
  test('API history filters before pagination and retains selection when older results load', async () => {
    await workspace.goto();
    await expect(workspace.execution).toHaveValue(fixture.rows[50]!.id);
    expect(fixture.requests.at(-1)?.get('browser')).toBe('api');
    await workspace.loadOlder();
    await expect(workspace.executionOption(fixture.rows[100]!.id)).toHaveCount(1);
    await expect(workspace.execution).toHaveValue(fixture.rows[50]!.id);
    await expect(workspace.older).toHaveCount(0);
    await workspace.selectExecution(fixture.rows[100]!.id);
    await expect(workspace.execution).toHaveValue(fixture.rows[100]!.id);
  });
  test('draft filters do not alter continuation or refresh; applying resets history and URL', async ({
    page,
  }) => {
    await history.goto();
    await expect(history.rows).toHaveCount(50);
    await history.editPhase('canceled');
    await history.loadOlder();
    await expect(history.rows).toHaveCount(100);
    expect(fixture.requests.at(-1)?.get('phase')).toBe('all');
    await history.refresh.click();
    await expect(history.rows).toHaveCount(50);
    expect(fixture.requests.at(-1)?.get('phase')).toBe('all');
    expect(fixture.requests.at(-1)?.has('cursor')).toBe(false);
    await history.apply.click();
    await expect(page).toHaveURL(/phase=canceled/);
    await expect(history.rows).toHaveCount(50);
    await expect(history.rows.first()).toContainText('canceled');
    expect(fixture.requests.at(-1)?.has('cursor')).toBe(false);
    await history.loadOlder();
    await expect(history.rows).toHaveCount(51);
    await expect(history.rows).not.toContainText(['completed']);
    await expect(history.older).toHaveCount(0);
  });
});
