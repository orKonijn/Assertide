import type { Page } from '@playwright/test';

import { NavigationSelectors as S } from '../types/navigation.selectors';
export class NotificationsComponent {
  public readonly toast;
  public readonly history;
  private readonly root;
  public constructor(private readonly page: Page) {
    this.toast = page.locator(S.toast);
    this.history = page.locator(S.notificationHistory);
    this.root = page.locator(S.notifications);
  }
  public openHistory(): Promise<void> {
    return this.page.getByText(/Notification history \(\d+\)/).click();
  }
}
