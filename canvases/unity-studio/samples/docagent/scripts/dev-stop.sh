#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.dev-run"

for argument in "$@"; do
  case "$argument" in
    --help|-h)
      echo "Usage: ./scripts/dev-stop.sh"
      exit 0
      ;;
    *)
      echo "Unknown option: $argument" >&2
      exit 2
      ;;
  esac
done

kill_tree() {
  local pid="$1" child
  kill -0 "$pid" 2>/dev/null || return 0
  while read -r child; do
    [[ -n "$child" ]] && kill_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid" 2>/dev/null || true
}

if [[ -f "$RUN_DIR/processes.posix.tsv" ]]; then
  while IFS=$'\t' read -r _name _port pid; do
    [[ "$pid" =~ ^[0-9]+$ ]] && kill_tree "$pid"
  done <"$RUN_DIR/processes.posix.tsv"
fi
rm -rf "$RUN_DIR"
echo "docs-agent5 stopped."
