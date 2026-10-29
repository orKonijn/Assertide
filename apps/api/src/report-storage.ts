import { readdir, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  objectStore,
  objectReference,
  type ObjectReference,
} from "./object-store.ts";
import type { SqlConnection } from "./database.ts";

const root = fileURLToPath(new URL("../../../.local/runs/", import.meta.url));
export const reportManifest = z.object({
  remote: z.boolean().optional(),
  files: z.record(z.string(), objectReference).optional(),
});
export async function initializeReports(db: SqlConnection) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS report_builds (run_id uuid NOT NULL, directory text NOT NULL, body jsonb NOT NULL, expires_at timestamptz NOT NULL, expired boolean NOT NULL DEFAULT false, PRIMARY KEY(run_id,directory))",
  );
}
function directoryPath(id: string, directory: string) {
  z.uuid().parse(id);
  if (!/^report-[a-f0-9-]{36}$/.test(directory))
    throw new Error("Invalid report directory");
  const target = path.resolve(root, id, directory);
  if (path.dirname(target) !== path.resolve(root, id))
    throw new Error("Report path escapes run directory");
  return target;
}
export async function archiveReport(
  db: SqlConnection,
  id: string,
  directory: string,
) {
  const target = directoryPath(id, directory);
  const manifest: { remote: boolean; files?: Record<string, ObjectReference> } =
    { remote: Boolean(objectStore) };
  const run = (
    await db.query<{ ended_at: string | null }>(
      "SELECT body->>'endedAt' AS ended_at FROM platform_documents WHERE id=$1",
      [id],
    )
  ).rows[0];
  const endedAt = run?.ended_at ? new Date(run.ended_at).getTime() : Date.now();
  const expiresAt = new Date(
    Math.min(Date.now(), endedAt) + 14 * 86400000,
  ).toISOString();
  // Register the immutable prefix before uploading so interrupted builds remain
  // discoverable by retention even if no report pointer is ever published.
  await db.query(
    "INSERT INTO report_builds(run_id,directory,body,expires_at) VALUES($1,$2,$3,$4)",
    [id, directory, JSON.stringify(manifest), expiresAt],
  );
  if (objectStore) {
    const files: Record<string, ObjectReference> = {};
    const base = await realpath(target);
    const pending: { name: string; filename: string }[] = [];
    const walk = async (current: string) => {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        if (entry.isSymbolicLink())
          throw new Error("Report contains a symbolic link");
        const filename = path.join(current, entry.name);
        if (entry.isDirectory()) await walk(filename);
        else if (entry.isFile()) {
          const resolved = await realpath(filename);
          const relative = path.relative(base, resolved);
          if (relative.startsWith("..") || path.isAbsolute(relative))
            throw new Error("Report file escapes its build");
          const name = relative.split(path.sep).join("/");
          pending.push({ name, filename: resolved });
        }
      }
    };
    await walk(base);
    for (let offset = 0; offset < pending.length; offset += 8) {
      const batch = await Promise.allSettled(
        pending.slice(offset, offset + 8).map(async (item) => {
          try {
            files[item.name] = await objectStore!.put(
              `runs/${id}/reports/${directory}/${item.name}`,
              await readFile(item.filename),
              "application/octet-stream",
            );
          } catch (error) {
            throw new Error(
              `Report asset ${item.name}: ${error instanceof Error ? error.name : "upload failed"}`,
            );
          }
        }),
      );
      const failure = batch.find((item) => item.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    }
    manifest.files = files;
    if (!files["index.html"]) throw new Error("Report index missing");
  }
  // Reports may embed videos/traces; use their shorter retention so a derivative
  // cannot retain content after the original evidence expires.
  await db.query(
    "UPDATE report_builds SET body=$3 WHERE run_id=$1 AND directory=$2",
    [id, directory, JSON.stringify(manifest)],
  );
  if (objectStore) await rm(target, { recursive: true, force: true });
  return expiresAt;
}
export async function expireReports(db: SqlConnection, now = new Date()) {
  const rows = (
    await db.query<{ run_id: string; directory: string; body: unknown }>(
      "SELECT run_id,directory,body FROM report_builds WHERE expires_at <= $1 AND NOT expired LIMIT 100",
      [now.toISOString()],
    )
  ).rows;
  for (const row of rows) {
    const manifest = reportManifest.parse(row.body);
    const target = directoryPath(row.run_id, row.directory);
    if (manifest.remote || manifest.files) {
      if (!objectStore)
        throw new Error("Object store required to expire report");
      await objectStore.deleteVersions(
        `runs/${row.run_id}/reports/${row.directory}/`,
      );
    }
    await rm(target, { recursive: true, force: true });
    await db.query(
      "UPDATE report_builds SET expired=true,body='{}'::jsonb WHERE run_id=$1 AND directory=$2",
      [row.run_id, row.directory],
    );
    await db.query(
      "UPDATE platform_documents SET body=body || $3::jsonb,version=version+1 WHERE id=$1 AND body->>'reportDirectory'=$2",
      [
        row.run_id,
        row.directory,
        JSON.stringify({
          reportPhase: "expired",
          reportDiagnostic: "Expired under report retention policy",
        }),
      ],
    );
  }
}
