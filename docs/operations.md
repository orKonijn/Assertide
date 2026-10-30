# Operations

`GET /health` is process liveness. `GET /ready` checks the database and configured Redis/object-store dependencies, returning 200 or 503 without connection details. Checks are bounded and shared for five seconds to avoid probe storms. An unconfigured optional development dependency is omitted, not reported as verified.

Administrators can inspect dependency status, queue age, execution phases, expired active leases and failed reports in Settings. Run counts include only projects they can access. The corresponding authenticated endpoint is `GET /v1/operations`; viewers and machine credentials are denied. Dependency diagnostics never return credentials or underlying exception text.

Capacity defaults are two active runs per project, four per organization and eight requested workers per organization. Set `MAX_PROJECT_RUNS`, `MAX_ORGANIZATION_RUNS` and `MAX_ORGANIZATION_WORKERS` in the supervisor environment to change deployment policy. Values must be positive integers, capped at 100, 500 and 1000 respectively. The scheduler enforces the configured limits transactionally. Reference-load testing with 20 workers requires an explicit larger deployment policy; changing limits is not proof that the host has sufficient capacity.

Monitor readiness failures, oldest queued age, expired leases and failed-report counts. A failed report can be rebuilt independently from test outcomes. An expired lease requires worker-host investigation; stale workers cannot publish results. Storage errors retain evidence references for retry rather than marking deletion successful. Retention is 14 days for trace/video, 30 for raw evidence/reports and 365 for normalized results/audit.

Verification includes forced database probe failure, authorization/scope checks, real object-store readiness, scheduler quota tests and desktop/mobile health screenshots. Production availability, load targets and full database restore acceptance require separate measured drills.

## Reference control-plane measurement

[CI run 40988164930](https://github.com/orKonijn/Assertide/actions/runs/40988164930), Ubuntu runner / Node 24 / PostgreSQL 17, used 50 authenticated clients, 10,000 parsed catalog cases, 100,000 stored result instances and 20 active worker leases across five projects. Five rounds produced 250 catalog searches and 250 paginated history reads, followed by 50 launch requests, 100 lease renewals and 50 live-event subscribers. Measured p95: catalog 292.51 ms, history metadata 177.62 ms, launch 110.65 ms, lease renewal 2.90 ms, live-event delivery 112.17 ms. The configured catalog/read/start/live thresholds passed. CI uploads the JSON measurement artifact and reruns the check on each change.

This measures control-plane HTTP, database contention and SSE delivery. It does not simulate 20 simultaneous browser processes, measure browser rendering, or establish production availability. [Database recovery](database-recovery.md) describes the separate restore drill and its limits.
