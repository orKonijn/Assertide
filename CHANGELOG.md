# Changelog

Noteworthy completed changes are recorded here. Entries under Unreleased have not been published or deployed as a product release. Release notes follow [the project changelog rules](docs/changelog-rules.md).

## Unreleased

### Added

- Added browser execution against a pinned local Sauce Labs sandbox, with telemetry disabled. All 12 catalog browser cases pass in Chromium, Firefox and WebKit; mixed browser/API launch and Allure viewing pass through the Angular UI.
- Added authenticated live execution events, seven-day server-calculated metrics with denominator explanations, and report rebuilding that preserves test outcomes. Browser checks cover viewer launch denial, anonymous evidence denial, rejected cross-origin logout and session invalidation.
- Added a connected local workflow for OIDC sign-in, project-scoped catalog selection, suite creation, trusted-fixture Playwright execution, stored results and authorized Allure 3 viewing on a separate hostname. The browser journey passed against the running services; production isolation and the full specification remain unfinished.
- Added responsive catalog screens with light/dark themes. Desktop and 390px checks passed and screenshots were captured from the running application.
- Added an opt-in local Lab API with signed fixture tokens, SQL-backed tenant-scoped order CRUD, idempotent creation, optimistic concurrency and viewer restrictions. SQL and HTTP integration tests pass using embedded PostgreSQL-compatible development storage; deployed PostgreSQL verification and the remaining Lab fault/rate-limit cases are pending.
- Added execution-domain functions for legal phase transitions, stale-version/lease rejection, idempotent cancellation, and historical pass/retry/latency calculations. Five Node tests verify the PRD fixture and edge cases; these functions are not yet integrated with a persistent API or runner.
- Added the initial strict, standalone Angular 22 web workspace with a dependency lockfile and an explicit setup-status screen. Production compilation and two starter component tests pass; backend integration and platform workflows are not implemented or verified.
- Added the Assertide product requirements, architecture, testing-target research and test catalog, Allure and analytics specification, and implementation roadmap to guide development. These are specifications, not implemented platform features.
- Added representative Playwright TypeScript examples for checkout and API contract tests, with a dependency lockfile. Type checking and discovery of five test instances pass; target execution has not been performed.
- Added project-wide changelog and release-note rules covering compatibility-based versioning, migration guidance, actual implementation screenshots, and evidence checks.
- Added the Assertide vector logo, favicon, 18 icons, theme tokens and four Pip mascot poses, with brand usage guidance.
- Added a local design-review prototype covering 12 main screens and supporting states, light/dark themes, mobile layouts and linked journeys. Values and controls are illustrative; this is not a running automation platform.
- Added an offline Figma development plugin intended to create editable screens, components, styles, variables and prototype links. Native Figma execution and visual validation remain blocked by the connected provider quota.

### Design preview visuals

These screenshots were captured from the running local HTML design preview. They are not screenshots of a deployed platform or the Figma canvas.

![Light desktop design preview showing historical quality cards, trends and separate live activity](docs/changelog/assets/unreleased/design-preview-light-desktop.png)

Historical aggregates and the current rerun are visibly separated in the desktop preview.

![Dark desktop design preview with the same dashboard data](docs/changelog/assets/unreleased/design-preview-dark-desktop.png)

The same dashboard uses the dark palette without changing the sample data.

![Mobile design preview showing stacked cards and labeled execution rows](docs/changelog/assets/unreleased/design-preview-light-mobile.png)

The 390px preview stacks metrics and turns execution rows into labeled details.

### Known issues

- The editable Figma design is incomplete: the file was created, but Figma's Starter-plan tool limit blocked further access before screens could be added. The local generator is provided for recovery, but its output has not been executed or inspected in Figma.
