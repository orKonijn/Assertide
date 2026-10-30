# Production adapters

Set `WORKER_RUNTIME=kubernetes` on the API and execution supervisor, and use the same registry digest in `OCI_WORKER_IMAGE`. The supervisor needs `kubectl` and namespace-scoped permissions from `deploy/kubernetes/worker-isolation.yaml`. Apply that file first on a cluster with an enforcing NetworkPolicy CNI. Workers have no network access, host mounts or service-account tokens. The approved Lab/store fixtures run inside each worker. This remains a trusted-code product, not a sandbox for arbitrary customer code.

Jobs have no automatic retries, a 30-minute deadline and a five-minute finished-job TTL. The supervisor transfers approved source and per-run input over authenticated Kubernetes exec streams. Input never enters a Job manifest. The worker mounts source read-only; a separate transfer container imports source and exports artifacts. Transfer rejects symlinks and traversal, limits source to 64 MiB, each artifact to 64 MiB and total artifacts to 512 MiB. Runs exceeding those bounds fail explicitly. Cancel, lease loss and supervisor shutdown delete the Job; terminal orphan cleanup and the cluster deadline cover supervisor crashes.

## Vault

Set `SECRET_BACKEND=vault`, `VAULT_ADDR=https://...`, `VAULT_ROLE=assertide` and mount a short-lived projected service-account JWT at `VAULT_JWT_FILE`. Configure its audience to match the Vault Kubernetes auth role. `VAULT_NAMESPACE`, `VAULT_AUTH_MOUNT`, `VAULT_TRANSIT_MOUNT` and `VAULT_TRANSIT_KEY` support deployments with dedicated mounts. Trust a private CA through Node's `NODE_EXTRA_CA_CERTS`; TLS verification must remain enabled.

An administrator enables Transit and creates the `assertide` key with `derived=true`. Application policy grants only `update` on `transit/encrypt/assertide` and `transit/decrypt/assertide`. Bind the Kubernetes auth role to the exact application service accounts and namespace. Do not grant key creation, rotation, export, deletion or administration to the application. Tokens are cached until shortly before expiry and replaced through workload login; a denied token is discarded, without replaying the failed operation.

Vault owns encryption keys; the database retains immutable ciphertext versions and metadata. Organization, project, credential ID and version form the derivation context. Old AES-GCM rows remain readable with the original `SECRET_ENCRYPTION_KEY`; new rotations use Vault. Keep that legacy key until all retained historical runs and backups no longer reference AES rows. A Vault outage fails credential operations closed and does not fall back to local encryption. Vault's versioned ciphertext supports key rotation without changing run references. Back up Vault storage/key material independently of PostgreSQL; neither backup alone restores credentials.

The API does not return plaintext or ciphertext. Only execution supervisors decrypt credential versions immediately before transferring per-run input. Keep production Vault audit devices enabled and protect their output. Never place JWTs, Vault tokens or credential values in Kubernetes manifests, command-line arguments, logs or Git.

## Verification

`production-adapters.test.ts` tests Job isolation contracts, mutable-image refusal, workload login, token reuse/rejection, context propagation and HTTPS enforcement. `scripts/verify-cluster.sh` creates a disposable kind cluster with Calico, loads a digest-addressed worker via an ephemeral registry, and tests real headed browser/API execution, egress denial and cancellation cleanup. It also exercises real Vault Transit with Kubernetes TokenReview authentication and verifies wrong-context and wrong-role refusal. This script is CI-only and creates its own kubeconfig; it must not target a shared cluster.

Sources: [Kubernetes Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/), [Calico kind installation](https://docs.tigera.io/calico/latest/getting-started/kubernetes/kind), [Vault Transit API](https://developer.hashicorp.com/vault/api-docs/secret/transit), [Vault Kubernetes authentication](https://developer.hashicorp.com/vault/docs/auth/kubernetes).

No product release is assigned or deployed by these changes. Production capacity, recovery and availability acceptance must use the deployment's actual infrastructure and workload.
