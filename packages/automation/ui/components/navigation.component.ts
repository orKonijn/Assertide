import type { Page } from "@playwright/test";
import { NavigationSelectors as S } from "../types/navigation.selectors";
import { AuthenticationSelectors as A } from "../types/authentication.selectors";
import { workflow } from "../utils/allure.utils";
export class NavigationComponent {
  readonly activeProject;
  readonly selectedProject;
  readonly menu;
  readonly dialog;
  readonly closeMenu;
  readonly signOut;
  readonly skip;
  readonly content;
  readonly heading;
  constructor(readonly page: Page) {
    this.activeProject = page.getByLabel(S.activeProject);
    this.selectedProject = this.activeProject.locator(S.selectedOption);
    this.menu = page.getByRole("button", { name: S.menu, exact: true });
    this.dialog = page.getByRole("dialog", { name: S.dialog });
    this.closeMenu = this.dialog.getByRole("button", {
      name: S.close,
      exact: true,
    });
    this.signOut = this.dialog.getByRole("button", {
      name: A.signOut,
      exact: true,
    });
    this.skip = page.getByRole("link", { name: S.skip });
    this.content = page.locator(S.content);
    this.heading = page.locator(S.heading);
  }
  goto(route: string) {
    return workflow("Open workspace route", () => this.page.goto(route));
  }
  selectProject(name: string) {
    return workflow("Switch active project", () =>
      this.activeProject.selectOption({ label: name }),
    );
  }
  async openMenuWithKeyboard() {
    await this.menu.focus();
    await this.page.keyboard.press("Enter");
  }
  press(key: string) {
    return this.page.keyboard.press(key);
  }
  async setTheme(theme: "light" | "dark") {
    await this.page.evaluate((value) => {
      localStorage.setItem("assertide-theme", value);
      document.documentElement.dataset["theme"] = value;
    }, theme);
  }
  async notifyVisibility() {
    await this.page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
  }
  async reducedMotionDuration() {
    await this.page.emulateMedia({ reducedMotion: "reduce" });
    return this.page
      .locator(S.button)
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
  }
}
