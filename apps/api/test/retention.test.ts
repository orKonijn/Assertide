import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { testDatabase } from "./database.ts";
import { PlatformService, localProjectId } from "../src/platform.ts";
import { expireRunData } from "../src/retention.ts";
test("retention removes expired raw evidence, then history, without removing recent results", async () => {
  const db = await testDatabase();
  const platform = new PlatformService(db);
  await platform.initialize();
  const id = randomUUID();
  const directory = fileURLToPath(
    new URL(`../../../.local/runs/${id}/`, import.meta.url),
  );
  const endedAt = new Date().toISOString();
  try {
    await mkdir(path.join(directory, "allure-results"), { recursive: true });
    await writeFile(path.join(directory, "allure-results", "data.json"), "{}");
    await db.query(
      "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'run',$4)",
      [
        id,
        "00000000-0000-4000-8000-000000000001",
        localProjectId,
        JSON.stringify({
          id,
          phase: "completed",
          endedAt,
          logTail: "private execution log",
          results: [{ status: "passed" }],
        }),
      ],
    );
    assert.deepEqual(
      await expireRunData(db, new Date(Date.now() + 15 * 86400000)),
      { rawRuns: 1, historyRuns: 0 },
    );
    await assert.rejects(access(path.join(directory, "allure-results")));
    const preserved = (
      await db.query<{
        body: { logTail?: string; results: unknown[]; rawExpiredAt?: string };
      }>("SELECT body FROM platform_documents WHERE id=$1", [id])
    ).rows[0]?.body;
    assert.ok(preserved?.rawExpiredAt);
    assert.equal(preserved.logTail, undefined);
    assert.equal(preserved.results.length, 1);
    assert.deepEqual(
      await expireRunData(db, new Date(Date.now() + 366 * 86400000)),
      { rawRuns: 0, historyRuns: 1 },
    );
    assert.equal(
      (await db.query("SELECT id FROM platform_documents WHERE id=$1", [id]))
        .rows.length,
      0,
    );
    await assert.rejects(access(directory));
  } finally {
    await db.close();
  }
});
