import type { Page, Response } from '@playwright/test';

import { AboutSelectors as S } from '../types/about.selectors';
import { AuthenticationSelectors } from '../types/authentication.selectors';

export class AboutPage {
  public readonly title;
  public readonly creator;
  public readonly inside;
  public readonly architecture;
  public readonly signIn;
  private readonly link;
  public constructor(private readonly page: Page) {
    this.title = page.getByRole('heading', { name: S.title, exact: true });
    this.creator = page.getByRole('heading', { name: 'Independent freelancer', exact: true });
    this.inside = page.locator('#inside-title');
    this.architecture = page.locator('.architecture details');
    this.signIn = page.getByRole('link', { name: AuthenticationSelectors.sso });
    this.link = page.getByRole('link', { name: S.title, exact: true });
  }
  public goto(fragment = ''): Promise<Response | null> {
    return this.page.goto(S.route + fragment);
  }
  public reload(): Promise<Response | null> {
    return this.page.reload();
  }
  public async openFromNavigation(): Promise<void> {
    await this.page.goto('/projects');
    await this.link.click();
  }
  public async openInside(): Promise<void> {
    await this.page.getByRole('button', { name: S.inside, exact: true }).click();
  }
  public async expandArchitecture(): Promise<void> {
    await this.page.getByText(S.architecture, { exact: true }).click();
  }
  public async viewport(width: number, theme: 'light' | 'dark'): Promise<void> {
    await this.page.setViewportSize({ width, height: 900 });
    await this.page.evaluate((value) => {
      localStorage.setItem('assertide-theme', value);
      document.documentElement.dataset['theme'] = value;
    }, theme);
  }
  public overflows(): Promise<boolean> {
    return this.page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  }
  public async capture(path: string): Promise<void> {
    await this.page.locator('.about-page').screenshot({
      path,
      style: '.mobile-header, aside, app-notifications { visibility: hidden !important; }',
    });
  }
  public async captureArchitecture(path: string): Promise<void> {
    await this.page.locator('.architecture').screenshot({
      path,
      style: '.mobile-header, aside, app-notifications { visibility: hidden !important; }',
    });
  }
  public async captureNavigationLink(path: string): Promise<void> {
    const menu = this.page.getByRole('button', { name: 'Menu', exact: true });
    if (await menu.isVisible()) {
      await menu.click();
    }
    await this.link.screenshot({ path });
  }
  public async captureAccount(path: string): Promise<void> {
    const menu = this.page.getByRole('button', { name: 'Menu', exact: true });
    if (await menu.isVisible()) {
      await menu.click();
    }
    await this.page.locator('#workspace-navigation .account').screenshot({
      path,
      mask: [this.page.locator('.account-identity strong'), this.page.locator('.account-avatar')],
    });
  }
}
