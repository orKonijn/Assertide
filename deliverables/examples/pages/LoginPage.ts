import { Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}
  async signIn(username: string, password: string) {
    await this.page.goto('/');
    await this.page.getByTestId('username').fill(username);
    await this.page.getByTestId('password').fill(password);
    await this.page.getByTestId('login-button').click();
    await expect(this.page).toHaveURL(/\/inventory\.html$/);
  }
}
