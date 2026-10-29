import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  DeleteObjectsCommand,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";

export const objectReference = z.object({
  key: z.string(),
  version: z.string().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ObjectReference = z.infer<typeof objectReference>;
const safeKey = (key: string) => {
  if (
    !/^runs\/[a-f0-9-]{36}\//.test(key) ||
    key.split("/").some((part) => part === ".." || part === "." || !part) ||
    key.includes("\\")
  )
    throw new Error("Invalid evidence object key");
  return key;
};
export class ObjectStore {
  readonly client: S3Client;
  constructor(
    readonly bucket: string,
    endpoint = process.env["S3_ENDPOINT"],
  ) {
    this.client = new S3Client({
      region: process.env["AWS_REGION"] ?? "us-east-1",
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      maxAttempts: 3,
    });
  }
  async put(
    key: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<ObjectReference> {
    safeKey(key);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: bytes,
            ContentType: contentType,
            Metadata: { sha256 },
            ...(process.env["S3_SSE"] === "AES256"
              ? { ServerSideEncryption: "AES256" }
              : {}),
          }),
        );
        return {
          key,
          sha256,
          ...(result.VersionId ? { version: result.VersionId } : {}),
        };
      } catch (error) {
        // The native Windows MinIO fixture can briefly deny writes during upload
        // bursts; the same writes succeed on retry. Never apply this to cloud
        // credentials or non-loopback endpoints.
        const endpoint = process.env["S3_ENDPOINT"];
        if (
          attempt >= 3 ||
          process.platform !== "win32" ||
          process.env["S3_WINDOWS_FIXTURE"] !== "true" ||
          !endpoint ||
          !["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname) ||
          !(error instanceof Error) ||
          error.name !== "AccessDenied"
        )
          throw error;
        await delay(200 * 2 ** attempt);
      }
    }
  }
  async get(reference: ObjectReference) {
    safeKey(reference.key);
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: reference.key,
        VersionId: reference.version,
      }),
    );
    if (!result.Body) throw new Error("Evidence object unavailable");
    const bytes = Buffer.from(await result.Body.transformToByteArray());
    if (createHash("sha256").update(bytes).digest("hex") !== reference.sha256)
      throw new Error("Evidence integrity check failed");
    return bytes;
  }
  async deleteVersions(prefix: string, exact = false) {
    safeKey(prefix.endsWith("/") ? `${prefix}placeholder` : prefix);
    let deleted = 0;
    do {
      const page = await this.client.send(
        new ListObjectVersionsCommand({ Bucket: this.bucket, Prefix: prefix }),
      );
      const objects = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
        .filter((item) => item.Key && (!exact || item.Key === prefix))
        .map((item) => ({ Key: item.Key!, VersionId: item.VersionId }));
      if (!objects.length) break;
      {
        const result = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
        if (result.Errors?.length)
          throw new Error("Evidence version deletion incomplete");
        deleted += objects.length;
      }
    } while (true);
    do {
      const page = await this.client.send(
        new ListMultipartUploadsCommand({
          Bucket: this.bucket,
          Prefix: prefix,
        }),
      );
      const uploads = (page.Uploads ?? []).filter(
        (upload) =>
          upload.Key && upload.UploadId && (!exact || upload.Key === prefix),
      );
      if (!uploads.length) break;
      for (const upload of uploads)
        await this.client.send(
          new AbortMultipartUploadCommand({
            Bucket: this.bucket,
            Key: upload.Key,
            UploadId: upload.UploadId,
          }),
        );
    } while (true);
    return deleted;
  }
}
export const objectStore = process.env["S3_BUCKET"]
  ? new ObjectStore(process.env["S3_BUCKET"])
  : null;
