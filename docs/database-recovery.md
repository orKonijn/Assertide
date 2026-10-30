# PostgreSQL backup and recovery

Use PostgreSQL client tools matching the server major version. Run these from `apps/api`, with connection strings and `SECRET_ENCRYPTION_KEY` supplied privately through the deployment environment:

```text
npx tsx scripts/database-backup.ts backup /private/backups/assertide.dump
npx tsx scripts/database-backup.ts restore /private/backups/assertide.dump
```

Backup reads `DATABASE_URL`; restore reads `RESTORE_DATABASE_URL`. The destination must be a separately created empty database. The tool refuses to overwrite an existing backup file or restore over existing relations. `pg_restore` runs in one transaction with error-stop enabled. Credentials travel through process environment, not command-line arguments or logs. `PG_TOOL_CONTAINER` is an optional Docker container ID used by the isolated CI drill; normal deployments use installed `pg_dump`/`pg_restore` binaries.

Each custom-format dump has a JSON sidecar with creation time, size, SHA-256 and encryption-key fingerprint. Restore verifies integrity and requires the matching key when the backup records one. Keep the actual encryption key separately in your secret manager; the fingerprint cannot recover it. Store backups in access-controlled encrypted backup storage. The application does not embed the key or make the dump public. Only restore trusted backups.

Back up at least daily to meet the planned 24-hour recovery-point target, monitor backup success/age, and retain copies outside the database host. Object-store versions and source snapshots need their own backup policy. A PostgreSQL dump does not contain S3 object bytes; report recovery depends on retained versions and their manifests. Reconfigure OIDC, storage and worker connections before bringing a restored deployment online, and revoke restored sessions/CI credentials when incident scope requires it.

The CI drill creates two disposable databases, backs up a queued run with its outbox, membership and encrypted credential, restores into the second database, and verifies all four. It also rejects a wrong key, a nonempty destination and a corrupted dump. On [CI run 40980967479](https://github.com/orKonijn/Assertide/actions/runs/40980967479), the 19,831-byte synthetic dump took 148 ms to create and 123 ms to restore. This proves the tested workflow, not production-size recovery time or ongoing backup coverage. Run the same drill against representative deployment data before claiming the four-hour recovery target.
