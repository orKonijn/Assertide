import type { Page, Response } from '@playwright/test';

import { ReportsSelectors as S } from '../types/reports.selectors';
import { Routes } from '../types/routes';

export class ReportsPage {
  public readonly rows;
  public readonly older;
  public readonly refresh;
  public readonly error;
  public constructor(private readonly page: Page) {
    this.rows = page.locator(S.rows);
    this.older = page.getByRole('button', { name: S.older, exact: true });
    this.refresh = page.getByRole('button', { name: S.refresh, exact: true });
    this.error = page.getByRole('alert');
  }
  public goto(): Promise<Response | null> {
    return this.page.goto(Routes.reports);
  }
  public loadOlder(): Promise<void> {
    return this.older.click();
  }
}
