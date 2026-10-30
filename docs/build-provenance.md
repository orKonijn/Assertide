# Build provenance and dependency checks

After the verification workflow succeeds, it packages the compiled Angular application, reviewed API/automation/worker source, locked dependency manifests and build metadata into `assertide-build.tgz`. The archive allowlist excludes `.local` credentials, databases, reports and test evidence. `SHA256SUMS` accompanies the artifact. The source revision and immutable CI worker image ID are recorded in `build.json`.

The source archive also includes Angular source/configuration, the root lint configuration and operating documentation. Packaging checks for required build inputs and rejects private runtime paths. The historical design deliverables remain available in the repository; the archive is a review/build artifact, not an installer or a production deployment.

Push workflows use GitHub's `actions/attest@v4` to sign build provenance through the workflow's short-lived OIDC identity. Pull-request workflows verify and package the same inputs but do not request an attestation. The archive is retained as the `assertide-verified-build` Actions artifact for 14 days. Inspect the latest workflow result before relying on an attestation; configuration alone is not evidence of a successful signature.

Download the archive and checksum from the same successful run. Verify the checksum, then use `gh attestation verify assertide-build.tgz --repo orKonijn/Assertide` to verify the repository/workflow identity and inspect its source revision. This does not publish a product release, deploy an app or attest that arbitrary external targets are safe. No release version has been assigned.

The workflow rejects high/critical npm advisories in the application's web, API and automation lockfiles. The separately pinned upstream practice fixture has its own dependencies and license; do not confuse its development dependency audit with the Assertide runtime audit. A deployment must additionally scan the chosen base image and retain an approved image registry digest.

Reference: [GitHub's official attestation action](https://github.com/actions/attest).
