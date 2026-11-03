#!/usr/bin/env bash
set -euo pipefail

# Canonical implementation loads load-ports.sh and honors:
# WEB_PORT AGENT_PORT SKILL_PORT INVENTORY_SEARCH_PORT TRADE_IN_VALUE_PORT
# RATE_SHEET_PORT DEAL_DOC_PORT AZURITE_BLOB_PORT AZURITE_QUEUE_PORT
# AZURITE_TABLE_PORT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IMPLEMENTATION="$REPO_ROOT/canvases/azure-app-platform/templates/shared/dealer/scripts/dev-start.sh"

if [[ ! -f "$IMPLEMENTATION" ]]; then
  echo "Dealer startup implementation not found: $IMPLEMENTATION" >&2
  exit 1
fi

export DEALER_SCRIPT_DIR="$SCRIPT_DIR"
export DEALER_REPO_ROOT="$REPO_ROOT"
exec "$IMPLEMENTATION" "$@"
