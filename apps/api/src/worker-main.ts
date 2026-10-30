import { connectDatabase } from "./database.ts";
import { LocalRunner } from "./local-runner.ts";

const role = process.env["WORKER_ROLE"];
if (role !== "execution" && role !== "report")
  throw new Error("WORKER_ROLE must be execution or report");
if (!process.env["DATABASE_URL"] || !process.env["S3_BUCKET"])
  throw new Error(
    "Separate workers require PostgreSQL and shared object storage",
  );
if (
  role === "execution" &&
  (!process.env["REDIS_URL"] ||
    !["oci", "kubernetes"].includes(process.env["WORKER_RUNTIME"] ?? ""))
)
  throw new Error("Separate execution workers require Redis and OCI isolation");
const db = await connectDatabase(process.env["DATABASE_URL"]);
// The API applies migrations before workers start. Never seed identities here.
await db.query("SELECT id FROM schema_migrations LIMIT 1");
const runner = new LocalRunner(db, role);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void runner
      .stop()
      .then(() => db.close())
      .catch(() => {
        process.exitCode = 1;
      });
  });
try {
  await runner.start();
  console.log(`Assertide ${role} worker ready`);
} catch {
  await runner.stop();
  await db.close();
  throw new Error("Worker startup failed; check infrastructure configuration");
}
