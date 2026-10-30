import {
  TraceFixturePage,
  TraceViewerPage,
} from "./support/trace-viewer.page.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import express from "express";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { testDatabase } from "./database.ts";
import { IdentityService } from "../src/identity.ts";
import { PlatformService, localProjectId } from "../src/platform.ts";
import { mountReportViewer } from "../src/report-viewer.ts";
import { captureAttachments } from "../src/artifacts.ts";
import { runRoot } from "../src/local-runner.ts";
import { objectStore } from "../src/object-store.ts";

test(
  "private trace viewer loads real actions, blocks anonymous access and clears on credential revocation",
  { skip: process.env["TEST_TRACE_VIEWER"] !== "true", timeout: 60000 },
  async () => {
    const db = await testDatabase();
    const identity = new IdentityService(db, "http://127.0.0.1");
    const platform = new PlatformService(db);
    await identity.initialize();
    await platform.initialize();
    await platform.seedLocal();
    const org = "00000000-0000-4000-8000-000000000001";
    await identity.provision({
      subject: "trace-admin",
      name: "Trace administrator",
      role: "administrator",
      organizationId: org,
      projectIds: [localProjectId],
    });
    const token = randomBytes(32).toString("hex");
    const digest = createHash("sha256").update(token).digest("hex");
    await db.query(
      "INSERT INTO sessions(digest,subject,expires_at) VALUES($1,'trace-admin',now()+interval '1 hour')",
      [digest],
    );
    const app = express();
    app.get("/fixture", (_req, res) =>
      res.send(
        "<html><head><title>Controlled trace fixture</title></head><body><button onclick=\"this.textContent='Complete'\">Start</button></body></html>",
      ),
    );
    const viewer = await mountReportViewer(app, db, identity, platform, {
      port: 0,
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const browser = await chromium.launch();
    const id = randomUUID();
    const output = path.resolve(runRoot, id);
    if (path.dirname(output) !== path.resolve(runRoot))
      throw new Error("Unsafe trace fixture cleanup");
    await mkdir(path.join(output, "evidence"), { recursive: true });
    try {
      const recording = await browser.newContext();
      await recording.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      });
      const fixture = new TraceFixturePage(await recording.newPage());
      await fixture.goto(origin);
      await fixture.start();
      await expect(fixture.complete).toBeVisible();
      const trace = path.join(output, "evidence", "trace.zip");
      await recording.tracing.stop({ path: trace });
      await recording.close();
      const artifacts = await captureAttachments(
        id,
        "UI-001:chromium",
        1,
        [{ name: "trace", contentType: "application/zip", path: trace }],
        (value) => value,
      );
      await db.query(
        "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'run',$4)",
        [
          id,
          org,
          localProjectId,
          JSON.stringify({
            id,
            projectId: localProjectId,
            phase: "completed",
            reportPhase: "failed",
            artifacts,
          }),
        ],
      );
      assert.equal(
        (
          await fetch(`${origin}/v1/runs/${id}/traces/${artifacts[0]!.id}`, {
            redirect: "manual",
          })
        ).status,
        401,
      );
      const context = await browser.newContext();
      await context.addCookies([
        { name: "assertide_session", value: token, url: origin },
      ]);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const traceViewer = new TraceViewerPage(page);
      await traceViewer.goto(origin, id, artifacts[0]!.id);
      await expect(traceViewer.actions).toBeVisible({ timeout: 15000 });
      await expect(traceViewer.recordedClick).toBeVisible({ timeout: 15000 });
      await expect
        .poll(() => traceViewer.containsCompletedSnapshot(), { timeout: 10000 })
        .toBe(true);
      assert.deepEqual(errors, []);
      const assetsUrl = page.url().split("?")[0]!;
      assert.equal((await fetch(assetsUrl)).status, 403);
      await db.query("DELETE FROM sessions WHERE digest=$1", [digest]);
      await expect(page).toHaveURL(/\/auth-status$/, { timeout: 8000 });
      assert.equal((await context.request.get(assetsUrl)).status(), 403);
      await context.close();
    } finally {
      await browser.close();
      viewer.closeAllConnections();
      server.closeAllConnections();
      await Promise.all([
        new Promise<void>((resolve) => viewer.close(() => resolve())),
        new Promise<void>((resolve) => server.close(() => resolve())),
      ]);
      if (objectStore) await objectStore.deleteVersions(`runs/${id}/`);
      await db.close();
      await rm(output, { recursive: true, force: true });
    }
  },
);
