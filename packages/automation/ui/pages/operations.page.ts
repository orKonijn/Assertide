import type { Page } from "@playwright/test";
import { SettingsSelectors as S } from "../types/settings.selectors";
import { Routes } from "../types/routes";
import { workflow } from "../utils/allure.utils";
export class OperationsPage {
  readonly card;
  readonly status;
  readonly refreshButton;
  constructor(readonly page: Page) {
    this.card = page.locator(S.section).filter({
      has: page.getByRole("heading", { name: S.health, exact: true }),
    });
    this.status = this.card.getByRole("status");
    this.refreshButton = this.card.getByRole("button", { name: S.refresh });
  }
  goto() {
    return workflow("Open service operations", () =>
      this.page.goto(Routes.settings),
    );
  }
  refresh() {
    return workflow("Refresh dependency health", () =>
      this.refreshButton.click(),
    );
  }
}
