import { test, expect } from "./fixtures";
import { randomUUID } from "node:crypto";

test("disabled suite members can be removed and API launch uses only executable cases", async ({
  page,
}) => {
  test.setTimeout(120000);
  const name = `Selection ${randomUUID().slice(0, 8)}`;
  await page.goto("/projects");
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByLabel("Active project").selectOption({ label: name });
  await expect(page).toHaveURL(/\/$/);
  const project = await page.getByLabel("Active project").inputValue();
  await page.goto("/suites");
  await page.getByLabel("Name", { exact: true }).fill(name);
  const first = page.getByRole("checkbox", {
    name: "LAB-001 Persistent order lifecycle",
    exact: true,
  });
  await first.check();
  await page
    .getByRole("checkbox", {
      name: "LAB-002 Missing authentication",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save suite", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.goto("/explorer");
  await page.getByRole("button", { name: "Edit LAB-001", exact: true }).click();
  await page
    .getByLabel("Enabled for future selections", { exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Save test metadata", exact: true })
    .click();
  await expect(
    page.getByLabel("Select LAB-001", { exact: true }),
  ).toBeDisabled();
  await page.goto("/suites");
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  await expect(first).toBeChecked();
  await expect(first).toBeEnabled();
  await first.uncheck();
  await expect(first).toBeDisabled();
  await page.getByRole("button", { name: "Save suite", exact: true }).click();
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card).toContainText(/1 tests .* revision 2/);
  await card.getByRole("button", { name: "Run suite", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[^/]+$/);
  const suiteRun = page.url().split("/").at(-1)!;
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/v1/runs/${suiteRun}`)).json()).phase,
      { timeout: 60000 },
    )
    .toBe("completed");
  expect(
    (await (await page.request.get(`/v1/runs/${suiteRun}`)).json()).selection
      .testIds,
  ).toEqual(["LAB-002"]);
  await page.goto("/api");
  await expect(
    page.getByText("14 executable API cases", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Run API suite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/runs\/[^/]+$/);
  const apiRun = page.url().split("/").at(-1)!;
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/v1/runs/${apiRun}`)).json()).phase,
      { timeout: 60000 },
    )
    .toBe("completed");
  const selected = (await (await page.request.get(`/v1/runs/${apiRun}`)).json())
    .selection.testIds;
  expect(selected).toHaveLength(14);
  expect(selected).not.toContain("LAB-001");
  const catalog = (
    await (await page.request.get(`/v1/projects/${project}/catalog`)).json()
  ).items;
  for (const item of catalog.filter(
    (item: { kind: string; enabled: boolean }) =>
      item.kind === "api" && item.enabled,
  )) {
    const response = await page.request.patch(
      `/v1/projects/${project}/catalog/${item.id}`,
      {
        headers: {
          Origin: "http://127.0.0.1:4200",
          "If-Match": `"${item.version}"`,
        },
        data: {
          feature: item.feature,
          module: item.module,
          owner: item.owner,
          tags: item.tags,
          priority: item.priority,
          enabled: false,
          quarantined: item.quarantined ?? false,
        },
      },
    );
    expect(response.ok()).toBe(true);
  }
  await page.goto("/api");
  await expect(
    page.getByText("0 executable API cases", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run API suite", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Execution", { exact: true }).selectOption("");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/api-disabled-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/api-disabled-mobile.png",
    fullPage: true,
  });
});
