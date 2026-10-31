# Assertide domain deployment

Status: the Always Free pilot VM has been created; application deployment and DNS cutover are not complete. The owner confirmed **assertide.com** on 2026-10-31. Do not configure or purchase assertide.net.

Use the actual application containers and [production deployment procedure](production-deployment.md), never `deliverables/` previews. No product release version is assigned by this preparation.

## Domain and authentication contract

| Setting                                   | Value or requirement                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `APP_ORIGIN` / renderer `appOrigin`       | `https://assertide.com`                                                               |
| `REPORT_ORIGIN` / renderer `reportOrigin` | `https://reports.assertide.com`                                                       |
| OIDC callback                             | `https://assertide.com/auth/callback`                                                 |
| Canonical redirect                        | `https://www.assertide.com` to `https://assertide.com`, preserving path and query     |
| Application API and sign-in               | Same-origin `/v1/` and `/auth/`, forwarded by the existing web proxy                  |
| Certificates                              | Apex, `www`, and `reports` must each have valid certificates before HTTPS checks pass |

Register a production confidential OIDC client with the exact callback above. Keep its secret in the hosting secret store. Do not add localhost callbacks or use the development identity provider. Bootstrap the administrator using the actual provider subject, following the existing deployment guide. Do not enable wildcard cross-origin access; the application uses the same-origin proxy. Report authorization remains on its separate origin.

The general renderer provisions app/report ingress. The [single-node pilot setup](free-pilot-setup.md) also renders production identity routes and an HTTPS `www` redirect. Public certificates and HTTP-to-HTTPS redirection still require ingress configuration.

## DNS baseline and cutover

The authenticated Porkbun DNS view contained these five records on 2026-10-31, all with TTL 600. Re-read the records immediately before any change.

| Type  | Host              | Value                                  | Priority | Treatment                                                    |
| ----- | ----------------- | -------------------------------------- | -------- | ------------------------------------------------------------ |
| ALIAS | `assertide.com`   | `uixie.porkbun.com`                    | —        | Replace only after the production ingress target is verified |
| CNAME | `*.assertide.com` | `uixie.porkbun.com`                    | —        | Preserve; add explicit required host records                 |
| MX    | `assertide.com`   | `fwd1.porkbun.com`                     | 10       | Preserve                                                     |
| MX    | `assertide.com`   | `fwd2.porkbun.com`                     | 20       | Preserve                                                     |
| TXT   | `assertide.com`   | `v=spf1 include:_spf.porkbun.com ~all` | —        | Preserve                                                     |

Use the hosting provider's verified apex ALIAS or A/AAAA target. Add explicit `www` and `reports` records for their verified endpoints; do not invent IP addresses, publish an unconfigured IPv6 address, or replace nameservers. Preserve any newly discovered email, verification, or unrelated records. Record the previous values privately for rollback. If cutover fails, restore only the records changed by this deployment. DNS rollback does not restore database state.

## Infrastructure gate

Before cutover, select and verify an accessible hosting account and its costs. Obtain owner approval before purchasing a paid plan. The available Railway connector requires reauthentication; the account's existing resources and plan have not been inspected. A web-only deployment is insufficient.

Provision PostgreSQL, Redis, private versioned artifact storage, a separate backup bucket, production Vault Transit, and durable shared source storage. Use the existing Kubernetes workflow with a network-policy-enforcing cluster, isolated worker Jobs, scoped identities, and the source PVC described in the production guide. Confirm the provider supports this topology before choosing it. Keep Vault, databases, queues, worker control, credentials, and internal health/metrics private.

Use verified immutable service/web/worker image digests produced by the existing image publication workflow. Supply real infrastructure values to `deploy/config.example.json` in private storage and render it with `deploy/render.mjs`. Do not treat illustrative digests or a successful render as a deployed platform. Keep recovered local projects, credentials, traces, reports, and database backups out of the deployment; use controlled production smoke-test data.

## Niva hosting compatibility review

The previous Niva publication used the Sites plugin, confirmed in its deployment chat and `workme/niva-tailwind/.openai/hosting.json`. Its production build uses an Angular frontend plus a Cloudflare Worker adapter and a D1 database. This is not the PostgreSQL/container deployment used by Assertide.

