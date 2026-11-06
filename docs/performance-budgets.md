# Performance budget foundation (0.5.0)

This is an internal, tested parser and advisory evaluator in `apps/api/src/lighthouse-results.ts`. It is not wired into run launch, workers, artifact import, API responses or the UI. It does not run Lighthouse or generate a performance report. No dependency, service, external destination or traffic-testing capability is enabled.

## Accepted measurements

The normalizer accepts Lighthouse navigation reports only for the approved local storefront origin and explicit static fixture routes. External origins, credentials, query strings, fragments and unapproved routes are rejected. Redirects between different approved routes, runtime errors and missing browser/profile metadata are labeled invalid rather than passed.

The returned summary retains the tool version, capture time, approved route, form factor, a hash of the browser/tool/throttling profile and four measurements: LCP milliseconds, CLS, total blocking time milliseconds and transferred bytes. Missing/error metrics remain null. Raw DOM, screenshots, full URLs, diagnostics and runtime-error text are omitted from the returned value. This helper does not provide a raw-artifact storage policy; a future producer must sanitize evidence before publication.

## Advisory evaluation

Evaluation requires exactly three valid samples with distinct capture timestamps and the same route/profile. Missing measurements, incompatible profiles, duplicates or invalid samples produce Inconclusive decisions. Timing spread above 20% of the median also produces Inconclusive rather than a noisy timing pass/fail.

The caller supplies absolute limits for all four metrics. LCP, CLS and total blocking time use the three-sample median; transferred bytes uses the worst sample. Each decision includes the sample count, minimum, median, maximum, limit and reason. This is a laboratory comparison, not field INP, a composite Lighthouse score or a blocking deployment gate.

The contract follows the [official Lighthouse result schema](https://github.com/GoogleChrome/lighthouse/blob/main/types/lhr/lhr.d.ts). Timing variability is a reason to retain sample context rather than equate a single score with a regression; see [Lighthouse performance scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring/).

## Remaining integration

A runnable collector still needs a pinned Lighthouse/Chrome image, approved route and authentication fixtures, frozen device/network/CPU settings, isolated resource limits, bounded capture and redaction, durable artifact delivery, cancellation/retention integration, and a user-facing comparison with actual repeated-run evidence. Those capabilities are not implemented by this foundation. Bounded protocol-load testing is also still future work.
