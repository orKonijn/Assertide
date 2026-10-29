# Controlled Lab fixtures

The developer launcher generates local credentials and starts the Lab on loopback. Authentication tokens expire after five minutes. Never reuse these credentials outside this fixture.

Order requests enforce 20 requests per minute per fixture subject. Signed `X-Lab-Fixture` JWTs allow independent test scopes and deterministic rate-window clocks. Their audience is `assertide-lab-fixture`, issuer is `assertide-lab`, subject must match the authenticated user, and claims include a UUID `scope`, millisecond `clock`, and optional `fault`. They expire after five minutes and use the local Lab signing key. The separate audience prevents fixture controls from authenticating ordinary API access.

`X-Lab-Fault` accepts `timeout`, `503` or `rate-limit` only when the signed control names the same fault. Timeout delays two seconds (or stops when the client disconnects); rate-limit returns 429 with `Retry-After: 2`; service failure returns a safe 503 problem and correlation ID. Platform routes reject fixture headers, and the combined Lab service refuses production mode.

Tests use unique SKUs and clean up created orders. Pagination can filter by SKU to isolate a test's records without truncating another run's data. The rate-window test verifies 20 successful requests, a rejected 21st request, and recovery after a signed clock advance. Warmed latency records 20 samples and nearest-rank p95; this is a local acceptance budget, not a production SLA.

Verification: all LAB-001 through LAB-015 passed, as did the browser journey launching all 15 cases alongside two browser cases and generating/rebuilding their Allure report. API integration checks also reject unsigned or forged fault controls.
