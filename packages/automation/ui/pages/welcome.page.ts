import type { Page, Response } from '@playwright/test';

import { WelcomeSelectors as S } from '../types/welcome.selectors';

export class WelcomePage {
  public readonly heading;
  public readonly signIn;
  public readonly create;
  public readonly guest;
  public readonly notice;
  public constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: S.heading, exact: true });
    this.signIn = page.getByRole('link', { name: S.signIn, exact: true });
    this.create = page.getByRole('link', { name: S.create, exact: true });
    this.guest = page.getByRole('button', { name: S.guest, exact: true });
    this.notice = page.locator(S.notice);
  }
  public async mockAvailability(failed: boolean): Promise<void> {
    await this.page.route('**/v1/me', (route) =>
      route.fulfill({ status: failed ? 502 : 401, json: {} }),
    );
    await this.page.route('**/auth/options', (route) =>
      route.fulfill({ status: failed ? 502 : 200, json: { registration: true } }),
    );
  }
  public goto(): Promise<Response | null> {
    return this.page.goto('/');
  }
  public async retryConnection(): Promise<void> {
    await this.page.getByRole('button', { name: S.retry, exact: true }).click();
  }
  public async retryOptions(): Promise<void> {
    await this.page.getByRole('button', { name: S.retryOptions, exact: true }).click();
  }
  public async themeByKeyboard(): Promise<void> {
    const button = this.page.getByRole('button', { name: S.theme, exact: true });
    await button.focus();
    await button.press('Enter');
  }
}
