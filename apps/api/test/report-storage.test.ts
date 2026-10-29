import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { testDatabase } from "./database.ts";
import { PlatformService, localProjectId } from "../src/platform.ts";
import {
  archiveReport,
  expireReports,
  reportManifest,
} from "../src/report-storage.ts";
import { objectStore } from "../src/object-store.ts";
test("immutable report builds publish complete manifests and expire without deleting outcomes", async () => {
  const db = await testDatabase();
  const service = new PlatformService(db);
  await service.initialize();
  const id = randomUUID();
  const directory = `report-${randomUUID()}`;
  const target = fileURLToPath(
    new URL(`../../../.local/runs/${id}/${directory}/`, import.meta.url),
  );
  try {
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "index.html"), "<html>Report</html>");
    await db.query(
      "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'run',$4)",
      [
        id,
        "00000000-0000-4000-8000-000000000001",
        localProjectId,
        JSON.stringify({
          id,
          projectId: localProjectId,
          phase: "completed",
          results: [{ id: "LAB-001", status: "passed" }],
          reportPhase: "ready",
          reportDirectory: directory,
        }),
      ],
    );
    await archiveReport(db, id, directory);
    const row = (
      await db.query<{ body: unknown }>(
        "SELECT body FROM report_builds WHERE run_id=$1",
        [id],
      )
    ).rows[0];
    assert.ok(row);
    const manifest = reportManifest.parse(row.body);
    if (objectStore) {
      assert.ok(manifest.files?.["index.html"]);
      assert.equal(
        (await objectStore.get(manifest.files["index.html"])).toString(),
        "<html>Report</html>",
      );
      await assert.rejects(access(target));
    }
    await expireReports(db, new Date(Date.now() + 15 * 86400000));
    await assert.rejects(access(target));
    const run = (
      await db.query<{
        body: { phase: string; reportPhase: string; results: unknown[] };
      }>("SELECT body FROM platform_documents WHERE id=$1", [id])
    ).rows[0];
    assert.equal(run?.body.phase, "completed");
    assert.equal(run?.body.reportPhase, "expired");
    assert.equal(run?.body.results.length, 1);
    if (objectStore && manifest.files?.["index.html"])
      await assert.rejects(objectStore.get(manifest.files["index.html"]));
  } finally {
    await db.close();
  }
});
