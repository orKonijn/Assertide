import { randomUUID } from "node:crypto";
import pg from "pg";
import { connectDatabase, type SqlConnection } from "../src/database.ts";

/** Each integration test gets its own schema, including when tests run concurrently. */
export async function testDatabase(): Promise<SqlConnection> {
  const url = process.env["TEST_DATABASE_URL"];
  if (!url) return connectDatabase();
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const scoped = new URL(url);
  scoped.searchParams.set("options", `-c search_path=${schema}`);
  const database = await connectDatabase(scoped.href);
  return {
    driver: "postgres",
    query: (sql, values) => database.query(sql, values),
    transaction: (handler) => database.transaction(handler),
    close: async () => {
      await database.close();
      try {
        await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      } finally {
        await admin.end();
      }
    },
  };
}
