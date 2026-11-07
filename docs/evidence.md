# Local execution evidence

The API workspace reads recorded exchanges; inspecting a request does not send it again. Lab authentication requests and credential-bearing headers are omitted. JSON and text evidence pass through fixture-password and JWT redaction before storage. Bodies are capped at 64 KiB per recorded exchange.

Execution results identify each artifact by run, result, attempt, capture time and expiry. Downloads require current project membership and create an audit event. Files are addressed by generated UUIDs rather than user-provided paths. The importer rejects files outside the run directory, unsupported content types and artifacts over 50 MB. Browser evidence is restricted to the trusted local storefront; API traces remain disabled.

Traces and video expire after 14 days; other imported artifacts expire after 30 days. The local worker sweeps expired evidence every minute, deletes each file and records a tombstone. Expired evidence returns HTTP 410. Private S3 storage deletes all object versions and multipart uploads; raw evidence, reports and history have their own retention sweeps. Scheduled database backups use a separate encrypted, versioned bucket. Its retention/object-lock and replication policy must be configured by the deployment owner; see [recovery guidance](database-recovery.md).

Worker logs retain a redacted tail. Events are retained for 24 hours. Reconnecting outside the retained window triggers a snapshot resync. A report rebuild remains separate from execution outcomes.

After worker execution ends, normalized results are saved under the `finalizing` phase before remote attachment uploads start. The detail page shows those results while evidence is saved. The worker retains its lease and capacity reservation until finalization finishes; stale owners cannot publish attachments. Lease recovery preserves already-saved results while marking the interrupted finalization as an infrastructure error.

Attachment imports share a maximum of eight concurrent operations across the whole run, including different cases and retry attempts. This replaces serial per-attachment uploads without changing generated object keys, redaction, integrity checks, expiry, authorization or the explicit unavailable marker for a failed attachment. The recorded end time is captured before attachment transfer. Raw archives and reports retain their existing complete-manifest publication rules. No configuration or database migration is required. Existing completed runs need no replay; an old run already finalizing on a previous worker should be allowed to finish before rollout.

Verified with SQL/HTTP integration tests and the browser journey, including recorded POST/GET/PUT/PATCH/DELETE evidence, a transport timeout, role revocation, artifact deletion and desktop/mobile overflow checks.

![Recorded API request and response in the running application](changelog/assets/unreleased/api-evidence.png)

The exchange list identifies method, path and response status; the evidence pane shows the recorded payload.

![API evidence on a mobile viewport](changelog/assets/unreleased/api-evidence-mobile.png)

The evidence panels stack at 390 px without widening the page.
