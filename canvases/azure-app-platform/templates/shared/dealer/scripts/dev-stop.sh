#!/usr/bin/env bash
set -u

SCRIPT_DIR="${DEALER_SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
REPO_ROOT="${DEALER_REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
STATE_FILE="$REPO_ROOT/.dev-run/processes.posix.tsv"

stopped_pids=" "
stopped_any=0

pid_stopped() {
  case "$stopped_pids" in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

remember_pid() {
  stopped_pids="${stopped_pids}$1 "
}

process_started_at() {
  ps -p "$1" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

is_protected_pid() {
  local candidate="$1" current="$$" parent
  [[ "$candidate" =~ ^[0-9]+$ ]] && ((candidate > 1)) || return 0
  while [[ "$current" =~ ^[0-9]+$ ]] && ((current > 1)); do
    [[ "$candidate" == "$current" ]] && return 0
    parent="$(ps -p "$current" -o ppid= 2>/dev/null | tr -d '[:space:]')"
    [[ -n "$parent" && "$parent" != "$current" ]] || break
    current="$parent"
  done
  return 1
}

kill_tree() {
  local pid="$1" child
  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  while read -r child; do
    [[ -n "$child" ]] && kill_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid" 2>/dev/null || true
  for _ in {1..20}; do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.1
  done
  kill -9 "$pid" 2>/dev/null || true
  sleep 0.1
  ! kill -0 "$pid" 2>/dev/null
}

echo "=== dev-stop ==="

if [[ -f "$STATE_FILE" ]]; then
  while IFS=$'\t' read -r name port pid started_at; do
    if [[ -n "$pid" ]] && is_protected_pid "$pid"; then
      printf '%-18s tracked pid %-6s SKIPPED (protected or invalid PID)\n' "$name" "$pid"
      continue
    fi
    if [[ -n "$pid" ]] && ! pid_stopped "$pid" && kill -0 "$pid" 2>/dev/null; then
      if [[ -n "$started_at" && "$(process_started_at "$pid")" != "$started_at" ]]; then
        printf '%-18s tracked pid %-6s SKIPPED (PID was reused)\n' "$name" "$pid"
        continue
      fi
      if ! kill_tree "$pid"; then
        printf '%-18s tracked pid %-6s FAILED to stop\n' "$name" "$pid" >&2
        continue
      fi
      remember_pid "$pid"
      stopped_any=1
      printf '%-18s tracked pid %-6s STOPPED\n' "$name" "$pid"
    fi
  done <"$STATE_FILE"
fi

rm -f "$STATE_FILE"
echo
if ((stopped_any)); then
  echo "Done. This workspace's tracked process trees were stopped."
else
  echo "No live processes owned by this workspace were recorded."
fi
