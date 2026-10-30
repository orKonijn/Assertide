import type { Page } from "@playwright/test";
import { ApiWorkspaceSelectors as S } from "../types/api-workspace.selectors";
import { Routes } from "../types/routes";
import { workflow } from "../utils/allure.utils";
export class ApiWorkspacePage {
  readonly heading;
  readonly runButton;
  readonly evidence;
  readonly selectedValue;
  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: S.heading, exact: true });
    this.runButton = page.getByRole("button", { name: S.run, exact: true });
    this.evidence = page.getByLabel(S.evidence);
    this.selectedValue = page.getByLabel(S.value);
  }
  goto() {
    return workflow("Open API evidence workspace", () =>
      this.page.goto(Routes.api),
    );
  }
  executableCount(count: number) {
    return this.page.getByText(S.executable(count), { exact: false });
  }
  runSuite() {
    return workflow("Run enabled API cases", () => this.runButton.click());
  }
  selectExecution(id: string) {
    return workflow("Select recorded execution", () =>
      this.page.getByLabel(S.execution, { exact: true }).selectOption(id),
    );
  }
  openExchange(id: string) {
    return workflow("Inspect recorded exchange", () =>
      this.page
        .getByRole("button", {
          name: new RegExp(`${id} .*attempt 1 .*api-exchange.json`),
        })
        .first()
        .click(),
    );
  }
  async download() {
    return workflow("Download redacted exchange JSON", async () => {
      const download = this.page.waitForEvent("download");
      await this.page
        .getByRole("button", { name: S.download, exact: true })
        .click();
      return download;
    });
  }
  inspectPointer(pointer: string) {
    return workflow("Inspect JSON pointer", async () => {
      await this.page.getByLabel(S.pointer, { exact: true }).fill(pointer);
      await this.page
        .getByRole("button", { name: S.inspect, exact: true })
        .click();
    });
  }
}
