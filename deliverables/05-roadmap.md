# Assertide implementation roadmap

This plan is sequenced for two full-stack engineers and one QA automation engineer with part-time design/security support. Estimates are planning ranges, not commitments. Phases 1–3 form the usable browser MVP; Phase 4 completes first-class API workflows; Phases 5–6 complete the proposed commercial-quality scope. Auth, basic API test execution, isolation and tenant keys start early rather than being retrofitted.

| Phase | Duration | Work and dependencies | Measurable exit gate |
|---|---|---|---|
| 1 Core architecture and runner | 2–3 weeks | Monorepo, locked toolchain, OIDC, project schema, approved bundle builder, local SauceDemo/The Internet, Lab API skeleton, isolated Chromium job, durable events. No prior phase. | Launch UI and API fixtures from CLI through queue; repeated delivery produces one job; worker termination creates diagnosed infrastructure error; secrets absent from captured logs |
| 2 Catalog and execution UI | 2–3 weeks | Depends on 1. Catalog sync, suites, explorer, configuration, quotas, idempotency, cancellation, live SSE, roles and primary flow A. | UI-001 and UI-005 selectable independently; 10k-case search target met; cancel and reconnect races pass; unauthorized project access rejected |
| 3 Allure and history | 1–2 weeks | Depends on immutable results in 1–2. Raw evidence collection, isolated report generation, Allure 3 history, private viewer, history/result screens, retention and flow C. | Retry grouping correct; report rebuild does not rerun tests; all expected failed-attempt artifacts available; expired artifact shown truthfully; unauthorized report child assets denied |
| 4 API automation workspace | 2 weeks | Depends on shared runner/results. Finish Lab API contract, all methods/auth/schema cases, redacted exchanges, request/response views and flow B. | API-001–007 and LAB P0 cases pass; no browser launched for API-only suite; secrets absent from attachments; auth and persistence tests target Lab, not JSONPlaceholder |
| 5 Analytics and UI refinement | 2 weeks | Depends on 3–4 normalized data. ECharts, KPI materialization, cross-browser pools, light/dark, mobile, empty/error/loading states, accessibility and design reconciliation. | PRD metric fixture matches exactly; no live/history mixing; all 12 views work at 390/768/1440px; three journeys pass keyboard and contrast review |
| 6 Production readiness | 2–3 weeks | Depends on prior gates. CI signed images, migration/canary strategy, vault, hardened egress, audit/retention verification, restore drills, load tests and runbooks. | Reference-load SLOs met; restore within 4h with ≤24h loss; no cross-tenant leaks; no unresolved P0 or exploitable critical findings; incident drill completed |

## Engineering backlog in implementation order

1. Record ADRs for source-owned tests, Allure 3, authoritative Postgres state, isolated report origin and trusted-code MVP. Lock OpenAPI/event schemas and reference data from the PRD.
2. Build authentication and project authorization middleware before exposed object endpoints. Add tenant-safe repository layer and migration tests. Add audit primitives.
3. Implement catalog discovery in an isolated job, stable case IDs and revision snapshots. Detect duplicate IDs as a discovery error. Do not replace valid catalog on failed discovery.
4. Implement launch transaction/outbox, idempotency conflict handling, fair scheduler and fencing tokens. Test duplicate dispatch and process crashes before adding UI affordances.
5. Build reporter spool, event ingestion and durable final manifest. Reconcile partially uploaded runs. Implement cancel_requested and race-safe finalization.
6. Add Angular shell, project/suite/explorer views and form validation from backend policies. Connect live stream with cursor recovery and snapshot reconciliation.
7. Implement artifact checksum/MIME validation, scoped access, redaction and retention. Add Allure generator compatibility fixture and history stream serialization.
8. Ship result detail, history and report explorer; inspect a real first-attempt failure and recovery with screenshot/trace. Validate private-origin viewer behavior in all supported browsers.
9. Implement the Lab API contract and API POM-free request utilities. Complete authorization/contract tests before enabling API workspace export.
10. Add analytics materializer and formula tests, then charts, saved filters and comparison. Avoid deriving historical percentages from UI summaries.
11. Complete Firefox/WebKit runners and headed virtual-display pool. Apply capacity accounting across browser matrix and Playwright workers, not just number of jobs.
12. Complete responsive views, semantic keyboard controls, dark theme and failure states. Run moderated task validation with representative users.
13. Finish backup/restore, dependency upgrades, security review, resource load and outage drills. Publish operational runbooks and release checklist.

## MVP cut and trade-offs

Release a useful vertical slice: approved repo → discovered suite → Chromium run → live progress → failed result → private Allure report → rerun. MVP supports API execution and evidence through the common runner but defers the dedicated workspace until Phase 4. A single organization deployment limits operational complexity; it does not excuse omitting authorization. PostgreSQL analytics costs more ingestion work than reading report HTML but supports durable filtering and reliable formulas. BullMQ is simple to operate with Redis, but needs a DB outbox and reconciliation to handle failure boundaries. Code-owned tests limit nontechnical authoring but avoid exposing an unsafe browser scripting service.

## Dependencies and release risks

Public fixtures can change or disappear: pinned local targets are the CI gate. Figma's provider quota currently prevents creating the hosted design contents: import the supplied development plugin and validate its output when access is restored. Allure identity/version changes can break history: pin compatibility and run two-launch history checks. Videos/traces can dominate cost: quotas, retention and capture policy must ship with capture. Cancellation may race side effects: never automatically replay an abandoned business mutation. Domain and trademark status need separate clearance before commercial launch.

## Definition of done and handoff

Every feature links PRD requirement → API/schema contract → design screen → automated acceptance case. A PR includes user-visible behavior, security impact, migration compatibility and relevant verification. Features cannot be called complete merely because a mocked UI exists. UI acceptance requires real API data, correct authorization and keyboard behavior. Reporting acceptance requires a real generated report and attempt evidence. Release readiness requires measured performance and recovery, not the illustrative figures in the design.

Outstanding design gate: the Figma file was created but no canvas writes succeeded because of the Starter-plan tool limit. Plugin syntax and local construction logic can be checked here; native Figma rendering, actual variable-mode support, prototype navigation and visual inspection must be checked in Figma before Deliverable D is accepted. This is an external delivery blocker, not a completed design claim.
