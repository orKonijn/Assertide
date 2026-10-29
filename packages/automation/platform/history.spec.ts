import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
test("compatible reports retain history and authenticated links without duplicate rebuild entries", async ({
  page,
}) => {
  test.setTimeout(60000);
  const credentials = z
    .object({ password: z.string() })
    .parse(JSON.parse(await readFile("../../.local/credentials.json", "utf8")));
  await page.goto("/explorer");
  await page.getByRole("link", { name: "Continue with SSO" }).click();
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/explorer$/);
  const project = "00000000-0000-4000-8000-000000000010";
  const catalog = await (
    await page.request.get(`/v1/projects/${project}/catalog`)
  ).json();
  const create = async () => {
    const response = await page.request.post(`/v1/projects/${project}/runs`, {
      headers: {
        Origin: "http://127.0.0.1:4200",
        "Idempotency-Key": randomUUID(),
      },
      data: {
        catalogRevision: catalog.revision,
        selection: { testIds: ["LAB-002", "LAB-003"] },
        environmentId: "local-lab",
        browserProjects: [],
        workers: 1,
        retries: 0,
        headed: false,
        video: "off",
      },
    });
    expect(response.status()).toBe(202);
    const created = await response.json();
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/v1/runs/${created.id}`)).json())
            .reportPhase,
        { timeout: 20000 },
      )
      .toBe("ready");
    return await (await page.request.get(`/v1/runs/${created.id}`)).json();
  };
  const first = await create();
  const second = await create();
  expect(second.historyStream).toBe(first.historyStream);
  expect(second.historyEntries).toBe(first.historyEntries + 1);
  const lineage = await (
    await page.request.get(`/v1/runs/${second.id}/history`)
  ).json();
  expect(
    lineage.items.some((item: { runId: string }) => item.runId === first.id),
  ).toBe(true);
  await page.goto(`/runs/${second.id}`);
  await page
    .getByRole("link", { name: first.id.slice(0, 8), exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/runs/${first.id}$`));
  await expect(
    page.getByRole("heading", {
      name: `Run ${first.id.slice(0, 8)}`,
      exact: true,
    }),
  ).toBeVisible();
  const rebuild = await page.request.post(
    `/v1/runs/${first.id}/report-rebuilds`,
    { headers: { Origin: "http://127.0.0.1:4200" }, data: {} },
  );
  expect(rebuild.status()).toBe(202);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/v1/runs/${first.id}`)).json())
          .historyVersion,
      { timeout: 20000 },
    )
    .toBeGreaterThan(second.historyVersion);
  const rebuilt = await (await page.request.get(`/v1/runs/${first.id}`)).json();
  expect(rebuilt.historyEntries).toBe(second.historyEntries);
  const report = await page.context().newPage();
  await report.goto(
    `http://127.0.0.1:4200/v1/runs/${first.id}/report/index.html`,
  );
  await expect(report).toHaveURL(/localhost:4012\/reports\//);
  await expect(
    report.getByRole("button", { name: "Expand all", exact: true }),
  ).toBeVisible();
  await report.close();
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Compatible execution history",
        exact: true,
      }),
    })
    .screenshot({
      path: "../../docs/changelog/assets/unreleased/report-history.png",
    });
});
