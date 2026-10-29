# Private evidence storage

Set `S3_BUCKET`, `S3_ENDPOINT` (for compatible services), `AWS_REGION`, and AWS credentials through the deployment secret manager to use private object storage. Standard AWS credential-provider discovery is supported. The application never makes buckets public or returns permanent object URLs. Enable bucket versioning externally; `S3_SSE=AES256` requests provider-managed encryption when the selected service supports it.

Evidence is stored under run-scoped immutable keys. PostgreSQL authorization is checked before each download and every report asset request. Stored references contain a SHA-256 digest and the provider's version identifier. Downloads verify integrity. Report uploads register their prefix first, upload all assets, then publish the complete manifest and pointer. An interrupted upload remains unpublished and discoverable by retention. Rebuilding creates a new prefix; existing viewer tickets remain bound to the build they opened.

The deletion worker removes every object version and delete marker, aborts unfinished multipart uploads, and retains artifact tombstones. Screenshots/text evidence expire after 30 days; traces/videos after 14. Currently generated reports and raw execution files conservatively expire after 14 days because they may contain copies of short-lived evidence. Normalized results and audit records expire after 365 days. Report expiry never changes test outcomes. Raw expiry prevents report rebuilds and removes live log tails. Separating short-lived embedded attachments from the report's intended 30-day retention remains an implementation gap.

## Local real-service verification

MinIO is a development test fixture, not a managed production storage deployment. Its source revision and AGPL license are retained in the ignored checkout. Go 1.27.3 was used to build it; on Windows, place a checksum-verified Go distribution under `.local/tools/go` or set `GO_BINARY`.

1. Run `node scripts/setup-object-store.mjs` to build the pinned source.
2. Run `node scripts/dev-object-store.mjs`. It generates private local credentials and binds only loopback port 9000. Service output is suppressed to prevent accidental credential logging.
3. Run `node scripts/with-local-object-store.mjs apps/api/node_modules/tsx/dist/cli.mjs apps/api/scripts/setup-bucket.ts` to create a private versioned development bucket.
4. Start the API using `node scripts/with-local-object-store.mjs scripts/dev-api.mjs`.
5. Run the usual platform browser tests. They exercise object-backed evidence, report viewing/rebuilding and post-logout denial.

The wrapper enables bounded retries for observed transient `AccessDenied` writes in the native Windows loopback fixture only. Production authentication errors are not retried by that exception. CI builds the same MinIO source on Linux and runs the database and browser workflows with PostgreSQL, Redis and versioned object storage.

Local S3 integration tests verify private GET denial, retrieval of an earlier object version, hash mismatch rejection, deletion of versions/delete markers and multipart cleanup. Storage tests also verify report expiration preserves normalized results. Do not treat these checks as a backup/restore drill or a production security certification.
