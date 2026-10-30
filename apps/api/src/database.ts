import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export interface SqlExecutor {
  query<T extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface SqlConnection extends SqlExecutor {
  transaction<T>(handler: (connection: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function connectDatabase(url?: string): Promise<SqlConnection> {
  if (url) {
    const pool = new pg.Pool({ connectionString: url });
    // Idle clients can disconnect during failover or shutdown. pg removes the
    // client before emitting this event; subsequent queries open a new one.
    // Never log the error object: it can contain connection credentials.
    pool.on("error", () => {
      console.warn("PostgreSQL idle connection lost; pool will reconnect");
    });
    return {
      query: (sql, values) => pool.query(sql, values),
      transaction: async (handler) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const value = await handler({
            query: (sql, values) => client.query(sql, values),
          });
          await client.query("COMMIT");
          return value;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (process.env["NODE_ENV"] === "production")
    throw new Error("DATABASE_URL is required in production");
  const db = new PGlite(process.env["LOCAL_DATABASE_PATH"]);
  await db.waitReady;
  return {
    query: (sql, values) => db.query(sql, values),
    transaction: (handler) =>
      db.transaction((tx) =>
        handler({ query: (sql, values) => tx.query(sql, values) }),
      ),
    close: () => db.close(),
  };
}
