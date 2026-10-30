import type { Page } from "@playwright/test";
import { AnalyticsSelectors as S } from "../types/analytics.selectors";
import { Routes } from "../types/routes";
import { workflow } from "../utils/allure.utils";
export class AnalyticsPage {
  readonly heading;
  readonly browser;
  readonly dateColumn;
  readonly comparison;
  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: S.heading, exact: true });
    this.browser = page.getByLabel(S.browser, { exact: true });
    this.dateColumn = page.getByRole("columnheader", {
      name: S.date,
      exact: true,
    });
    this.comparison = page.getByRole("heading", {
      name: S.comparison,
      exact: true,
    });
  }
  goto() {
    return workflow("Open quality overview", () =>
      this.page.goto(Routes.overview),
    );
  }
  period(days: number) {
    return this.page.getByRole("heading", {
      name: S.period(days),
      exact: true,
    });
  }
  filter(days: number, browser: string) {
    return workflow("Apply analytics filters", async () => {
      const panel = this.page.locator('details.history-filters');
      if (!(await panel.evaluate((element) => element.hasAttribute('open')))) {
        await panel.locator('summary').click();
      }
      await this.page
        .getByLabel(S.window, { exact: true })
        .selectOption({ label: `${days} days` });
      await this.browser.selectOption(browser);
      await this.page
        .getByRole("button", { name: S.apply, exact: true })
        .click();
    });
  }
  showData() {
    return this.page.getByText(S.table, { exact: true }).click();
  }
  saveFilters() {
    return workflow("Save personal analytics filters", () =>
      this.page.getByRole("button", { name: S.save, exact: true }).click(),
    );
  }
  resetFilters() {
    return this.page
      .getByRole("button", { name: S.reset, exact: true })
      .click();
  }
  restoreFilters() {
    return this.page
      .getByRole("button", { name: S.restore, exact: true })
      .click();
  }
  async export() {
    return workflow("Export metrics JSON", async () => {
      const download = this.page.waitForEvent("download");
      await this.page
        .getByRole("button", { name: S.export, exact: true })
        .click();
      return download;
    });
  }
}
