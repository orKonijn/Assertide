#!/usr/bin/env bash
set -euo pipefail
docker build -f deploy/Dockerfile --target service -t assertide-service:ci .
docker build -f deploy/Dockerfile --target web -t assertide-web:ci .
docker run --rm --read-only --tmpfs /tmp --entrypoint node assertide-service:ci -e 'const assert=require("node:assert/strict"); assert.notEqual(process.getuid(),0); require("node:fs").accessSync("/app/apps/api/scripts/bootstrap.ts");'
docker run --rm --entrypoint kubectl assertide-service:ci version --client
docker run --rm --entrypoint pg_dump assertide-service:ci --version
docker run -d --name assertide-web-smoke --read-only --tmpfs /tmp --add-host assertide-api:127.0.0.1 -p 18080:8080 assertide-web:ci
trap 'docker rm -f assertide-web-smoke assertide-api-smoke >/dev/null 2>&1 || true' EXIT
for attempt in {1..50}; do
  if curl --fail --silent http://127.0.0.1:18080/health >/dev/null; then break; fi
  sleep .2
done
curl --fail --silent http://127.0.0.1:18080/projects | grep -q '<app-root'
if [[ -n "${DATABASE_URL:-}" ]]; then
  docker run -d --name assertide-api-smoke --network host --read-only --tmpfs /tmp --tmpfs /app/.local:uid=10001,gid=10001 --env DATABASE_URL --env NODE_ENV=test --env PORT=14010 --env REPORT_PORT=14012 --env APP_ORIGIN=http://127.0.0.1:18080 --env REPORT_ORIGIN=http://localhost:14012 assertide-service:ci
  for attempt in {1..100}; do
    if curl --fail --silent http://127.0.0.1:14010/ready >/dev/null; then break; fi
    sleep .2
  done
  curl --fail --silent http://127.0.0.1:14010/ready
fi
mkdir -p .local/verification/images "$RUNNER_TEMP/trivy"
curl -fsSL https://github.com/aquasecurity/trivy/releases/download/v0.76.1/trivy_0.76.1_Linux-64bit.tar.gz -o "$RUNNER_TEMP/trivy/trivy.tar.gz"
curl -fsSL https://github.com/aquasecurity/trivy/releases/download/v0.76.1/trivy_0.76.1_checksums.txt -o "$RUNNER_TEMP/trivy/checksums.txt"
(cd "$RUNNER_TEMP/trivy" && grep 'trivy_0.76.1_Linux-64bit.tar.gz$' checksums.txt | sed 's/trivy_0.76.1_Linux-64bit.tar.gz/trivy.tar.gz/' | sha256sum --check && tar -xzf trivy.tar.gz trivy)
for image in service web worker; do
  "$RUNNER_TEMP/trivy/trivy" image --scanners vuln --format spdx-json --output ".local/verification/images/$image.spdx.json" "assertide-$image:ci"
  "$RUNNER_TEMP/trivy/trivy" image --scanners vuln --ignore-unfixed --severity HIGH,CRITICAL --exit-code 1 "assertide-$image:ci"
done
