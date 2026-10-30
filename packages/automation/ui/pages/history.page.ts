import type { Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { HistorySelectors as S } from '../types/analytics.selectors';
import { Routes } from '../types/routes';
import { workflow } from '../utils/allure.utils';
export class HistoryPage {
  public readonly created;
  public readonly sort;
  public readonly sortButton;
  public readonly apply;
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
  }
  public goto(): Promise<Response | null> {
    return workflow('Open execution history', () => this.page.goto(Routes.runs));
  }
  public filter(phase: string, browser: string): Promise<void> {
    return workflow('Filter execution history', async () => {
      await this.page.getByLabel(S.phase, { exact: true }).selectOption(phase);
      await this.page.getByLabel(S.browser, { exact: true }).selectOption(browser);
      await this.apply.click();
    });
  }
  public async sortWithKeyboard(): Promise<void> {
    await this.sortButton.focus();
    await this.page.keyboard.press('Enter');
  }
}
