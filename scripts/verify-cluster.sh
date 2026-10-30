#!/usr/bin/env bash
set -euo pipefail
# Ephemeral CI only. Never point this script at an existing cluster.
curl -fsSL https://kind.sigs.k8s.io/dl/v0.33.0/kind-linux-amd64 -o "$RUNNER_TEMP/kind"
chmod +x "$RUNNER_TEMP/kind"
cat > "$RUNNER_TEMP/kind.yaml" <<'YAML'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  disableDefaultCNI: true
  podSubnet: 192.168.0.0/16
kubeadmConfigPatches:
  - |-
    kind: KubeletConfiguration
    podPidsLimit: 256
containerdConfigPatches:
  - |-
    [plugins."io.containerd.cri.v1.images".registry]
      config_path = "/etc/containerd/certs.d"
YAML
export KUBECONFIG="$RUNNER_TEMP/assertide-kubeconfig"
"$RUNNER_TEMP/kind" create cluster --name assertide-ci --config "$RUNNER_TEMP/kind.yaml"
trap '"$RUNNER_TEMP/kind" delete cluster --name assertide-ci' EXIT
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.33.0/manifests/calico.yaml
kubectl -n kube-system rollout status daemonset/calico-node --timeout=180s
kubectl wait --for=condition=Ready nodes --all --timeout=180s
docker run -d --name assertide-registry --network kind -p 5001:5000 registry:2
docker exec assertide-ci-control-plane mkdir -p /etc/containerd/certs.d/assertide-registry:5000
printf '[host."http://assertide-registry:5000"]\n  capabilities = ["pull", "resolve"]\n' | docker exec -i assertide-ci-control-plane sh -c 'cat > /etc/containerd/certs.d/assertide-registry:5000/hosts.toml'
docker tag assertide-worker:ci localhost:5001/assertide-worker:ci
docker push localhost:5001/assertide-worker:ci
DIGEST=$(docker inspect --format '{{index .RepoDigests 0}}' localhost:5001/assertide-worker:ci | cut -d@ -f2)
export OCI_WORKER_IMAGE="assertide-registry:5000/assertide-worker@$DIGEST"
kubectl apply -f deploy/kubernetes/worker-isolation.yaml
kubectl create namespace assertide
node --input-type=module -e 'import {deployment} from "./deploy/render.mjs"; const image=process.env.OCI_WORKER_IMAGE; console.log(JSON.stringify(deployment({serviceImage:image,webImage:image,workerImage:image,appOrigin:"https://app.example.test",reportOrigin:"https://reports.example.test",vaultAddress:"https://vault.example.test",vaultRole:"assertide",ingressClass:"nginx",ingressNamespace:"ingress-nginx",tlsSecret:"assertide-tls"})));' > "$RUNNER_TEMP/deployment.json"
kubectl apply --dry-run=server -f "$RUNNER_TEMP/deployment.json"
kubectl -n assertide create serviceaccount assertide-execution
kubectl -n assertide-workers create rolebinding supervisor --role=assertide-execution --serviceaccount=assertide:assertide-execution
kubectl config view --raw --minify -o json > "$RUNNER_TEMP/scoped-kubeconfig"
kubectl -n assertide create token assertide-execution --duration=10m > "$RUNNER_TEMP/supervisor-jwt"
node --input-type=module -e 'import fs from "node:fs"; const p=process.env.RUNNER_TEMP; const config=JSON.parse(fs.readFileSync(p+"/scoped-kubeconfig")); config.users[0].user={token:fs.readFileSync(p+"/supervisor-jwt","utf8").trim()}; fs.writeFileSync(p+"/scoped-kubeconfig",JSON.stringify(config),{mode:0o600});'
if KUBECONFIG="$RUNNER_TEMP/scoped-kubeconfig" kubectl auth can-i get secrets -n assertide; then echo "Supervisor must not read service secrets"; exit 1; fi
export TEST_KUBERNETES=true
(cd apps/api && KUBECONFIG="$RUNNER_TEMP/scoped-kubeconfig" npx tsx --test test/kubernetes-worker.test.ts)

# Real Vault + real Kubernetes TokenReview, isolated from worker namespace.
kubectl create serviceaccount vault
kubectl create serviceaccount assertide-vault
kubectl create clusterrolebinding vault-reviewer --clusterrole=system:auth-delegator --serviceaccount=default:vault
kubectl run vault --image=hashicorp/vault:1.21 --env=VAULT_DEV_ROOT_TOKEN_ID=ci-only-vault-root --env=VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200 --override-type=strategic --overrides='{"spec":{"serviceAccountName":"vault","containers":[{"name":"vault","readinessProbe":{"httpGet":{"path":"/v1/sys/health","port":8200},"periodSeconds":1,"failureThreshold":60}}]}}'
kubectl wait --for=condition=Ready pod/vault --timeout=120s
kubectl exec vault -- sh -ec '
  export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=ci-only-vault-root
  vault status
  vault secrets enable transit
  vault write transit/keys/assertide derived=true
  vault auth enable kubernetes
  vault write auth/kubernetes/config kubernetes_host=https://kubernetes.default.svc kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
  printf '\''path "transit/encrypt/assertide" { capabilities = ["update"] }\npath "transit/decrypt/assertide" { capabilities = ["update"] }'\'' | vault policy write assertide -
  vault write auth/kubernetes/role/assertide bound_service_account_names=assertide-vault bound_service_account_namespaces=default audience=vault policies=assertide ttl=5m
'
kubectl create token assertide-vault --audience=vault --duration=10m > "$RUNNER_TEMP/vault-jwt"
kubectl port-forward pod/vault 18200:8200 > "$RUNNER_TEMP/vault-port-forward.log" 2>&1 &
FORWARD_PID=$!
for attempt in {1..50}; do
  if curl --fail --silent http://127.0.0.1:18200/v1/sys/health >/dev/null; then break; fi
  sleep .2
done
export NODE_ENV=test TEST_VAULT=true VAULT_ADDR=http://127.0.0.1:18200 VAULT_JWT_FILE="$RUNNER_TEMP/vault-jwt" VAULT_ROLE=assertide
(cd apps/api && npx tsx --test test/production-adapters.test.ts)
(cd apps/api && SECRET_BACKEND=vault npx tsx --test test/environments.test.ts)
kill "$FORWARD_PID"

# Exercise the connected application against the Kubernetes adapter as well as OCI.
export WORKER_RUNTIME=kubernetes SEPARATE_WORKERS=true
(cd packages/automation && KUBECONFIG="$RUNNER_TEMP/scoped-kubeconfig" npx playwright test --config platform.config.ts)
