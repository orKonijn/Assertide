# Performance budgets

The published **0.5.0** release contains the internal parser and advisory evaluator in `apps/api/src/lighthouse-results.ts`. That release does not launch Lighthouse. The local, **unreleased** collector extension described below connects real measurements to run evidence and the UI.

## Accepted measurements

The normalizer accepts Lighthouse navigation reports only for the approved local storefront origin and explicit static fixture routes. External origins, credentials, query strings, fragments and unapproved routes are rejected. Redirects between different approved routes, runtime errors and missing browser/profile metadata are labeled invalid rather than passed.

The returned summary retains the tool version, capture time, approved route, form factor, a hash of the browser/tool/viewport/throttling profile and four measurements: LCP milliseconds, CLS, total blocking time milliseconds and transferred bytes. Missing/error metrics remain null. Raw DOM, screenshots, full URLs, diagnostics and runtime-error text are omitted from the returned value. The collector below also sanitizes evidence before attachment; the general normalizer does not publish raw reports.

## Advisory evaluation

Evaluation requires exactly three valid samples with distinct capture timestamps and the same route/profile. Missing measurements, incompatible profiles, duplicates or invalid samples produce Inconclusive decisions. Timing spread above 20% of the median also produces Inconclusive rather than a noisy timing pass/fail.

The caller supplies absolute limits for all four metrics. LCP, CLS and total blocking time use the three-sample median; transferred bytes uses the worst sample. Each decision includes the sample count, minimum, median, maximum, limit and reason. This is a laboratory comparison, not field INP, a composite Lighthouse score or a blocking deployment gate.

The contract follows the [official Lighthouse result schema](https://github.com/GoogleChrome/lighthouse/blob/main/types/lhr/lhr.d.ts). Timing variability is a reason to retain sample context rather than equate a single score with a regression; see [Lighthouse performance scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring/).

## Unreleased: controlled catalog benchmark

1. In Test explorer, select **UI-001** only. Choose Chromium, the Local Lab sandbox, one worker, zero retries and headless mode.
2. Enable **Benchmark catalog performance** and start the execution. Test explorer explains incompatible settings and keeps both Start execution buttons disabled until corrected or the benchmark is switched off. The server independently rejects other combinations; old runs default this optional setting to false. Existing operator/project authorization and execution quotas still apply.
3. After the functional login test, its final screenshot, diagnostics and trace are preserved before releasing its browser. A separate temporary Chromium profile receives the controlled fixture's browser storage in memory. Lighthouse **13.6.0** measures `/inventory.html` three times. Raw storage, authentication values, DOM, screenshots and diagnostic bodies are excluded from the measurement attachment; ordinary private functional evidence keeps its existing policy.
4. Run detail displays **Catalog performance** with metric medians, ranges, budgets and Pass/Fail/Inconclusive indicators. The original functional result stays independent. Reloading retains the metrics. Missing final-attempt evidence or failed measurement is labeled Not measured, never a pass.

The frozen desktop profile uses 1350 × 940 at device scale 1, simulated 40 ms RTT, 10,240 Kbps throughput and CPU multiplier 1. Browser cache is cleared before every sample while fixture login storage is preserved. Setup/cache tabs close before measurement, keeping one benchmark renderer active. Collection is limited to the exact approved local inventory URL, with a separate Chromium instance and a 150-second collection deadline; load/FCP waits are capped at 15 seconds per sample. The performance fixture has its own bounded 180-second setup/teardown budget; ordinary functional test timeouts are unchanged. The worker schema also restricts the supported case/browser/concurrency combination. No arbitrary destinations or protocol-load traffic are enabled.

The fixed advisory limits are LCP 2,500 ms, CLS 0.1, blocking time 200 ms and transferred bytes 1,000,000. These are initial lab thresholds, not a measured production SLA. The test fixture can legitimately produce Inconclusive timing results when the host is noisy. Three samples and cold-cache byte counts are shown rather than implying a score or precision the evidence does not support.

Only an allowlisted measurement envelope reaches Playwright/Allure. The private artifact importer limits this envelope to 100 KB, validates it, and rewrites stored content to the normalized metric summary. It rejects incomplete sample sets and unsupported URLs. It uses only unique evidence for the final attempt; earlier retries or duplicate artifacts cannot substitute for missing evidence. The existing private artifact access and 30-day retention apply; normalized summaries follow run history retention of 365 days. No database migration or new public service is needed.

### Installation, rollout and recovery

The automation lockfile pins Lighthouse 13.6.0, chrome-launcher 1.2.3 and Puppeteer Core 25.16.0. Use `npm ci` to install reproducibly. Puppeteer Core is Lighthouse's browser-control toolchain; declaring the existing version directly adds no browser download. The collector uses the existing Playwright Chromium executable, independently of Playwright's trace recorder. Its debugging endpoint listens on loopback inside the worker, and its temporary profile is removed on completion. Cancellation uses the existing worker/process-tree lifetime controls; the collection deadline also terminates its browser.

The Kubernetes cancel flag is written with a single-process file operation in the existing transfer container, avoiding another Node VM near the pod PID limit. Canceled Playwright traces can retain resource names containing `@`; both transfer endpoints accept that character while retaining their path traversal, absolute-path, symlink and size checks. The existing hard-stop fallback remains available.

Deploy matching API, web and rebuilt worker images before enabling the option in isolated environments. Rebuild the approved automation source snapshot: its new lockfile must match the immutable worker image. Historical runs keep their original source/image constraints. Disable the option to return to ordinary functional execution; rolling back does not require rewriting prior results. This extension has been exercised with the trusted Windows local runner and separate Linux OCI/Kubernetes candidate jobs. It remains **unreleased and undeployed**; the live application is still 0.5.0.

### Verification and remaining scope

Local quick verification, eight focused browser journeys, architecture/reporting checks and four desktop/mobile dark/light axe/reflow checks cover the extension. The benchmark journey collected real Lighthouse samples and reloaded their budget table while UI-001 remained passed, including combined accessibility/performance collection. Importer tests reject malformed evidence and keep private canaries out of stored JSON; API tests reject unsupported profiles and unauthorized launch. Actual screenshots are recorded in the Unreleased changelog. Those screenshots show a trusted local UI run; the separate Linux checks below verify isolated worker behavior.

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

The test file skips a runtime when its prerequisites are absent; a skip is not a pass. The established Linux CI commands now include this file after the baseline worker checks. The Windows checks and the bounded ARM64 candidate checks do not establish a fully green GitHub/Linux infrastructure matrix. Signed image scanning/publication, deployment and live verification remain release-finalization work when publication is requested.

Additional routes, mobile profiles, configurable per-project budgets, cross-run comparison UI, CI blocking gates and bounded protocol-load testing remain future work. The bounded candidate checks do not establish production performance, availability or a production SLA.

## QA review patch � 0.6.1 release draft

The 0.6.0 implementation is preserved as source milestone `5247c77`. The reviewed 0.6.1 candidate adds pre-launch profile recovery, an explicit Browser control name and clear Unavailable metric ranges. The 0.6.2 release candidate additionally corrects the evidence test to use the configured S3/filesystem backend. It is the first intended live rollout of this feature; no separate 0.6.0 or 0.6.1 live deployment is claimed. The worker collector, approved targets, sample profile, isolation and cancellation contracts are unchanged from the Linux verification above.
