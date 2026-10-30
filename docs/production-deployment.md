# Production adapters

Set `WORKER_RUNTIME=kubernetes` on the API and execution supervisor, and use the same registry digest in `OCI_WORKER_IMAGE`. The supervisor needs `kubectl` and namespace-scoped permissions from `deploy/kubernetes/worker-isolation.yaml`. Apply that file first on a cluster with an enforcing NetworkPolicy CNI. Workers have no network access, host mounts or service-account tokens. The approved Lab/store fixtures run inside each worker. This remains a trusted-code product, not a sandbox for arbitrary customer code.

Set the worker-node kubelet `podPidsLimit` to 256 (Kubernetes has no per-Pod PID-limit field), and keep these Jobs on nodes with that limit. Jobs have no automatic retries, a 30-minute deadline, a five-second termination grace period and a five-minute finished-job TTL. The supervisor transfers approved source and per-run input over authenticated Kubernetes exec streams. Input never enters a Job manifest. The worker mounts source read-only; a separate transfer container imports source and exports artifacts. Transfer rejects symlinks and traversal, limits source to 64 MiB, each artifact to 64 MiB and total artifacts to 512 MiB. Runs exceeding those bounds fail explicitly. Cancel, lease loss and supervisor shutdown first signal execution through the private input volume, collect completed attempts, and then delete the Job. A ten-second supervisor fallback forcibly removes unresponsive work; terminal orphan cleanup and the cluster deadline cover supervisor crashes.

## Vault

Set `SECRET_BACKEND=vault`, `VAULT_ADDR=https://...`, `VAULT_ROLE=assertide` and mount a short-lived projected service-account JWT at `VAULT_JWT_FILE`. Configure its audience to match the Vault Kubernetes auth role. `VAULT_NAMESPACE`, `VAULT_AUTH_MOUNT`, `VAULT_TRANSIT_MOUNT` and `VAULT_TRANSIT_KEY` support deployments with dedicated mounts. Trust a private CA through Node's `NODE_EXTRA_CA_CERTS`; TLS verification must remain enabled.

`scripts/configure-vault.sh` provisions the exact derived-key policy and workload bindings with an administrator's short-lived token; the app itself cannot administer Vault. In-cluster Vault needs `system:auth-delegator` on its own service account for TokenReview. An administrator enables Transit and creates the `assertide` key with `derived=true`. Application policy grants only `update` on `transit/encrypt/assertide` and `transit/decrypt/assertide`. Bind the Kubernetes auth role to the exact application service accounts and namespace. Do not grant key creation, rotation, export, deletion or administration to the application. Tokens are cached until shortly before expiry and replaced through workload login; a denied token is discarded, without replaying the failed operation.

Vault owns encryption keys; the database retains immutable ciphertext versions and metadata. Organization, project, credential ID and version form the derivation context. Old AES-GCM rows remain readable with the original `SECRET_ENCRYPTION_KEY`; new rotations use Vault. Keep that legacy key until all retained historical runs and backups no longer reference AES rows. A Vault outage fails credential operations closed and does not fall back to local encryption. Vault's versioned ciphertext supports key rotation without changing run references. Back up Vault storage/key material independently of PostgreSQL; neither backup alone restores credentials.

The API does not return plaintext or ciphertext. Only execution supervisors decrypt credential versions immediately before transferring per-run input. Keep production Vault audit devices enabled and protect their output. Never place JWTs, Vault tokens or credential values in Kubernetes manifests, command-line arguments, logs or Git.

## Verification

`production-adapters.test.ts` tests Job isolation contracts, mutable-image refusal, workload login, token reuse/rejection, context propagation and HTTPS enforcement. `scripts/verify-cluster.sh` creates a disposable kind cluster with Calico, loads a digest-addressed worker via an ephemeral registry, and tests real headed browser/API execution, egress denial and cancellation cleanup. It also exercises real Vault Transit with Kubernetes TokenReview authentication and verifies wrong-context and wrong-role refusal. This script is CI-only and creates its own kubeconfig; it must not target a shared cluster.

