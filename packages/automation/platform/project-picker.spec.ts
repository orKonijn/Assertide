import { test, expect } from "./fixtures";
import { violations } from "../ui/utils/accessibility.utils";
import { fitsViewport, viewport } from "../ui/utils/viewport.utils";
import { ProjectPickerComponent } from "../ui/components/project-picker.component";
import { NavigationComponent } from "../ui/components/navigation.component";
import { Routes } from "../ui/types/routes";

test.describe("Project picker", () => {
  let picker: ProjectPickerComponent;
  let navigation: NavigationComponent;
  test.beforeEach(async ({ page, isolatedProject }) => {
    void isolatedProject;
    picker = new ProjectPickerComponent(page);
    navigation = new NavigationComponent(page);
    await navigation.goto(Routes.overview);
  });
  test("searches, switches, and preserves mobile focus", async ({
    page,
    isolatedProject,
  }) => {
    await picker.open();
    await expect(picker.search).toBeFocused();
    await picker.searchFor("no-project-matches-this-query");
    await expect(picker.empty).toBeVisible();
    await picker.searchFor(isolatedProject.name);
    await picker.choose(isolatedProject.name);
    await expect(picker.trigger).toContainText(isolatedProject.name);
    await viewport(page, "mobile");
    await navigation.menu.click();
    await picker.open();
    await expect(picker.search).toBeFocused();
    await navigation.setTheme("dark");
    expect(await violations(page)).toEqual([]);
    expect(await fitsViewport(page)).toBe(true);
    await navigation.press("Escape");
    await expect(picker.dialog).not.toBeVisible();
    await expect(picker.trigger).toBeFocused();
    await expect(navigation.closeMenu).toBeVisible();
  });
  test("only a click starting and ending outside dismisses the picker", async ({
    page,
  }) => {
    for (const size of ["desktop", "mobile"] as const) {
      await viewport(page, size);
      if (size === "mobile") await navigation.menu.click();
      await picker.open();
      await picker.clickPadding();
      await expect(picker.dialog).toBeVisible();
      await picker.dragOutside();
      await expect(picker.dialog).toBeVisible();
      await picker.clickOutside();
      await expect(picker.dialog).not.toBeVisible();
      await expect(picker.trigger).toBeFocused();
    }
  });
});
