import type { Page } from "@playwright/test";
import { SettingsSelectors as S } from "../types/settings.selectors";
import { Routes } from "../types/routes";
import { workflow } from "../utils/allure.utils";
export class MembersPage {
  constructor(readonly page: Page) {}
  goto() {
    return workflow("Open member administration", () =>
      this.page.goto(Routes.settings),
    );
  }
  subject(value: string) {
    return this.page.getByRole("cell", { name: value, exact: true });
  }
  role(subject: string, role: string) {
    return this.page
      .getByRole("row")
      .filter({ hasText: subject })
      .getByRole("cell", { name: role, exact: true });
  }
  add(subject: string, name: string, project: string) {
    return workflow("Grant project membership", async () => {
      await this.page
        .getByLabel(S.memberSubject, { exact: true })
        .fill(subject);
      await this.page.getByLabel(S.memberName, { exact: true }).fill(name);
      await this.page
        .getByRole("checkbox", { name: project, exact: true })
        .check();
      await this.page
        .getByRole("button", { name: S.addMember, exact: true })
        .click();
    });
  }
  setRole(name: string, role: string) {
    return workflow("Update member role", async () => {
      await this.page
        .getByRole("button", { name: S.edit(name), exact: true })
        .click();
      await this.page.getByLabel(S.memberRole).selectOption(role);
      await this.page
        .getByRole("button", { name: S.saveMember, exact: true })
        .click();
    });
  }
}
