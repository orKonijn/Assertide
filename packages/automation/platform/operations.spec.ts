import { test, expect } from "./fixtures";

test("administrator inspects service health, quotas and retention on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/settings");
  const card = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Service health and capacity",
      exact: true,
    }),
  });
  await expect(card.getByRole("status")).toContainText("ready");
  await expect(card).toContainText("database: ok");
  await expect(card).toContainText("trace/video 14 days");
  await card.getByRole("button", { name: "Refresh health" }).click();
  await expect(
    card.getByRole("button", { name: "Refresh health" }),
  ).toBeEnabled();
  await card.screenshot({
    path: "../../docs/changelog/assets/unreleased/service-health.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await card.screenshot({
    path: "../../docs/changelog/assets/unreleased/service-health-mobile.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
