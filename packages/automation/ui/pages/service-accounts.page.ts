import type { Locator, Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { Routes } from '../types/routes';
import { SettingsSelectors as S } from '../types/settings.selectors';
import { registerSecret, workflow } from '../utils/allure.utils';
export class ServiceAccountsPage {
  public constructor(private readonly page: Page) {}
  public goto(): Promise<Response | null> {
    return workflow('Open CI account administration', () => this.page.goto(Routes.settings));
  }
  public card(name: string): Locator {
    return this.page
      .locator(S.article)
      .filter({ has: this.page.getByRole('heading', { name, exact: true }) });
  }
  public revokeButton(name: string): Locator {
    return this.page.getByRole('button', { name: S.revoke(name), exact: true });
  }
  public create(name: string): Promise<string> {
    return workflow('Create CI credential', async () => {
      await this.page.getByLabel(S.accountName, { exact: true }).fill(name);
      await this.page.getByRole('button', { name: S.createToken, exact: true }).click();
      return this.readAndHideToken();
    });
  }
  public rotate(name: string): Promise<string> {
    return workflow('Rotate CI credential', async () => {
      this.page.once('dialog', (dialog) => dialog.accept());
      await this.page.getByRole('button', { name: S.rotate(name), exact: true }).click();
      return this.readAndHideToken();
    });
  }
  public revoke(name: string): Promise<number> {
    return workflow('Revoke CI credential', async () => {
      this.page.once('dialog', (dialog) => dialog.accept());
      const response = this.page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().endsWith('/revoke'),
      );
      await this.revokeButton(name).click();
      return (await response).status();
    });
  }
  private async readAndHideToken(): Promise<string> {
    const token = await this.page.getByLabel(S.token, { exact: true }).inputValue();
    await this.page.getByRole('button', { name: S.hide, exact: true }).click();
    registerSecret(token);
    return token;
  }
}
