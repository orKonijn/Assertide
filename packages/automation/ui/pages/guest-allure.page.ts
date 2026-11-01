import type { Locator, Page } from '@playwright/test';

export class GuestAllurePage {
  public constructor(private readonly page: Page) {}
  public content(): Locator {
    return this.page.locator('body');
  }
  public async openFailure(): Promise<void> {
    await this.page.getByText('Checkout displays delivery estimate', { exact: true }).click();
  }
}
