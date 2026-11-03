#!/usr/bin/env bash
set -euo pipefail
umask 077

AI_GATEWAY_API_VERSION="2025-09-01-preview"
DELETED_SERVICE_API_VERSION="2024-05-01"
MODE="${1:-}"
case "$MODE" in
  prepare|cleanup) ;;
  *) echo "Usage: $0 prepare|cleanup" >&2; exit 2 ;;
esac

azd_value() {
  azd env get-value "$1" 2>/dev/null || true
}

environment_name="${AZURE_ENV_NAME:-$(azd_value AZURE_ENV_NAME)}"
subscription_id="${AZURE_SUBSCRIPTION_ID:-$(azd_value AZURE_SUBSCRIPTION_ID)}"
subscription_id="${subscription_id:-$(az account show --query id -o tsv)}"
resource_group="${AI_GATEWAY_RESOURCE_GROUP:-$(azd_value AI_GATEWAY_RESOURCE_GROUP)}"
resource_group="${resource_group:-rg-app-platform-aigateway}"
gateway_name="${AI_GATEWAY_NAME:-$(azd_value AI_GATEWAY_NAME)}"
location="${AI_GATEWAY_LOCATION:-$(azd_value AI_GATEWAY_LOCATION)}"
location="${location:-eastus2}"
state_dir=".azure/${environment_name}"
state_file="${state_dir}/apim-lifecycle.state"

if [ -z "$gateway_name" ]; then
  gateway_name="$(az resource list \
    --subscription "$subscription_id" \
    --resource-group "$resource_group" \
    --resource-type Microsoft.ApiManagement/service \
    --query "[?tags.\"azd-env-name\"=='${environment_name}' && sku.name=='AIGateway'].name | [0]" \
    -o tsv 2>/dev/null || true)"
fi
if [ -z "$gateway_name" ] && [ -f "$state_file" ]; then
  gateway_name="$(sed -n 's/^gateway_name=//p' "$state_file" | tail -n 1)"
fi
if [ -z "$gateway_name" ]; then
  echo "No environment-owned AI Gateway needs lifecycle cleanup."
  exit 0
fi

mkdir -p "$state_dir"
printf 'gateway_name=%s\nresource_group=%s\nlocation=%s\n' \
  "$gateway_name" "$resource_group" "$location" > "$state_file"

resource_id="/subscriptions/${subscription_id}/resourceGroups/${resource_group}/providers/Microsoft.ApiManagement/service/${gateway_name}"
resource_uri="https://management.azure.com${resource_id}?api-version=${AI_GATEWAY_API_VERSION}"
deleted_uri="https://management.azure.com/subscriptions/${subscription_id}/providers/Microsoft.ApiManagement/locations/${location}/deletedservices/${gateway_name}?api-version=${DELETED_SERVICE_API_VERSION}"

state="$(az rest --method get --uri "$resource_uri" --query properties.provisioningState -o tsv 2>/dev/null || true)"
owner="$(az rest --method get --uri "$resource_uri" --query 'tags."azd-env-name"' -o tsv 2>/dev/null || true)"
if [ -n "$state" ] && [ "$owner" != "$environment_name" ]; then
  echo "Refusing to manage ${resource_group}/${gateway_name}; ownership tag mismatch." >&2
  exit 1
fi

if [ "$MODE" = "prepare" ] && [ "$state" = "Succeeded" ]; then
  echo "Preserving healthy environment-owned AI Gateway ${resource_group}/${gateway_name}."
  exit 0
fi
if [ "$MODE" = "prepare" ] && [ -n "$state" ] && [ "$state" != "Failed" ] && [ "$state" != "Deleting" ]; then
  echo "AI Gateway is in nonterminal state ${state}; wait for Azure before retrying." >&2
  exit 1
fi
if [ -n "$state" ] && [ "$state" != "Deleting" ]; then
  echo "Deleting environment-owned AI Gateway ${resource_group}/${gateway_name}."
  az rest --method delete --uri "$resource_uri" --headers 'If-Match=*' -o none
fi

started_at="$(date +%s)"
delay=5
quiet_started=""
while true; do
  if az rest --method get --uri "$resource_uri" -o none 2>/dev/null; then
    quiet_started=""
    echo "Waiting for AI Gateway deletion."
  else
    deleted_service_id="$(az rest --method get --uri "$deleted_uri" --query properties.serviceId -o tsv 2>/dev/null || true)"
    if [ -n "$deleted_service_id" ]; then
      if [ "$(printf '%s' "$deleted_service_id" | tr '[:upper:]' '[:lower:]')" != "$(printf '%s' "$resource_id" | tr '[:upper:]' '[:lower:]')" ]; then
        echo "Refusing to purge mismatched soft-deleted service ${deleted_service_id}." >&2
        exit 1
      fi
      echo "Purging soft-deleted AI Gateway ${gateway_name}."
      az rest --method delete --uri "$deleted_uri" -o none
      quiet_started=""
    elif [ -z "$quiet_started" ]; then
      quiet_started="$(date +%s)"
    fi
  fi

  now="$(date +%s)"
  if [ -n "$quiet_started" ] && [ $((now - quiet_started)) -ge 180 ]; then
    echo "AI Gateway deletion, purge, and managed-identity settle window completed."
    exit 0
  fi
  if [ $((now - started_at)) -ge 900 ]; then
    echo "AI Gateway cleanup did not settle within 900 seconds; rerun provisioning." >&2
    exit 1
  fi
  sleep "$delay"
  if [ "$delay" -lt 30 ]; then
    delay=$((delay * 2))
    [ "$delay" -le 30 ] || delay=30
  fi
done
