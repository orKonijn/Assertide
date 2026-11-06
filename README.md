# Assertide

Assertide is a testing workspace that connects test selection, execution and failure investigation. Built by **Or Konijn**, an independent freelancer creating website-testing tools for companies, it demonstrates company-focused testing workflows.

[Explore the live demo](https://assertide.com) · [Creator and architecture](https://assertide.com/about) · [Verification workflow](https://github.com/orKonijn/Assertide/actions/workflows/verify.yml)

## A three-minute tour

1. Choose **Explore as guest**. No account is needed; all guest data is synthetic.
2. Browse **Projects**, **Test suites** and **Test explorer**.
3. In **Overview**, choose **Try a simulated run**, then inspect the failed checkout result and its API example.
4. Open **Reports → Open Allure sample → Checkout displays delivery estimate** to inspect the missing field assertion.

The guest tour does not launch workers or prove a real test run passed. For real automation, inspect [API lifecycle tests](packages/automation/tests/lab.spec.ts), [UI scenarios](packages/automation/tests/store.spec.ts), [fixture isolation](packages/automation/ui/fixtures/platform.fixture.ts), and [retry-aware metrics](packages/domain/execution.ts).

## Verification evidence and limits

The [Verify workflow](https://github.com/orKonijn/Assertide/actions/workflows/verify.yml) is the source of current CI results. Select the exact commit being reviewed, inspect failed or skipped steps, and download its evidence artifacts. Image publication and a local build are not substitutes for completed Linux infrastructure checks. No claim of green CI is made by this README; see [how to assess verification evidence](docs/recruiter-review.md).

Public registration on the pilot is currently limited; existing users can sign in. The guest demo remains available without an account. The architecture page describes supported configurations, not a guarantee that every deployment uses them.

## Implementation status

The [free pilot at assertide.com](https://assertide.com) now includes the guest workspace, graphs and synthetic Allure sample. Existing sign-in works; public registration remains disabled pending email/provider configuration. See the [2026-11-01 deployment evidence and limitations](docs/guest-pilot-deployment.md). Product publication numbering is documented in [the version policy](docs/versioning.md) and [changelog](CHANGELOG.md).

The runnable application includes automatic local OIDC sign-in, project/member administration, source-backed discovery, editable suites, queued execution, live logs, attempt investigation, Allure 3 history and private viewers, scoped CI credentials, encrypted environment references, and transactional historical analytics. It includes 65 controlled API cases and 62 UI cases across three browsers, with masked screenshots for each named browser workflow step; 14 supplemental public-practice cases are available through an explicitly manual command. Run `npm run test:regression` for all controlled cases; see [coverage and commands](docs/regression-coverage.md). Linux CI exercises PostgreSQL, Redis, MinIO and separate execution/report supervisors with isolated OCI jobs. Windows development runs trusted fixtures locally.

See [implementation, test coverage and remaining production gates](docs/implementation-verification.md). The files in `deliverables` are the original specifications, design previews and illustrative examples. The approved free pilot is available at [assertide.com](https://assertide.com); see its [verification and limitations](docs/pilot-verification.md). See the product release history in [CHANGELOG.md](CHANGELOG.md).

## Web development

Available in 0.5.0: [opt-in accessibility review on controlled browser runs](docs/run-accessibility.md), with advisory rule findings, manual-review needs, explicit final-state coverage, saved ownership and expiring administrator-approved exceptions. This is separate from the platform's own accessibility acceptance checks.

The reviewed 0.6.2 release candidate includes the 0.6.0 controlled, three-sample Lighthouse benchmark milestone. Its [usage, isolated Linux verification and remaining release gates](docs/performance-budgets.md) are documented separately. The deployed pilot remains on 0.5.0.

For a new local checkout with Node.js 24 and npm 11 installed, run `npm run setup` once, then `npm start`. Open [Assertide locally](http://127.0.0.1:4200). Sign in as `admin` using the generated password in the ignored `.local/credentials.json`; issuer, client ID and callback settings are automatic. Stop the services with Ctrl+C. Run `npm run verify:quick` for local domain/API/web checks and `npm run test:e2e` for connected browser acceptance. The default local setup uses embedded PostgreSQL and filesystem evidence; S3 and isolated Linux workers remain optional infrastructure configurations below.

Once [local MinIO](docs/object-storage.md#local-real-service-verification) is configured, `npm start` restores its saved configuration, starts MinIO automatically if needed, and waits for storage readiness. There is no need to launch it in a separate terminal. Explicit external S3 settings take precedence.

Use Node.js 24 and npm 11. In `apps/web`, run `npm ci`, then `npm start`. Run `npm run build` for a production build and `npm test -- --watch=false` for unit tests.

For the connected development application:

1. Run `npm ci` in `apps/api`, `apps/web`, and `packages/automation`.
2. Run `node scripts/setup-sandbox.mjs` to build the pinned local Sauce Labs fixture with telemetry disabled. Its MIT license remains in the ignored checkout.
3. From the repository root, run `node scripts/dev-api.mjs`. This generates ignored local credentials and starts the API, development OIDC provider, trusted local runner, browser sandbox and report viewer.
4. In `apps/web`, run `npm start -- --host 127.0.0.1 --proxy-config proxy.conf.json`.
5. Open `http://127.0.0.1:4200`, choose Sign in, and sign in as `admin`, `operator` or `viewer` using the generated password in `.local/credentials.json`.
6. In `packages/automation`, run `npx playwright test --config platform.config.ts` for the connected browser journeys.

Optional infrastructure: [private object storage](docs/object-storage.md), [isolated Linux workers](docs/isolated-workers.md), [report history](docs/report-history.md), and [environments and credentials](docs/environments.md). Local sign-in is generated automatically; no external identity-provider account is needed for development.

The local OIDC provider is a development fixture with ephemeral signing keys. Production requires an external configured issuer and explicitly provisioned memberships. Never expose the local runner or fixture provider publicly. Credentials, databases, reports and raw results stay in ignored `.local/` storage.

The infrastructure baseline requires Docker, PostgreSQL 17, Redis and private S3-compatible storage. Follow [the architecture](deliverables/02-architecture-and-automation.md) and [implementation order](deliverables/05-roadmap.md).

See [UI automation and Allure reports](docs/ui-testing.md) for Page Object boundaries, focused test commands, CI artifacts and credential-safe diagnostics.

## Versions

Product releases follow [the pre-1.0 version policy](docs/versioning.md) and are recorded in [CHANGELOG.md](CHANGELOG.md). The About page reads its build version from `apps/web/src/app/core/release.ts`. Private npm package versions remain internal tooling placeholders. Completed changes stay under `Unreleased` until publication is verified.

## Production deployment

Kubernetes Jobs, Vault Transit workload authentication, service/web images, TLS ingress manifests, health/metrics and encrypted scheduled backups are documented in [production deployment](docs/production-deployment.md). The renderer requires real registry digests and deployment bindings. CI exercises the adapters and scans the images; the manual image publication workflow does not merge or deploy the application.
