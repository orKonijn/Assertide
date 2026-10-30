# Historical analytics

Overview reads completed outcomes from the database. Filters support UTC dates, project, frozen suite reference, environment, browser/API and result status. Suite launches now freeze suite ID, version and metadata; older runs without suite provenance remain visible under all suites and are not retroactively attributed to an edited suite. Saved filters are local to the signed-in subject/project on that device. Shared URLs contain filter identifiers only.

The equal-length preceding UTC interval uses the same filters. Pass-rate changes use percentage points, including when a baseline is zero. Missing case/browser/environment identities are counted explicitly; this is a cohort comparison, not a claim that code and case mix stayed constant. The day table and chart can select a single UTC day. Both first-attempt and final-pass series retain their denominators.

Instability candidates have both pass and failure over their last ten eligible runs within the selected interval, with at least five observations. Expected failures are excluded. Duration sums all recorded attempt durations, retaining retry cost; missing durations are excluded rather than treated as zero. Failure rankings show count, exposure and rate. API p95 uses completed HTTP exchanges, including HTTP failures, and counts transport failures separately. Method/path groups normalize numeric and UUID identifiers; fewer than 20 completed responses is a small sample.

Evidence completeness counts failed/broken attempts, including failures recovered by retry. Required browser evidence is screenshot plus trace, and video when enabled. API attempts require exchange/transport evidence. Missing, expired and unavailable required items are separate counts; disabled video is disclosed. A zero-eligible denominator displays no rate.

JSON export contains the displayed metrics, comparison, filters, definitions, sample counts, generatedAt and dataAsOf. Aggregates are currently calculated from authoritative records at request time, so there is no asynchronous materialization delay; an incremental materializer remains an architectural optimization for larger deployments. Dates and daily buckets are explicitly UTC.

Verification covers exact denominator fixtures, transport failures, instability minimums, attempt duration, evidence reasons, cross-project exclusion, date boundaries, matching comparison filters, stale suite versions, immutable suite snapshots, saved-filter/export consistency and responsive accessibility scans.

![Overview with filters, comparison and historical evidence metrics](changelog/assets/unreleased/analytics-desktop.png)

Desktop Overview from the running application.

![Overview at 390 pixels](changelog/assets/unreleased/analytics-mobile.png)

The same workflow at mobile width.
