#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROOT/.dev-pids"

source "$ROOT/scripts/load-ports.sh"
load_app_ports "$ROOT"

kill_tree() {
  local target_pid="$1"
  if [ -z "$target_pid" ]; then
    return 0
  fi
  local children=""
  children="$(pgrep -P "$target_pid" 2>/dev/null || true)"
  for child in $children; do
    kill_tree "$child"
  done
  kill "$target_pid" >/dev/null 2>&1 || true
}

if [ -d "$PID_DIR" ]; then
  for pid_file in "$PID_DIR"/*.pid; do
    [ -e "$pid_file" ] || continue
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$pid" ]; then
      kill_tree "$pid"
    fi
    rm -f "$pid_file"
  done
fi

for port in "$WEB_PORT" "$AGENT_PORT" 7071 7072 7073 7074; do
  [ -n "$port" ] || continue
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
    for pid in $pids; do
      kill "$pid" >/dev/null 2>&1 || true
    done
  fi
done
