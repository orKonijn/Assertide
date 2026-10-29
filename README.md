# Assertide

QA automation control plane specified in [the product requirements](deliverables/01-product-requirements.md).

## Implementation status

The local development application supports OIDC sign-in, project-scoped catalog browsing, suite creation, queued execution of 15 controlled Lab API cases and 12 browser cases, execution results, and an authenticated Allure 3 viewer on a separate hostname. The local runner executes only this repository's trusted fixtures and is not a production isolation boundary. Production worker isolation, full catalog discovery, supplemental practice targets, operational acceptance and several specification features remain under development. The files in `deliverables` are specifications, design previews and illustrative examples.

## Web development

Use Node.js 24 and npm 11. In `apps/web`, run `npm ci`, then `npm start`. Run `npm run build` for a production build and `npm test -- --watch=false` for unit tests.

For the connected development application:

1. Run `npm ci` in `apps/api`, `apps/web`, and `packages/automation`.
2. Run `node scripts/setup-sandbox.mjs` to build the pinned local Sauce Labs fixture with telemetry disabled. Its MIT license remains in the ignored checkout.
3. From the repository root, run `node scripts/dev-api.mjs`. This generates ignored local credentials and starts the API, development OIDC provider, trusted local runner, browser sandbox and report viewer.
3. In `apps/web`, run `npm start -- --host 127.0.0.1 --proxy-config proxy.conf.json`.
4. Open `http://127.0.0.1:4200`, choose Continue with SSO, and sign in as `admin`, `operator` or `viewer` using the generated password in `.local/credentials.json`.
5. In `packages/automation`, run `npx playwright test --config platform.config.ts` for the connected browser journey. The local services must be running.

The local OIDC provider is a development fixture with ephemeral signing keys. Production requires an external configured issuer and explicitly provisioned memberships. Never expose the local runner or fixture provider publicly. Credentials, databases, reports and raw results stay in ignored `.local/` storage.

The infrastructure baseline requires Docker, PostgreSQL 17, Redis and private S3-compatible storage. Follow [the architecture](deliverables/02-architecture-and-automation.md) and [implementation order](deliverables/05-roadmap.md).

## Versions

No product release is assigned. The private web package uses `0.0.0` as a tooling placeholder, not a released application version. A documented pre-1.0 compatibility policy must precede the first product release. Completed changes remain under `Unreleased` in the changelog.
