#!/usr/bin/env bash
set -euo pipefail
umask 077

unset UV_FROZEN UV_LOCKED UV_OFFLINE UV_NO_SYNC UV_EXTRA_INDEX_URL
export UV_INDEX_URL="${UV_INDEX_URL:-https://packagefeedproxy.microsoft.io/pypi/simple/}"
export UV_DEFAULT_INDEX="${UV_DEFAULT_INDEX:-$UV_INDEX_URL}"
export PIP_INDEX_URL="${PIP_INDEX_URL:-$UV_INDEX_URL}"

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

if [ "${APP_PLATFORM_GATEWAY_SELECTION:-0}" = "1" ]; then
  gateway_model="${AZURE_AI_GATEWAY_MODEL:-}"
  gateway_mini_model="${AZURE_AI_GATEWAY_MINI_MODEL:-}"
else
  gateway_model="${AZURE_AI_GATEWAY_MODEL:-$(azd_value AZURE_AI_GATEWAY_MODEL)}"
  gateway_mini_model="${AZURE_AI_GATEWAY_MINI_MODEL:-$(azd_value AZURE_AI_GATEWAY_MINI_MODEL)}"
fi
if [ -z "$gateway_model" ] || [ -z "$gateway_mini_model" ]; then
  echo "Discovering models on AI Gateway ${gateway_name}..." >&2
  alias_names="$(az aigateway model-alias list \
    --subscription "$subscription_id" \
    -g "$resource_group" \
    --gateway-name "$gateway_name" \
    --query '[].properties.aliasName' -o tsv 2>/dev/null | tr '\t' '\n' || true)"
  model_names="$(az aigateway model list \
    --subscription "$subscription_id" \
    -g "$resource_group" \
    --gateway-name "$gateway_name" \
    --query '[].name' -o tsv 2>/dev/null | tr '\t' '\n' || true)"
  if [ -n "$alias_names" ]; then
    model_names="$(printf '%s\n%s\n' "$alias_names" "$model_names" | awk 'NF && !seen[$0]++')"
  fi
  if [ -z "$model_names" ]; then
    model_names="$(az rest --method get \
      --uri "https://management.azure.com/subscriptions/${subscription_id}/resourceGroups/${resource_group}/providers/Microsoft.ApiManagement/aigateways/${gateway_name}/workspaces/default/models?api-version=${AI_GATEWAY_API_VERSION}" \
      --query 'value[].name' -o tsv 2>/dev/null | tr '\t' '\n' || true)"
  fi
  if [ -z "$model_names" ]; then
    model_names="$(az rest --method get \
      --uri "https://management.azure.com${gateway_resource_id}/workspaces/default/models?api-version=${AI_GATEWAY_API_VERSION}" \
      --query 'value[].name' -o tsv | tr '\t' '\n')" || {
        echo "Unable to discover models on the selected gateway. Check Azure access and retry." >&2
        exit 1
      }
  fi
  if [ -z "$model_names" ]; then
    echo "No models are configured on ${gateway_name}. Add a model in AI Gateway Studio or select another gateway." >&2
    exit 1
  fi
  first_model="$(printf '%s\n' "$model_names" | sed -n '1p')"
  mini_model="$(printf '%s\n' "$model_names" | grep -i 'mini' | sed -n '1p' || true)"
  full_model="$(printf '%s\n' "$model_names" | grep -iv 'mini' | sed -n '1p' || true)"
  gateway_mini_model="${gateway_mini_model:-${mini_model:-$first_model}}"
  gateway_model="${gateway_model:-${full_model:-$first_model}}"
fi
gateway_model="$(require_value AZURE_AI_GATEWAY_MODEL "$gateway_model")"
gateway_mini_model="$(require_value AZURE_AI_GATEWAY_MINI_MODEL "$gateway_mini_model")"

gateway_url="${AZURE_AI_GATEWAY_ENDPOINT:-}"
if [ -z "$gateway_url" ] && [ "${APP_PLATFORM_GATEWAY_SELECTION:-0}" != "1" ]; then
  gateway_url="$(azd_value AZURE_AI_GATEWAY_ENDPOINT)"
