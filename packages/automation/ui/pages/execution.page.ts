import type { Locator, Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { ExecutionSelectors as S } from '../types/execution.selectors';
import { Routes } from '../types/routes';
import { workflow } from '../utils/allure.utils';
import { AllureReportPage } from './report.page';
export class ExecutionPage {
  public readonly status;
  public readonly reportLink;
  public readonly rerunDialog;
  public readonly startRerunButton;
  public readonly screenshotButton;
  public readonly screenshotDialog;
  public readonly download;
  public constructor(private readonly page: Page) {
    this.status = page.getByRole(S.status).first();
    this.reportLink = page.getByRole('link', {
      name: S.openReport,
      exact: true,
    });
    this.rerunDialog = page.getByRole('dialog', { name: S.rerunDialog });
    this.startRerunButton = page.getByRole('button', {
      name: S.startRerun,
      exact: true,
    });
    this.screenshotButton = page.getByRole('button', {
      name: S.screenshot,
      exact: true,
    });
    this.screenshotDialog = page.getByRole('dialog', {
      name: S.screenshotDialog,
      exact: true,
    });
    this.download = page.getByRole('link', { name: S.download });
  }
  public goto(id: string, result?: string): Promise<Response | null> {
    return workflow('Open execution', () =>
      this.page.goto(result ? Routes.result(id, result) : Routes.run(id)),
    );
  }
  public id(): string {
    return new URL(this.page.url()).pathname.split('/').at(-1)!;
  }
  public heading(id: string): Locator {
    return this.page.getByRole('heading', { name: S.heading(id), exact: true });
  }
  public outcome(id: string, status: string): Locator {
    return this.page.getByText(`${id} · ${status}`, { exact: false });
  }
  public section(
    name: typeof S.results | typeof S.report | typeof S.environment | typeof S.history,
  ): Locator {
    return this.page
      .locator(S.section)
      .filter({ has: this.page.getByRole('heading', { name, exact: true }) });
  }
  public openResult(id: string, status = 'passed'): Promise<void> {
    return workflow('Inspect test result', () => this.outcome(id, status).click());
  }
  public openScreenshot(): Promise<void> {
    return workflow('Inspect attempt screenshot', () => this.screenshotButton.click());
  }
  public screenshotWidth(): Promise<number> {
    return this.screenshotDialog
      .locator(S.image)
      .evaluate((image: HTMLImageElement) => image.naturalWidth);
  }
  public closeScreenshot(): Promise<void> {
    return this.page.keyboard.press('Escape');
  }
  public rebuildReport(): Promise<void> {
    return workflow('Rebuild Allure report', () =>
      this.page.getByRole('button', { name: S.rebuild, exact: true }).click(),
    );
  }
  public cancel(): Promise<void> {
    return workflow('Cancel active execution', async () => {
      this.page.once('dialog', (dialog) => dialog.accept());
      await this.page.getByRole('button', { name: S.cancel, exact: true }).click();
    });
  }
  public reviewRerun(id: string): Promise<void> {
    return workflow('Review selected rerun', async () => {
      await this.page.getByRole('checkbox', { name: S.selectRerun(id), exact: true }).check();
      await this.page.getByRole('button', { name: S.rerunChecked, exact: true }).click();
    });
  }
  public startRerun(): Promise<void> {
    return workflow('Start reviewed rerun', () => this.startRerunButton.click());
  }
  public async openReport(): Promise<AllureReportPage> {
    return workflow('Open generated Allure report', async () => {
      const popup = this.page.waitForEvent('popup');
      await this.reportLink.click();
      return new AllureReportPage(await popup);
    });
  }
  public openHistory(id: string): Promise<void> {
    return workflow('Open compatible historical execution', () =>
      this.page.getByRole('link', { name: id.slice(0, 8), exact: true }).click(),
    );
  }
  public addNote(note: string): Promise<void> {
    return workflow('Add investigation note', async () => {
      await this.page.getByLabel(S.diagnosis, { exact: true }).fill(note);
      await this.page.getByRole('button', { name: S.addNote, exact: true }).click();
    });
  }
  public note(value: string): Locator {
    return this.page.getByText(value, { exact: true });
  }
}
