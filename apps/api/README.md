# Control service and Lab fixture

Node 24, npm 11. From the repository root, run `npm run setup` then `npm start` for the connected app with automatic local OIDC. In this directory, `npm ci`, `npm run typecheck` and `npm test` verify the API. Root `npm run test:e2e` verifies browser workflows.

The Nest/Express service exposes authenticated `/v1` platform routes for projects, catalogs, suites, execution, evidence, analytics and operations. Authorization is project scoped. Unexpected failures return a generic message with the same request identifier used in safe, allowlisted diagnostic logs.

The opt-in controlled Lab uses `/lab/v1`, separate from platform authentication. It provides signed five-minute tokens, tenant-scoped orders, role checks, atomic idempotent creation, conditional updates/deletion, deterministic fault hooks and rate limiting. For isolated fixture development, set `ENABLE_LAB=true`, `LAB_PASSWORD` (at least 12 characters) and `LAB_SIGNING_KEY` (at least 32 characters). Never use production secrets. Fixture users are `operator-a`, `viewer-a`, and `operator-b`.

Set `DATABASE_URL` to PostgreSQL for deployment. Non-production fallback uses PGlite, optionally persisted at `LOCAL_DATABASE_PATH`. Production refuses fallback and Lab mode. Checksum-locked migrations preserve existing data; separate execution/report supervisors use leases and bounded shutdown. Execution supervisors prepare current-image sources before claiming work. Production uses shared durable `SOURCE_ROOT` storage for historical revisions.

See [production deployment](../../docs/production-deployment.md), [migrations](../../docs/migrations.md), [worker isolation](../../docs/isolated-workers.md) and [implementation/test coverage](../../docs/implementation-verification.md). Infrastructure-gated tests run in Linux CI; local skipped tests are not reported as passing.
