import type { Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { AuthenticationSelectors as A } from '../types/authentication.selectors';
import { NavigationSelectors as S } from '../types/navigation.selectors';
import { Routes } from '../types/routes';
import { workflow } from '../utils/allure.utils';
import { ProjectPickerComponent } from './project-picker.component';
export class NavigationComponent {
  private readonly activeProject;
  public readonly selectedProject;
  public readonly menu;
  private readonly dialog;
  public readonly closeMenu;
  public readonly signOut;
  public readonly skip;
  public readonly content;
  public readonly heading;
  public constructor(private readonly page: Page) {
    this.activeProject = page.getByLabel(S.activeProject);
    this.selectedProject = this.activeProject.locator('span').first();
    this.menu = page.getByRole('button', { name: S.menu, exact: true });
    this.dialog = page.getByRole('dialog', { name: S.dialog });
    this.closeMenu = this.dialog.getByRole('button', {
      name: S.close,
      exact: true,
    });
    this.signOut = this.dialog.getByRole('button', {
      name: A.signOut,
      exact: true,
    });
    this.skip = page.getByRole('link', { name: S.skip });
    this.content = page.locator(S.content);
    this.heading = page.locator(S.heading);
  }
  public goto(route: string): Promise<Response | null> {
    return workflow('Open workspace route', () => this.page.goto(route));
  }
  public selectProject(name: string): Promise<void> {
    return workflow('Switch active project', async () => {
      // The app uses location.assign, so selection alone does not finish the switch.
      const navigated = this.page.waitForEvent('framenavigated', {
        predicate: (frame) =>
          frame === this.page.mainFrame() && new URL(frame.url()).pathname === Routes.overview,
      });
      const picker = new ProjectPickerComponent(this.page);
      await picker.open();
      await picker.searchFor(name);
      await picker.choose(name);
      await navigated;
      await this.page.waitForLoadState('load');
    });
  }
  public async openMenuWithKeyboard(): Promise<void> {
    await this.menu.focus();
    await this.page.keyboard.press('Enter');
  }
  public press(key: string): Promise<void> {
    return this.page.keyboard.press(key);
  }
  public async setTheme(theme: 'light' | 'dark'): Promise<void> {
    await this.page.evaluate((value) => {
      localStorage.setItem('assertide-theme', value);
      document.documentElement.dataset['theme'] = value;
    }, theme);
  }
  public async notifyVisibility(): Promise<void> {
    await this.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  }
  public async reducedMotionDuration(): Promise<string> {
    await this.page.emulateMedia({ reducedMotion: 'reduce' });
    return this.page
      .locator(S.button)
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
  }
}