fi
if [ -z "$gateway_url" ]; then
  cli_hostname="$(az aigateway show \
    --subscription "$subscription_id" \
    -g "$resource_group" \
    -n "$gateway_name" \
    --query 'properties.gatewayUrl || properties.frontend.defaultHostname || properties.runtimeHostname' \
    -o tsv 2>/dev/null || true)"
  if [ -n "$cli_hostname" ]; then
    case "$cli_hostname" in
      http://*|https://*) gateway_url="$cli_hostname" ;;
      *) gateway_url="https://${cli_hostname}/" ;;
    esac
  fi
fi
if [ -z "$gateway_url" ]; then
  gateway_url="$(az rest --method get --uri "$gateway_uri" --query properties.gatewayUrl -o tsv 2>/dev/null || true)"
fi
if [ -z "$gateway_url" ]; then
  runtime_hostname="$(az rest --method get --uri "$gateway_uri" --query properties.runtimeHostname -o tsv 2>/dev/null || true)"
  [ -n "$runtime_hostname" ] && gateway_url="https://${runtime_hostname}/"
fi
gateway_url="$(require_value AZURE_AI_GATEWAY_ENDPOINT "$gateway_url")"
gateway_api_key="$(az aigateway api-key list-secrets \
  --subscription "$subscription_id" \
  -g "$resource_group" \
  --gateway-name "$gateway_name" \
  -n master \
  --query 'primaryKey || properties.primaryKey || primaryValue || properties.primaryValue' \
  -o tsv 2>/dev/null || true)"
if [ -z "$gateway_api_key" ]; then
  first_key_name="$(az aigateway api-key list \
    --subscription "$subscription_id" \
    -g "$resource_group" \
    --gateway-name "$gateway_name" \
    --query '[0].name' -o tsv 2>/dev/null || true)"
  if [ -n "$first_key_name" ]; then
    gateway_api_key="$(az aigateway api-key list-secrets \
      --subscription "$subscription_id" \
      -g "$resource_group" \
      --gateway-name "$gateway_name" \
      -n "$first_key_name" \
      --query 'primaryKey || properties.primaryKey || primaryValue || properties.primaryValue' \
      -o tsv 2>/dev/null || true)"
  fi
fi
if [ -z "$gateway_api_key" ]; then
  gateway_api_key="$(az rest \
    --method post \
    --uri "https://management.azure.com${gateway_resource_id}/apiKeys/default/listSecrets?api-version=${AI_GATEWAY_API_VERSION}" \
    --body '{}' \
    --query 'primaryKey || properties.primaryKey || primaryValue || properties.primaryValue' \
    -o tsv 2>/dev/null || true)"
fi
if [ -z "$gateway_api_key" ]; then
  gateway_api_key="$(az rest \
    --method post \
    --uri "https://management.azure.com${gateway_resource_id}/apiKeys/default/listValues?api-version=${AI_GATEWAY_API_VERSION}" \
    --body '{}' \
    --query 'primaryValue || properties.primaryValue || primaryKey || properties.primaryKey' \
    -o tsv)"
fi
gateway_api_key="$(require_value AZURE_AI_GATEWAY_API_KEY "$gateway_api_key")"

run_python() {
  if [ -x "${REPO_ROOT}/src/agent/.venv/bin/python" ]; then
    "${REPO_ROOT}/src/agent/.venv/bin/python" "$@"
  else
    uv run --project "${REPO_ROOT}/src/agent" python "$@"
  fi
}

request_body="$(run_python -c \
  'import json,sys; print(json.dumps({"model":sys.argv[1],"input":"Reply with exactly one word: ok","max_output_tokens":128,"stream":False}))' \
  "$gateway_model")"
ready=false
last_error_detail=""
echo "Validating model ${gateway_model} on gateway ${gateway_name}..."
max_attempts=20
connect_timeout=10
max_time=30
if [ "${APP_PLATFORM_GATEWAY_SELECTION:-}" = "1" ]; then
  max_attempts=2
  connect_timeout=5
  max_time=15
