import type { Page } from "@playwright/test";
import { ExecutionSelectors as S } from "../types/execution.selectors";
import { Routes } from "../types/routes";
import { workflow } from "../utils/allure.utils";
import { AllureReportPage } from "./report.page";
export class ExecutionPage {
  readonly status;
  readonly reportLink;
  readonly rerunDialog;
  readonly startRerunButton;
  readonly screenshotButton;
  readonly screenshotDialog;
  readonly download;
  constructor(readonly page: Page) {
    this.status = page.getByRole(S.status).first();
    this.reportLink = page.getByRole("link", {
      name: S.openReport,
      exact: true,
    });
    this.rerunDialog = page.getByRole("dialog", { name: S.rerunDialog });
    this.startRerunButton = page.getByRole("button", {
      name: S.startRerun,
      exact: true,
    });
    this.screenshotButton = page.getByRole("button", {
      name: S.screenshot,
      exact: true,
    });
    this.screenshotDialog = page.getByRole("dialog", {
      name: S.screenshotDialog,
      exact: true,
    });
    this.download = page.getByRole("link", { name: S.download });
  }
  goto(id: string, result?: string) {
    return workflow("Open execution", () =>
      this.page.goto(result ? Routes.result(id, result) : Routes.run(id)),
    );
  }
  id() {
    return new URL(this.page.url()).pathname.split("/").at(-1)!;
  }
  heading(id: string) {
    return this.page.getByRole("heading", { name: S.heading(id), exact: true });
  }
  outcome(id: string, status: string) {
    return this.page.getByText(`${id} · ${status}`, { exact: false });
  }
  section(
    name:
      | typeof S.results
      | typeof S.report
      | typeof S.environment
      | typeof S.history,
  ) {
    return this.page
      .locator(S.section)
      .filter({ has: this.page.getByRole("heading", { name, exact: true }) });
  }
  openResult(id: string, status = "passed") {
    return workflow("Inspect test result", () =>
      this.outcome(id, status).click(),
    );
  }
  openScreenshot() {
    return workflow("Inspect attempt screenshot", () =>
      this.screenshotButton.click(),
    );
  }
  screenshotWidth() {
    return this.screenshotDialog
      .locator(S.image)
      .evaluate((image: HTMLImageElement) => image.naturalWidth);
  }
  closeScreenshot() {
    return this.page.keyboard.press("Escape");
  }
  rebuildReport() {
    return workflow("Rebuild Allure report", () =>
      this.page.getByRole("button", { name: S.rebuild, exact: true }).click(),
    );
  }
  cancel() {
    return workflow("Cancel active execution", async () => {
      this.page.once("dialog", (dialog) => dialog.accept());
      await this.page
        .getByRole("button", { name: S.cancel, exact: true })
        .click();
    });
  }
  reviewRerun(id: string) {
    return workflow("Review selected rerun", async () => {
      await this.page
        .getByRole("checkbox", { name: S.selectRerun(id), exact: true })
        .check();
      await this.page
        .getByRole("button", { name: S.rerunChecked, exact: true })
        .click();
    });
  }
  startRerun() {
    return workflow("Start reviewed rerun", () =>
      this.startRerunButton.click(),
    );
  }
  async openReport() {
    return workflow("Open generated Allure report", async () => {
      const popup = this.page.waitForEvent("popup");
      await this.reportLink.click();
      return new AllureReportPage(await popup);
    });
  }
  openHistory(id: string) {
    return workflow("Open compatible historical execution", () =>
      this.page
        .getByRole("link", { name: id.slice(0, 8), exact: true })
        .click(),
    );
  }
  addNote(note: string) {
    return workflow("Add investigation note", async () => {
      await this.page.getByLabel(S.diagnosis, { exact: true }).fill(note);
      await this.page
        .getByRole("button", { name: S.addNote, exact: true })
        .click();
    });
  }
  note(value: string) {
    return this.page.getByText(value, { exact: true });
  }
}