Sources: [Kubernetes Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/), [Calico kind installation](https://docs.tigera.io/calico/latest/getting-started/kubernetes/kind), [Vault Transit API](https://developer.hashicorp.com/vault/api-docs/secret/transit), [Vault Kubernetes authentication](https://developer.hashicorp.com/vault/docs/auth/kubernetes).

No product release is assigned or deployed by these changes. Production capacity, recovery and availability acceptance must use the deployment's actual infrastructure and workload.

## Service deployment

Build `deploy/Dockerfile` targets `service` and `web`, and `workers/Dockerfile` for execution. The service image includes Node, the API/report code, approved automation dependencies, kubectl rebuilt from a pinned upstream commit with patched Go transport dependencies and PostgreSQL 17 client tools. `scripts/verify-images.sh` builds the service/web images, checks non-root operation and web routing, produces SPDX SBOMs and rejects fixable high/critical image vulnerabilities. The manual `Publish reviewed container images` workflow applies these checks before publishing commit-addressed GHCR images with GitHub-signed provenance. It does not create a product release or deploy a cluster. Verify each image digest's attestation with GitHub's attestation tooling before deployment.

Copy `deploy/config.example.json` outside Git and fill actual image digests, HTTPS origins, ingress controller and TLS secret names. The renderer refuses placeholders, mutable tags and a shared app/report origin:

```sh
node deploy/render.mjs /private/deployment.json > /private/assertide.json
kubectl apply -f deploy/kubernetes/worker-isolation.yaml
kubectl apply -f /private/assertide.json
```

Create the TLS certificate secret through the deployment's certificate manager. Configure HTTPS redirects at the ingress controller; the application only creates secure production session cookies. The renderer creates two API replicas, two execution supervisors, one report supervisor, two web replicas, readiness/liveness/startup probes, disruption budgets, workload identities, scoped Job RBAC and ingress isolation. Only the execution identity receives Kubernetes API credentials. Vault JWTs have a dedicated audience and ten-minute expiry. The web proxy exposes application/auth routes, not internal metrics. Reports use a separate HTTPS origin and their existing scoped viewer grant.

Provision these **private** Kubernetes Secrets through your infrastructure secret operator; the renderer never emits secret values:

| Secret | Required configuration |
| --- | --- |
| `assertide-api-config` | `DATABASE_URL`, `REDIS_URL`, `S3_BUCKET`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`; object-store region/endpoint and workload credentials if needed |
| `assertide-execution-config` | `DATABASE_URL`, `REDIS_URL`, `S3_BUCKET`; object-store configuration; legacy encryption key only when historical AES credentials remain |
| `assertide-report-config` | `DATABASE_URL`, `S3_BUCKET`; object-store configuration (no OIDC or Vault permissions required) |
| `assertide-backup-config` | Read-only backup `DATABASE_URL`, `BACKUP_S3_BUCKET`, object-store configuration with access only to the backup bucket; legacy encryption key when a backup must record its fingerprint |

The API also needs the legacy key if administrators rotate existing AES credentials during migration. Bind the Vault role to `assertide-api` and `assertide-execution` in the chosen namespace. Use separate database/storage principals with the minimum role-specific access. Configure provider workload-identity annotations on service accounts when using cloud-native credentials. CA certificate mounts and `NODE_EXTRA_CA_CERTS` are deployment overlays, not secrets embedded in images.

Before initial API startup, run `apps/api/scripts/bootstrap.ts /private/bootstrap.json` from the service image with the database and app-origin environment. Input fields are `organizationId`, `projectId`, `projectName`, the actual OIDC `subject`, and display `name`. This explicit offline operation applies migrations and atomically creates the project and initial administrator; it refuses duplicate IDs or memberships. It does not invent identity-provider accounts. API startup validates external OIDC configuration and rejects development fixtures. Start API before supervisors so migrations exist; readiness keeps services out of traffic during dependency failure.

## Backup, monitoring and incident checks

The rendered backup CronJob runs daily at 02:00 UTC with no overlapping executions, a one-hour deadline and no automatic retries. It produces a custom PostgreSQL dump plus checksum/key-fingerprint sidecar, uploads both into a separate versioned bucket using server-side encryption and validates the uploaded dump's size, checksum metadata and version ID. Configure bucket access controls, retention/object lock and off-site replication separately. A failed or overdue backup must alert an operator; a successful upload is not proof of restore. Follow [the restore drill](database-recovery.md), including Vault key recovery, on production-size copies before accepting RPO/RTO targets.

If using Prometheus Operator, apply `deploy/kubernetes/monitoring.yaml` after adjusting the application/monitoring namespaces. It scrapes internal queue/lease metrics and supplies stalled-queue, expired-lease and overdue-backup alerts. Configure Alertmanager destinations outside Git. Also monitor API readiness, Kubernetes restarts and resource pressure, private storage errors, Vault sealed/health state and report failures. Aggregate gauges describe the whole control plane; use `max`, not a sum across API replicas.

For a supervisor outage, confirm its lease expires, the run becomes an infrastructure failure and the Job is deleted by orphan cleanup/deadline. For a Vault outage, confirm new credential operations fail without plaintext fallback and recover after service restoration. For PostgreSQL/Redis/S3 outages, readiness must fail and run evidence must remain inspectable after recovery. Do not claim availability or capacity from these drills alone.
