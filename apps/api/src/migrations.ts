import { createHash } from "node:crypto";
import type { SqlConnection } from "./database.ts";

/** Additive, checksum-locked migrations. A failed batch and its marker roll back together. */
export async function migrate(
  db: SqlConnection,
  id: string,
  statements: readonly string[],
) {
  if (!/^[a-z0-9-]{1,80}$/.test(id) || !statements.length)
    throw new Error("Invalid migration definition");
  const checksum = createHash("sha256")
    .update(JSON.stringify(statements))
    .digest("hex");
  await db.transaction(async (tx) => {
    // Serialize cold starts before creating the ledger. PGlite serializes its
    // transactions internally; PostgreSQL coordinates separate API processes.
    if (db.driver === "postgres")
      await tx.query("SELECT pg_advisory_xact_lock(742193811)");
    await tx.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const previous = (
      await tx.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (previous) {
      if (previous.checksum !== checksum)
        throw new Error(
          `Applied migration ${id} has changed; add a new migration instead`,
        );
      return;
    }
    for (const statement of statements) await tx.query(statement);
    await tx.query("INSERT INTO schema_migrations(id,checksum) VALUES($1,$2)", [
      id,
      checksum,
    ]);
  });
}
