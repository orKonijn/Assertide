import type { Page } from "@playwright/test";
import {
  PracticeSelectors as S,
  PracticeRoutes as R,
  PracticeData as D,
} from "../types/practice.selectors";
import { workflow } from "../utils/allure.utils";
export class PracticePage {
  readonly finish;
  readonly boxes;
  readonly dropdown;
  readonly selectedOption;
  readonly result;
  readonly heading;
  readonly uploaded;
  readonly input;
  constructor(readonly page: Page) {
    this.finish = page.locator(S.finish);
    this.boxes = page.getByRole(S.checkbox);
    this.dropdown = page.getByRole(S.dropdown);
    this.selectedOption = page.locator(S.selected);
    this.result = page.locator(S.result);
    this.heading = page.getByRole("heading", { name: S.windowHeading });
    this.uploaded = page.locator(S.uploaded);
    this.input = page.locator(S.input);
  }
  goto(route: string) {
    return workflow("Open manual practice exercise", () =>
      this.page.goto(R.origin + route),
    );
  }
  startLoading() {
    return workflow("Request dynamically loaded content", () =>
      this.page.getByRole("button", { name: S.start, exact: true }).click(),
    );
  }
  async setCheckboxes() {
    await this.boxes.nth(0).check();
    await this.boxes.nth(1).uncheck();
  }
  selectOption() {
    return this.dropdown.selectOption(D.option);
  }
  confirm(accept: boolean) {
    return workflow(
      `${accept ? "Accept" : "Dismiss"} confirmation`,
      async () => {
        this.page.once("dialog", (dialog) =>
          accept ? dialog.accept() : dialog.dismiss(),
        );
        await this.page
          .getByRole("button", { name: S.confirm, exact: true })
          .click();
      },
    );
  }
  async openWindow() {
    const popup = this.page.waitForEvent("popup");
    await this.page
      .getByRole("link", { name: S.openWindow, exact: true })
      .click();
    const page = await popup;
    return {
      page,
      heading: page.getByRole("heading", { name: S.newWindow, exact: true }),
    };
  }
  upload() {
    return workflow("Upload synthetic text fixture", async () => {
      await this.page.locator(S.upload).setInputFiles({
        name: D.fileName,
        mimeType: "text/plain",
        buffer: Buffer.from(D.fileBody),
      });
      await this.page
        .getByRole("button", { name: S.uploadButton, exact: true })
        .click();
    });
  }
  enable() {
    return this.page
      .getByRole("button", { name: S.enable, exact: true })
      .click();
  }
  enterText() {
    return this.input.fill(D.input);
  }
}
