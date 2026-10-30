import type { Page } from "@playwright/test";
import { SettingsSelectors as S } from "../types/settings.selectors";
import { Routes } from "../types/routes";
import { workflow, registerSecret } from "../utils/allure.utils";
export class ServiceAccountsPage {
  constructor(readonly page: Page) {}
  goto() {
    return workflow("Open CI account administration", () =>
      this.page.goto(Routes.settings),
    );
  }
  card(name: string) {
    return this.page
      .locator(S.article)
      .filter({ has: this.page.getByRole("heading", { name, exact: true }) });
  }
  revokeButton(name: string) {
    return this.page.getByRole("button", { name: S.revoke(name), exact: true });
  }
  private async readAndHideToken() {
    const token = await this.page
      .getByLabel(S.token, { exact: true })
      .inputValue();
    await this.page.getByRole("button", { name: S.hide, exact: true }).click();
    registerSecret(token);
    return token;
  }
  create(name: string) {
    return workflow("Create CI credential", async () => {
      await this.page.getByLabel(S.accountName, { exact: true }).fill(name);
      await this.page
        .getByRole("button", { name: S.createToken, exact: true })
        .click();
      return this.readAndHideToken();
    });
  }
  rotate(name: string) {
    return workflow("Rotate CI credential", async () => {
      this.page.once("dialog", (dialog) => dialog.accept());
      await this.page
        .getByRole("button", { name: S.rotate(name), exact: true })
        .click();
      return this.readAndHideToken();
    });
  }
  revoke(name: string) {
    return workflow("Revoke CI credential", async () => {
      this.page.once("dialog", (dialog) => dialog.accept());
      const response = this.page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/revoke"),
      );
      await this.revokeButton(name).click();
      return (await response).status();
    });
  }
}
