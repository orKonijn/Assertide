import {
  S3Client,
  CreateBucketCommand,
  PutBucketVersioningCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
const bucket = process.env["S3_BUCKET"];
if (!bucket || !process.env["S3_ENDPOINT"])
  throw new Error("Explicit local S3_BUCKET and S3_ENDPOINT are required");
const url = new URL(process.env["S3_ENDPOINT"]);
if (!["127.0.0.1", "localhost"].includes(url.hostname))
  throw new Error(
    "This setup helper is limited to loopback development storage",
  );
const client = new S3Client({
  region: "us-east-1",
  endpoint: url.href,
  forcePathStyle: true,
});
try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
} catch (error) {
  if (
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode !== 404
  )
    throw error;
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
}
await client.send(
  new PutBucketVersioningCommand({
    Bucket: bucket,
    VersioningConfiguration: { Status: "Enabled" },
  }),
);
client.destroy();
console.log(
  "Private development bucket is ready with object versioning enabled.",
);
