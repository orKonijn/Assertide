import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export interface SqlConnection {
  query<T extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}

export async function connectDatabase(url?: string): Promise<SqlConnection> {
  if (url) {
    const pool = new pg.Pool({ connectionString: url });
    return {
      query: (sql, values) => pool.query(sql, values),
      close: () => pool.end(),
    };
  }
  if (process.env["NODE_ENV"] === "production")
    throw new Error("DATABASE_URL is required in production");
  const db = new PGlite(process.env["LOCAL_DATABASE_PATH"]);
  await db.waitReady;
  return {
    query: (sql, values) => db.query(sql, values),
    close: () => db.close(),
  };
}
