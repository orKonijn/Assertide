# Audit remediation

This change addresses the 2026-11-05 design and usability audit of v0.2.2. It does not amend the original PDF or turn untested conditions into passing checks.

| Audit item                  | Implemented response                                                                                                                                                            | Verification                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| F01: hidden save failures   | Suite and metadata errors render inside the active dialog. Draft values are retained, with retry/conflict guidance; background alerts are suppressed while that editor is open. | Controlled suite 409/422/503 responses remain visible; a subsequent retry saves the draft. Metadata 409 remains visible inside its editor.  |
| F02: light contrast         | Darkened the light muted-text token from #526169 to #45545c without brightening the canvas.                                                                                     | Repeated 69-state route/theme/viewport scan returned zero axe violations. This is not full WCAG conformance or screen-reader certification. |
| F03: mobile history density | Filters default closed on mobile with a selected-filter count. Desktop defaults expanded. Query-backed filters survive refresh; disclosure does not clear them.                 | At 390 x 844, the empty/result area is in the viewport; selected query filters survive refresh.                                             |
| F04: suite review           | Added Selected only and 4/8/12 rows per page. The existing membership set remains the source of truth.                                                                          | Deselecting in review removes the row and saves exactly 64 of 65 API tests. Existing membership persistence and bulk selection still pass.  |
| F05: release wording        | About displays a demonstration-build version from core/release.ts; README now links to the established product policy and changelog.                                            | Build version is 0.3.0; historical release records remain unchanged.                                                                        |
| Q01: stale selector         | Updated the quarantine accessible name and separated explanatory text with aria-describedby.                                                                                    | The previously failing quarantine/disabled-policy persistence journey now passes.                                                           |

## Verification

- `npm run verify:quick`: passed. Existing access-entry stylesheet size warning remains.
- Focused browser suite: 13 passed (remediation, catalog and suites).
- Architecture and safe-reporting checks: passed, including the 70 MiB attachment fixture.
- Actual local captures and accessibility matrix: 69 states, 11 authenticated routes across 1440 x 900, 768 x 1024 and 390 x 844 in both themes, plus dialog/public states. No document overflow or automated accessibility violations in that sample.
- One overlapping local test invocation lost its test-owned web server when another invocation shut down. The affected journeys were rerun sequentially and passed; connection errors were not treated as product failures or suppressed.
- Human screen-reader testing, other browser engines, infrastructure CI and production storage/report access remain separate checks.

## Visual evidence

[Modal save error](changelog/assets/unreleased/audit-fixes-modal-error.png) · [Light contrast](changelog/assets/unreleased/audit-fixes-light-contrast.png) · [Mobile history](changelog/assets/unreleased/audit-fixes-mobile-history.png) · [Selected-only review](changelog/assets/unreleased/audit-fixes-selected-review.png).

These are screenshots of the running local implementation with controlled data and an explicitly injected save error. For comparable prior behavior, see the audit PDF's findings F01-F04; no generated mockups are used.

## Publication build prerequisite

The first publication scan rejected the worker base image for fixable HIGH findings in apt and libapt-pkg6.0t64 (installed 2.8.3; scanner fixed version 2.8.4ubuntu0.1). The worker build now upgrades those system packages alongside the existing Brotli update. The vulnerability gate remains enabled; the replacement publication must pass before deployment.

## Compatibility

The change is a compatible UI/workflow addition, planned as product 0.3.0 under the pre-1.0 policy. No API or database migration is needed. Existing run outcomes, selections in saved suites, permissions and evidence retention are unchanged. Deployment can update the web image; rollback restores its previous signed digest. The release metadata constant should be updated when assigning subsequent product versions.
