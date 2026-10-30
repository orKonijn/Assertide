import type { Page } from "@playwright/test";
import { ProjectsSelectors as S } from "../types/projects.selectors";
import { Routes } from "../types/routes";
import { workflow } from "../utils/allure.utils";
export class ProjectsPage {
  readonly name;
  readonly description;
  constructor(readonly page: Page) {
    this.name = page.getByLabel(S.name, { exact: true });
    this.description = page.getByLabel(S.description, { exact: true });
  }
  goto() {
    return workflow("Open projects", () => this.page.goto(Routes.projects));
  }
  heading(name: string) {
    return this.page.getByRole("heading", { name, exact: true });
  }
  card(name: string) {
    return this.page.locator(S.section).filter({ has: this.heading(name) });
  }
  create(name: string, description = "") {
    return workflow("Create project", async () => {
      await this.name.fill(name);
      await this.description.fill(description);
      await this.page
        .getByRole("button", { name: S.create, exact: true })
        .click();
    });
  }
  edit(name: string) {
    return workflow("Edit project", () =>
      this.page
        .getByRole("button", { name: S.edit(name), exact: true })
        .click(),
    );
  }
  updateDescription(description: string) {
    return workflow("Save project description", async () => {
      await this.description.fill(description);
      await this.page
        .getByRole("button", { name: S.save, exact: true })
        .click();
    });
  }
}
