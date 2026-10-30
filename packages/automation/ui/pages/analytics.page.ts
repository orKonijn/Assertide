import type { Download, Locator, Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { AnalyticsSelectors as S } from '../types/analytics.selectors';
import { Routes } from '../types/routes';
import { workflow } from '../utils/allure.utils';
export class AnalyticsPage {
  public readonly heading;
  public readonly browser;
  public readonly dateColumn;
  public readonly comparison;
  public constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: S.heading, exact: true });
    this.browser = page.getByLabel(S.browser, { exact: true });
    this.dateColumn = page.getByRole('columnheader', {
      name: S.date,
      exact: true,
    });
    this.comparison = page.getByRole('heading', {
      name: S.comparison,
      exact: true,
    });
  }
  public goto(): Promise<Response | null> {
    return workflow('Open quality overview', () => this.page.goto(Routes.overview));
  }
  public period(days: number): Locator {
    return this.page.getByRole('heading', {
      name: S.period(days),
      exact: true,
    });
  }
  public filter(days: number, browser: string): Promise<void> {
    return workflow('Apply analytics filters', async () => {
      const panel = this.page.locator('details.history-filters');
      if (!(await panel.evaluate((element) => element.hasAttribute('open')))) {
        await panel.locator('summary').click();
      }
      await this.page.getByLabel(S.window, { exact: true }).selectOption({ label: `${days} days` });
      await this.browser.selectOption(browser);
      await this.page.getByRole('button', { name: S.apply, exact: true }).click();
    });
  }
  public showData(): Promise<void> {
    return this.page.getByText(S.table, { exact: true }).click();
  }
  public saveFilters(): Promise<void> {
    return workflow('Save personal analytics filters', () =>
      this.page.getByRole('button', { name: S.save, exact: true }).click(),
    );
  }
  public resetFilters(): Promise<void> {
    return this.page.getByRole('button', { name: S.reset, exact: true }).click();
  }
  public restoreFilters(): Promise<void> {
    return this.page.getByRole('button', { name: S.restore, exact: true }).click();
  }
  public async export(): Promise<Download> {
    return workflow('Export metrics JSON', async () => {
      const download = this.page.waitForEvent('download');
      await this.page.getByRole('button', { name: S.export, exact: true }).click();
      return download;
    });
  }
}
