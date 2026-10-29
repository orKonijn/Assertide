# Assertide testing targets and test plan

Research date: 29 October 2026. This is a planned test catalog; no browser or API tests were executed against the public targets during this work.

## Target selection and permission evidence

| Target | Purpose and evidence | Decision and limitations |
|---|---|---|
| [SauceDemo](https://www.saucedemo.com/) | Sauce Labs publishes [automated login demonstrations](https://docs.saucelabs.com/web-apps/automated-testing/selenium/sample-scripts/) targeting SauceDemo. The [official source](https://github.com/saucelabs/sample-app-web) includes automated tests, deployment destinations and an MIT license. | Approved for small functional practice runs consistent with those examples; not load/security testing. Direct page retrieval failed in this research tool, so current end-to-end availability was not verified. Preflight before use; use a pinned local source build for CI and reproducibility. |
| [The Internet](https://the-internet.herokuapp.com/) | The [official repository](https://github.com/saucelabs/the-internet) explicitly describes the app as suitable for automated acceptance testing. The public index was readable and lists practice features. | Supplemental UI target for dynamic controls, windows and forms. Public hosting has no verified SLA or published numeric request cap in reviewed material. Default to a self-hosted pinned revision for repeated CI. Avoid intentionally unstable examples in the release gate. |
| [JSONPlaceholder](https://jsonplaceholder.typicode.com/) | Official homepage describes a fake REST API for testing/prototyping and documents requests made with any HTTP client. [Guide](https://jsonplaceholder.typicode.com/guide/) documents CRUD-shaped operations. | Approved low-volume public API practice; no API key required. Writes are simulated and not persistent. Not an authorization, validation, transactional consistency or performance benchmarking target. No numeric rate limit verified in reviewed official material; absence of a number is not unlimited permission. |
| Assertide Lab API, http://lab-api:4010/v1 inside isolated network | Newly specified self-controlled fixture service owned by the implementing team. No claim that this service already exists publicly. | Required for real CRUD, auth, validation, conflicts, rate-limit and fault scenarios. Build it in Phase 1/4 before executing LAB cases. Bind developer port only to loopback; no production data. |

Public-target policy: one worker, maximum one API request/second, no automatic retries on failed public calls, no soak/load tests, stop on 429/403/access challenge, honor Retry-After. These are conservative Assertide limits, not publisher terms. Cache documentation, keep synthetic accounts/data, and never bypass CAPTCHA or access controls. Recheck permission evidence and target behavior when upstream changes. If scope of permission becomes unclear, disable public execution and use a pinned self-hosted copy. Preserve license notices and disable upstream telemetry in local fixtures where applicable.

## Public API operation matrix

JSONPlaceholder documents /posts (100), /comments (500), /albums (100), /photos (5000), /todos (200), /users (10). The suite uses a small subset. Authentication: none. Headers: Content-Type application/json for JSON writes. GET /posts/1 reads one item; GET /posts?userId=1 filters; GET /posts/1/comments is nested. POST /posts returns an echoed resource with a generated ID, commonly 101; PUT /posts/1 replaces fields in the simulated response; PATCH /posts/1 changes supplied fields in the simulated response; DELETE /posts/1 returns an empty object. Do not assert that a later GET sees any write. Numeric quotas and a latency SLA were not established. [Official API guide](https://jsonplaceholder.typicode.com/guide/).

## Controlled Lab API contract

The following is the contract to implement, not observed public behavior. POST /auth/token accepts fixture username/password and returns a 5-minute JWT for operator-a (tenant A), viewer-a (tenant A) or operator-b (tenant B). Invalid credentials return 401; no production authentication system is reused. JWT checks issuer, audience, expiry and signature; fixture refresh is explicit.

Orders: {id:uuid, tenantId:uuid, sku:string, quantity:integer 1..10, status:"draft"|"confirmed", version:integer, createdAt:date-time}. POST /orders requires operator role and Idempotency-Key, returns 201 + Location + ETag. GET /orders/{id} returns 200 to same-tenant members and 404 to other tenants. GET /orders?status=draft&limit=20&cursor=... returns stable ordered pages. PUT replaces writable fields with If-Match; PATCH updates allowed fields with If-Match; both return 200 and new ETag, stale ETag returns 412. DELETE draft order returns 204, then GET returns 404; confirmed order delete returns 409. Missing/invalid token 401, insufficient same-tenant role 403, malformed JSON 400, invalid contract fields 422, unsupported media type 415. Duplicate idempotency key with a different payload returns 409. Secret admin seed/reset endpoint is network-restricted and disabled outside the lab.

Fault hooks exist only in the lab: signed fixture header X-Lab-Fault: timeout|503|rate-limit. Rate-limit mode returns 429 and Retry-After: 2; timeout delays 2 seconds for a request configured with 500ms timeout. Production routes reject these headers. Rate policy 20 requests/minute per fixture user with deterministic test-clock reset, enabling reliable 429 tests without flooding. Lab p95 latency target <500ms over 20 serial warmed GETs is a local acceptance budget, not a public-service SLA.

## Catalog conventions

Every case below inherits: clean browser context or standalone API context; target health preflight; approved environment; no real customer data. UI cases run Chromium for PR smoke and Chromium/Firefox/WebKit nightly. API cases run once, with browser=null. P0 blocks release; P1 required regression; P2 supplemental. Each row includes its business objective in the name/objective column. Preconditions supplement the shared baseline. Steps execute left-to-right; expected result is independently asserted.

Allure labels for every case: id=case ID, epic=Quality sandbox, feature=module, story=case name, suite=UI or API, owner=QA Platform, severity mapped P0 critical/P1 normal/P2 minor, tags=kind+coverage. Non-excluded parameters: target contract version, environment, browser for UI. Random entity IDs and run IDs are excluded from history identity. UI evidence U = test steps, error/stack, screenshot+trace on failure, optional retained video. API evidence A = redacted method/path/query, allowlisted headers/body, response status/body/schema diff and duration. Never attach bearer tokens. Each case lists its module/coverage and evidence profile; those values complete its label/attachment requirements.

## UI cases

| ID and objective | Preconditions and data | Steps | Expected result | Priority; labels; evidence |
|---|---|---|---|---|
| UI-001 Valid login unlocks catalog | SauceDemo; standard_user / secret_sauce demo credentials | Open login → fill username/password → submit | Inventory URL and Products heading; six product cards on pinned fixture | P0; Auth/smoke/positive; U |
| UI-002 Locked user cannot enter | SauceDemo; locked_out_user / secret_sauce | Fill credentials → submit | Locked-out message and login remains; no inventory access | P0; Auth/regression/negative; U |
| UI-003 Invalid password is rejected | SauceDemo; standard_user / wrong-password | Submit invalid credentials | Error visible; no authenticated navigation | P1; Auth/regression/negative; U |
| UI-004 Required login input | SauceDemo; empty username then empty password | Submit blank → fill username → submit | Appropriate required-field error for each submission | P1; Auth/regression/negative; U |
| UI-005 Checkout completes | SauceDemo; standard login; backpack; Ada/Test/10001 | Add backpack → cart → checkout → fill customer → continue → finish | Summary matches item; success confirmation appears; cart cleared | P0; Checkout/smoke/e2e; U |
| UI-006 Cart removal preserves remaining items | Login; backpack and bike light | Add both → cart → remove backpack | One correct item remains and badge becomes 1 | P1; Cart/functional; U |
| UI-007 Price sort is numeric | Login; seeded six-item catalog | Select low-to-high → read all prices | Numeric array nondecreasing, same item count and IDs | P1; Catalog/regression; U |
| UI-008 Checkout rejects missing customer data | Login; backpack in cart | Checkout → blank continue → fill first/last → blank postal continue | Required errors; user stays on information page; cart preserved | P0; Checkout/negative; U |
| UI-009 Logout clears session | Login; one cart item | Menu → logout → navigate directly to inventory | Login required; protected inventory not usable | P0; Auth/smoke/security-functional; U |
| UI-010 Cancel checkout preserves cart | Login; backpack in cart | Checkout info → cancel | Cart displayed with original backpack, no completion | P1; Checkout/regression; U |
| UI-011 Product detail matches catalog | Login; backpack | Capture title/price → open item → add to cart → view cart | Name/price match through all views; quantity 1 | P1; Catalog/e2e; U |
| UI-012 Checkout total arithmetic | Login; backpack and bike light; pinned price fixture | Checkout overview → capture item prices/subtotal/tax/total | Subtotal equals sum to cent; total equals subtotal+displayed tax; no floating-point tolerance beyond cent | P0; Checkout/regression; U |
| WEB-001 Dynamic loading waits for content | The Internet /dynamic_loading/1 | Start → await Hello World | Text visible within timeout without fixed sleep | P1; Dynamic/functional; U |
| WEB-002 Checkbox state persists within page | /checkboxes | Inspect states → check first → uncheck second | First checked, second unchecked using semantic state | P1; Forms/functional; U |
| WEB-003 Dropdown selects requested option | /dropdown; value 2 | Select value 2 | Selected value 2 and Option 2 label | P1; Forms/functional; U |
| WEB-004 Alert confirmation accepts/dismisses | /javascript_alerts | Register dialog handler → click confirm → dismiss; repeat accept | Correct result text for each path; handler attached before trigger | P1; Dialog/positive-negative; U |
| WEB-005 New window isolation | /windows | Await popup event while clicking link → inspect popup → close | New Window heading in popup; original page remains usable | P1; Navigation/regression; U |
| WEB-006 Upload synthetic text file | /upload; local hello.txt, 20 bytes | Set input files → upload | Uploaded filename displayed; no personal files used | P2; Forms/regression; U |
| WEB-007 Dynamic input enablement | /dynamic_controls | Enable → wait for enabled input → fill demo | Input becomes enabled; entered text matches | P1; Dynamic/regression; U |

## Public API cases

| ID and objective | Preconditions and data | Steps | Expected result | Priority; labels; evidence |
|---|---|---|---|---|
| API-001 Read post contract | JSONPlaceholder; post 1 | GET /posts/1 → validate schema | 200; integer id=1/userId; string title/body; JSON content type | P0; Posts/smoke/positive; A |
| API-002 Filter by owner | userId=1 | GET /posts?userId=1 | 200; nonempty list; every userId=1 | P1; Posts/functional; A |
| API-003 Simulated creation | {userId:1,title:"Assertide",body:"fixture"} | POST /posts → inspect echo | 201; generated numeric ID; supplied fields returned; no persistence assertion | P0; Posts/smoke/POST; A |
| API-004 Simulated replacement | post 1; full replacement fields | PUT /posts/1 | 200; id=1 and replacement values in response | P1; Posts/regression/PUT; A |
| API-005 Simulated patch | post 1; title="Updated" | PATCH /posts/1 | 200; updated title; id remains 1; baseline body retained | P1; Posts/regression/PATCH; A |
| API-006 Simulated deletion | post 1 | DELETE /posts/1 | 200; empty object; later reads not assumed deleted | P1; Posts/regression/DELETE; A |
| API-007 Nested relationship | post 1 | GET /posts/1/comments | 200; nonempty schema-valid collection; every postId=1 | P1; Comments/integration; A |

## Controlled API cases

| ID and objective | Preconditions and data | Steps | Expected result | Priority; labels; evidence |
|---|---|---|---|---|
| LAB-001 Persistent order lifecycle | operator-a token; unique idempotency key; sku DEMO-01 qty 2 | POST → GET returned Location → PUT qty 3 with ETag → PATCH qty 4 with new ETag → DELETE with current ETag → GET | 201,200,200,200,204,404; state/version preserved across reads | P0; Orders/smoke/e2e; A |
| LAB-002 Missing authentication | No token | GET /orders | 401 with safe auth error; no tenant data | P0; Auth/negative; A |
| LAB-003 Invalid/expired token | Controlled bad signature and expired JWT variants | GET /orders per variant | 401 for both; no internal signing detail | P0; Auth/negative; A |
| LAB-004 Viewer cannot create | viewer-a token; valid body | POST /orders | 403; resource count unchanged | P0; Authorization/negative; A |
| LAB-005 Tenant separation | A-created order; operator-b token | GET/PATCH/DELETE A order as B | 404 each; subsequent A GET unchanged | P0; Authorization/regression; A |
| LAB-006 Quantity boundary validation | operator-a; quantities 0,1,10,11 | POST each with distinct keys → cleanup successes | 422,201,201,422; error pointer /quantity for invalid values | P1; Schema/boundary; A |
| LAB-007 Malformed JSON/media type | operator-a; body "{" then text/plain | POST malformed JSON → POST wrong content type | 400 then 415; no resource created | P1; Transport/negative; A |
| LAB-008 Optimistic concurrency | Fresh order and ETag v1 | Update with v1 → attempt another update using stale v1 | First 200/new ETag; second 412; successful value remains | P0; Orders/concurrency; A |
| LAB-009 Idempotency deduplication | Same principal and key | POST twice same body → third POST changed body same key | First/second same ID and creation response; only one row; third 409 | P0; Orders/integration; A |
| LAB-010 Pagination has no overlap | Seed 25 owned orders, frozen test clock | GET limit20 → use next cursor | 20 then 5; unique IDs; stable ordering; no cross-tenant records | P1; Orders/regression; A |
| LAB-011 Rate-limit handling | Fault hook enabled; reset fixture counter | GET with rate-limit fault | 429; Retry-After=2; runner records one attempt and does not busy-loop | P1; Resilience/negative; A |
| LAB-012 Bounded timeout | Timeout fault; request timeout 500ms | GET with timeout hook → capture transport exception | Timeout classified as transport, within 1.5s local tolerance; no fake HTTP status | P1; Resilience/negative; A |
| LAB-013 Service failure diagnosis | 503 fault hook | GET orders with injected fault | 503; correlation ID; safe body; Allure failure includes request context | P1; Resilience/negative; A |
| LAB-014 Response-time budget | Warm local service; operator-a | Warm 3 GETs → measure 20 serial GETs | All 200; sorted nearest-rank p95 <500ms; samples attached | P2; Performance/budget; A |
| LAB-015 Confirmed-order deletion protection | Confirmed order | DELETE confirmed order → GET | 409 then 200; order intact | P1; Orders/business-rule; A |

## Assertide platform acceptance tests

| ID and objective | Preconditions | Steps | Expected result | Priority; labels; evidence |
|---|---|---|---|---|
| PLAT-001 Duplicate start is safe | Operator and one case | Submit same key/body concurrently | One run/job, both responses reference same run | P0; Execution/concurrency; API trace + DB invariant |
| PLAT-002 Cancel race preserves truth | Run near completion | Cancel while final event arrives | Exactly one terminal state; completed attempts preserved; audit shows race result | P0; Execution/race; event sequence |
| PLAT-003 Worker loss is visible | Running isolated job | Kill worker → wait lease expiry | infrastructure_error; incomplete items diagnosed; no silent rerun | P0; Execution/chaos; events/logs |
| PLAT-004 Stream resume deduplicates | Live stream with last event ID | Disconnect/reconnect/replay duplicate | Ordered unique UI updates; same counts as snapshot | P0; Live/integration; event log |
| PLAT-005 Cross-project evidence denied | User lacks other project | Request result, trace, report child asset and SSE | 404/403 consistently; no bytes or live events leaked | P0; Security/authorization; redacted API trace |
| PLAT-006 Report failure independent | Completed failing run | Inject report job error → rebuild | Test outcomes unchanged; report failed then ready | P0; Reporting/resilience; report logs |
| PLAT-007 Retention is truthful | Expired objects + valid result | Retention worker → reload result | Tombstone explains expiry; download unavailable; stats retained | P1; Retention/integration; audit |
| PLAT-008 Metric denominators | Seed PRD fixture | Query 7-day analytics with same filters | 2268/2340=96.9%; retry recovery 45/2340=1.9%; skipped=60 | P0; Analytics/contract; fixture query |
| PLAT-009 Config injection is rejected | Operator form/API | Submit shell text, private destination, excess workers | 422; no process/network side effect | P0; Security/negative; policy audit |
| PLAT-010 Accessible primary journeys | Keyboard + screen reader | Complete A/B/C without pointer; 200% zoom; 390px | No trapped focus; labels/status read; no page overflow | P1; UX/accessibility; review notes |

## Execution strategy and exit criteria

PR gate uses local UI-001/005/008/009/012 and LAB-001/002/004/005/008/009 plus platform P0. Full regression nightly runs UI across three browsers and API once. Public practice suites run manually/on demand, not every PR. Public infrastructure failure is categorized separately from a product regression. Quarantine requires owner, issue, reason and 7-day expiry; quarantined tests remain visible and never inflate gate coverage. Retry is a diagnostic aid: first-attempt and eventual outcome are both retained.

Entry: target revision pinned, permission decision stored, fixture contract implemented, dependency compatibility verified, sandbox healthy. Exit: all P0 cases pass on the release candidate, no unresolved security isolation defects, at least 95% evidence completeness, flake recovery under an agreed pilot threshold (initial target <2%), browser and API contract coverage reviewed. Thresholds are proposed release policies, not observed results. Unexpected public behavior opens a target-maintenance issue rather than changing assertions merely to force green.
