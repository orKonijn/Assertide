import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { z } from "zod";
test("unauthenticated API and report assets disclose no evidence", async ({
  request,
}) => {
  expect((await request.get("/v1/projects")).status()).toBe(401);
  expect(
    (
      await request.get("/v1/runs/00000000-0000-4000-8000-000000000000/events")
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.get(
        "http://localhost:4012/reports/00000000-0000-4000-8000-000000000000/index.html",
      )
    ).status(),
  ).toBe(403);
});
test("viewer cannot launch, forged origin is rejected and logout expires access", async ({
  page,
}) => {
  const credentials = z
    .object({ password: z.string() })
    .parse(JSON.parse(await readFile("../../.local/credentials.json", "utf8")));
  await page.goto("/");
  await page.getByRole("link", { name: "Continue with SSO" }).click();
  await page.getByLabel("Account").selectOption("viewer");
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Quality at a glance" }),
  ).toBeVisible();
  const project = "00000000-0000-4000-8000-000000000010";
  const config = {
    catalogRevision: "local-lab-v1",
    selection: { testIds: ["LAB-001"] },
    environmentId: "local-lab",
    browserProjects: [],
    workers: 1,
    retries: 0,
    headed: false,
    video: "off",
  };
  const launch = await page.request.post(`/v1/projects/${project}/runs`, {
    headers: {
      Origin: "http://127.0.0.1:4200",
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: config,
  });
  expect(launch.status()).toBe(403);
  expect(
    (
      await page.request.post("/auth/logout", {
        headers: { Origin: "https://untrusted.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get(
        "/v1/projects/00000000-0000-4000-8000-000000000099/catalog",
      )
    ).status(),
  ).toBe(404);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Continue with SSO" }),
  ).toBeVisible();
  expect((await page.request.get("/v1/me")).status()).toBe(401);
});

test("idle session revocation clears protected content and preserves the return URL", async ({
  page,
}) => {
  const credentials = z
    .object({ password: z.string() })
    .parse(JSON.parse(await readFile("../../.local/credentials.json", "utf8")));
  await page.goto("/explorer?query=LAB");
  await page.getByRole("link", { name: "Continue with SSO" }).click();
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Test explorer", exact: true }),
  ).toBeVisible();
  const identity = await (await page.request.get("/v1/me")).json();
  expect(Date.parse(identity.sessionExpiresAt)).toBeGreaterThan(Date.now());
  await page.request.post("/auth/logout", {
    headers: { Origin: "http://127.0.0.1:4200" },
    data: {},
  });
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByRole("link", { name: "Continue with SSO" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Test explorer", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Continue with SSO" }),
  ).toHaveAttribute("href", /returnTo=%2Fexplorer%3Fquery%3DLAB/);
});
