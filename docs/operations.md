# Operations

`GET /health` is process liveness. `GET /ready` checks the database and configured Redis/object-store dependencies, returning 200 or 503 without connection details. Checks are bounded and shared for five seconds to avoid probe storms. An unconfigured optional development dependency is omitted, not reported as verified.

Administrators can inspect dependency status, queue age, execution phases, expired active leases and failed reports in Settings. Run counts include only projects they can access. The corresponding authenticated endpoint is `GET /v1/operations`; viewers and machine credentials are denied. Dependency diagnostics never return credentials or underlying exception text.

Capacity defaults are two active runs per project, four per organization and eight requested workers per organization. Set `MAX_PROJECT_RUNS`, `MAX_ORGANIZATION_RUNS` and `MAX_ORGANIZATION_WORKERS` in the supervisor environment to change deployment policy. Values must be positive integers, capped at 100, 500 and 1000 respectively. The scheduler enforces the configured limits transactionally. Reference-load testing with 20 workers requires an explicit larger deployment policy; changing limits is not proof that the host has sufficient capacity.

Monitor readiness failures, oldest queued age, expired leases and failed-report counts. A failed report can be rebuilt independently from test outcomes. An expired lease requires worker-host investigation; stale workers cannot publish results. Storage errors retain evidence references for retry rather than marking deletion successful. Retention is 14 days for trace/video, 30 for raw evidence/reports and 365 for normalized results/audit.

Verification includes forced database probe failure, authorization/scope checks, real object-store readiness, scheduler quota tests and desktop/mobile health screenshots. Production availability, load targets and full database restore acceptance require separate measured drills.
