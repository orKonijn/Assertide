import type { Page, Response } from '@playwright/test';

export class PublicProfilePage {
  public readonly creator;
  public readonly source;
  public readonly unavailable;
  public constructor(private readonly page: Page) {
    this.creator = page.getByRole('heading', { name: 'Or Konijn', exact: true });
    this.source = page.getByRole('link', { name: 'View source on GitHub' });
    this.unavailable = page
      .getByRole('status')
      .filter({ hasText: 'New accounts are currently unavailable' });
  }
  public async availability(enabled: boolean, identityStatus = 401): Promise<void> {
    await this.page.route('**/v1/me', (route) =>
      route.fulfill({ status: identityStatus, json: {} }),
    );
    await this.page.route('**/auth/options', (route) =>
      route.fulfill({ json: { registration: enabled } }),
    );
  }
  public goto(): Promise<Response | null> {
    return this.page.goto('/about');
  }
  public async openFromWelcome(): Promise<void> {
    await this.page.getByRole('link', { name: 'About the creator & architecture' }).click();
  }
  public async openFromGuest(): Promise<void> {
    await this.page
      .getByRole('region', { name: 'Demo access' })
      .getByRole('link', { name: 'About Assertide' })
      .click();
  }
  public async returnToDemo(): Promise<void> {
    await this.page.getByRole('link', { name: 'Back to demo', exact: true }).click();
  }
  public async openRegistration(): Promise<void> {
    await this.page.goto('/register');
  }
}
