import type { Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { Routes } from '../types/routes';
import { SettingsSelectors as S } from '../types/settings.selectors';
import { workflow } from '../utils/allure.utils';
export class OperationsPage {
  public readonly card;
  public readonly status;
  public readonly refreshButton;
  public constructor(private readonly page: Page) {
    this.card = page.locator(S.section).filter({
      has: page.getByRole('heading', { name: S.health, exact: true }),
    });
    this.status = this.card.getByRole('status');
    this.refreshButton = this.card.getByRole('button', { name: S.refresh });
  }
  public goto(): Promise<Response | null> {
    return workflow('Open service operations', () => this.page.goto(Routes.settings));
  }
  public refresh(): Promise<void> {
    return workflow('Refresh dependency health', () => this.refreshButton.click());
  }
}
