#!/usr/bin/env bash
set -euo pipefail
# Run with an administrator's short-lived Vault token supplied privately.
# This provisions bindings; it does not create or expose production credentials.
: "${VAULT_ADDR:?Set the HTTPS Vault address}"
: "${VAULT_KUBERNETES_HOST:?Set the Kubernetes API HTTPS address}"
: "${VAULT_KUBERNETES_CA_FILE:?Set the Kubernetes CA certificate path}"
NAMESPACE="${ASSERTIDE_NAMESPACE:-assertide}"
[[ "$VAULT_ADDR" == https://* && "$VAULT_KUBERNETES_HOST" == https://* ]]
[[ "$NAMESPACE" =~ ^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$ ]]
if ! vault secrets list -format=json | jq -e 'has("transit/")' >/dev/null; then
  vault secrets enable transit
fi
if ! vault read -format=json transit/keys/assertide > /dev/null 2>&1; then
  vault write transit/keys/assertide derived=true exportable=false allow_plaintext_backup=false
fi
vault read -format=json transit/keys/assertide | jq -e '.data.derived == true and .data.exportable == false' >/dev/null
if ! vault auth list -format=json | jq -e 'has("kubernetes/")' >/dev/null; then
  vault auth enable kubernetes
fi
# For Vault running in-cluster, its own service account performs TokenReview.
# External Vault installations supply a reviewer JWT file and rotate it separately.
REVIEWER=()
if [[ -n "${VAULT_REVIEWER_JWT_FILE:-}" ]]; then REVIEWER+=("token_reviewer_jwt=@$VAULT_REVIEWER_JWT_FILE"); fi
vault write auth/kubernetes/config "kubernetes_host=$VAULT_KUBERNETES_HOST" "kubernetes_ca_cert=@$VAULT_KUBERNETES_CA_FILE" "${REVIEWER[@]}"
vault policy write assertide deploy/vault-policy.hcl
vault write auth/kubernetes/role/assertide bound_service_account_names=assertide-api,assertide-execution "bound_service_account_namespaces=$NAMESPACE" audience=vault policies=assertide ttl=5m max_ttl=10m
