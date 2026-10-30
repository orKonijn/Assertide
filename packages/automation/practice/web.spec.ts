import { test, expect } from "../ui/fixtures/base.fixture";
import { PracticePage } from "../ui/pages/practice.page";
import {
  PracticeRoutes as R,
  PracticeData as D,
} from "../ui/types/practice.selectors";
import { Timeouts } from "../ui/types/test-data";
import { restrictPractice } from "../ui/utils/practice-network.utils";
test.describe("Manual public browser practice", () => {
  let practice: PracticePage;
  test.beforeEach(async ({ page, context }) => {
    practice = new PracticePage(page);
    await restrictPractice(context);
  });
  test.afterEach(async ({ context }) => {
    await context.unrouteAll({ behavior: "wait" });
  });
  test("WEB-001 Dynamic loading waits for content", async () => {
    await practice.goto(R.loading);
    await practice.startLoading();
    await expect(practice.finish).toHaveText("Hello World!", {
      timeout: Timeouts.practice,
    });
    await expect(practice.finish).toBeVisible({ timeout: Timeouts.practice });
  });
  test("WEB-002 Checkbox state persists within page", async () => {
    await practice.goto(R.checkboxes);
    await practice.setCheckboxes();
    await expect(practice.boxes.nth(0)).toBeChecked();
    await expect(practice.boxes.nth(1)).not.toBeChecked();
  });
  test("WEB-003 Dropdown selects requested option", async () => {
    await practice.goto(R.dropdown);
    await practice.selectOption();
    await expect(practice.dropdown).toHaveValue(D.option);
    await expect(practice.selectedOption).toHaveText(D.optionText);
  });
  test("WEB-004 Alert confirmation accepts and dismisses", async () => {
    await practice.goto(R.alerts);
    await practice.confirm(false);
    await expect(practice.result).toHaveText("You clicked: Cancel");
    await practice.confirm(true);
    await expect(practice.result).toHaveText("You clicked: Ok");
  });
  test("WEB-005 New window isolation", async () => {
    await practice.goto(R.windows);
    const popup = await practice.openWindow();
    await expect(popup.heading).toBeVisible();
    await popup.page.waitForLoadState("load");
    await popup.page.close();
    await expect(practice.heading).toBeVisible();
  });
  test("WEB-006 Upload synthetic text file", async () => {
    await practice.goto(R.upload);
    await practice.upload();
    await expect(practice.uploaded).toHaveText(D.fileName);
  });
  test("WEB-007 Dynamic input enablement", async () => {
    await practice.goto(R.controls);
    await practice.enable();
    await expect(practice.input).toBeEnabled({ timeout: Timeouts.practice });
    await practice.enterText();
    await expect(practice.input).toHaveValue(D.input);
  });
});
