import { test, expect } from "./fixtures";

import { randomUUID } from "node:crypto";

test("administrator creates and switches projects and manages member access", async ({
  page,
}) => {
  await page.goto("/projects");
  const name = `Payments ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Payment contract verification");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Payment and refund contract verification");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name, exact: true }) })
      .getByText("Payment and refund contract verification", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Active project").selectOption({ label: name });
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(
    page.getByLabel("Active project").locator("option:checked"),
  ).toHaveText(name);
  await page.goto("/settings");
  const subject = `reviewer-${randomUUID().slice(0, 8)}`;
  const memberName = `Reviewer ${subject}`;
  await page.getByLabel("Member subject", { exact: true }).fill(subject);
  await page.getByLabel("Member name", { exact: true }).fill(memberName);
  await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: subject, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Edit ${memberName}`, exact: true })
    .click();
  await page.getByLabel("Member role").selectOption("operator");
  await page.getByRole("button", { name: "Save member", exact: true }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: subject })
      .getByRole("cell", { name: "operator", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/project-members.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/project-members-mobile.png",
    fullPage: true,
  });
});
