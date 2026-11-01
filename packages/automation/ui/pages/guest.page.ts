import type { Locator, Page, Response } from '@playwright/test';

import { RegistrationSelectors as S } from '../types/registration.selectors';
import { workflow } from '../utils/allure.utils';

export class GuestPage {
  public readonly label;
  public readonly heading;
  public readonly restriction;
  public readonly expired;
  public constructor(private readonly page: Page) {
    this.label = page.getByText(S.demoLabel, { exact: true });
    this.heading = page.getByRole('heading', { level: 1 });
    this.restriction = page.getByRole('heading', { name: 'Account required' });
    this.expired = page.getByRole('status').filter({ hasText: 'Your guest demo expired' });
  }
  public goto(): Promise<Response | null> {
    return workflow('Open guest entry', () => this.page.goto('/'));
  }
  public enter(): Promise<void> {
    return workflow('Explore synthetic demo', async () => {
      await this.page.getByRole('button', { name: S.guest, exact: true }).click();
      await this.label.waitFor({ state: 'visible' });
    });
  }
  public open(section: string): Promise<void> {
    return workflow(`Browse demo ${section}`, async () => {
      await this.revealNavigation();
      await this.page
        .getByRole('navigation', { name: S.demoNavigation })
        .getByRole('button', { name: section, exact: true })
        .click();
    });
  }
  public restrict(action: string): Promise<void> {
    return workflow('Inspect a restricted demo action', () =>
      this.page.getByRole('button', { name: action, exact: true }).click(),
    );
  }
  public leave(): Promise<void> {
    return workflow('Leave guest mode', async () => {
      await this.revealNavigation();
      await this.page.getByRole('button', { name: S.leave, exact: true }).click();
    });
  }
  public reload(): Promise<Response | null> {
    return this.page.reload();
  }
  public async expire(): Promise<void> {
    await this.page.evaluate(
      (key) => localStorage.setItem(key, String(Date.now() - 1)),
      S.expiryKey,
    );
    await this.page.reload();
  }
  public createAccount(): Promise<void> {
    return workflow('Move from guest demo to registration', () =>
      this.page
        .getByRole('contentinfo')
        .getByRole('link', { name: 'Account access', exact: true })
        .click(),
    );
  }
  public guestState(): Promise<string | null> {
    return this.page.evaluate((key) => localStorage.getItem(key), S.expiryKey);
  }
  public evidence(): Locator {
    return this.page.getByRole('article', { name: 'Synthetic sample report' });
  }
  public async enterByKeyboard(): Promise<void> {
    const button = this.page.getByRole('button', { name: S.guest, exact: true });
    await button.focus();
    await button.press('Enter');
    await this.label.waitFor({ state: 'visible' });
  }
  public async keyboardOpenReports(): Promise<void> {
    await this.revealNavigation();
    const button = this.page
      .getByRole('navigation', { name: S.demoNavigation })
      .getByRole('button', { name: 'Reports', exact: true });
    await button.focus();
    await button.press('Enter');
  }
  public simulate(): Promise<void> {
    return workflow('Try the deterministic simulated run', () =>
      this.page.getByRole('button', { name: '2. Try a simulated run', exact: true }).click(),
    );
  }
  public simulationStatus(): Locator {
    return this.page.getByRole('status').filter({ hasText: 'Simulation complete' });
  }
  public chart(): Locator {
    return this.page.getByRole('img', {
      name: 'Synthetic latest result: two passed and one failed',
    });
  }
  public trendTable(): Locator {
    return this.page.getByRole('table', { name: S.trendTable });
  }
  public async selectDay(day: string): Promise<void> {
    await this.trendTable().getByRole('button', { name: day, exact: true }).click();
  }
  public dayStatus(): Locator {
    return this.page.getByRole('status').filter({ hasText: 'Selected sample day' });
  }
  public async openAllure(): Promise<Page> {
    const popup = this.page.waitForEvent('popup');
    await this.page.getByRole('link', { name: S.allureSample, exact: true }).click();
    return popup;
  }
  private async revealNavigation(): Promise<void> {
    await this.label.waitFor({ state: 'visible' });
    const menu = this.page.getByRole('button', { name: S.menu, exact: true });
    if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false') {
      await menu.focus();
      await menu.press('Enter');
    }
  }
}
