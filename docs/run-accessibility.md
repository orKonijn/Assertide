# Accessibility checks on browser runs

This first roadmap slice was published as **0.4.0 on 2026-11-06** to main and assertide.com. It adds opt-in advisory axe checks to the approved controlled storefront. It does not enable arbitrary destinations, claim accessibility conformance, or implement the complete accessibility roadmap.

## Use

1. In Test explorer, select browser tests and enable **Check accessibility** in Configure execution.
2. Start the execution. The option is frozen with the run configuration; ordinary runs keep it disabled.
3. In Run detail, open **Accessibility review**. Each browser test has one expected checkpoint: its final page state, on its last recorded attempt. Coverage is paginated at ten test/browser instances per page.
4. Review rule findings, impact, affected-node counts and rule guidance. Rules axe could not decide appear separately as requiring manual assessment. Follow **Investigate result and add a note** to use the existing scoped investigation notes.

Functional test outcomes, retry-aware analytics and Allure report readiness remain independent. A scanned page with no automated violations is not a conformance pass. Earlier intermediate states, dialogs already closed and routes not visited are not covered. Keyboard, screen-reader and human assessment remain necessary.

## Evidence, policy and compatibility

- `accessibility: true` is an optional launch field. Omission defaults to false. The server rejects API-only selections with the option enabled; existing operator authorization, environment restrictions and quotas still apply. Reruns preserve the option when browser cases remain, and disable it for an API-only subset.
- The browser fixture scans only final pages on `http://127.0.0.1:4013`. Sensitive tests, closed pages, unapproved destinations and scan failures (including a five-second scan deadline) produce unavailable coverage. Missing, malformed, rejected or duplicate checkpoint evidence is never substituted with an earlier successful retry.
- The fixture records the axe engine version, viewport, rule IDs, descriptions, guidance links and counts. It does not retain DOM, selectors, page text, input values or page URLs in the accessibility payload. Each violation/manual list is capped at 100 rules with explicit truncation; the importer bounds the JSON to 100 KB and validates the schema and HTTPS guidance origin.
- Checkpoints use the existing private artifact importer and current project-membership checks. Raw JSON expires after 30 days. The bounded normalized run summary persists with run outcomes for 365 days. Existing trace/video retention stays at 14 days. No new database table, service or dependency installation is required.
- Roll out matching API/web/worker images before using the new option in isolated deployments. Rebuild the approved automation source snapshot: its digest includes the changed fixture and utility. Keep old images available for their frozen historical runs. Disabling the option restores ordinary functional execution; existing run data need not be migrated or rewritten.

## Verification and limits

The focused browser journey launches an owned UI-001 run, observes an unchanged functional pass, reloads the page and verifies retained final-state coverage. API tests cover imported checkpoint validation, unsafe links, missing retry evidence, duplicate scans, unavailable artifacts, operator permissions and API-only rejection. The web component test distinguishes findings, manual review and missing evidence. Actual dark/light desktop/mobile captures and four axe/reflow checks cover the review surface.

Local quick verification, architecture/reporting checks and five focused browser journeys (new coverage plus existing execution behavior) passed with this change. Linux OCI/Kubernetes checks were skipped in local verification. The publication below additionally verified one live isolated Kubernetes execution; it does not substitute for the complete infrastructure CI matrix. Existing upstream build warnings are not suppressed.

The published 0.4.0 slice did not include assignment or expiring exceptions. The 0.5.0 extension below adds rule-level review records. Named intermediate state inventories, DOM-node identity/deduplication, approved baselines and full manual-audit records remain future work. Lighthouse collection and bounded protocol load testing remain later roadmap phases. No external traffic testing is enabled.

## 0.5.0: investigation and triage

**Investigate result and add a note** now selects the result's table page, opens its details, focuses Diagnosis and brings it into view. Repeated clicks on the same result work, including mobile and reduced-motion mode. Read-only users reach the result summary instead of an unavailable editing field.

Use **Triage findings** beside a checked state with findings to open its recorded rules. Operators can save an owner label, Open/Investigating status and a review note. These are review records, not changes to immutable results. An owner label does not grant project membership or send a notification.

Administrators can approve or remove an exception with a reason and an expiry within the next 30 days. Expiry is evaluated on every read and automatically changes the exception to Expired. Exceptions remain visible and do not suppress findings, change coverage, rewrite functional outcomes or affect analytics. Ordinary operators can update ownership/notes while preserving an existing exception. The audit trail records the reviewer and finding ID without copying note content.

Review identity is scoped to the organization and project, then keyed by environment, test/browser instance, axe engine version, final checkpoint state, finding kind and rule ID. Compatible runs share the saved review. A changed environment or engine creates a separate identity. This is rule-level continuity, not per-node deduplication or proof a missing finding was resolved; changed test implementations can retain the same rule key and require human reassessment.

