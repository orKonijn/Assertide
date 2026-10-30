import type { Page } from "@playwright/test";
import { NavigationSelectors as S } from "../types/navigation.selectors";
export class NotificationsComponent {
  readonly toast;
  readonly history;
  readonly root;
  constructor(private readonly page: Page) {
    this.toast = page.locator(S.toast);
    this.history = page.locator(S.notificationHistory);
    this.root = page.locator(S.notifications);
  }
  openHistory() {
    return this.page.getByText(/Notification history \(\d+\)/).click();
  }
}
