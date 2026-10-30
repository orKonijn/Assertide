import type { Page } from "@playwright/test";
import { ProjectPickerSelectors as S } from "../types/project-picker.selectors";
import { workflow } from "../utils/allure.utils";
export class ProjectPickerComponent {
  readonly trigger;
  readonly dialog;
  readonly search;
  readonly empty;
  constructor(readonly page: Page) {
    this.trigger = page.getByRole("button", { name: S.trigger, exact: true });
    this.dialog = page.getByRole("dialog", { name: S.dialog });
    this.search = this.dialog.getByRole("searchbox", { name: S.search });
    this.empty = this.dialog.getByText(new RegExp(S.empty));
  }
  open() {
    return workflow("Open project picker", () => this.trigger.click());
  }
  searchFor(name: string) {
    return workflow("Search accessible projects", () => this.search.fill(name));
  }
  choose(name: string) {
    return workflow("Choose project", () =>
      this.dialog.getByRole("button", { name, exact: true }).click(),
    );
  }
}