The installed Sites hosting contract supports Cloudflare Workers with 128 MB per isolate, HTTP external connections, D1 records, and R2 files; raw TCP is unavailable. Assertide's production database uses `pg.Pool`, its queue uses BullMQ/ioredis, and its execution runtimes launch isolated OCI containers or Kubernetes Jobs. Its Playwright image and subprocess-based services cannot be deployed as a Sites Worker.

Sites could serve the frontend after a separate integration, but would still require external backend and execution infrastructure. Moving records to D1 and files to R2 alone would not provide a browser execution runtime, and the current artifact storage contract requires versioned objects. Therefore Niva's hosting is not a complete free deployment target for the current Assertide implementation. No Assertide Site was created, no Niva configuration was changed, and no domain cutover was performed during this review.

## Free pilot candidate: Oracle VM and Backblaze B2

Research date: 2026-10-31. This is a deployment design, not an implemented or load-tested environment. A free pilot cannot promise the availability of the managed multi-node production topology.

Use one Oracle Always Free Ampere A1 VM with 2 OCPUs and 12 GB RAM, with a 50 GB boot disk and up to 150 GB persistent data disk within the 200 GB combined allowance. Run a single-node K3s cluster with enforcing network policy and the existing restricted worker namespace. Keep the Kubernetes API private. Reduce the application and execution supervisors to one replica each, allow one run at a time, and adapt disruption budgets to the single-node maintenance model. A shared local persistent volume is viable only with explicit single-node affinity and a retained/recoverable data disk; it is not a multi-node RWX replacement.

Host PostgreSQL, Redis, HashiCorp Vault Transit, and a production Keycloak OIDC provider privately on this VM, alongside the existing API, report supervisor, and web containers. Keycloak's login endpoint would use `https://auth.assertide.com`, a production database, and the exact app callback. Keep its administrative interface private. Oracle Vault is not a drop-in replacement for the application's HashiCorp Transit API. Do not use development Vault or the development identity provider.

Use Backblaze B2 private buckets for artifacts and separate backups, with scoped credentials, server-side encryption, and version-aware reads/deletion. Its first 10 GB is free across the account, not per bucket. Enforce account caps for storage, transactions, and downloads before uploads, and stop accepting runs when space is insufficient instead of silently deleting required evidence. Keep headroom for historical object versions and backup generations. No paid upgrades or payment method additions are authorized. A real SDK contract test must verify upload version IDs, old-version reads, hashes, bulk version deletion, multipart cleanup, backup upload, and anonymous denial before adoption.

Oracle's object storage is an alternative, but its S3 support table does not explicitly list `ListObjectVersions`, which Assertide's retention code calls. Documentation confirms version-ID support, not full application compatibility; do not assume that this removes the need for a contract test or adapter.

Use ingress directly on the VM for HTTP/HTTPS, with certificates and explicit apex/report/auth routes plus the `www` redirect. Avoid provisioning a paid managed Kubernetes service, NAT gateway, or paid load balancer. Preserve Porkbun nameservers and email records. The database, Redis, Vault, source volume, and worker control endpoints remain inaccessible from the public internet.

### Verification and outstanding work

- Latest pilot verification: lint, formatting, type checks and nine deployment/credential tests passed. The full quick run exhausted local memory during concurrent API tests. Re-running the API suite serially passed 33 tests with eight infrastructure skips; all ten frontend tests and the production build passed separately. Logs remain private under `.local/verification/`. Native Linux/container and live-domain checks are still unavailable.

