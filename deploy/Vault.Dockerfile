ARG VAULT_IMAGE
FROM golang:1.27.3-alpine AS build
RUN apk add --no-cache git build-base
WORKDIR /src
ENV GOWORK=off
RUN git clone --depth 1 --branch v2.2.1 https://github.com/hashicorp/vault.git . \
 && test "$(git rev-parse HEAD)" = "0e7c41b936218bd2401ab0f891c93bec10e2e8e4"
# Patch the JOSE dependency while retaining the reviewed upstream release.
# Preserve explicit release metadata for scanners. The upstream v2 tag does not
# match its v1 module path; VCS inference otherwise incorrectly reports v0.0.0.
RUN go mod edit -require=github.com/go-jose/go-jose/v4@v4.1.6 \
 && CGO_ENABLED=0 go build -buildvcs=false -mod=mod -p=2 -ldflags='-s -w -X github.com/hashicorp/vault/version.Version=2.2.1 -X github.com/hashicorp/vault/version.VersionMetadata=assertide.1 -X github.com/hashicorp/vault/version.GitCommit=0e7c41b936218bd2401ab0f891c93bec10e2e8e4' -o /vault .
FROM ${VAULT_IMAGE}
COPY --from=build /vault /bin/vault
