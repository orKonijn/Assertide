import type { Page } from "@playwright/test";
import { SettingsSelectors as S } from "../types/settings.selectors";
import { Routes } from "../types/routes";
import { workflow, registerSecret } from "../utils/allure.utils";
export class EnvironmentsPage {
  readonly credentialValue;
  readonly credentialStatus;
  readonly environmentStatus;
  readonly root;
  constructor(readonly page: Page) {
    this.credentialValue = page.getByLabel(S.credentialValue, { exact: true });
    this.credentialStatus = page
      .getByRole("status")
      .filter({ hasText: S.credentialSaved });
    this.environmentStatus = page
      .getByRole("status")
      .filter({ hasText: S.environmentSaved });
    this.root = page.locator(S.environmentRoot);
  }
  goto() {
    return workflow("Open environment policies", () =>
      this.page.goto(Routes.settings),
    );
  }
  saveCredential(name: string, value: string) {
    return workflow("Save write-only credential version", async () => {
      await this.page.getByLabel(S.credentialName, { exact: true }).fill(name);
      registerSecret(value);
      await this.credentialValue.fill(value);
      await this.page
        .getByRole("button", { name: S.saveCredential, exact: true })
        .click();
    });
  }
  savePolicy(id: string, name: string, credential: string) {
    return workflow("Save environment credential reference", async () => {
      await this.page.getByLabel(S.environmentId, { exact: true }).fill(id);
      await this.page.getByLabel(S.environmentName, { exact: true }).fill(name);
      await this.page
        .getByLabel(S.passwordReference)
        .selectOption({ label: `${credential} · version 1` });
      await this.page
        .getByRole("button", { name: S.saveEnvironment, exact: true })
        .click();
    });
  }
}
