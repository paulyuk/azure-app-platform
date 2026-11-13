#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.dev-run"
PID_DIR="$ROOT/.dev-pids"

kill_tree() {
  local pid="$1" child
  kill -0 "$pid" 2>/dev/null || return 0
  while read -r child; do
    [[ -n "$child" ]] && kill_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid" 2>/dev/null || true
}

if [[ -f "$RUN_DIR/processes.posix.tsv" ]]; then
  while IFS=$'\t' read -r _name _port pid _rest; do
    [[ "$pid" =~ ^[0-9]+$ ]] && kill_tree "$pid"
  done <"$RUN_DIR/processes.posix.tsv"
fi

if [[ -d "$PID_DIR" ]]; then
  for pid_file in "$PID_DIR"/*.pid; do
    [[ -e "$pid_file" ]] || continue
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    [[ "$pid" =~ ^[0-9]+$ ]] && kill_tree "$pid"
  done
fi

rm -rf "$RUN_DIR" "$PID_DIR" "$ROOT/.dev-logs"
