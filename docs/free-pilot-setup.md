# Single-node pilot setup

This is the operator procedure for the actual application. The [pilot verification record](pilot-verification.md) describes the current deployment; this procedure alone is not evidence of capacity or recovery acceptance. See [domain acceptance](assertide-domain-deployment.md) and [production operations](production-deployment.md). The pilot adds a single-node renderer; the general multi-node renderer remains unchanged. Do not apply this overlay to an existing multi-node installation or recovered local database.

## Prerequisites and cost boundary

Use an existing Oracle Always Free tenancy and confirm the console labels the chosen VM and disks eligible before creation. Do not upgrade the account or allocate paid load balancers. Verify free storage and transfer allowances across the whole account. Provisioning is blocked if free capacity is unavailable.

Install a reviewed, pinned K3s version on the ARM VM, with network-policy enforcement, kubelet `podPidsLimit=256`, encrypted Kubernetes secrets at rest, swap disabled, and private cluster administration. Only HTTP/HTTPS should be public; restrict SSH to the operator. Persist the K3s state and local-path data on the retained data disk, and verify the disk is mounted before starting K3s. Back up cluster encryption configuration privately. Do not expose port 6443, PostgreSQL, Redis, Vault, or Keycloak administration publicly.

Create a `assertide-retain` StorageClass using the installed local-path provisioner, `volumeBindingMode: WaitForFirstConsumer` and `reclaimPolicy: Retain`. Verify its actual volume paths are on the data disk and fsGroup ownership works for non-root pods. Local-path PVC size declarations are not disk quotas: monitor aggregate usage and stop admission before exhausting space. This setup cannot survive loss of the only node without restore.

Create namespace `assertide` with Pod Security enforcement set to `restricted` before creating its Secrets or certificates. Configure Traefik for HTTP-to-HTTPS redirection. Obtain a trusted certificate for `assertide.com`, `www.assertide.com`, `auth.assertide.com` and `reports.assertide.com` using a free ACME issuer and automated renewal. DNS-01 permits certificate issuance before moving the apex; any DNS API key must be restricted and stored privately. Create the configured `assertide-tls` Secret in namespace `assertide`. Do not send production traffic to a self-signed certificate.

The pilot renderer attaches an HTTPS redirect middleware only to application routes, leaving separate HTTP-01 challenge routes usable. After installing cert-manager and verifying public DNS/ports, copy `deploy/pilot-https.example.yaml` to private configuration, replace the example email and hostnames, and apply it. Its solver policy admits only Traefik traffic to the challenge pod. Wait for the Certificate to become Ready and verify automatic renewal ownership before disabling any manual certificate bootstrap timer. A manually issued initial certificate alone does not establish renewal.

## Images and configuration

The image publication workflow now accepts `architecture=arm64` and uses a native ARM runner. Published tags are `<commit>-arm64` or `<commit>-amd64`; consumers of the old plain commit tag must use the new architecture tag or, preferably, its verified digest. It still scans images and produces provenance. Run the Linux isolation checks on the selected architecture before launch. Check the account's free Actions allowance before dispatching builds.

Enable `pilot_dependencies` in the image publication workflow to build, scan and attest the additional PostgreSQL, Keycloak and Vault images. `scripts/verify-pilot-images.sh` pins the reviewed upstream bases. PostgreSQL removes the unused root-only `gosu` helper and runs as UID 999. Keycloak optimizes PostgreSQL and health support and replaces its vulnerable Guava library with a checksum-verified patch. Vault rebuilds the pinned 2.2.1 release with the patched JOSE dependency. Verify these derived images with real startup and authentication tests before use; a successful scan alone is insufficient. Also verify Redis Debian (UID 999) and ARM support. The renderer validates digest syntax, not provenance, supported architecture, or vulnerabilities.

Copy `deploy/pilot.example.json` into ignored `.local/pilot.json`, replace every image placeholder, and set the actual node hostname and retained storage class. Keep `stage` at `infrastructure`. No cloud resource or DNS record is created by rendering.

## Private credentials and first boot

Create two private, versioned B2 buckets, one for evidence and one for backups. Set free-tier caps and alerts before writing data. Provide four distinct scoped application keys: API/execution/report limited to the evidence operations they need, backup limited to its bucket. Verify version-list/read/delete compatibility and anonymous denial using the real application adapter before accepting B2. Do not assume a cap can be inferred from the renderer or that a bucket name makes storage private.

The B2 dashboard's Read and Write preset includes bucket-management permissions. Use the Native API to restrict service keys to `listBuckets`, `listFiles`, `readFiles` and `writeFiles`, plus `deleteFiles` for evidence retention. The backup uploader also needs `readBuckets` to inspect versioning, but needs neither deletion nor bucket mutation. Scope every key to exactly one bucket and set an expiry; the pilot keys expire after one year and require rotation before expiry. Invalidate any temporary administrative setup key immediately afterward. Anonymous denial may be HTTP 401 (B2) or 403 (MinIO); both are tested as access denial.

Set `BACKUP_WRITE_MODE=unique-versioned` in the private backup Secret for B2, which rejects conditional PUT headers. The uploader still requires versioning, generates a new UUID namespace for every backup, verifies its checksum and size using the returned object version, and records that exact version in its sidecar. Other providers default to conditional writes. No existing backup is rewritten or migrated.

