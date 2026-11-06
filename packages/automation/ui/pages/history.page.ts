import type { Locator, Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { HistorySelectors as S } from '../types/analytics.selectors';
import { Routes } from '../types/routes';
import { workflow } from '../utils/allure.utils';
export class HistoryPage {
  public readonly created;
  public readonly sort;
  public readonly sortButton;
  public readonly apply;
  public readonly rows;
  public readonly older;
  public readonly refresh;
  public readonly phase;
  public constructor(private readonly page: Page) {
    this.created = page.getByRole('columnheader', {
      name: S.created,
      exact: true,
    });
    this.sort = page.getByRole('columnheader', {
      name: S.selected,
      exact: true,
    });
    this.sortButton = this.sort.getByRole('button');
    this.apply = page.getByRole('button', { name: S.apply, exact: true });
    this.rows = page.locator(S.rows);
    this.older = page.getByRole('button', { name: S.older, exact: true });
    this.refresh = page.getByRole('button', { name: S.refresh, exact: true });
    this.phase = page.getByLabel(S.phase, { exact: true });
  }
  public goto(): Promise<Response | null> {
    return workflow('Open execution history', () => this.page.goto(Routes.runs));
  }
  public filter(phase: string, browser: string): Promise<void> {
    return workflow('Filter execution history', async () => {
      const filters = this.page.locator(S.filters);
      if (!(await filters.evaluate((el) => el.hasAttribute('open')))) {
        await filters.locator('summary').click();
      }
      await this.page.getByLabel(S.phase, { exact: true }).selectOption(phase);
      await this.page.getByLabel(S.browser, { exact: true }).selectOption(browser);
      await this.apply.click();
    });
  }
  public filterPanel(): Locator {
    return this.page.locator(S.filters);
  }
  public noResults(): Locator {
    return this.page.getByText(S.noResults, { exact: true });
  }
  public toggleFilters(): Promise<void> {
    return this.filterPanel().locator('summary').click();
  }
  public async sortWithKeyboard(): Promise<void> {
    await this.sortButton.focus();
    await this.page.keyboard.press('Enter');
  }
  public async editPhase(value: string): Promise<void> {
    if (!(await this.filterPanel().evaluate((element) => element.hasAttribute('open')))) {
      await this.toggleFilters();
    }
    await this.phase.selectOption(value);
  }
  public loadOlder(): Promise<void> {
    return this.older.click();
  }
}
