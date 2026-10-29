# Assertide product requirements

Version 1.0 · 29 October 2026 · Product and engineering baseline

Assertide is a QA automation control plane for teams using Playwright and Allure. It connects a versioned test catalog, controlled execution, live evidence, and comparable historical results. The primary job is to help an engineer move from a failing quality signal to a reproducible diagnosis without reconstructing what ran, where it ran, or which artifacts belong to it.

## Product decisions

The source repository owns executable TypeScript tests. Assertide owns catalog metadata, suite membership, run selection, execution policies, investigation, and history. Editing arbitrary executable scripts in a web form is outside the MVP. API tests have the same catalog, execution, evidence, and history contracts as browser tests; the API workspace additionally shows structured request and response evidence.

MVP supports one organization per deployment, multiple projects, an OIDC identity provider, approved repositories, Chromium runs, a controlled sandbox, and Allure reports. Tenant IDs and authorization checks are present from the start. Firefox, WebKit, API workspace, advanced trends, and managed multi-tenant hosting follow through the six-phase roadmap. Headed execution means a dedicated worker with a virtual display; interactive remote desktop control is not implied.

The brand name is a working original proposal. Exact-name searches found no relevant product match, but trademark clearance and domain registration availability remain unverified. The created Figma file still has its provisional creation name because the provider blocked further tool calls. It contains no completed screens. The supplied plugin is a recovery artifact, not evidence of a completed hosted design.

## Users and outcomes

| Persona | Current problem | Assertide outcome |
|---|---|---|
| Automation engineer | Logs, traces and retries scattered across CI | Open the exact attempt, source revision and evidence from one result |
| QA lead | A green retry hides instability | Compare first-attempt reliability and final pass rate separately |
| Developer | Cannot reproduce a reported failure | Rerun an immutable selection and environment snapshot with lineage |
| Release manager | Cannot distinguish infrastructure issues from product defects | See failed, broken, canceled, skipped and incomplete coverage separately |
| Administrator | Test jobs can consume resources or expose secrets | Approved destinations, quotas, isolated workers and auditable policies |

Pilot success targets, to measure rather than assume: median failure-to-artifact navigation under 30 seconds in five moderated sessions; at least 90% task completion for the three primary journeys; 95% of supported failed attempts retain expected evidence; no duplicate run from a repeated start submission; no cross-project evidence disclosure in adversarial authorization tests.

## Scope and priorities

P0 means release-blocking MVP; P1 means required full-product scope; P2 means post-launch optimization.

| ID | Requirement | Priority | Acceptance |
|---|---|---|---|
| AUTH-01 | OIDC login, logout, session expiry, role-aware navigation | P0 | Expired session preserves return URL but never exposes cached protected evidence |
| CAT-01 | Discover Playwright tests from an approved immutable revision | P0 | Discovery yields stable case IDs, file, title, tags and project; discovery errors never overwrite the previous catalog |
| CAT-02 | Project/module/feature/tag organization and search | P0 | URL stores query and filters; 10,000 cases searchable in under 1 second p95 at reference load |
| CAT-03 | Manage suites, owner, description, priority and enabled membership | P0 | Optimistic concurrency rejects stale writes; disabling affects future selections only |
| RUN-01 | Run single case, suite or selection | P0 | Server resolves and freezes IDs before queueing; empty selection returns 422 |
| RUN-02 | Browser, environment, workers, retries, video and headed policy | P1 | Invalid or forbidden options rejected server-side; API-only selection has no browser selector |
| RUN-03 | Queue, monitor, cancel and rerun | P0 | Idempotent start; cancellation outcome reconciled; rerun creates a distinct linked run |
| RUN-04 | Live logs, progress, reconnect and stale-stream indicator | P0 | Reconnect resumes after last event; a missing segment prompts snapshot resync |
| REP-01 | Allure generation, explorer and secured viewer | P0 | Report failure never changes test outcomes; generation can be retried independently |
| REP-02 | Screenshot, trace, optional video and stack trace | P0 | Evidence shows attempt, timestamp, redaction policy and expiry; missing artifact has a reason |
| API-01 | First-class API suite and request/response investigation | P1 | GET/POST/PUT/PATCH/DELETE supported; schema and authorization failures visible in Allure |
| ANA-01 | Final pass rate, first-attempt reliability, duration and flakiness | P1 | Formula, denominator, filters and freshness available beside every KPI |
| ANA-02 | Browser breakdown, API latency and failure ranking | P1 | Browserless API cases never counted as Chromium; small samples marked |
| ENV-01 | Approved environments and secret references | P0 | Secret values cannot be read back; all modifications are audited |
| UX-01 | Light/dark desktop and responsive mobile | P1 | All 12 views usable at 390px; keyboard paths and WCAG 2.2 AA review pass |
| OPS-01 | Retention, quotas, health and audit trail | P0 | Deletion removes object versions according to policy; quota errors explain remedy |
| CI-01 | CI service account and commit-linked executions | P1 | Scoped token can launch only its project; secret rotation does not require redeploy |
| INT-01 | Notifications and integrations | P2 | Delivery retries deduplicated; no notification is sent without configured destination |

## Roles and authorization

Viewer reads authorized project metadata and redacted evidence. Operator additionally launches, cancels and reruns executions and edits personal saved filters. Maintainer manages suites and catalog metadata. Administrator manages members, environments, secret references, approved repositories and retention. Platform service identities have narrower machine scopes. Backend authorization is enforced on every object access and streaming subscription, not just navigation. Cancellation is allowed for the run creator or a project maintainer/admin; an operator cannot cancel another user's work by guessing an ID.

