import type { Page } from "@playwright/test";
import { ReportsSelectors as S } from "../types/reports.selectors";
import { ApiRoutes } from "../types/routes";
import { TestData } from "../types/test-data";
import { workflow } from "../utils/allure.utils";
export class AllureReportPage {
  readonly expandButton;
  constructor(readonly page: Page) {
    this.expandButton = page.getByRole("button", {
      name: S.expand,
      exact: true,
    });
  }
  goto(id: string) {
    return workflow("Open authorized Allure report", () =>
      this.page.goto(TestData.origin + ApiRoutes.report(id)),
    );
  }
  expand() {
    return workflow("Expand report scenarios", () => this.expandButton.click());
  }
  testTitle(title: string) {
    return this.page.getByText(title, { exact: false }).first();
  }
  close() {
    return this.page.close();
  }
}
