#!/usr/bin/env bash
set -euo pipefail
umask 077

AI_GATEWAY_API_VERSION="2025-09-01-preview"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SLICE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SLICE_ROOT}/.." && pwd)"

azd_value() {
  local value
  if value="$(azd env get-value "$1" 2>/dev/null)"; then
    printf '%s' "$value"
  fi
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

if [ "${UNITY_GATEWAY_SELECTION:-0}" = "1" ]; then
  gateway_model="${AZURE_AI_GATEWAY_MODEL:-}"
  gateway_mini_model="${AZURE_AI_GATEWAY_MINI_MODEL:-}"
else
  gateway_model="${AZURE_AI_GATEWAY_MODEL:-$(azd_value AZURE_AI_GATEWAY_MODEL)}"
  gateway_mini_model="${AZURE_AI_GATEWAY_MINI_MODEL:-$(azd_value AZURE_AI_GATEWAY_MINI_MODEL)}"
fi
if [ -z "$gateway_model" ] || [ -z "$gateway_mini_model" ]; then
  model_names="$(az rest --method get \
    --uri "https://management.azure.com${gateway_resource_id}/workspaces/default/modelProviders/foundry/models?api-version=${AI_GATEWAY_API_VERSION}" \
    --query 'value[].name' -o tsv 2>/dev/null | tr '\t' '\n' || true)"
  first_model="$(printf '%s\n' "$model_names" | sed -n '1p')"
  mini_model="$(printf '%s\n' "$model_names" | grep -i 'mini' | sed -n '1p' || true)"
  full_model="$(printf '%s\n' "$model_names" | grep -iv 'mini' | sed -n '1p' || true)"
  gateway_mini_model="${gateway_mini_model:-${mini_model:-$first_model}}"
  gateway_model="${gateway_model:-${full_model:-$first_model}}"
fi
gateway_model="$(require_value AZURE_AI_GATEWAY_MODEL "$gateway_model")"
gateway_mini_model="$(require_value AZURE_AI_GATEWAY_MINI_MODEL "$gateway_mini_model")"

gateway_url="${AZURE_AI_GATEWAY_ENDPOINT:-}"
if [ -z "$gateway_url" ] && [ "${UNITY_GATEWAY_SELECTION:-0}" != "1" ]; then
  gateway_url="$(azd_value AZURE_AI_GATEWAY_ENDPOINT)"
fi
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

request_body="$(uv run --project "${REPO_ROOT}/src/agent" python -c \
  'import json,sys; print(json.dumps({"model":sys.argv[1],"input":"Reply with exactly one word: ok","max_output_tokens":128,"stream":False}))' \
  "$gateway_model")"
ready=false
for attempt in $(seq 1 20); do
  response="$(curl -sS -w $'\n%{http_code}' \
    -X POST "${gateway_url%/}/default/models/openai/v1/responses" \
    -H "Api-Key: ${gateway_api_key}" \
    -H "Content-Type: application/json" \
    --data-binary "$request_body" || true)"
  status="${response##*$'\n'}"
  response_body="${response%$'\n'*}"
  if [[ "$status" == 2* ]] && printf '%s' "$response_body" | uv run --project "${REPO_ROOT}/src/agent" python -c '
import json, sys
payload = json.load(sys.stdin)
readable = any(
    content.get("type") == "output_text" and content.get("text", "").strip()
    for item in payload.get("output", [])
    if item.get("type") == "message"
    for content in item.get("content", [])
)
raise SystemExit(0 if readable else 1)
'; then
    ready=true
    break
  fi
  echo "Waiting for AI Gateway model route, attempt=${attempt}, status=${status:-unavailable}"
  sleep 6
done
if [ "$ready" != true ]; then
  echo "AI Gateway Responses route did not return a readable message (HTTP ${status:-unavailable})." >&2
  exit 1
fi

