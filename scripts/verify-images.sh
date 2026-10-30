#!/usr/bin/env bash
set -euo pipefail
docker build -f deploy/Dockerfile --target service -t assertide-service:ci .
docker build -f deploy/Dockerfile --target web -t assertide-web:ci .
docker run --rm --read-only --tmpfs /tmp --entrypoint node assertide-service:ci -e 'const assert=require("node:assert/strict"); assert.notEqual(process.getuid(),0); require("node:fs").accessSync("/app/apps/api/scripts/bootstrap.ts");'
docker run --rm --entrypoint kubectl assertide-service:ci version --client
docker run --rm --entrypoint pg_dump assertide-service:ci --version
docker run -d --name assertide-web-smoke --read-only --tmpfs /tmp --add-host assertide-api:127.0.0.1 -p 18080:8080 assertide-web:ci
trap 'docker rm -f assertide-web-smoke assertide-api-smoke assertide-execution-smoke >/dev/null 2>&1 || true' EXIT
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
  # Independent writable filesystems reproduce fresh API/execution pods.
  docker run -d --name assertide-execution-smoke --network host --read-only --tmpfs /tmp --tmpfs /app/.local:uid=10001,gid=10001 --env DATABASE_URL --env NODE_ENV=test --env WORKER_ROLE=execution --env WORKER_RUNTIME=kubernetes --env REDIS_URL=redis://127.0.0.1:6379 --env S3_BUCKET=assertide-test --env S3_ENDPOINT=http://127.0.0.1:9000 --env AWS_REGION=us-east-1 --env AWS_ACCESS_KEY_ID=assertide_test --env AWS_SECRET_ACCESS_KEY=local_ci_object_store_only --env WORKER_HEALTH_PORT=14020 assertide-service:ci /app/apps/api/src/worker-main.ts
  for attempt in {1..100}; do
    if curl --fail --silent http://127.0.0.1:14020/ready >/dev/null; then break; fi
    sleep .2
  done
  curl --fail --silent http://127.0.0.1:14020/ready
  docker exec assertide-execution-smoke node --import /app/apps/api/node_modules/tsx/dist/loader.mjs --input-type=module -e 'const s=await import("/app/apps/api/src/source.ts"); await s.verifySource(s.catalogRevision); console.log("Fresh execution source verified");'
fi
mkdir -p .local/verification/images "$RUNNER_TEMP/trivy"
curl -fsSL https://github.com/aquasecurity/trivy/releases/download/v0.76.1/trivy_0.76.1_Linux-64bit.tar.gz -o "$RUNNER_TEMP/trivy/trivy.tar.gz"
curl -fsSL https://github.com/aquasecurity/trivy/releases/download/v0.76.1/trivy_0.76.1_checksums.txt -o "$RUNNER_TEMP/trivy/checksums.txt"
(cd "$RUNNER_TEMP/trivy" && grep 'trivy_0.76.1_Linux-64bit.tar.gz$' checksums.txt | sed 's/trivy_0.76.1_Linux-64bit.tar.gz/trivy.tar.gz/' | sha256sum --check && tar -xzf trivy.tar.gz trivy)
for image in service web worker; do
  "$RUNNER_TEMP/trivy/trivy" image --scanners vuln --format spdx-json --output ".local/verification/images/$image.spdx.json" "assertide-$image:ci"
  "$RUNNER_TEMP/trivy/trivy" image --scanners vuln --ignore-unfixed --severity HIGH,CRITICAL --exit-code 1 "assertide-$image:ci"
done