In an access-restricted operator checkout, prepare `.local/pilot-input.json` with this structure (replace placeholders privately):

```json
{
  "appOrigin": "https://assertide.com",
  "authOrigin": "https://auth.assertide.com",
  "ownerName": "Owner display name",
  "ownerEmail": "owner@example.test",
  "storage": {
    "region": "provider-region",
    "endpoint": "https://verified-provider-endpoint.example",
    "bucket": "private-evidence",
    "backupBucket": "private-backups",
    "backupWriteMode": "unique-versioned",
    "credentials": {
      "api": { "accessKeyId": "replace", "secretAccessKey": "replace" },
      "execution": { "accessKeyId": "replace", "secretAccessKey": "replace" },
      "report": { "accessKeyId": "replace", "secretAccessKey": "replace" },
      "backup": { "accessKeyId": "replace", "secretAccessKey": "replace" }
    }
  }
}
```

Run without shell tracing or transcript capture:

```sh
node deploy/pilot-secrets.mjs .local/pilot-input.json
node deploy/pilot.mjs .local/pilot.json > .local/pilot.json.manifest
kubectl apply -f deploy/kubernetes/worker-isolation.yaml
kubectl apply -f .local/pilot-secrets/manifest.json
```

The helper generates independent database passwords, a confidential OIDC client, and an owner with a temporary password requiring change. Its generated bootstrap subject matches that imported user. Generated files stay under `.local/pilot-secrets`; it refuses an existing directory. Files request Unix 0600 permissions; on Windows restrict the folder ACL separately. Never print, commit, attach, or publish these files. Keep encrypted offline recovery copies; do not rerun the helper to rotate a live database. PostgreSQL initialization and Keycloak realm import only apply to empty state.

Before applying the infrastructure manifest, create a private CA and a server certificate with SAN `assertide-vault.assertide.svc.cluster.local`. Store only the public CA in ConfigMap `assertide-vault-ca` as `ca.crt`; store the server certificate/key in Secret `assertide-vault-tls` as `tls.crt`/`tls.key`. Keep the CA signing key offline. Configure certificate expiry monitoring and renewal; never disable TLS verification. Then:

```sh
kubectl apply -f .local/pilot.json.manifest
kubectl -n assertide rollout status statefulset/assertide-postgres
kubectl -n assertide rollout status statefulset/assertide-redis
```

Initialize and unseal Vault using its private TLS endpoint through authenticated cluster access. Save unseal shares and the initial root token in separate encrypted recovery storage, never console logs. Configure an audit device with protected persistent output. Run `scripts/configure-vault.sh` with a short-lived administrative token, private CA trust, the in-cluster Kubernetes API, and the documented workload identity bindings. Revoke the initial root token after configuration and secure recovery access. Vault readiness stays false while sealed; manual unseal is required after restart. Back up Raft state and test key recovery separately from PostgreSQL.

Wait for Keycloak readiness and verify its discovery URL and public TLS. Only `/realms/assertide` and `/resources` are routed publicly; administrative access must use a private authenticated tunnel. Change the bootstrap administrative password and remove the temporary bootstrap administrator after establishing a secured named administrator. SMTP/password recovery is intentionally not configured; maintain private operator recovery access.

Bootstrap the empty application database once after PostgreSQL is ready:

```sh
kubectl -n assertide create secret generic assertide-bootstrap --from-file=bootstrap.json=.local/pilot-secrets/bootstrap.json
node deploy/pilot.mjs .local/pilot.json --bootstrap > .local/bootstrap-job.json
kubectl apply -f .local/bootstrap-job.json
kubectl -n assertide wait --for=condition=complete job/assertide-bootstrap --timeout=300s
kubectl -n assertide delete job assertide-bootstrap
kubectl -n assertide delete secret assertide-bootstrap
```

Do not rerun a failed bootstrap without inspecting its transaction outcome; it deliberately refuses duplicate project/membership IDs and has no automatic retries. Keep its identity input privately for recovery.

Set `stage` to `application`, render again, and apply the result. The API performs the remaining migrations; workers may restart until those finish. Confirm all four Deployments are ready, the backup schedule is enabled, and source revisions are present on durable storage. Apply worker isolation **before** the pilot manifest: reapplying the generic worker quota afterward would lift the pilot's one-job limit.

## Launch and recovery gates

Run the domain guide's complete acceptance checks, including login/password change, controlled worker execution, private reports, anonymous denial, HTTPS renewal, and backup restore. Verify Keycloak's admin paths remain unreachable publicly and external connections to internal service ports fail. Measure memory/disk under a real report and test job, and verify a second concurrent job cannot exceed the pilot quota. No public launch until these pass.

Configure operator alerts for disk/object-storage headroom, backup age, Vault seal/certificate expiry, worker failure and pod restarts. The renderer does not configure a billing cap, an alert delivery service, public certificates, VM allocation, or a storage account. Those remain mandatory provider/operator steps.

Preserve retained volumes, Vault shares, source revisions, database dumps, identity database, image digests, and the private cluster restore configuration. Never delete/recreate claims to fix a startup problem. Restore dependencies and sources before application workers. Use the [database recovery drill](database-recovery.md); do not claim recovery targets until a separate restore succeeds. Roll back DNS using the saved records while preserving MX/SPF, and roll back images only when migrations are compatible.
