import express from "express";
import { connectDatabase } from "./database.ts";
import { LabService, mountLab } from "./lab.ts";
import { startLocalSandbox } from "./local-sandbox.ts";
export async function startWorkerFixtures(
  password: string,
  signingKey: string,
) {
  const db = await connectDatabase();
  const lab = new LabService(db, password, signingKey);
  await lab.initialize();
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  mountLab(app, lab);
  const server = app.listen(4010, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const browser = await startLocalSandbox();
  return async () => {
    server.closeAllConnections();
    browser.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => server.close(() => resolve())),
      new Promise<void>((resolve) => browser.close(() => resolve())),
    ]);
    await db.close();
  };
}
