import type { Page } from "@playwright/test";
import { NavigationSelectors as S } from "../types/navigation.selectors";
export class NotificationsComponent {
  readonly badge;
  readonly bell;
  readonly history;
  readonly root;
  constructor(private readonly page: Page) {
    this.badge = page.locator(S.notificationBadge);
    this.bell = page.getByRole("button", {
      name: S.notificationBell,
      exact: true,
    });
    this.history = page.locator(S.notificationHistory);
    this.root = page.locator(S.notifications);
  }
  closeHistory() {
    return this.page
      .getByRole("button", { name: S.closeNotifications })
      .click();
  }
  dismissWithEscape() {
    return this.page.keyboard.press("Escape");
  }
  dismissOutside() {
    return this.page.getByRole("heading", { level: 1 }).click();
  }
  openHistory() {
    return this.bell.click();
  }
}