fi
for attempt in $(seq 1 "$max_attempts"); do
  response="$(curl --connect-timeout "$connect_timeout" --max-time "$max_time" -sS -w $'\n%{http_code}' \
    -X POST "${gateway_url%/}/default/models/openai/v1/responses" \
    -H "Api-Key: ${gateway_api_key}" \
    -H "Content-Type: application/json" \
    --data-binary "$request_body" || true)"
  status="${response##*$'\n'}"
  response_body="${response%$'\n'*}"
  if [[ "$status" == 2* ]] && printf '%s' "$response_body" | run_python -c '
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
  last_error_detail="$(printf '%s' "$response_body" | run_python -c '
import json, sys
try:
    payload = json.load(sys.stdin)
    err = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(err, dict):
        msg = err.get("message") or err.get("details") or err.get("code") or ""
        print(str(msg).strip()[:240])
except Exception:
    pass
' 2>/dev/null || true)"
  echo "Waiting for AI Gateway model route, attempt=${attempt}, status=${status:-unavailable}${last_error_detail:+ ($last_error_detail)}"
  [ "$attempt" -lt "$max_attempts" ] && sleep 3
done
if [ "$ready" != true ]; then
  if [ "$status" = "502" ] || [ "$status" = "503" ]; then
    echo "AI Gateway '${gateway_name}' returned HTTP ${status} for model '${gateway_model}'${last_error_detail:+: ${last_error_detail}}. The backend model deployment or provider is unreachable or misconfigured; choose another gateway/model or repair the model provider." >&2
  else
    echo "AI Gateway Responses route did not return a readable message for model '${gateway_model}' (HTTP ${status:-unavailable})${last_error_detail:+: ${last_error_detail}}." >&2
  fi
  exit 1
fi

active_gateway_file="${REPO_ROOT}/.azure-app-platform/active-gateway.json"
gateway_lock_dir="${REPO_ROOT}/.azure-app-platform/gateway-config.lock"
gateway_lock_acquired=false
mkdir -p "${REPO_ROOT}/.azure-app-platform"
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
if [ -n "${APP_PLATFORM_GATEWAY_CONFIGURATION_ID:-}" ]; then
  current_configuration_id="$(run_python -c \
    'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8")).get("configurationId", ""))' \
    "$active_gateway_file")"
  if [ "$current_configuration_id" != "$APP_PLATFORM_GATEWAY_CONFIGURATION_ID" ]; then
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

aca_sandbox_group="${ACA_SANDBOX_GROUP:-}"
aca_resource_group="${ACA_RESOURCE_GROUP:-}"
aca_region="${ACA_REGION:-}"
aca_subscription="${ACA_SUBSCRIPTION:-$subscription_id}"
if [ "${ACA_SANDBOX_DISABLE:-0}" != "1" ] && [ -z "$aca_sandbox_group" ] && [ -f "${HOME}/.config/aca/config.json" ]; then
  eval "$(run_python - "${HOME}/.config/aca/config.json" <<'PY'
import json, shlex, sys
try:
    cfg = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    cfg = {}
nested = cfg.get("sandbox") if isinstance(cfg.get("sandbox"), dict) else {}
for env_name, key, nested_key in (
    ("aca_sandbox_group", "sandbox_group", "group"),
    ("aca_resource_group", "resource_group", "resource_group"),
    ("aca_region", "region", "region"),
    ("aca_subscription", "subscription", "subscription"),
):
    val = str(cfg.get(key) or nested.get(nested_key) or "").strip()
    if val:
        print(f"{env_name}={shlex.quote(val)}")
PY
)"
fi

