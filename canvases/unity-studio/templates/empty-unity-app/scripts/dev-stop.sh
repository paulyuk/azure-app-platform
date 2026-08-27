#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.dev-run"

kill_tree() {
  local pid="$1" child
  kill -0 "$pid" 2>/dev/null || return 0
  while read -r child; do
    [[ -n "$child" ]] && kill_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid" 2>/dev/null || true
}

for file in "$RUN_DIR"/*.pid; do
  [[ -f "$file" ]] || continue
  pid="$(cat "$file")"
  kill_tree "$pid"
done
rm -rf "$RUN_DIR"
echo "__APP_NAME__ stopped."
