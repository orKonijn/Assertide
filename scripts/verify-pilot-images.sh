#!/usr/bin/env bash
set -euo pipefail
# Run after verify-images.sh, which installs the checksum-verified scanner.
: "${RUNNER_TEMP:?Set the private runner temporary directory}"
docker build -f deploy/Postgres.Dockerfile --build-arg POSTGRES_IMAGE=postgres@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5 -t assertide-postgres:ci .
docker build -f deploy/Keycloak.Dockerfile --build-arg KEYCLOAK_IMAGE=quay.io/keycloak/keycloak@sha256:3f3c5f8e03c614774b4bd9173b88391fefa4153bfc010d8012d59ad825377332 -t assertide-keycloak:ci .
docker build -f deploy/Vault.Dockerfile --build-arg VAULT_IMAGE=hashicorp/vault@sha256:962a92876e168d68eaaa24b0b8b49bbce1cb63024060a67bba95cd158a366fc2 -t assertide-vault:ci .
docker run --rm assertide-postgres:ci pg_dump --version
docker run --rm assertide-keycloak:ci --version
docker run --rm --entrypoint vault assertide-vault:ci version
for image in postgres keycloak vault; do
  "$RUNNER_TEMP/trivy/trivy" image --scanners vuln --format spdx-json --output ".local/verification/images/$image.spdx.json" "assertide-$image:ci"
  "$RUNNER_TEMP/trivy/trivy" image --scanners vuln --ignore-unfixed --severity HIGH,CRITICAL --exit-code 1 "assertide-$image:ci"
done