The API requires current project access and an optimistic version on every save. Conflicting edits return 412; the dialog preserves the draft and offers Reload reviews. Human operator access is required for edits; exception approval additionally requires administrator access. Reviews use the existing `platform_documents` storage and expire 365 days after their last update. No database migration, new service or worker policy change is needed. Deploy matching API/web images when this extension is released; old run summaries remain readable. Rolling back the extension leaves the added review records unused without rewriting historical results.

The next performance phase currently has an [internal normalization and advisory-budget foundation](performance-budgets.md). A runnable Lighthouse collector is not included.

## Publication - 2026-11-06

[Source 729f4ff](https://github.com/orKonijn/Assertide/commit/729f4ff0595e836c86bf8f7aa490f9304fe3726a) was published to main. [Image publication 42255711010](https://github.com/orKonijn/Assertide/actions/runs/42255711010) passed builds, security scans and signing. Each native ARM64 image's signed provenance was verified against that source before rollout:

| Component                             | Verified deployed digest                                                  |
| ------------------------------------- | ------------------------------------------------------------------------- |
| API, execution and report supervisors | `sha256:473d76702ce682395f0ed2edf7c0f1d0488eef81d045425d8686f3f148db9121` |
| Web                                   | `sha256:f7d924748103a41fbdef6acdeecd670097779565a735d71c1004e3454bce71a6` |
| Isolated browser worker               | `sha256:f0ee30f06e38e8346637e9c98fc652ddded3ae746a0687654adf3f2e32917ec3` |

Images were pre-pulled, idle execution/report queues were checked, and matching API/worker/web components were rolled out with a brief single-node restart. The previous deployment/configuration snapshot remains private for recovery. No database migration, identity-provider change or egress-policy relaxation was introduced.

Live verification used a temporary controlled identity and its own run of LAB-001 and UI-001. Both functional results passed on the isolated worker; the final browser accessibility checkpoint was recorded with its engine and manual-review rule summaries. Desktop/mobile review in both themes, authenticated artifact retrieval, anonymous artifact denial, private Allure generation/opening, v0.4.0 identity and logout passed. The temporary identity was disabled afterward, its sessions revoked and project access removed; its local credential copy was deleted.

[Broader Verify run 42255688132](https://github.com/orKonijn/Assertide/actions/runs/42255688132) was still running its full controlled API/cross-browser regression step when publication was verified. No fully green infrastructure CI claim is made. Public or arbitrary-target scanning, intermediate-state coverage, finding ownership/baselines and blocking accessibility gates are not part of this release.

![Actual desktop accessibility review](changelog/assets/0.4.0/accessibility-review-1440-dark.png)

Actual controlled browser run; automated findings and manual-assessment needs are separate.

![Actual mobile accessibility review in light mode](changelog/assets/0.4.0/accessibility-review-390-light.png)

The same recorded state stacks at mobile width without page overflow.

## Publication - 0.5.0 - 2026-11-06

Source `98832b7059c2c1d7c729fa7137b80ed70d073118` was published to main. [Image publication 42281882582](https://github.com/orKonijn/Assertide/actions/runs/42281882582) passed builds, security scans and signing. The earlier candidate was rejected by the vulnerability gate for CVE-2026-78661 in the bundled Kubernetes client's `golang.org/x/net`; it was rebuilt with 0.62.0 without weakening the gate. Signed image provenance was verified against the final source before rollout.

| Component                             | Deployed digest                                                           |
| ------------------------------------- | ------------------------------------------------------------------------- |
| API, execution and report supervisors | `sha256:55aa80b9b4aa8bfb927d1ce4b964a616c8b1520eaef8bf5ad3b5cae29b407671` |
| Web                                   | `sha256:ac11275d64dc34115591fc048578dd7c1ed5bdab45f3fcba8572ff808ca03ef9` |
| Isolated browser worker               | `sha256:0627fbde70847da0d031ce56b93da99450510e7455970ab8b1231b9fd7d6badb` |

Images were pre-pulled, queues were confirmed idle, and matching API/worker/web components were rolled out. The previous deployment/configuration snapshot remains private for rollback. No migration, authentication-policy change, new service or egress relaxation was introduced.

Live verification used a temporary identity with an explicitly provisioned membership matched to the provider-issued subject. LAB-001 and UI-001 passed in an isolated run, with recorded accessibility coverage. Desktop/mobile themes, the investigation jump and note save, repeated mobile clicks, saved ownership after reopening triage, private artifact retrieval and anonymous denial, Allure generation/opening, v0.5.0 identity and logout passed. The verification identity was disabled, its provider/application sessions revoked, project access removed and the local credential copy deleted. The owner's identity was unchanged.

[Broader Verify run 42281881914](https://github.com/orKonijn/Assertide/actions/runs/42281881914) was still running controlled cross-browser regression when deployment was checked. The live smoke run does not establish the full Linux infrastructure matrix. Lighthouse collection and protocol load testing are not enabled in 0.5.0.
