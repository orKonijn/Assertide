import type { Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { AuthenticationSelectors as S } from '../types/authentication.selectors';
import { Routes } from '../types/routes';
import { registerSecret, workflow } from '../utils/allure.utils';
export class LoginPage {
  public readonly signInLink;
  private readonly password;
  private readonly account;
  public constructor(private readonly page: Page) {
    this.signInLink = page.getByRole('link', { name: S.sso });
    this.password = page.getByLabel(S.password, { exact: true });
    this.account = page.getByRole('combobox', { name: S.account, exact: true });
  }
  public goto(route: string = Routes.overview): Promise<Response | null> {
    return workflow('Open sign-in entry', () => this.page.goto(route));
  }
  public openSso(): Promise<void> {
    return workflow('Continue to single sign-on', () => this.signInLink.click());
  }
  public signIn(password: string, account = 'admin'): Promise<void> {
    return workflow(`Sign in as ${account}`, async () => {
      await this.account.selectOption(account);
      registerSecret(password);
      await this.password.fill(password);
      await this.page.getByRole('button', { name: S.signIn, exact: true }).click();
    });
  }
  public async login(
    password: string,
    account = 'admin',
    route: string = Routes.overview,
  ): Promise<void> {
    await this.goto(route);
    await this.openSso();
    await this.signIn(password, account);
  }
  public signOut(): Promise<void> {
    return workflow('Sign out of Assertide', () =>
      this.page.getByRole('button', { name: S.signOut, exact: true }).click(),
    );
  }
}
