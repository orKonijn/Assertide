import type { Page, Response } from '@playwright/test';

import { RegistrationSelectors as S } from '../types/registration.selectors';
import { registerSecret, workflow } from '../utils/allure.utils';

export class RegistrationPage {
  public readonly heading;
  public readonly pending;
  public readonly welcome;
  public readonly alert;
  private verificationUrl = '';
  public constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Create your workspace.' });
    this.pending = page.getByRole('heading', { name: 'Verify your email', exact: true });
    this.welcome = page.getByRole('heading', { name: S.welcome });
    this.alert = page.getByRole('alert');
  }
  public goto(): Promise<Response | null> {
    return workflow('Open account registration', () => this.page.goto(S.registerRoute));
  }
  public openProvider(): Promise<void> {
    return workflow('Continue to provider-hosted registration', () =>
      this.page.getByRole('link', { name: S.continue, exact: true }).click(),
    );
  }
  public submit(name: string, email: string, password: string): Promise<void> {
    return workflow('Submit synthetic registration to the local provider', async () => {
      registerSecret(password);
      await this.page.getByLabel(S.name, { exact: true }).fill(name);
      await this.page.getByLabel(S.email, { exact: true }).fill(email);
      await this.page.getByLabel(S.password, { exact: true }).fill(password);
      await this.page.getByRole('button', { name: S.create, exact: true }).click();
    });
  }
  public resend(): Promise<void> {
    return workflow('Request another verification email', () =>
      this.page.getByRole('button', { name: 'Resend verification email', exact: true }).click(),
    );
  }
  public verify(): Promise<void> {
    return workflow('Verify through the private synthetic mailbox', async () => {
      await this.page.getByRole('link', { name: S.mailbox, exact: true }).click();
      const link = this.page.getByRole('link', { name: S.verify, exact: true });
      this.verificationUrl = new URL((await link.getAttribute('href'))!, this.page.url()).href;
      registerSecret(this.verificationUrl);
      await link.click();
      await this.page.getByRole('link', { name: S.resume, exact: true }).click();
    });
  }
  public async reusedLinkStatus(): Promise<number> {
    return (await this.page.request.get(this.verificationUrl)).status();
  }
  public dashboard(): Promise<void> {
    return workflow('Finish onboarding', () =>
      this.page.getByRole('button', { name: 'Go to dashboard', exact: true }).click(),
    );
  }
  public async rejectedMailboxStatus(): Promise<number> {
    return (
      await this.page.request.get(
        new URL('/interaction/not-this-session/mail', this.page.url()).href,
      )
    ).status();
  }
  public async keyboardOpenProvider(): Promise<void> {
    const link = this.page.getByRole('link', { name: S.continue, exact: true });
    await link.focus();
    await link.press('Enter');
  }
}
