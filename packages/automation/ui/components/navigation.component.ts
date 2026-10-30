import type { Page } from "@playwright/test";
import { NavigationSelectors as S } from "../types/navigation.selectors";
import { AuthenticationSelectors as A } from "../types/authentication.selectors";
import { workflow } from "../utils/allure.utils";
import { Routes } from "../types/routes";
import { ProjectPickerComponent } from "./project-picker.component";
export class NavigationComponent {
  readonly activeProject;
  readonly selectedProject;
  readonly menu;
  readonly dialog;
  readonly closeMenu;
  readonly backdrop;
  readonly signOut;
  readonly skip;
  readonly content;
  readonly heading;
  constructor(readonly page: Page) {
    this.activeProject = page.getByLabel(S.activeProject);
    this.selectedProject = this.activeProject.locator("span").first();
    this.menu = page.getByRole("button", { name: S.menu, exact: true });
    this.backdrop = page.getByRole("button", { name: S.backdrop, exact: true });
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
    return workflow("Switch active project", async () => {
      // The app uses location.assign, so selection alone does not finish the switch.
      const navigated = this.page.waitForEvent("framenavigated", {
        predicate: (frame) =>
          frame === this.page.mainFrame() &&
          new URL(frame.url()).pathname === Routes.overview,
      });
      const picker = new ProjectPickerComponent(this.page);
      await picker.open();
      await picker.searchFor(name);
      await picker.choose(name);
      await navigated;
      await this.page.waitForLoadState("load");
    });
  }
  async openMenuWithKeyboard() {
    await this.menu.focus();
    await this.page.keyboard.press("Enter");
  }
  press(key: string) {
    return this.page.keyboard.press(key);
  }
  async dismissFromOutside() {
    const box = await this.backdrop.boundingBox();
    if (!box) throw new Error("Navigation backdrop is not visible");
    await this.page.mouse.click(box.x + box.width - 12, box.y + 24);
  }
  async closingMotion() {
    return this.backdrop.evaluate(async (button) => {
      (button as HTMLButtonElement).click();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const drawer = document.getElementById("workspace-navigation")!;
      return {
        animating: drawer
          .getAnimations()
          .some((animation) => animation.playState === "running"),
        visible: getComputedStyle(drawer).display !== "none",
      };
    });
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
