# Contributing

Use Node.js 24 and npm 11. Run `npm run setup` from a stopped checkout, then `npm start`. Local identity configuration is generated automatically; credentials remain in ignored `.local/credentials.json`. Never commit that directory or copy its contents into a bug report.

Work on a feature branch and use meaningful Conventional Commits. Before pushing, run `npm run verify:quick` and the browser acceptance tests relevant to the change (`npm run test:e2e` runs all of them). The root lint command covers maintained JavaScript, TypeScript and Angular's external/inline templates. Run `npm run lint:fix` followed by `npm run format` before review; `npm run format:check` is a required CI gate. See [code quality conventions](docs/code-quality.md). Keep strict types, native control flow, standalone components, lifecycle-safe signals/subscriptions and server-side authorization. Do not suppress checks to hide defects.

Tests own their projects or run IDs. Unrelated app journeys use the in-memory authenticated fixture; security/login tests use fresh unauthenticated contexts. Explicitly clear storage state when creating an anonymous context from an authenticated test. Do not use arbitrary sleeps or retries to hide races. The default Playwright artifact policy avoids retaining successful authentication traces.

Linux CI supplies PostgreSQL, Redis, private MinIO and isolated OCI jobs. It runs migration/restore/load checks, audits application dependency locks, builds the web application and signs build provenance on pushes. A Windows local skip is not evidence that an infrastructure test passed; inspect the corresponding CI check.

Follow [the complete changelog rules](docs/changelog-rules.md). Record verified behavior under Unreleased and capture actual desktop/mobile UI changes in the established assets directory. Keep historical design artifacts distinguishable from implemented application evidence. Update `.env.example` and operational guidance for configuration changes. No release version is assigned by routine implementation commits.

PRs should explain behavior, relevant verification, migration/security impact and remaining limitations. Link screenshots and requirement coverage. Keep PR #1 unmerged until the owner explicitly requests a merge.

UI changes must follow the [Page Object architecture](docs/playwright-ui-architecture.md) and [implemented testing/reporting workflow](docs/ui-testing.md). Run `npm run test:architecture` and `npm run test:reporting` in `packages/automation` when changing selectors, fixtures, diagnostics or reporting. Do not regenerate committed changelog screenshots during routine test runs.
