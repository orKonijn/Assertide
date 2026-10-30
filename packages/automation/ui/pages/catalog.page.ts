import type { Page } from "@playwright/test";
import { CatalogSelectors as S } from "../types/catalog.selectors";
import { Routes } from "../types/routes";
import { workflow } from "../utils/allure.utils";
export class CatalogPage {
  readonly heading;
  readonly cases;
  readonly quarantined;
  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: S.heading, exact: true });
    this.cases = page.getByRole("checkbox");
    this.quarantined = page.getByLabel(S.quarantined);
  }
  goto() {
    return workflow("Open test explorer", () =>
      this.page.goto(Routes.explorer),
    );
  }
  selection(id: string) {
    return this.page.getByLabel(S.select(id), { exact: true });
  }
  editButton(id: string) {
    return this.page.getByRole("button", { name: S.edit(id), exact: true });
  }
  editMetadata(id: string) {
    return workflow("Edit catalog metadata", () => this.editButton(id).click());
  }
  updateMetadata(input: {
    module: string;
    owner: string;
    quarantined: boolean;
    enabled: boolean;
  }) {
    return workflow("Save catalog execution policy", async () => {
      await this.page.getByLabel(S.module, { exact: true }).fill(input.module);
      await this.page.getByLabel(S.owner, { exact: true }).fill(input.owner);
      await this.quarantined.setChecked(input.quarantined);
      await this.page
        .getByLabel(S.enabled, { exact: true })
        .setChecked(input.enabled);
      await this.page
        .getByRole("button", { name: S.save, exact: true })
        .click();
    });
  }
  search(value: string) {
    return workflow("Search catalog", () =>
      this.page.getByLabel(S.search).fill(value),
    );
  }
  select(ids: readonly string[]) {
    return workflow("Select catalog cases", async () => {
      for (const id of ids) await this.selection(id).check();
    });
  }
  selectEnvironment(name: string) {
    return this.page
      .getByLabel(S.environment, { exact: true })
      .selectOption({ label: name });
  }
  startExecution() {
    return workflow("Start selected execution", () =>
      this.page.getByRole("button", { name: S.start, exact: true }).click(),
    );
  }
}
