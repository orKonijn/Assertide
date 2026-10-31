# Free pilot deployment verification

Initial verification on 2026-10-31. **Subsequent incident:** B2 exhausted the free daily transaction allowance and denied reads, causing HTTP 502/503. Storage health polling was excessive; the correction and quota-reset constraint are documented in [pilot operations](free-pilot-setup.md#free-tier-storage-health-budget). The successful launch checks below are historical evidence, not a current uptime guarantee. The deployment address is [assertide.com](https://assertide.com); API access is currently blocked by the storage quota incident. This is a single-node pilot with the limitations below, not a product release or a high-availability production acceptance claim.

## Deployment and DNS

- Oracle Always Free ARM server: 2 OCPUs, 12 GB RAM, a 47 GB boot disk and a 150 GB retained data disk. No paid load balancer, managed Kubernetes service, account upgrade or new paid service was purchased.
- K3s runs the web application, API, execution/report supervisors, PostgreSQL, Redis, production Keycloak and Vault Transit. Restricted, network-isolated Jobs execute controlled fixtures. Development identity and trusted local runners are not public.
- Private B2 evidence and backup buckets retain object versions and use server-side encryption. Four independently scoped keys have one-year expiry. The backup key can inspect versioning and read/write files, but cannot delete backups or mutate buckets. Temporary setup keys were invalidated. Account daily caps are $0 with provider email threshold alerts.
- Porkbun apex ALIAS was replaced with an A record; explicit A records for `auth`, `reports` and `www` point to the same approved server. TTL is 600. Existing wildcard CNAME, MX, SPF and unrelated verification records were preserved. Four initial certificate-challenge TXT records remain harmlessly present; renewal uses HTTP-01 instead.
- Cert-manager owns the trusted certificate for all four names and its automated HTTP-01 renewal. Certificate Ready was verified after a real issuance. The manual bootstrap timer is disabled. HTTP redirects to HTTPS; `www` preserves path/query when redirecting to the apex.
- Sign-in uses production Keycloak at `auth.assertide.com`, an exact callback at `https://assertide.com/auth/callback`, confidential-client credentials and PKCE. Keycloak administration and the master realm have no public ingress. The application API uses its same-origin `/v1` proxy; wildcard CORS is not enabled.

## Successful checks

| Check                     | Observed result                                                                                                                                                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNS and HTTPS             | All four names resolve to the intended server. Valid TLS, application HTTP 200, HTTP-to-HTTPS 301 and canonical `www` 308 passed.                                                                                                                                                                                    |
| Login and frontend/API    | Actual browser OIDC sign-in returned to the application, loaded projects/catalog and queued controlled runs. Anonymous protected API returned 401.                                                                                                                                                                   |
| Kubernetes execution      | Controlled API order-lifecycle and Chromium sign-in cases completed successfully on native ARM, with normalized results and private artifacts. The final combined verification completed two tests with no retries.                                                                                                  |
| Private report            | Authorized Allure report rendered both passing results. Anonymous access, removed project membership and an expired viewing grant each returned 403; a fresh authorized grant restored access.                                                                                                                       |
| Vault                     | Real API and execution identities passed TLS, Kubernetes login, encrypt/decrypt and wrong-context rejection; administrative access returned 403. Initial root token was revoked.                                                                                                                                     |
| Public boundaries         | External connections to PostgreSQL 5432, Redis 6379, Vault 8200 and Kubernetes 6443 failed. Public Keycloak `/admin/` returned 404. SSH remains operator-address restricted.                                                                                                                                         |
| Object storage            | Real adapter checks passed upload/version reads, checksum rejection, anonymous denial, version deletion and multipart cleanup. Evidence keys were checked for cross-bucket denial.                                                                                                                                   |
| Scheduled database backup | The deployed image completed an encrypted, versioned B2 backup without the temporary script override. Daily schedule is 02:00 UTC. Exact object-version download, size and SHA-256 validation passed.                                                                                                                |
| Database restore          | The downloaded application dump restored transactionally into a separate empty database, recovering documents and memberships. A separate identity-database restore recovered both realms and all three then-existing users. Live databases were not overwritten.                                                    |
| Vault restore             | A disposable private Vault instance restored the saved Raft snapshot, unsealed with the original recovery shares, and decrypted a controlled value encrypted by the live deployment. Its restored root token was revoked and the disposable pod removed.                                                             |
| Off-host recovery copy    | Application/identity dumps, retained sources, Vault snapshot/recovery material and cluster configuration were copied to access-restricted local storage, encrypted with Windows user protection and round-trip verified. No recovery material or raw evidence is committed.                                          |
| Local verification        | Full `verify:quick` passed after integration with main. Focused UI checks, automation type checks, architecture and credential-safe reporting checks passed. The full local browser acceptance rerun passed all 34 tests, including the 64-state accessibility matrix; current Linux CI is tracked separately below. |

Native ARM images are built, scanned and signed by the image publication workflow; each deployed application digest is verified against its source commit and GitHub workflow attestation. The private operator configuration records exact immutable digests. Publication alone does not deploy them.

## Remaining production limitations

- One node means maintenance, host failure or free-capacity reclamation stops the whole application. Only one execution Job is admitted. This is not arbitrary untrusted-code hosting or a capacity-tested multi-tenant service.
- Vault requires manual unsealing after restart. Recovery material is protected locally; the Windows-encrypted copy depends on this operator account. Arrange a separately secured recovery custodian before relying on this pilot for critical data.
- Daily off-host backups currently cover the application database. Identity database, sources, Vault and cluster material have a verified initial recovery copy, but their recurring coordinated off-host backup and whole-host disaster-recovery drill are not established. No 24-hour RPO or four-hour RTO is claimed.
- B2 provider cost-cap alerts are configured. Delivered operational outage/backup-age/disk/Vault-expiry alerts are not yet configured. Private metrics and Kubernetes readiness do not replace operator notification. Retained object versions count toward the account's 10 GB free allowance; reaching caps may stop writes or reads.
- SMTP password recovery is not configured. The owner must change their initial temporary password themselves; use the private operator procedure for recovery. Open registration is disabled. Rotate scoped storage keys before their one-year expiry.
- Previous executions pin their original worker image. After an image update, creating a fresh execution works; rerunning an old execution requires a matching worker image and is intentionally refused otherwise.
- Recovered local projects/history were preserved on the original computer and were not uploaded. The hosted pilot contains its bootstrap project and controlled verification runs.

## Operator recovery and rollback

Use [the setup procedure](free-pilot-setup.md), [database recovery](database-recovery.md) and [production guidance](production-deployment.md). Inspect readiness, disk capacity, Vault seal status, certificate expiry and the most recent successful backup before accepting important work. Restore only into new empty databases/volumes; preserve live and retained volumes. Revoke restored sessions and credentials as appropriate to the incident.

The encrypted recovery archive and owner-only first-login file are in the ignored operator checkout. Never attach these files to issues or PRs. The private named Keycloak administrator replaces the removed bootstrap administrator. Do not reapply the initial generated Secret manifest: it contains historical setup credentials and an obsolete backup key.

For application rollback, pin the previously verified image set only after checking database compatibility. DNS rollback restores the saved apex parking ALIAS and removes only this deployment's explicit host records; preserve unrelated/email records. It does not restore application data.

## Deployed image record

Application source: `89060e9e17720d32edcd226a024abbe7b207cb1f`, published by [the successful native ARM workflow](https://github.com/orKonijn/Assertide/actions/runs/41221558701). Later test-only commits do not change this deployed application build.

| Role    | Verified digest                                                           |
| ------- | ------------------------------------------------------------------------- |
| Service | `sha256:c7d2a2fb9a437d9cd27f83293919c58512668be0d36817602c14d7d9a3988e8e` |
| Web     | `sha256:c74817a00164e2c0b246ae9e1dbcb6cfce2f203936d7304bfd3132d5e0d2e577` |
| Worker  | `sha256:c92274169178a249e43cc25857f49e5d0ee414cb298993a6121b7ead1d0b682a` |

The certificate expires 2027-01-29; cert-manager schedules renewal for 2026-12-30. These are observed status values, not a guarantee of future renewal.

Current Linux checks are visible on [deployment PR #5](https://github.com/orKonijn/Assertide/pull/5). Earlier failures exposed stale UI contracts and were corrected; a running check is not a pass. The full local browser rerun uses the original local app's private run directory through the documented test override. No production credentials or raw evidence are included in CI.

## Storage quota incident correction (2026-10-31)

Source commit `655be7b17252eb906a2f3fd78111a7f3e11fbef8` was published by [image workflow 41233625352](https://github.com/orKonijn/Assertide/actions/runs/41233625352). Image smoke/vulnerability checks and signed source provenance verification passed. Deployed application digests supersede the initial-launch digests above:

- Service: `ghcr.io/orkonijn/assertide-service@sha256:27374872cff4e0d07f31574e2a68ed3a17b9c2836fc2487e16999d69bd36add5`
- Web: `ghcr.io/orkonijn/assertide-web@sha256:327a1558af3777a35b749aebf2c04f50d2cc752d82a681c33d4aa0e70b23e084`
- Isolated execution image configured for new runs: `ghcr.io/orkonijn/assertide-worker@sha256:4bfc8e7ce3ec11ab2a51f9b64ced5cc68c9d33156fdae054cd4b81b15b9f2c59`

All three service containers run the corrected module with `STORAGE_HEALTH_INTERVAL_MS=900000`; an in-container controlled check confirmed 50 concurrent callers share one probe. Their liveness endpoints return 200, and storage-dependent readiness correctly remains 503. The public frontend returns 200, API returns 502 and reports return 503 while the B2 cap remains active. Authentication and a new execution/report round trip cannot be verified during this outage. No new controlled production run is claimed for these digests.

Full local `verify:quick` passed, including deterministic one-day request-budget and failure/recovery tests. Linux CI for this commit was still running at this verification. The private local application was restarted with its existing database; frontend/backend health and the local SSO entry page respond normally. No database reset, DNS change, cap increase or paid purchase was performed.
