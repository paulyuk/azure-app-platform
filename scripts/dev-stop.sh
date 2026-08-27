#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="$REPO_ROOT/.dev-run/processes.posix.tsv"

declare -a target_names=(
  azurite-blob
  azurite-queue
  azurite-table
  inventory-search
  trade-in-value
  rate-sheet
  deal-doc
  agent
  web
)
declare -a target_ports=(10000 10001 10002 7071 7072 7073 7074 8088 3000)

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
}

echo "=== dev-stop ==="

if [[ -f "$STATE_FILE" ]]; then
  while IFS=$'\t' read -r name port pid; do
    if [[ -n "$pid" ]] && ! pid_stopped "$pid" && kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid"
      remember_pid "$pid"
      stopped_any=1
      printf '%-18s tracked pid %-6s STOPPED\n' "$name" "$pid"
    fi
  done <"$STATE_FILE"
fi

for i in "${!target_names[@]}"; do
  name="${target_names[$i]}"
  port="${target_ports[$i]}"
  pids=""
  if command -v lsof >/dev/null; then
    pids="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v fuser >/dev/null; then
    pids="$(fuser "$port/tcp" 2>/dev/null || true)"
  fi

  if [[ -z "$pids" ]]; then
    printf '%-18s port %-6s nothing listening\n' "$name" "$port"
    continue
  fi

  for pid in $pids; do
    pid_stopped "$pid" && continue
    kill_tree "$pid"
    remember_pid "$pid"
    stopped_any=1
    printf '%-18s port %-6s STOPPED pid=%s\n' "$name" "$port" "$pid"
  done
done

rm -f "$STATE_FILE"
echo
if ((stopped_any)); then
  echo "Done. All tracked processes and known listening ports were cleaned up."
else
  echo "Nothing was listening on any tracked port - already clean."
fi
