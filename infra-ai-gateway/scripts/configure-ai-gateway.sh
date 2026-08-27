#!/usr/bin/env bash
set -euo pipefail
umask 077

AI_GATEWAY_API_VERSION="2025-09-01-preview"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SLICE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SLICE_ROOT}/.." && pwd)"

azd_value() {
  azd env get-value "$1" 2>/dev/null || true
}

require_value() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "${name} is required after azd provision." >&2
    exit 1
  fi
  printf '%s' "$value"
}

subscription_id="$(require_value AZURE_SUBSCRIPTION_ID "${AZURE_SUBSCRIPTION_ID:-$(azd_value AZURE_SUBSCRIPTION_ID)}")"
resource_group="$(require_value AI_GATEWAY_RESOURCE_GROUP "${AI_GATEWAY_RESOURCE_GROUP:-$(azd_value AI_GATEWAY_RESOURCE_GROUP)}")"
gateway_name="$(require_value AI_GATEWAY_NAME "${AI_GATEWAY_NAME:-$(azd_value AI_GATEWAY_NAME)}")"
gateway_resource_id="/subscriptions/${subscription_id}/resourceGroups/${resource_group}/providers/Microsoft.ApiManagement/service/${gateway_name}"
gateway_uri="https://management.azure.com${gateway_resource_id}?api-version=${AI_GATEWAY_API_VERSION}"

gateway_model="${AZURE_AI_GATEWAY_MODEL:-$(azd_value AZURE_AI_GATEWAY_MODEL)}"
gateway_mini_model="${AZURE_AI_GATEWAY_MINI_MODEL:-$(azd_value AZURE_AI_GATEWAY_MINI_MODEL)}"
if [ -z "$gateway_model" ] || [ -z "$gateway_mini_model" ]; then
  model_names="$(az rest --method get \
    --uri "https://management.azure.com${gateway_resource_id}/workspaces/default/modelProviders/foundry/models?api-version=${AI_GATEWAY_API_VERSION}" \
    --query 'value[].name' -o tsv 2>/dev/null || true)"
  first_model="$(printf '%s\n' "$model_names" | sed -n '1p')"
  second_model="$(printf '%s\n' "$model_names" | sed -n '2p')"
  gateway_mini_model="${gateway_mini_model:-$first_model}"
  gateway_model="${gateway_model:-${second_model:-$first_model}}"
fi
gateway_model="$(require_value AZURE_AI_GATEWAY_MODEL "$gateway_model")"
gateway_mini_model="$(require_value AZURE_AI_GATEWAY_MINI_MODEL "$gateway_mini_model")"

gateway_url="${AZURE_AI_GATEWAY_ENDPOINT:-$(azd_value AZURE_AI_GATEWAY_ENDPOINT)}"
if [ -z "$gateway_url" ]; then
  gateway_url="$(az rest --method get --uri "$gateway_uri" --query properties.gatewayUrl -o tsv 2>/dev/null || true)"
fi
if [ -z "$gateway_url" ]; then
  runtime_hostname="$(az rest --method get --uri "$gateway_uri" --query properties.runtimeHostname -o tsv 2>/dev/null || true)"
  [ -n "$runtime_hostname" ] && gateway_url="https://${runtime_hostname}/"
fi
gateway_url="$(require_value AZURE_AI_GATEWAY_ENDPOINT "$gateway_url")"
gateway_api_key="$(az rest \
  --method post \
  --uri "https://management.azure.com${gateway_resource_id}/apiKeys/default/listSecrets?api-version=${AI_GATEWAY_API_VERSION}" \
  --body '{}' \
  --query 'primaryKey || properties.primaryKey || primaryValue || properties.primaryValue' \
  -o tsv 2>/dev/null || true)"
if [ -z "$gateway_api_key" ]; then
  gateway_api_key="$(az rest \
    --method post \
    --uri "https://management.azure.com${gateway_resource_id}/apiKeys/default/listValues?api-version=${AI_GATEWAY_API_VERSION}" \
    --body '{}' \
    --query 'primaryValue || properties.primaryValue || primaryKey || properties.primaryKey' \
    -o tsv)"
fi
gateway_api_key="$(require_value AZURE_AI_GATEWAY_API_KEY "$gateway_api_key")"

request_body="$(python3 -c 'import json,sys; print(json.dumps({"model":sys.argv[1],"messages":[{"role":"user","content":"Reply with exactly one word: ok"}],"max_completion_tokens":128}))' "$gateway_model")"
ready=false
for attempt in $(seq 1 20); do
  response="$(curl -sS -w $'\n%{http_code}' \
    -X POST "${gateway_url%/}/default/models/openai/v1/chat/completions" \
    -H "Api-Key: ${gateway_api_key}" \
    -H "Content-Type: application/json" \
    --data-binary "$request_body" || true)"
  status="${response##*$'\n'}"
  if [[ "$status" == 2* ]]; then
    ready=true
    break
  fi
  echo "Waiting for AI Gateway model route, attempt=${attempt}, status=${status:-unavailable}"
  sleep 6
done
if [ "$ready" != true ]; then
  echo "AI Gateway model route did not become ready (HTTP ${status:-unavailable})." >&2
  exit 1
fi

azd env set AZURE_AI_GATEWAY_ENDPOINT "${gateway_url%/}/"
azd env set AZURE_AI_GATEWAY_MODEL "$gateway_model"
azd env set AZURE_AI_GATEWAY_MINI_MODEL "$gateway_mini_model"
azd env set AZURE_AI_GATEWAY_API_KEY "$gateway_api_key" >/dev/null

agent_env="${REPO_ROOT}/src/agent/.env"
cat > "$agent_env" <<EOF
AZURE_AI_GATEWAY_ENDPOINT="${gateway_url%/}/"
AZURE_AI_GATEWAY_API_KEY="${gateway_api_key}"
AZURE_AI_GATEWAY_MODEL="${gateway_model}"
AZURE_AI_GATEWAY_MINI_MODEL="${gateway_mini_model}"
MOCK="0"
EOF
chmod 600 "$agent_env"

echo "AI Gateway is ready. Local agent settings were written to src/agent/.env (key not displayed)."
echo "No TOOLBOX_ENDPOINT set, so the agent will run the Hosted Skills in-process from src/skills/."
