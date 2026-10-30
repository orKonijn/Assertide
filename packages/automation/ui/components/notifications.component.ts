import type { Page } from '@playwright/test';

import { NavigationSelectors as S } from '../types/navigation.selectors';
export class NotificationsComponent {
  public readonly badge;
  public readonly bell;
  public readonly history;
  public readonly root;
  public constructor(private readonly page: Page) {
    this.badge = page.locator(S.notificationBadge);
    this.bell = page.getByRole('button', {
      name: S.notificationBell,
      exact: true,
    });
    this.history = page.locator(S.notificationHistory);
    this.root = page.locator(S.notifications);
  }
  public closeHistory(): Promise<void> {
    return this.page.getByRole('button', { name: S.closeNotifications }).click();
  }
  public dismissWithEscape(): Promise<void> {
    return this.page.keyboard.press('Escape');
  }
  public dismissOutside(): Promise<void> {
    return this.page.getByRole('heading', { level: 1 }).click();
  }
  public openHistory(): Promise<void> {
    return this.bell.click();
  }
}
