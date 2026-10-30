import { createHash } from 'node:crypto';

import { ExecutionPage } from '../ui/pages/execution.page';
import { LoginPage } from '../ui/pages/login.page';
import { AllureReportPage } from '../ui/pages/report.page';
import { ApiRoutes } from '../ui/types/routes';
import { TestData as D, Timeouts } from '../ui/types/test-data';
import { localPassword } from '../ui/utils/credentials.utils';
import { removeLocalRawCopy, reportMetadata } from '../ui/utils/file.utils';
import { uniqueName } from '../ui/utils/test-data.utils';
import { fitsViewport, viewport } from '../ui/utils/viewport.utils';
import { expect, test } from './fixtures';
test.use({ storageState: { cookies: [], origins: [] } });
test.describe('Allure report history', () => {
  test.setTimeout(120000);
  let execution: ExecutionPage;
  test.beforeEach(async ({ page }) => {
    execution = new ExecutionPage(page);
    await new LoginPage(page).login(await localPassword());
    await expect(new LoginPage(page).signInLink).toHaveCount(0);
  });
  test('compatible history and restored raw evidence rebuild without duplicate entries', async ({
    page,
    api,
    isolatedProject,
  }) => {
    const first = await api.readyReport(D.historyIds, isolatedProject.id);
    const second = await api.readyReport(D.historyIds, isolatedProject.id);
    const comparison = await api.get<{ previous: { runId: string } }>(
      ApiRoutes.previous(second.id, second.results[0]!.id),
    );
    expect(comparison.previous.runId).toBe(first.id);
    expect(second.historyStream).toBe(first.historyStream);
    expect(second.historyEntries).toBe(first.historyEntries + 1);
    const lineage = await api.get<{ items: { runId: string }[] }>(ApiRoutes.history(second.id));
    expect(lineage.items.some((item) => item.runId === first.id)).toBe(true);
    await execution.goto(second.id);
    await execution.openHistory(first.id);
    await expect(page).toHaveURL(new RegExp(`/runs/${first.id}$`));
    await expect(execution.heading(first.id)).toBeVisible();
    if (first.rawArchive) {
      await removeLocalRawCopy(first.id);
    }
    await execution.rebuildReport();
    await expect
      .poll(async () => (await api.run(first.id)).historyVersion, {
        timeout: Timeouts.report,
      })
      .toBeGreaterThan(second.historyVersion);
    const rebuilt = await api.run(first.id);
    expect(rebuilt.historyEntries).toBe(second.historyEntries);
    expect(rebuilt.results).toEqual(first.results);
    expect(rebuilt.reportDirectory).not.toBe(first.reportDirectory);
    const report = new AllureReportPage(await page.context().newPage());
    await report.goto(first.id);
    expect(report.url()).toMatch(/localhost:4012\/reports\//);
    await expect(report.expandButton).toBeVisible();
    await report.close();
  });
  test('report ZIP is authenticated and matches its recorded checksum and toolchain', async ({
    page,
    api,
    browser,
  }) => {
    const run = await api.readyReport(D.historyIds);
    const download = await page.request.get(ApiRoutes.download(run.id));
    expect(download.status()).toBe(200);
    const archive = await download.body();
    expect(archive.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(createHash('sha256').update(archive).digest('hex')).toBe(
      download.headers()['x-checksum-sha256'],
    );
    expect(download.headers()['x-report-generation']).toBe(run.reportDirectory);
    const anonymous = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    try {
      expect((await anonymous.request.get(D.origin + ApiRoutes.download(run.id))).status()).toBe(
        401,
      );
    } finally {
      await anonymous.close();
    }
    expect(run.toolchain.playwright).toBe('1.64.1');
    expect(run.results[0]!.attempts[0]!.steps.length).toBeGreaterThan(0);
    const raw = await reportMetadata(run.id);
    expect(raw.environment).toContain('Playwright=1.64.1');
    expect(raw.result.labels.some((label) => label.name === 'severity')).toBe(true);
    await execution.goto(run.id);
    await expect(execution.reportLink).toBeVisible({
      timeout: Timeouts.report,
    });
    const report = await execution.openReport();
    await report.expand();
    await expect(report.testTitle('LAB-002 Missing authentication')).toBeVisible();
    const login = new LoginPage(page);
    await login.signOut();
    await expect(login.signInLink).toBeVisible();
    expect(await report.responseStatus()).toBe(403);
    await report.close();
  });
  test('browser workflow screenshots are published in the authenticated Allure viewer', async ({
    page,
    api,
  }) => {
    const run = await api.readyReport([D.login]);
    const report = new AllureReportPage(await page.context().newPage());
    try {
      await report.goto(run.id);
      await report.expand();
      await report.openStepScreenshot(
        'UI-001 Valid login unlocks catalog',
        'Sign in to controlled storefront',
      );
      await expect(report.screenshotImage()).toBeVisible();
      await expect
        .poll(() =>
          report.screenshotImage().evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
    } finally {
      await report.close();
    }
  });
  test('investigation notes survive reload and report environment remains accessible on mobile', async ({
    page,
    api,
  }) => {
    const run = await api.readyReport(D.historyIds);
    await execution.goto(run.id, run.results[0]!.id);
    const note = uniqueName('Investigation: verified recorded request contract');
    await execution.addNote(note);
    await expect(execution.note(note)).toBeVisible();
    await page.reload();
    await expect(execution.note(note)).toBeVisible();
    await expect(execution.download).toBeVisible();
    await expect(execution.section('Execution environment')).toBeVisible();
    await viewport(page, 'mobile');
    expect(await fitsViewport(page)).toBe(true);
  });
});
