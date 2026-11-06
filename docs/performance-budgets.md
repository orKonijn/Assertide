# Performance budgets

The **0.5.0** release introduced the internal parser and advisory evaluator in `apps/api/src/lighthouse-results.ts`. The **0.6.0** source milestone added real collection; **0.6.1** and **0.6.2** contain the QA corrections below. The combined feature was first deployed as **0.6.2 on 2026-11-07**.

## Accepted measurements

The normalizer accepts Lighthouse navigation reports only for the approved local storefront origin and explicit static fixture routes. External origins, credentials, query strings, fragments and unapproved routes are rejected. Redirects between different approved routes, runtime errors and missing browser/profile metadata are labeled invalid rather than passed.

The returned summary retains the tool version, capture time, approved route, form factor, a hash of the browser/tool/viewport/throttling profile and four measurements: LCP milliseconds, CLS, total blocking time milliseconds and transferred bytes. Missing/error metrics remain null. Raw DOM, screenshots, full URLs, diagnostics and runtime-error text are omitted from the returned value. The collector below also sanitizes evidence before attachment; the general normalizer does not publish raw reports.

## Advisory evaluation

Evaluation requires exactly three valid samples with distinct capture timestamps and the same route/profile. Missing measurements, incompatible profiles, duplicates or invalid samples produce Inconclusive decisions. Timing spread above 20% of the median also produces Inconclusive rather than a noisy timing pass/fail.

The caller supplies absolute limits for all four metrics. LCP, CLS and total blocking time use the three-sample median; transferred bytes uses the worst sample. Each decision includes the sample count, minimum, median, maximum, limit and reason. This is a laboratory comparison, not field INP, a composite Lighthouse score or a blocking deployment gate.