- Local `npm run verify:quick` completed successfully on 2026-10-31 after locked dependency installation in the isolated deployment checkout: lint, formatting, type checks, renderer/domain/local-service tests, 33 API tests, 10 frontend tests, and the production frontend build passed. Eight infrastructure-dependent API tests were skipped (PostgreSQL reconnect, Kubernetes, OCI isolation, S3, Vault, cross-worker evidence, Redis, and private trace viewer). They are not deployment passes. The private log is `.local/verification/quick-20261031.log`.
- The pinned `mcr.microsoft.com/playwright:v1.64.1-noble` registry manifest was queried and contains both Linux amd64 and arm64 images. Playwright also documents ARM Linux support. This does not verify Assertide's full image or dependency compatibility.
- The image workflow now offers native amd64 or arm64 runners and architecture-specific tags. Build and scan native ARM service/web/worker images, pin their resulting digests, and run the Linux isolation suite on ARM before launch. Do not build heavy images on the small production VM while serving users.
- K3s documents a two-core/two-GB server minimum excluding application workloads. A preliminary memory envelope is 2 GB for OS/K3s/ingress, 3 GB for API/report/execution supervisors, 2 GB for the isolated job, 1 GB PostgreSQL, 1.5 GB Keycloak, 0.5 GB Redis/Vault, and 2 GB headroom. These are planning estimates, not measured requirements; actual container limits and report-generation peaks must be tested. If the workload does not fit, do not weaken isolation or silently upgrade billing.
- The single-node renderer and private credential/bootstrap helper are implemented with local contract tests; see [setup and recovery](free-pilot-setup.md). The approved VM, retained disk, encrypted K3s state, private Vault certificate, and capped B2 storage are provisioned. Public certificates, Vault initialization, application startup and complete runtime verification remain pending.
- Test backup recovery on a separate disposable environment. Single-node outages stop the whole app; Oracle may reclaim idle free VMs and capacity may be unavailable. Do not artificially generate activity to defeat reclamation.
- Oracle sign-in succeeded and the approved `assertide-pilot` VM is Running in the home region with 2 ARM OCPUs and 12 GB RAM. Its SSH ingress has been restricted to the operator IPv4 /32 before public address assignment. SSH connectivity and K3s readiness are verified. A positive control reached the Kubernetes service while the same probe in the worker namespace was denied. This checks network-policy enforcement, not complete worker execution. Login and domain acceptance remain pending. Local Docker is unavailable and WSL lists no installed distributions.

The VM has a 47 GB boot volume and a 150 GB retained data volume (197 GB total). K3s v1.37.1+k3s1 runs with encrypted secrets and a verified pod PID limit of 256. The application images built natively on ARM; the service image passed 33 API tests with eight infrastructure skips, and the web container passed private health and SPA routing checks. Image scan remediation and signed publication are still in progress. B2 has two private encrypted buckets retaining all versions, $0 daily caps and email alerts. Its real application storage contract passed, including old-version reads, integrity rejection, anonymous denial, version deletion and multipart cleanup. Four bucket-scoped file-only keys replaced the broader dashboard key; the temporary master setup key was invalidated and returned HTTP 401 on verification. No public DNS records have changed.

### Provider references

- [Oracle Always Free limits, capacity and reclamation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Oracle account verification requirements](https://docs.oracle.com/en/learn/cloud_free_tier/)
- [Oracle S3 API support](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/s3compatibleapi_topic-Amazon_S3_Compatibility_API_Support.htm)
- [K3s system requirements](https://docs.k3s.io/installation/requirements)
- [Playwright supported platforms](https://playwright.dev/docs/intro)
- [Keycloak production containers](https://www.keycloak.org/server/containers)
- [Backblaze free storage allowance](https://help.backblaze.com/hc/en-us/articles/217667478-Understanding-B2-Pricing-Structure)
- [Backblaze transaction pricing and version-list support](https://www.backblaze.com/cloud-storage/transaction-pricing)
- [Backblaze caps and alerts](https://www.backblaze.com/docs/en/cloud-storage-data-caps-and-alerts)

## Acceptance and rollback gate

Record each result as passed, failed, or unavailable, with the deployed commit and image digests. Do not mark the platform live until all required checks pass.

1. Run repository verification and Linux container/Kubernetes/Vault checks for the deployment revision. Confirm dependencies, migrations, bootstrap, private storage/versioning, worker isolation, and service readiness.
2. Confirm public DNS answers reach the intended ingress for apex, `www`, and reports. Confirm MX and SPF still match the baseline or intentionally preserved later records.
3. Validate trusted, unexpired HTTPS certificates and HTTP redirects. Confirm the `www` canonical redirect preserves path/query without redirect loops.
4. Log in through the production OIDC provider; verify the exact callback, secure session cookie, logout, and denial of anonymous protected API access. Confirm projects load through the web proxy.
5. Execute an owned controlled fixture run using the isolated production worker. Verify completion, normalized results, and persisted private artifacts; do not run public-practice cases.
6. Open the generated report as an authorized member. Verify anonymous, expired-grant, and cross-project access are denied and the underlying storage is not public.
7. Verify a database/source backup and restore drill before claiming recovery targets. Preserve logs and evidence privately, with no credentials or raw evidence committed.

On failure, keep public launch unannounced, restore the previous DNS records if needed, and retain the failed deployment's private diagnostics. Roll back containers using the last verified digests only after checking database migration compatibility; do not reset or replace persisted data.
