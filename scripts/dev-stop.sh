#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IMPLEMENTATION="$REPO_ROOT/canvases/azure-app-platform/templates/shared/dealer/scripts/dev-stop.sh"

if [[ ! -f "$IMPLEMENTATION" ]]; then
  echo "Dealer shutdown implementation not found: $IMPLEMENTATION" >&2
  exit 1
fi

export DEALER_SCRIPT_DIR="$SCRIPT_DIR"
export DEALER_REPO_ROOT="$REPO_ROOT"
exec "$IMPLEMENTATION" "$@"