The contract follows the [official Lighthouse result schema](https://github.com/GoogleChrome/lighthouse/blob/main/types/lhr/lhr.d.ts). Timing variability is a reason to retain sample context rather than equate a single score with a regression; see [Lighthouse performance scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring/).

## Controlled catalog benchmark

The following run-level workflow is the **unreleased 0.7.0** extension; the live 0.6.2 publication is recorded below.

1. In Test explorer, select your approved tests and choose Local Lab. UI-001 does not need to be selected. API-only and mixed selections are supported.
2. Set the functional browser, workers and retries as usual. Enable **Benchmark catalog performance** and start the execution. The server independently enforces the Local Lab restriction and existing project authorization/quotas.
3. Selected tests complete with their configured retries first. A separate, serial, headless Chromium worker then logs in to the controlled catalog and collects one three-sample Lighthouse benchmark. It always uses one worker and zero benchmark retries, independently of the functional settings. Benchmark setup is not added to the selected functional results or their Allure report.
4. Run detail displays one **Run benchmark** summary with medians, ranges and advisory budgets. Unavailable evidence is Not measured. Cancellation before measurement skips it; cancellation during the benchmark stops its active worker and preserves already completed functional outcomes. Existing canceled-run reporting policy remains in effect.

The run remains active until the optional benchmark phase settles. Functional failures that exhaust retries still permit the advisory benchmark; infrastructure failure or cancellation skips it. Failed or malformed benchmark evidence cannot change functional outcomes. The separate phase adds one worker startup, not one benchmark per selected case or retry.

The frozen desktop profile uses 1350 × 940 at device scale 1, simulated 40 ms RTT, 10,240 Kbps throughput and CPU multiplier 1. Browser cache is cleared before every sample while fixture login storage is preserved. Setup/cache tabs close before measurement, keeping one benchmark renderer active. Collection is limited to the exact approved local inventory URL, with a separate Chromium instance and a 150-second collection deadline; load/FCP waits are capped at 15 seconds per sample. The benchmark fixture has its own bounded 180-second setup/teardown budget; ordinary functional test timeouts are unchanged. The worker schema restricts only the benchmark phase to its fixed case/browser/concurrency combination; functional workers receive performance=false. No arbitrary destinations or protocol-load traffic are enabled.

The fixed advisory limits are LCP 2,500 ms, CLS 0.1, blocking time 200 ms and transferred bytes 1,000,000. These are initial lab thresholds, not a measured production SLA. The test fixture can legitimately produce Inconclusive timing results when the host is noisy. Three samples and cold-cache byte counts are shown rather than implying a score or precision the evidence does not support.

Only an allowlisted measurement envelope reaches Playwright/Allure. The private artifact importer limits this envelope to 100 KB, validates it, and rewrites stored content to the normalized metric summary. It rejects incomplete sample sets and unsupported URLs. New runs retain one unique run-level artifact with resultId `catalog-benchmark` and benchmark attempt 1. Duplicate artifacts cannot substitute for valid evidence. Functional retry attempts do not determine benchmark coverage. Historical 0.6.x per-case summaries remain unchanged; consumers must not assume new performance rows join to selected functional result IDs. The existing private artifact access and 30-day retention apply; normalized summaries follow run history retention of 365 days. No database migration or new public service is needed.

### Installation, rollout and recovery

The automation lockfile pins Lighthouse 13.6.0, chrome-launcher 1.2.3 and Puppeteer Core 25.16.0. Use `npm ci` to install reproducibly. Puppeteer Core is Lighthouse's browser-control toolchain; declaring the existing version directly adds no browser download. The collector uses the existing Playwright Chromium executable, independently of Playwright's trace recorder. Its debugging endpoint listens on loopback inside the worker, and its temporary profile is removed on completion. Cancellation uses the existing worker/process-tree lifetime controls; the collection deadline also terminates its browser.

The Kubernetes cancel flag is written with a single-process file operation in the existing transfer container, avoiding another Node VM near the pod PID limit. Canceled Playwright traces can retain resource names containing `@`; both transfer endpoints accept that character while retaining their path traversal, absolute-path, symlink and size checks. The existing hard-stop fallback remains available.

Deploy matching API, web and rebuilt worker images before enabling the option in isolated environments. Rebuild the approved automation source snapshot: its new lockfile must match the immutable worker image. Historical runs keep their original source/image constraints. Disable the option to return to ordinary functional execution; rolling back does not require rewriting prior results. This extension has been exercised with the trusted Windows local runner and separate Linux OCI/Kubernetes candidate jobs. The matching images were published and deployed as **0.6.2**; see the publication record below.

### Verification and remaining scope

Local quick verification, eight focused browser journeys, architecture/reporting checks and four desktop/mobile dark/light axe/reflow checks cover the extension. The benchmark journey collected real Lighthouse samples and reloaded their budget table while UI-001 remained passed, including combined accessibility/performance collection. Importer tests reject malformed evidence and keep private canaries out of stored JSON; API tests reject unsupported profiles and unauthorized launch. Actual screenshots are recorded in the 0.6.0/0.6.1 source milestone and 0.6.2 release entries. The milestone screenshots show a trusted local UI run; the 0.6.2 screenshots show the deployed site. The separate Linux checks below verify isolated worker behavior.

### Isolated Linux verification - 2026-11-06

The candidate was built and exercised on the existing ARM64 host without changing live deployment images or worker configuration. Both execution paths used the approved frozen automation revision `50b2873c8da940f732445145668c0c944bc29b6e26ead634b3f63c9d4c57fed6`, with one CPU, 2 GiB memory and the existing 256-process limit. The local candidate image digest was `sha256:e047cfb2697b3ec5fc492fa73e7bad7673ae8dab15a1e384a5e20b0b3aa06c0e`; this is a development verification reference, not a published registry image or signed release.

| Check                                                           | OCI               | Kubernetes                                                   |
| --------------------------------------------------------------- | ----------------- | ------------------------------------------------------------ |
| UI-001 functional result remains passed                         | Passed            | Passed                                                       |
| Final functional screenshot retained                            | Passed            | Passed                                                       |
| Three valid, bounded Lighthouse samples and all four metrics    | Passed            | Passed                                                       |
| Raw storage/DOM/image fields excluded from measurement evidence | Passed            | Passed                                                       |
| Cancellation after the first recorded sample                    | Container removed | Cooperative flag accepted, evidence transferred, Job removed |

Both profiles reported blocking-time variability as Inconclusive rather than turning noise into a budget pass. Baseline isolated-worker checks also exercised non-root execution, denied source/root writes and blocked external traffic. All candidate Jobs/containers were confirmed removed, and the live API, execution/report supervisors, web and worker configuration still matched the deployed 0.5.0 images.

Repeat the new integration checks with an immutable worker image:

```sh
# OCI: existing isolated-worker image, non-root Docker supervisor
cd apps/api
OCI_WORKER_IMAGE=sha256:<image-id> npx tsx --test test/performance-worker.test.ts

# Kubernetes: existing scoped supervisor configuration and immutable registry image
TEST_KUBERNETES=true OCI_WORKER_IMAGE=<image>@sha256:<digest> npx tsx --test test/performance-worker.test.ts
```

The test file skips a runtime when its prerequisites are absent; a skip is not a pass. The established Linux CI commands now include this file after the baseline worker checks. The Windows checks and the bounded ARM64 candidate checks do not establish a fully green GitHub/Linux infrastructure matrix. At that candidate-verification point, signed image publication, deployment and live verification remained pending. Their completed 0.6.2 evidence is recorded below.

Additional routes, mobile profiles, configurable per-project budgets, cross-run comparison UI, CI blocking gates and bounded protocol-load testing remain future work. The bounded candidate checks do not establish production performance, availability or a production SLA.

## QA review patches - 0.6.1 and 0.6.2

The 0.6.0 implementation is preserved as source milestone `5247c77`. The reviewed 0.6.1 source milestone adds pre-launch profile recovery, an explicit Browser control name and clear Unavailable metric ranges. The 0.6.2 patch additionally corrects the evidence test to use the configured S3/filesystem backend. It is the first live rollout of this feature; no separate 0.6.0 or 0.6.1 live deployment is claimed. The worker collector, approved targets, sample profile, isolation and cancellation contracts are unchanged from the Linux verification above.

## Publication - 0.6.2 - 2026-11-07

Source `3569c80e9c5ee084232ac5e9625788ded07dd96c` was published to main. [Image publication 42300506426](https://github.com/orKonijn/Assertide/actions/runs/42300506426) passed native ARM64 builds, vulnerability gates and signing. Each image's signed provenance was verified against this source before rollout.

| Component | Deployed digest                                                           |
| --------- | ------------------------------------------------------------------------- |
| service   | `sha256:cfc70d6c76a7c482e6b8ee910029252627a796aefa35d89bc2762277b0e0634d` |
| web       | `sha256:d322516a4f83bd27cb89948b2556d833f123864f3b7e9fa22cf9e952a2c930bf` |
| worker    | `sha256:f02979150f8cc1ebb53500b70e167395158cb503916b4957174acebab5cc3414` |

Images were pre-pulled, execution/report queues were confirmed idle, and matching API, execution/report supervisor and web components were rolled out. All four deployments became ready and their configured image digests matched the verified images; the worker setting matched too. The previous deployment/configuration snapshot remains private for rollback. No database migration, authorization change, public destination, new service or egress relaxation was introduced.

Live verification passed entry/anonymous denial, sign-in, invalid benchmark-setting recovery, UI-001 with combined accessibility and three valid Lighthouse samples, retained functional screenshot, ordinary LAB-001 with benchmark disabled, reload persistence, dark/light mobile reflow, normalized private artifact access, anonymous artifact denial, private Allure generation/opening, v0.6.2 build identity and logout. Blocking-time variability was correctly Inconclusive; it did not change the functional pass. Actual live desktop/mobile screenshots are included in the changelog. The temporary verification identity was disabled, provider/application sessions revoked, project access removed, and its local credential copy deleted; the owner identity was unchanged.

The initial [Verify run 42299121645](https://github.com/orKonijn/Assertide/actions/runs/42299121645) exposed a filesystem-only assumption in the new performance-evidence test when the private object-store backend was active. That was corrected in 0.6.2 without changing application storage or authorization. The corrected test passed three checks against an owned, real versioned MinIO fixture, then passed again in the GitHub PostgreSQL/MinIO-backed API matrix. [Verify run 42300505824](https://github.com/orKonijn/Assertide/actions/runs/42300505824) also passed load/restore and isolated-worker checks and was still running the broader controlled regression/infrastructure matrix at publication. No fully green infrastructure CI claim is made.

Final local verification: quick lint/format/type/unit/build checks, all 65 platform acceptance journeys, reporting/architecture checks, and four desktop/mobile dark/light axe/reflow checks passed. The 0.6.2 correction was additionally tested against the private MinIO fixture; the fixture was removed afterward. Existing CSS-budget/logo-size warnings and moderate frontend/reporting toolchain audit findings remain; the high/critical dependency and image gates passed. The bounded ARM64 candidate and live checks do not establish production performance or an availability SLA.

## 0.7.0 rollout and compatibility (unreleased)

Roll out matching API/web/worker source images. The execution supervisor runs two sequential commands, with a fresh isolated Job/container ID for the benchmark. Both phases use the frozen approved source and worker image. Cancellation, lease ownership, private storage, resource limits, egress denial and deadlines remain enforced. No migration, dependency upgrade or new public service is required. The result JSON shape is retained, but new performance coverage is run-level (`catalog-benchmark`), not keyed to a selected test or its last retry. Existing stored summaries are not rewritten.

To recover, disable the optional benchmark; ordinary functional execution is unchanged. Preserve historical source snapshots and images when rolling back. Raw benchmark setup output is separate from the selected-test Allure input; only the bounded, normalized checkpoint is exposed as a private run artifact.

### 0.7.0 candidate verification - 2026-11-07

Local quick verification, focused mixed-selection/cancellation/report journeys and four desktop/mobile dark/light axe/reflow checks passed. A full 62-case Chromium selection with one retry configured completed with 62 functional passes, exactly one normalized performance attachment, one three-sample collection and a ready Allure report. A mixed selection without UI-001 also retained only its three selected functional results; cancellation during the separate phase preserved completed outcomes.

The native ARM64 worker contract was exercised with the approved source revision `7d3c3f47135b644606cd0c4cfde412992386d3d840350b94b7bbdddc7de0903f` in both OCI and Kubernetes. Each profile first completed LAB-001/UI-002/UI-003 with two retries configured and performance disabled, then ran one separate fixed benchmark, retained three valid sanitized samples, and passed cancellation during an additional benchmark. The unchanged worker protocol was checked with the previously signed 0.6.2 worker digest `sha256:f02979150f8cc1ebb53500b70e167395158cb503916b4957174acebab5cc3414`. Resource/egress restrictions were preserved; no worker Jobs or labeled Docker containers remained afterward. These are bounded native worker checks, not a claim that the full Linux CI matrix is green. Final matching image publication and live orchestration verification are recorded separately when complete.