## Information architecture and screens

Persistent navigation: Overview, Projects, Test suites, Test explorer, Executions, Reports, API workspace, Settings. Project switcher always visible on desktop; mobile uses a menu and project header. Run configuration and live monitor are task screens within Executions. A result detail is linked from every failure count. Global search is project-scoped unless the user explicitly chooses all accessible projects.

| Screen | Main content | Primary action | Essential secondary states |
|---|---|---|---|
| Login | Product identity, work-email hint, SSO action | Continue with SSO | Redirecting, expired session, access denied, provider unavailable |
| Dashboard | Historical KPIs and trends; independent live activity strip | New run | No history, filtered-empty, delayed aggregates, partial service outage |
| Projects | Owner, target, case count, recent run and health | Open project | No access, create-first-project, archived project |
| Suites | Suite composition, tags, owners and revision | Run suite | Empty suite, stale revision, read-only role |
| Explorer | Search, tags, priority, selection and result history | Run selected | No matches, discovery in progress, discovery failed |
| Configure | Frozen selection, browser, environment, workers and retry policy | Start execution | Policy cap, unavailable worker, changed source revision |
| Live monitor | Progress, worker activity, attempts, elapsed time and logs | Open results | Queueing, disconnect, cancellation pending, worker loss |
| History | Runs by date, status, suite, browser and environment | Open run | Empty, cursor pagination, partial run |
| Reports | Report build status, comparison and download | Open Allure | Generating, generation failed, expired artifacts |
| Result | Assertion, expected/actual, attempt tabs, steps and evidence | Rerun failed | Broken setup, flaky retry, evidence unavailable |
| API workspace | Suites, method/path, request, response, schema and timings | Run API suite | Redacted body, invalid schema, timeout, auth failure |
| Settings | Environments, quotas, roles, secrets, retention and audit | Save changes | Validation failure, stale edit, forbidden, success |

## Core journeys

**A — selection to evidence:** Login → choose Swag Store project → Test explorer → select UI-001 and UI-005 → Configure → verify resolved count, revision and target → Start → run detail appears immediately in queued state → live updates → completed outcomes → Open Allure. Start remains disabled after submission until its idempotency key resolves. Navigating away never stops a run. A success toast links to the created run; errors remain inline and preserve form input.

**B — API investigation:** API workspace → Orders contract suite → choose controlled sandbox → Start API run → inspect failed schema assertion → select request/response tabs → open redacted body and JSON pointer → open corresponding Allure case. A browser is not required. Token values are represented by secret reference and never enter screenshots, URLs or analytics.

**C — reproduce a failure:** History → filter Failed → open R-1042 → open UI-005 → inspect first-attempt screenshot and trace → compare previous result → Rerun failed → review inherited selection and current environment availability → create R-1043 with parent R-1042. Default rerun uses the same revision and frozen parameters. Changing revision produces an explicit “changed revision” badge; results are never rewritten.

Cancel opens a confirmation describing currently running and not-yet-started tests. Confirm immediately sets cancel_requested; the UI says “Stopping workers” until acknowledged. Save environment with a changed destination requires a policy check, not just a client confirmation. Revoking access removes the active subscription and clears sensitive view state.

## Shared sample data

All design data is illustrative, not executed test results. Organization Meridian Engineering; project Swag Store; environment Local sandbox; suite Checkout smoke; revision 8f2c0a1 (illustrative); owner Maya Chen. Historical 7-day slice: 2,400 final test instances, 2,268 passed, 72 failed, 60 skipped, no canceled/broken in this sample. Executed denominator 2,340; final pass rate 96.9%; 45 passed after retry, so recovered-flaky rate 1.9%. Average run duration 2m 48s is a separate run-level fixture, not derived from test durations. API p95 182ms is a separate synthetic request fixture.

R-1042 is a completed UI run: 24 selected, 21 passed, 2 failed, 1 skipped; 91.3% final pass rate (21/23). UI-005 Checkout completes is a failure, UI-009 Logout clears session is the other failure. R-1043 is its running rerun: 2 selected, 1 passed, 1 running. These live numbers never enter historical cards before terminalization and aggregation.

## Interaction and accessibility contract

150ms button/focus transitions, 200ms route crossfade, 250ms panel reveal; reduced-motion preference disables movement. Polling and SSE updates must not steal focus. Announce run state changes with a polite live region, not every log line. Preserve scroll and filters on back navigation. Provide table sorting via keyboard, visible 2px focus rings, persistent field labels, text and icons for statuses, 44px mobile targets, chart table alternatives and non-color differentiation.

Loading shows structural skeletons only after 200ms to avoid flashes. Empty states explain what is missing and offer one relevant action. Recoverable errors include retry and correlation ID; destructive errors do not invite automatic retries. Success toasts last 5 seconds and have an accessible notification log. Mobile turns wide tables into result cards; detailed request bodies use bounded horizontal scrolling and do not force the whole page wider.

## Operational acceptance and non-goals

Reference load: 50 concurrent UI users, 10,000 discovered cases, 100,000 result rows, 20 active workers across five projects. Metadata read p95 <500ms, start API p95 <1 second excluding execution, live update delay p95 <2 seconds. These are test targets, not measured guarantees. API availability target 99.5% for pilot; recovery point 24 hours and recovery time 4 hours, proven by restore drill. No production execution of untrusted customer code in MVP; no public load testing, no CAPTCHA bypass, no billing, no generic low-code scripting engine, and no claim that a green report certifies a release.
