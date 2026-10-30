import { test, expect } from "./fixtures";
import { readFile, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
test("compatible reports retain history and authenticated links without duplicate rebuild entries", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/explorer");
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
  const download = await page.request.get(
    `/v1/runs/${first.id}/report-download`,
  );
  expect(download.status()).toBe(200);
  const archive = await download.body();
  expect(archive.subarray(0, 4).toString("hex")).toBe("504b0304");
  expect(createHash("sha256").update(archive).digest("hex")).toBe(
    download.headers()["x-checksum-sha256"],
  );
  expect(download.headers()["x-report-generation"]).toBe(first.reportDirectory);
  const anonymous = await page
    .context()
    .browser()!
    .newContext({ storageState: { cookies: [], origins: [] } });
  expect(
    (
      await anonymous.request.get(
        `http://127.0.0.1:4200/v1/runs/${first.id}/report-download`,
      )
    ).status(),
  ).toBe(401);
  await anonymous.close();
  expect(first.toolchain.playwright).toBe("1.64.1");
  expect(first.results[0].attempts[0].steps.length).toBeGreaterThan(0);
  const firstRaw = path.resolve(
    "../../.local/runs",
    z.uuid().parse(first.id),
    "allure-results",
  );
  expect(
    await readFile(path.join(firstRaw, "environment.properties"), "utf8"),
  ).toContain("Playwright=1.64.1");
  const resultName = (await readdir(firstRaw)).find((name) =>
    name.endsWith("-result.json"),
  )!;
  const enriched = JSON.parse(
    await readFile(path.join(firstRaw, resultName), "utf8"),
  );
  expect(
    enriched.labels.some(
      (label: { name: string }) => label.name === "severity",
    ),
  ).toBe(true);
  const second = await create();
  const comparison = await (
    await page.request.get(
      `/v1/runs/${second.id}/results/${second.results[0].id}/previous`,
    )
  ).json();
  expect(comparison.previous.runId).toBe(first.id);
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
  if (first.rawArchive) {
    const runId = z.uuid().parse(first.id);
    const runDirectory = path.resolve("../../.local/runs", runId);
    const rawDirectory = path.resolve(runDirectory, "allure-results");
    if (path.dirname(rawDirectory) !== runDirectory)
      throw new Error("Unsafe evidence cleanup");
    await rm(rawDirectory, { recursive: true, force: true });
  }
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
  const resultId = first.results[0].id;
  await page.goto(`/runs/${first.id}?result=${encodeURIComponent(resultId)}`);
  const note = `Investigation ${randomUUID().slice(0, 8)}: verified the recorded request contract.`;
  await page.getByLabel("Diagnosis", { exact: true }).fill(note);
  await page
    .getByRole("button", { name: "Add investigation note", exact: true })
    .click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Test results", exact: true }),
    })
    .screenshot({
      path: "../../docs/changelog/assets/unreleased/result-investigation.png",
    });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    fullPage: true,
    path: "../../docs/changelog/assets/unreleased/result-investigation-mobile.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  const reportCard = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Allure report", exact: true }),
  });
  await expect(
    reportCard.getByRole("link", { name: "Download report ZIP" }),
  ).toBeVisible();
  await reportCard.screenshot({
    path: "../../docs/changelog/assets/unreleased/report-download.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await reportCard.screenshot({
    path: "../../docs/changelog/assets/unreleased/report-download-mobile.png",
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(
    page.getByRole("heading", { name: "Execution environment", exact: true }),
  ).toBeVisible();
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Execution environment",
        exact: true,
      }),
    })
    .screenshot({
      path: "../../docs/changelog/assets/unreleased/execution-environment.png",
    });
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
