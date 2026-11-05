# Audit remediation

This change addresses the 2026-11-05 design and usability audit of v0.2.2. It does not amend the original PDF or turn untested conditions into passing checks.

| Audit item                  | Implemented response                                                                                                                                                                                                                                      | Verification                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| F01: hidden save failures   | Suite and metadata errors render inside the active dialog. Draft values are retained, with retry/conflict guidance; errors receive focus and scroll into view even after a mobile submission; background alerts are suppressed while that editor is open. | Controlled suite 409/422/503 responses remain visible; a subsequent retry saves the draft. Metadata 409 remains visible inside its editor.  |
| F02: light contrast         | Darkened the light muted-text token from #526169 to #45545c without brightening the canvas.                                                                                                                                                               | Repeated 69-state route/theme/viewport scan returned zero axe violations. This is not full WCAG conformance or screen-reader certification. |
| F03: mobile history density | Filters default closed on mobile with a selected-filter count. Desktop defaults expanded. Query-backed filters survive refresh; disclosure does not clear them.                                                                                           | At 390 x 844, the empty/result area is in the viewport; selected query filters survive refresh.                                             |
| F04: suite review           | Added Selected only and 4/8/12 rows per page. The existing membership set remains the source of truth.                                                                                                                                                    | Deselecting in review removes the row and saves exactly 64 of 65 API tests. Existing membership persistence and bulk selection still pass.  |
| F05: release wording        | About displays a demonstration-build version from core/release.ts; README now links to the established product policy and changelog.                                                                                                                      | Build version is 0.3.0; historical release records remain unchanged.                                                                        |
| Q01: stale selector         | Updated the quarantine accessible name and separated explanatory text with aria-describedby.                                                                                                                                                              | The previously failing quarantine/disabled-policy persistence journey now passes.                                                           |

## Verification

- `npm run verify:quick`: passed. Existing access-entry stylesheet size warning remains.
- Focused browser suite: 14 passed (remediation, catalog and suites).
- Architecture and safe-reporting checks: passed, including the 70 MiB attachment fixture.
- Actual local captures and accessibility matrix: 69 states, 11 authenticated routes across 1440 x 900, 768 x 1024 and 390 x 844 in both themes, plus dialog/public states. No document overflow or automated accessibility violations in that sample.
- One overlapping local test invocation lost its test-owned web server when another invocation shut down. The affected journeys were rerun sequentially and passed; connection errors were not treated as product failures or suppressed.
- Human screen-reader testing, other browser engines, infrastructure CI and production storage/report access remain separate checks.

## Visual evidence

[Modal save error](changelog/assets/unreleased/audit-fixes-modal-error.png) · [Mobile save error](changelog/assets/unreleased/audit-fixes-mobile-error.png) · [Light contrast](changelog/assets/unreleased/audit-fixes-light-contrast.png) · [Mobile history](changelog/assets/unreleased/audit-fixes-mobile-history.png) · [Selected-only review](changelog/assets/unreleased/audit-fixes-selected-review.png).

These are screenshots of the running local implementation with controlled data and an explicitly injected save error. For comparable prior behavior, see the audit PDF's findings F01-F04; no generated mockups are used.

## Publication build prerequisite

The first publication scan rejected the worker base image for fixable HIGH findings in apt and libapt-pkg6.0t64 (installed 2.8.3; scanner fixed version 2.8.4ubuntu0.1). The worker build now upgrades those system packages alongside the existing Brotli update. The vulnerability gate remained enabled; the final replacement publication passed before deployment.

## Compatibility

The change is a compatible UI/workflow addition, published as product 0.3.0 under the pre-1.0 policy. No API or database migration is needed. Existing run outcomes, selections in saved suites, permissions and evidence retention are unchanged. This publication updated the web and service/worker images together to include the worker system-package fixes. Rollback restores the previous signed image set and worker-image configuration from the private pre-rollout snapshot. The release metadata constant should be updated when assigning subsequent product versions.

## Production publication - 2026-11-05

Published application source `5236f5cb95f9f07d1cc05192f8c9abd88b5a16ae` to main. [Image publication 42033762823](https://github.com/orKonijn/Assertide/actions/runs/42033762823) passed builds, smoke tests, vulnerability scans and signing. All three image digests were verified against this exact source and the hosted workflow before rollout.

- web: `ghcr.io/orkonijn/assertide-web@sha256:005e8394c22cd5fcec8d701290413273294e1e8261419affe5121b4bd272f70b`
- service: `ghcr.io/orkonijn/assertide-service@sha256:70b2c5ea7ca6127d327fba694b9905e48a8e3ff4d4162f4a7457feb9290b978a`
- worker: `ghcr.io/orkonijn/assertide-worker@sha256:4614859476b7b41b7051ddc7bf08cf2213ab67faeb10e1df0237ddb29cc92a7d`

API, web, execution and report deployments became ready; backup jobs use the same service image. Previous configuration was saved privately for rollback. No data migration, authentication-policy change, storage cap increase or owner credential change occurred.

Live checks passed for sign-in, anonymous access denial, mobile navigation, selected-only/page-size review, visible/focused mobile suite-save errors, metadata conflict feedback, collapsed mobile history with visible results, the v0.3.0 About identity, a light-theme explorer axe scan and logout. Save faults were intercepted in the verification browser; the draft suite and metadata conflict were not persisted in production.

Controlled run `b4dc0e07-29ef-41db-84f2-4b1117cb2ee3` completed with both API/browser tests passed on the new isolated worker. Its private Allure report reached ready, opened for the authenticated verifier and denied anonymous access. This validates that owned run, not every historical production report.

The temporary verification identity was disabled, its provider/application sessions and project access revoked, and the temporary local password file removed. The original owner account was unchanged. [Broader Verify 42033761801](https://github.com/orKonijn/Assertide/actions/runs/42033761801) was still running at handoff; no fully green infrastructure-CI or complete accessibility-conformance claim is made.
