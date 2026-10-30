# Assertide

QA automation control plane specified in [the product requirements](deliverables/01-product-requirements.md).

## Implementation status

The application supports automatic local OIDC sign-in, project and membership administration, source-backed catalog discovery, editable suites, queued execution of 15 controlled Lab API cases and 12 browser cases, live logs, attempt evidence, API investigation, analytics, scoped CI credentials, environment policies and encrypted credential references. Allure reports include compatible history and open through an authenticated viewer on a separate hostname. Private object storage supports integrity-checked evidence, report rebuilding after local raw-data loss, and retention cleanup. Linux CI exercises PostgreSQL, Redis, MinIO and isolated OCI workers. Windows development executes trusted fixtures in local processes. Supplemental practice targets and operational acceptance remain under development; the full specification is not yet complete. The files in `deliverables` are specifications, design previews and illustrative examples.

## Web development

For a new local checkout with Node.js 24 and npm 11 installed, run `npm run setup` once, then `npm start`. Open [Assertide locally](http://127.0.0.1:4200). Sign in as `admin` using the generated password in the ignored `.local/credentials.json`; issuer, client ID and callback settings are automatic. Stop the services with Ctrl+C. Run `npm run verify:quick` for local domain/API/web checks and `npm run test:e2e` for connected browser acceptance. The default local setup uses embedded PostgreSQL and filesystem evidence; S3 and isolated Linux workers remain optional infrastructure configurations below.

Use Node.js 24 and npm 11. In `apps/web`, run `npm ci`, then `npm start`. Run `npm run build` for a production build and `npm test -- --watch=false` for unit tests.

For the connected development application:

1. Run `npm ci` in `apps/api`, `apps/web`, and `packages/automation`.
2. Run `node scripts/setup-sandbox.mjs` to build the pinned local Sauce Labs fixture with telemetry disabled. Its MIT license remains in the ignored checkout.
3. From the repository root, run `node scripts/dev-api.mjs`. This generates ignored local credentials and starts the API, development OIDC provider, trusted local runner, browser sandbox and report viewer.
4. In `apps/web`, run `npm start -- --host 127.0.0.1 --proxy-config proxy.conf.json`.
5. Open `http://127.0.0.1:4200`, choose Continue with SSO, and sign in as `admin`, `operator` or `viewer` using the generated password in `.local/credentials.json`.
6. In `packages/automation`, run `npx playwright test --config platform.config.ts` for the connected browser journeys.

Optional infrastructure: [private object storage](docs/object-storage.md), [isolated Linux workers](docs/isolated-workers.md), [report history](docs/report-history.md), and [environments and credentials](docs/environments.md). Local sign-in is generated automatically; no external identity-provider account is needed for development.

The local OIDC provider is a development fixture with ephemeral signing keys. Production requires an external configured issuer and explicitly provisioned memberships. Never expose the local runner or fixture provider publicly. Credentials, databases, reports and raw results stay in ignored `.local/` storage.

The infrastructure baseline requires Docker, PostgreSQL 17, Redis and private S3-compatible storage. Follow [the architecture](deliverables/02-architecture-and-automation.md) and [implementation order](deliverables/05-roadmap.md).

## Versions

No product release is assigned. The private web package uses `0.0.0` as a tooling placeholder, not a released application version. A documented pre-1.0 compatibility policy must precede the first product release. Completed changes remain under `Unreleased` in the changelog.
