#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.dev-run"

if [[ -f "$RUN_DIR/processes.posix.tsv" ]]; then
  while IFS=$'\t' read -r _name _port pid; do
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done <"$RUN_DIR/processes.posix.tsv"
fi
rm -rf "$RUN_DIR"