active_gateway_file="${REPO_ROOT}/.unity-studio/active-gateway.json"
gateway_lock_dir="${REPO_ROOT}/.unity-studio/gateway-config.lock"
gateway_lock_acquired=false
mkdir -p "${REPO_ROOT}/.unity-studio"
release_gateway_lock() {
  if [ "$gateway_lock_acquired" = true ]; then
    rm -f "${gateway_lock_dir}/pid"
    rmdir "$gateway_lock_dir"
  fi
}
for _ in $(seq 1 600); do
  if mkdir "$gateway_lock_dir" 2>/dev/null; then
    gateway_lock_acquired=true
    printf '%s\n' "$$" > "${gateway_lock_dir}/pid"
    break
  fi
  sleep 0.2
done
if [ "$gateway_lock_acquired" != true ]; then
  echo "Timed out waiting to apply AI Gateway settings. If no configuration is running, remove ${gateway_lock_dir} and retry." >&2
  exit 1
fi
trap release_gateway_lock EXIT
if [ -n "${UNITY_GATEWAY_CONFIGURATION_ID:-}" ]; then
  current_configuration_id="$(uv run --project "${REPO_ROOT}/src/agent" python -c \
    'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8")).get("configurationId", ""))' \
    "$active_gateway_file")"
  if [ "$current_configuration_id" != "$UNITY_GATEWAY_CONFIGURATION_ID" ]; then
    echo "Gateway configuration was superseded before settings were applied."
    exit 3
  fi
fi

if [ -n "$(azd_value AZURE_ENV_NAME)" ]; then
  azd env set AZURE_AI_GATEWAY_ENDPOINT "${gateway_url%/}/"
  azd env set AZURE_AI_GATEWAY_MODEL "$gateway_model"
  azd env set AZURE_AI_GATEWAY_MINI_MODEL "$gateway_mini_model"
  azd env set AZURE_AI_GATEWAY_API_KEY "$gateway_api_key" >/dev/null
fi

agent_env="${REPO_ROOT}/src/agent/.env"
cat > "$agent_env" <<EOF
AI_GATEWAY_NAME="${gateway_name}"
AI_GATEWAY_RESOURCE_GROUP="${resource_group}"
AZURE_SUBSCRIPTION_ID="${subscription_id}"
AZURE_AI_GATEWAY_ENDPOINT="${gateway_url%/}/"
AZURE_AI_GATEWAY_API_KEY="${gateway_api_key}"
AZURE_AI_GATEWAY_MODEL="${gateway_model}"
AZURE_AI_GATEWAY_MINI_MODEL="${gateway_mini_model}"
MOCK="0"
EOF
chmod 600 "$agent_env"

active_gateway_tmp="${active_gateway_file}.$$"
uv run --project "${REPO_ROOT}/src/agent" python -c '
import datetime, json, os, sys
source, destination, expected, name, resource_group, subscription_id, endpoint = sys.argv[1:]
if expected:
    with open(source, encoding="utf-8") as handle:
        active = json.load(handle)
    if active.get("configurationId") != expected:
        raise SystemExit("Gateway configuration changed before completion.")
else:
    active = {
        "name": name,
        "resourceGroup": resource_group,
        "location": "",
        "subscriptionId": subscription_id,
        "endpoint": endpoint,
        "selectedAt": datetime.datetime.now(datetime.UTC).isoformat(),
    }
active.update({
    "configurationStatus": "ready",
    "configuredAt": datetime.datetime.now(datetime.UTC).isoformat(),
    "lastExitCode": 0,
    "lastSignal": None,
})
with open(destination, "w", encoding="utf-8") as handle:
    json.dump(active, handle, indent=2)
    handle.write("\n")
os.chmod(destination, 0o600)
' "$active_gateway_file" "$active_gateway_tmp" "${UNITY_GATEWAY_CONFIGURATION_ID:-}" \
  "$gateway_name" "$resource_group" "$subscription_id" "${gateway_url%/}/"
mv "$active_gateway_tmp" "$active_gateway_file"

echo "AI Gateway is ready. Local agent settings were written to src/agent/.env (key not displayed)."
echo "No TOOLBOX_ENDPOINT set. Run locally to start each Hosted Skill as a separate Functions MCP service; the agent will bind to those local endpoints."
