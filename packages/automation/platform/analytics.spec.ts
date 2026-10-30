import { test, expect } from "./fixtures";
import { AnalyticsPage } from "../ui/pages/analytics.page";
import { HistoryPage } from "../ui/pages/history.page";
import { downloadText } from "../ui/utils/file.utils";
import { viewport, fitsViewport } from "../ui/utils/viewport.utils";
test.describe("Quality analytics", () => {
  let analytics: AnalyticsPage;
  test.beforeEach(async ({ page }) => {
    analytics = new AnalyticsPage(page);
    await analytics.goto();
  });
  test("filters persist, charts have tables and exported metrics explain comparisons", async ({
    page,
  }) => {
    await expect(analytics.heading).toBeVisible();
    await analytics.filter(30, "api");
    await expect(page).toHaveURL(/days=30&browser=api/);
    await expect(analytics.period(30)).toBeVisible();
    await analytics.showData();
    await expect(analytics.dateColumn).toBeVisible();
    await analytics.saveFilters();
    await analytics.resetFilters();
    await expect(analytics.browser).toHaveValue("all");
    await analytics.restoreFilters();
    await expect(analytics.browser).toHaveValue("api");
    await expect(analytics.comparison).toBeVisible();
    const exported = JSON.parse(await downloadText(await analytics.export()));
    expect(exported.filters.browser).toBe("api");
    expect(exported.definitions.comparison).toContain("UTC");
    expect(exported.generatedAt).toBeTruthy();
    expect(exported.comparison).toHaveProperty("missingPriorIdentities");
    await viewport(page, "mobile");
    expect(await fitsViewport(page)).toBe(true);
    await page.reload();
    await expect(analytics.browser).toHaveValue("api");
  });
});
test.describe("Execution history filters", () => {
  let history: HistoryPage;
  test.beforeEach(async ({ page }) => {
    history = new HistoryPage(page);
    await history.goto();
  });
  test("URL filters and keyboard sorting expose accessible state", async ({
    page,
  }) => {
    await history.filter("completed", "api");
    await expect(page).toHaveURL(/phase=completed&browser=api/);
    await expect(history.created).toBeVisible();
    await expect(history.apply).toBeEnabled();
    await history.sortWithKeyboard();
    await expect(history.sort).toHaveAttribute("aria-sort", "ascending");
    await expect(history.sortButton).toBeFocused();
    await history.sortWithKeyboard();
    await expect(history.sort).toHaveAttribute("aria-sort", "descending");
  });
});
