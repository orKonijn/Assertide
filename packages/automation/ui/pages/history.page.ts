import type { Page } from "@playwright/test";
import { HistorySelectors as S } from "../types/analytics.selectors";
import { Routes } from "../types/routes";
import { workflow } from "../utils/allure.utils";
export class HistoryPage {
  readonly created;
  readonly sort;
  readonly sortButton;
  readonly apply;
  constructor(readonly page: Page) {
    this.created = page.getByRole("columnheader", {
      name: S.created,
      exact: true,
    });
    this.sort = page.getByRole("columnheader", {
      name: S.selected,
      exact: true,
    });
    this.sortButton = this.sort.getByRole("button");
    this.apply = page.getByRole("button", { name: S.apply, exact: true });
  }
  goto() {
    return workflow("Open execution history", () =>
      this.page.goto(Routes.runs),
    );
  }
  filter(phase: string, browser: string) {
    return workflow("Filter execution history", async () => {
      await this.page.getByLabel(S.phase, { exact: true }).selectOption(phase);
      await this.page
        .getByLabel(S.browser, { exact: true })
        .selectOption(browser);
      await this.apply.click();
    });
  }
  async sortWithKeyboard() {
    await this.sortButton.focus();
    await this.page.keyboard.press("Enter");
  }
}
