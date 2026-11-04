# Evidence collection and workspace guide

## Findings and repair

The pilot run `83406ab4-2497-41e6-8197-cab2f0060889` retained 127 complete Allure result records, all passed, with every referenced attachment present. Its application records instead contained 127 synthetic “No terminal result received” placeholders after a Kubernetes artifact transfer failure. Those placeholders were incorrectly counted as failures because the run was marked completed.

The checkpoint reporter embedded binary attachments in both checkpoint and JSON summaries. A controlled 70 MiB attachment fixture reproduces oversized summaries; the revised reporter stores those attachments in files, keeping both summaries below 1 MiB without losing their contents. The retained production evidence and transfer error establish the collection failure; the oversized-summary mechanism is validated by the controlled regression rather than a retained original summary file.

On 2026-11-05, a guarded one-run recovery verified all 127 result IDs and all referenced attachments, backed up the original run privately, and restored the recorded outcomes. Analytics now contain 127 eligible, final-passed and first-attempt-passed results. Recovery also restored 1,392 attachments including 556 API exchanges. No tests were rerun and no outcomes were inferred solely from console text. Raw evidence archiving completed; report generation is tracked separately from these recovered test outcomes.

The recovered report subsequently exhausted its 2 GiB worker limit during Allure generation (the pod recorded `OOMKilled`). The report deployment now allows 4 GiB; API and execution limits remain unchanged. Operators must reserve sufficient node capacity before applying this setting. The pilot had more than 8 GiB available before rollout.

The first rebuilt report exposed a second packaging problem: parallel ZIP compression started a worker per large attachment and starved health/lease processing. ZIP exports now use standard stored entries instead of recompressing screenshots and traces. Exports remain ordinary ZIP files with unchanged contents and retention rules, but may be larger for text-heavy reports. The existing 256 MiB input cap remains.

## Implementation and rollout

- Binary attachments become private files before checkpoint and JSON reporting.
- Kubernetes transfer/cleanup failures return an infrastructure exit status. Missing terminal results also prevent a run being classified as completed.
- Raw evidence archival and restoration transfer at most eight files concurrently. Each batch settles before failure is propagated; run ownership, path, integrity and retention checks remain in place.
- Getting started is available in the sidebar on desktop and mobile. Its guide explains workspace selection, execution prerequisites, test selection and evidence inspection without assuming a project is empty.
- Clear selection sits with execution actions. API workspace explains missing evidence and avoids showing a one-page pager or promising an available Allure report.

The fixes are published on main and deployed to the pilot on 2026-11-05. API/service, web and immutable automation worker images were updated together; the API prepared the new source snapshot through the existing deployment procedure. Existing run evidence is not rewritten by deployment. No database migration or authentication change is required. Rollback uses prior image digests; the separately backed-up one-run repair must not be reverted merely by deploying older code.

## Verification

- `npm run verify:quick`: passed. Existing access-entry stylesheet budget warning remains (4.37 kB against 4 kB).
- Reporting checks: passed, including actual Playwright output with 70 MiB of file attachments.
- Architecture checks: passed.
- Execution outcome tests: passed for complete pass/fail exits, missing results, transfer error, cancellation and timeout.
- Controlled object-storage fixture: archive/restore of 16 files passed, with eight simultaneous transfers and exact restored contents.
- Focused connected browser journeys: four passed, covering API evidence, drawer behavior and Getting started navigation on desktop/mobile. Existing catalog selection/clear behavior also passed.
- Three fresh-context registration checks passed, including verified workspace provisioning and invalid/reused verification handling.
- Actual running UI captures: desktop/mobile, dark/light guide accessibility scans and no horizontal page overflow passed. API empty-state screenshots use an explicitly controlled infrastructure-error fixture.

Linux isolation and real object-storage integration checks are not part of local quick verification. See the production checks and remaining CI/storage limitations below.

## Running UI evidence

![Getting started desktop with sidebar navigation and four workflow steps](changelog/assets/unreleased/evidence-fix-guide-dark-1440.png)

[Mobile guide](changelog/assets/unreleased/evidence-fix-guide-dark-390.png) · [Test explorer selection actions](changelog/assets/unreleased/evidence-fix-explorer.png)

![API workspace with explicit missing-evidence guidance](changelog/assets/unreleased/evidence-fix-api-empty.png)

[Mobile API workspace](changelog/assets/unreleased/evidence-fix-api-mobile.png). These are screenshots of the local running implementation, not design mockups.

## Pilot publication — 2026-11-05

Application source `9da7ae3a5b19f0d79c367e1fcc318bc60b905bf3` is on main. [Image publication 41929990210](https://github.com/orKonijn/Assertide/actions/runs/41929990210) passed builds, smoke tests and vulnerability scans. All three image signatures/provenance were verified against that exact commit and the hosted publication workflow before rollout. No product release version is assigned.

- service: `ghcr.io/orkonijn/assertide-service@sha256:861c5d0c332d3c03f783ffe53979528bd5084fc81f3273e6b947b04511b1aafc`
- web: `ghcr.io/orkonijn/assertide-web@sha256:fa41bb0a2845b06845c6875f99ab1ba316a671faccf736d6379d74411e8c58f3`
- worker: `ghcr.io/orkonijn/assertide-worker@sha256:e2ce368d695bad510367b28e4b85034cf2dd500b20ca01f05d06c4d357d01162`

API, execution, report and web deployments became ready; scheduled backups use the same service image. Report memory is capped at 4 GiB. Previous images/configuration remain in private rollback storage. No authentication settings, public registration policy, DNS, storage billing cap or user credentials were changed.

Live checks passed for HTTPS entry, production sign-in, frontend/API connectivity, the sidebar guide at desktop/mobile widths, anonymous private-data denial and logout. A controlled `LAB-001`/`UI-001` execution on the newly published evidence worker (`836493d3-0a68-4853-829f-7d3f15cfa925`) completed with both tests passed and ten attachments captured. The final ZIP packaging code also round-tripped 64 controlled files (12.8 MB) on the deployed report worker in 121 ms. This is a bounded fixture measurement, not a general performance guarantee. The temporary verification identity was disabled and its sessions/project access revoked afterward; its local password file was removed.

### Remaining report and CI limitations

The original run retains 127 recovered passes, 1,392 attachments and 556 API exchanges. The large Allure output was generated during verification, but ZIP packaging interrupted publication before the final packaging fix. Subsequent report restoration for the fresh run hit the provider error: “Cannot download file, download bandwidth or transaction (Class B) cap exceeded.” The storage cap was not raised automatically. Report generation/access is therefore **not verified end to end** after the final fix. Once the provider cap resets or is explicitly adjusted by the owner, use **Rebuild report** on the affected completed runs and verify private report access. Retained evidence and outcomes were not deleted.

The broader [initial Verify run](https://github.com/orKonijn/Assertide/actions/runs/41927820545) recorded a failed platform-browser step while infrastructure work continued. The [final-source Verify run](https://github.com/orKonijn/Assertide/actions/runs/41929990806) was still running at handoff. Neither is claimed fully green; local quick checks and the separate image publication succeeded.
