# Execution delivery and ownership

Run creation records its idempotency response, immutable selection and outbox entry in one SQL statement. Redis delivery is optional for local development; set `REDIS_URL` to use BullMQ. The SQL outbox remains authoritative and is replayed after publication failures. Job IDs are run UUIDs, while a database compare-and-swap prevents duplicate delivery from starting an already claimed or terminal execution.

Workers claim a monotonically increasing lease epoch and renew a 30-second lease every five seconds. Result and log writes require the owner, epoch and unexpired lease. Terminal outcomes cannot be transitioned again. Expired execution leases become infrastructure errors rather than silently replaying tests with possible side effects. Report generation has independent recovery and can be retried without changing execution results.

Capacity admission is serialized in a database transaction: at most two active runs per project, four per organization and eight aggregate workers. Runs remain queued with an explanation when capacity is exhausted. Redis jobs are delayed without consuming retry attempts; the SQL fallback rechecks capacity.

The local launcher still executes this repository's trusted fixtures in child process groups. Redis delivery and fencing do not make that runner a production isolation boundary. Production execution uses digest-pinned OCI or Kubernetes workers, private object storage and separate execution/report supervisors. CI verifies both runtimes and reference restore/load drills; production-scale capacity, recovery and availability acceptance remain deployment-specific. See [deployment setup](production-deployment.md).

CI runs SQL tests against PostgreSQL 17 and verifies Redis duplicate delivery. The browser pipeline is configured to use PostgreSQL and Redis together. Local fallback checks use embedded PostgreSQL-compatible storage; the Redis-only test is explicitly skipped when `TEST_REDIS_URL` is absent.