if [ -n "$aca_sandbox_group" ]; then
  resolved_aca_rg="${aca_resource_group:-$resource_group}"
  resolved_aca_region="${aca_region:-eastus2}"
  resolved_aca_sub="${aca_subscription:-$subscription_id}"
  export PATH="$HOME/.local/bin:$HOME/.aca/bin:$PATH"
  if ! command -v aca >/dev/null 2>&1; then
    echo "ACA CLI ('aca') is not installed. Install ACA CLI in Prerequisites or choose Local simulation mode." >&2
    exit 1
  fi
  echo "Validating ACA Sandbox Group '${aca_sandbox_group}' (create and delete permissions)..."
  create_out="$(aca -s "$resolved_aca_sub" -g "$resolved_aca_rg" --region "$resolved_aca_region" \
    sandbox create --group "$aca_sandbox_group" --egress-default Deny -l purpose=canvas-validation 2>&1)" || {
      if printf '%s' "$create_out" | grep -qiE '403|Forbidden|Access denied'; then
        echo "Access denied (HTTP 403) creating a sandbox in '${aca_sandbox_group}' (resource group '${resolved_aca_rg}', subscription '${resolved_aca_sub}'). Assign 'Container Apps SandboxGroup Data Owner' on this sandbox group: aca -s ${resolved_aca_sub} -g ${resolved_aca_rg} sandboxgroup role create --group ${aca_sandbox_group} --role \"Container Apps SandboxGroup Data Owner\" --principal-id <your-entra-object-id>" >&2
      else
        echo "Failed to create a validation sandbox in '${aca_sandbox_group}': ${create_out}" >&2
      fi
      exit 1
    }
  validation_sb_id="$(printf '%s\n' "$create_out" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n 1 || true)"
  if [ -z "$validation_sb_id" ]; then
    echo "ACA Sandbox Group '${aca_sandbox_group}' did not return a valid sandbox ID during validation: ${create_out}" >&2
    exit 1
  fi
  delete_out="$(aca -s "$resolved_aca_sub" -g "$resolved_aca_rg" --region "$resolved_aca_region" \
    sandbox delete --group "$aca_sandbox_group" --id "$validation_sb_id" --yes 2>&1)" || {
      echo "Created validation sandbox '${validation_sb_id}' in '${aca_sandbox_group}', but deleting it failed: ${delete_out}" >&2
      exit 1
    }
  echo "ACA Sandbox Group '${aca_sandbox_group}' verified (create and delete succeeded)."
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
AI_GATEWAY_BASE_URL="${gateway_url%/}/default/models/openai/v1"
AI_GATEWAY_API_KEY="${gateway_api_key}"
AI_GATEWAY_MODEL="${gateway_model}"
MOCK="0"
EOF
if [ -n "$aca_sandbox_group" ]; then
  cat >> "$agent_env" <<EOF
ACA_SANDBOX_GROUP="${aca_sandbox_group}"
ACA_RESOURCE_GROUP="${aca_resource_group:-$resource_group}"
ACA_REGION="${aca_region:-eastus2}"
ACA_SUBSCRIPTION="${aca_subscription:-$subscription_id}"
EOF
fi
chmod 600 "$agent_env"

active_gateway_tmp="${active_gateway_file}.$$"
run_python -c '
import datetime, json, os, sys
source, destination, expected, name, resource_group, subscription_id, endpoint, sandbox_name, sandbox_rg, sandbox_region, sandbox_sub = sys.argv[1:]
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
if sandbox_name:
    active["sandboxGroup"] = {
        "name": sandbox_name,
        "resourceGroup": sandbox_rg or resource_group,
        "location": sandbox_region or "eastus2",
        "subscriptionId": sandbox_sub or subscription_id,
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
' "$active_gateway_file" "$active_gateway_tmp" "${APP_PLATFORM_GATEWAY_CONFIGURATION_ID:-}" \
  "$gateway_name" "$resource_group" "$subscription_id" "${gateway_url%/}/" \
  "${aca_sandbox_group:-}" "${aca_resource_group:-}" "${aca_region:-}" "${aca_subscription:-}"
mv "$active_gateway_tmp" "$active_gateway_file"

echo "AI Gateway is ready. Local agent settings were written to src/agent/.env (key not displayed)."
echo "No TOOLBOX_ENDPOINT set. Run locally to start each Hosted Skill as a separate Functions MCP service; the agent will bind to those local endpoints."
