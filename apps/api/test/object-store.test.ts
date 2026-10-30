import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ListObjectVersionsCommand,
  CreateMultipartUploadCommand,
  ListMultipartUploadsCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { ObjectStore } from "../src/object-store.ts";

test(
  "S3 evidence is private, version-pinned, integrity checked and fully deleted including multipart uploads",
  { skip: !process.env["S3_BUCKET"] },
  async () => {
    const store = new ObjectStore(process.env["S3_BUCKET"]!);
    const prefix = `runs/${randomUUID()}/retention/`;
    try {
      const first = await store.put(
        `${prefix}evidence`,
        Buffer.from("first version"),
        "text/plain",
      );
      const second = await store.put(
        `${prefix}evidence`,
        Buffer.from("second version"),
        "text/plain",
      );
      assert.ok(first.version);
      assert.notEqual(first.version, second.version);
      assert.equal((await store.get(first)).toString(), "first version");
      await assert.rejects(
        store.get({ ...second, sha256: "0".repeat(64) }),
        /integrity/,
      );
      const publicResponse = await fetch(
        `${process.env["S3_ENDPOINT"]}/${store.bucket}/${first.key}`,
      );
      assert.equal(publicResponse.status, 403);
      await store.client.send(
        new DeleteObjectCommand({ Bucket: store.bucket, Key: first.key }),
      );
      await store.client.send(
        new CreateMultipartUploadCommand({
          Bucket: store.bucket,
          Key: `${prefix}interrupted`,
        }),
      );
      assert.equal(await store.deleteVersions(prefix), 3);
      const versions = await store.client.send(
        new ListObjectVersionsCommand({ Bucket: store.bucket, Prefix: prefix }),
      );
      assert.equal(versions.Versions?.length ?? 0, 0);
      assert.equal(versions.DeleteMarkers?.length ?? 0, 0);
      const uploads = await store.client.send(
        new ListMultipartUploadsCommand({
          Bucket: store.bucket,
          Prefix: prefix,
        }),
      );
      assert.equal(uploads.Uploads?.length ?? 0, 0);
      await assert.rejects(store.get(first));
      await assert.rejects(store.deleteVersions("runs/"), /Invalid/);
    } finally {
      await store.deleteVersions(prefix);
      store.client.destroy();
    }
  },
);
