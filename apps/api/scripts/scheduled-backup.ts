import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  S3Client,
  GetBucketVersioningCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { backupDatabase } from "../src/database-backup.ts";
import { validateStorageTransport } from "../src/production-config.ts";

const bucket = process.env["BACKUP_S3_BUCKET"];
const database = process.env["DATABASE_URL"];
if (!bucket || !database)
  throw new Error("Private backup bucket and database required");
validateStorageTransport();
const client = new S3Client({
  ...(process.env["S3_ENDPOINT"]
    ? { endpoint: process.env["S3_ENDPOINT"], forcePathStyle: true }
    : {}),
});
const directory = await mkdtemp(path.join(tmpdir(), "assertide-backup-"));
let stage = "storage configuration";
try {
  if (
    (await client.send(new GetBucketVersioningCommand({ Bucket: bucket })))
      .Status !== "Enabled"
  )
    throw new Error("Backup bucket versioning is required");
  const file = path.join(directory, "database.dump");
  stage = "database dump";
  const metadata = await backupDatabase(database, file);
  const key = `postgres/${metadata.createdAt.replaceAll(":", "-")}/${metadata.sha256}.dump`;
  stage = "encrypted upload";
  const saved = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(file),
      ContentLength: metadata.bytes,
      ServerSideEncryption: "AES256",
      Metadata: { sha256: metadata.sha256 },
      IfNoneMatch: "*",
    }),
  );
  if (!saved.VersionId) throw new Error("Backup did not return a version ID");
  stage = "upload verification";
  const head = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
      VersionId: saved.VersionId,
    }),
  );
  if (
    head.ContentLength !== metadata.bytes ||
    head.Metadata?.["sha256"] !== metadata.sha256
  )
    throw new Error("Backup upload verification failed");
  stage = "metadata upload";
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${key}.json`,
      Body: await readFile(`${file}.json`),
      ServerSideEncryption: "AES256",
      IfNoneMatch: "*",
      ContentType: "application/json",
    }),
  );
  console.log(
    JSON.stringify({
      event: "backup.completed",
      bytes: metadata.bytes,
      sha256: metadata.sha256,
      createdAt: metadata.createdAt,
    }),
  );
} catch {
  console.error(
    `Scheduled backup failed during ${stage}; inspect database and private backup storage health`,
  );
  process.exitCode = 1;
} finally {
  client.destroy();
  await rm(directory, { recursive: true, force: true });
}
