import type { Page } from "@playwright/test";
import { SuitesSelectors as S } from "../types/suites.selectors";
import { Routes } from "../types/routes";
import { workflow } from "../utils/allure.utils";
export class SuitesPage {
  readonly owner;
  constructor(readonly page: Page) {
    this.owner = page.getByLabel(S.owner, { exact: true });
  }
  goto() {
    return workflow("Open test suites", () => this.page.goto(Routes.suites));
  }
  heading(name: string) {
    return this.page.getByRole("heading", { name, exact: true });
  }
  card(name: string) {
    return this.page.getByRole(S.article).filter({ has: this.heading(name) });
  }
  membership(id: string) {
    return this.page.getByRole("checkbox", { name: new RegExp(`^${id} `) });
  }
  edit(name: string) {
    return workflow("Edit saved suite", () =>
      this.page
        .getByRole("button", { name: S.edit(name), exact: true })
        .click(),
    );
  }
  fillDetails(input: {
    name: string;
    description: string;
    owner: string;
    tags: string;
  }) {
    return workflow("Enter suite details", async () => {
      await this.page.getByLabel(S.name, { exact: true }).fill(input.name);
      await this.page
        .getByLabel(S.description, { exact: true })
        .fill(input.description);
      await this.owner.fill(input.owner);
      await this.page.getByLabel(S.tags).fill(input.tags);
    });
  }
  setMember(id: string, selected: boolean) {
    return workflow(`${selected ? "Add" : "Remove"} suite member ${id}`, () =>
      this.membership(id).setChecked(selected),
    );
  }
  updateDescription(description: string) {
    return this.page
      .getByLabel(S.description, { exact: true })
      .fill(description);
  }
  save() {
    return workflow("Save suite", () =>
      this.page.getByRole("button", { name: S.save, exact: true }).click(),
    );
  }
  run(name: string) {
    return workflow("Run saved suite", () =>
      this.card(name).getByRole("button", { name: S.run, exact: true }).click(),
    );
  }
}
