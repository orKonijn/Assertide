import { test, expect } from "./fixtures";

import { randomUUID } from "node:crypto";

test("cancellation stops the worker tree and preserves completed attempts", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Quality at a glance" }),
  ).toBeVisible();
  const project = "00000000-0000-4000-8000-000000000010";
  const catalog = await (
    await page.request.get(`/v1/projects/${project}/catalog`)
  ).json();
  const launch = await page.request.post(`/v1/projects/${project}/runs`, {
    headers: {
      Origin: "http://127.0.0.1:4200",
      "Idempotency-Key": randomUUID(),
    },
    data: {
      catalogRevision: catalog.revision,
      selection: {
        testIds: catalog.items
          .filter((item: { kind: string }) => item.kind === "ui")
          .map((item: { id: string }) => item.id),
      },
      environmentId: "local-lab",
      browserProjects: ["chromium"],
      workers: 1,
      retries: 0,
      headed: false,
      video: "off",
    },
  });
  expect(launch.status()).toBe(202);
  const run = await launch.json();
  await page.goto(`/runs/${run.id}`);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/v1/runs/${run.id}`)).json()).logTail ??
        "",
      { timeout: 15000, intervals: [100] },
    )
    .toContain("UI-001");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Cancel execution", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("canceled", {
    timeout: 15000,
  });
  const final = await (await page.request.get(`/v1/runs/${run.id}`)).json();
  expect(final.results).toHaveLength(12);
  expect(
    final.results.some(
      (result: { status: string }) => result.status === "passed",
    ),
  ).toBe(true);
  expect(
    final.results.some(
      (result: { status: string }) => result.status === "canceled",
    ),
  ).toBe(true);
});
