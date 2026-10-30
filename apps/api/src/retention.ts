import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { SqlConnection } from "./database.ts";
import { objectStore } from "./object-store.ts";
import { removeShortLivedFiles } from "./evidence-files.ts";
const root = fileURLToPath(new URL("../../../.local/runs/", import.meta.url));
function runPath(id: string) {
  z.uuid().parse(id);
  const target = path.resolve(root, id);
  if (path.dirname(target) !== path.resolve(root))
    throw new Error("Retention path escapes run storage");
  return target;
}
export async function expireRunData(db: SqlConnection, now = new Date()) {
  const shorter = (
    await db.query<{ id: string }>(
      "SELECT id FROM platform_documents WHERE kind='run' AND body->>'phase' IN ('completed','canceled','timed_out','infrastructure_error') AND body->>'endedAt'<$1 AND NOT body ? 'shortEvidenceExpiredAt' LIMIT 100",
      [new Date(now.getTime() - 14 * 86400000).toISOString()],
    )
  ).rows;
  for (const row of shorter) {
    if (objectStore)
      await objectStore.deleteVersions(`runs/${row.id}/raw/short/`);
    const directory = runPath(row.id);
    await removeShortLivedFiles(path.join(directory, "allure-results"));
    await removeShortLivedFiles(path.join(directory, "evidence"));
    await db.query(
      "UPDATE platform_documents SET body=body || $2::jsonb,version=version+1 WHERE id=$1",
      [row.id, JSON.stringify({ shortEvidenceExpiredAt: now.toISOString() })],
    );
  }
  const cutoff = new Date(now.getTime() - 30 * 86400000).toISOString();
  const rows = (
    await db.query<{ id: string }>(
      "SELECT id FROM platform_documents WHERE kind='run' AND body->>'phase' IN ('completed','canceled','timed_out','infrastructure_error') AND body->>'endedAt'<$1 AND NOT body ? 'rawExpiredAt' LIMIT 100",
      [cutoff],
    )
  ).rows;
  for (const row of rows) {
    if (objectStore) await objectStore.deleteVersions(`runs/${row.id}/raw/`);
    const directory = runPath(row.id);
    for (const name of [
      "allure-results",
      "evidence",
      "attempts.ndjson",
      "results.json",
      "worker.log",
      "history.jsonl",
      "allure.config.mjs",
    ]) {
      const target = path.resolve(directory, name);
      if (path.dirname(target) !== directory)
        throw new Error("Raw evidence path escaped storage");
      await rm(target, { recursive: true, force: true });
    }
    await db.query(
      "UPDATE platform_documents SET body=(body - 'logTail') || $2::jsonb,version=version+1 WHERE id=$1",
      [
        row.id,
        JSON.stringify({
          rawExpiredAt: now.toISOString(),
          rawUnavailableReason:
            "Raw evidence expired after 30 days; report rebuilding is unavailable",
        }),
      ],
    );
  }
  const historyCutoff = new Date(now.getTime() - 365 * 86400000).toISOString();
  const expired = (
    await db.query<{ id: string }>(
      "SELECT id FROM platform_documents WHERE kind='run' AND body->>'phase' IN ('completed','canceled','timed_out','infrastructure_error') AND body->>'endedAt'<$1 LIMIT 100",
      [historyCutoff],
    )
  ).rows;
  for (const row of expired) {
    const target = runPath(row.id);
    if (objectStore) await objectStore.deleteVersions(`runs/${row.id}/`);
    await rm(target, { recursive: true, force: true });
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM run_events WHERE run_id=$1", [row.id]);
      await tx.query("DELETE FROM run_outbox WHERE run_id=$1", [row.id]);
      await tx.query("DELETE FROM launch_keys WHERE run_id=$1", [row.id]);
      await tx.query("DELETE FROM report_builds WHERE run_id=$1", [row.id]);
      // Report tickets are created only when the viewer is mounted.
      if (
        (await tx.query("SELECT to_regclass('report_tickets') AS table_name"))
          .rows[0]?.["table_name"]
      )
        await tx.query("DELETE FROM report_tickets WHERE run_id=$1", [row.id]);
      await tx.query(
        "DELETE FROM platform_documents WHERE id=$1 AND kind='run'",
        [row.id],
      );
    });
  }
  await db.query(
    "DELETE FROM platform_documents WHERE kind='audit' AND body->>'occurredAt'<$1",
    [historyCutoff],
  );
  await db.query(
    "UPDATE report_history SET body=COALESCE((SELECT jsonb_agg(entry) FROM jsonb_array_elements(body) entry WHERE entry->>'endedAt'>=$1),'[]'::jsonb),version=version+1 WHERE (lease_expires IS NULL OR lease_expires<now()) AND EXISTS (SELECT 1 FROM jsonb_array_elements(body) entry WHERE entry->>'endedAt'<$1)",
    [historyCutoff],
  );
  return { rawRuns: rows.length, historyRuns: expired.length };
}
