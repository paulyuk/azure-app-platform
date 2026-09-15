#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.dev-run"
STATE_FILE="$RUN_DIR/processes.posix.tsv"
NEXT_STATE="$STATE_FILE.next.$$"
PS_COMMAND="${UNITY_PS_COMMAND:-ps}"
PGREP_COMMAND="${UNITY_PGREP_COMMAND:-pgrep}"
KILL_COMMAND="${UNITY_KILL_COMMAND:-kill}"
SLEEP_COMMAND="${UNITY_SLEEP_COMMAND:-sleep}"

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

process_started_at() {
  "$PS_COMMAND" -p "$1" -o lstart= 2>/dev/null |
    sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

parent_pid() {
  "$PS_COMMAND" -p "$1" -o ppid= 2>/dev/null | tr -d '[:space:]'
}

is_protected_pid() {
  local candidate="$1" current="$$" parent
  [[ "$candidate" =~ ^[0-9]+$ ]] && ((candidate > 1)) || return 0
  while [[ "$current" =~ ^[0-9]+$ ]] && ((current > 1)); do
    [[ "$candidate" == "$current" ]] && return 0
    parent="$(parent_pid "$current")"
    [[ "$parent" =~ ^[0-9]+$ ]] && [[ "$parent" != "$current" ]] || break
    current="$parent"
  done
  return 1
}

process_matches() {
  local current
  current="$(process_started_at "$1")"
  [[ -n "$current" && "$current" == "$2" ]]
}

kill_tree() {
  local pid="$1" expected_start="$2" child child_start
  process_matches "$pid" "$expected_start" || return 0

  while read -r child; do
    [[ "$child" =~ ^[0-9]+$ ]] || continue
    if is_protected_pid "$child"; then
      echo "Refusing to stop protected descendant PID $child." >&2
      return 1
    fi
    child_start="$(process_started_at "$child")"
    [[ -n "$child_start" ]] || continue
    kill_tree "$child" "$child_start" || return 1
  done < <("$PGREP_COMMAND" -P "$pid" 2>/dev/null || true)

  process_matches "$pid" "$expected_start" || return 0
  "$KILL_COMMAND" "$pid" 2>/dev/null || true
  for _ in {1..20}; do
    process_matches "$pid" "$expected_start" || return 0
    "$SLEEP_COMMAND" 0.1
  done

  process_matches "$pid" "$expected_start" || return 0
  "$KILL_COMMAND" -9 "$pid" 2>/dev/null || true
  for _ in {1..10}; do
    process_matches "$pid" "$expected_start" || return 0
    "$SLEEP_COMMAND" 0.1
  done
  ! process_matches "$pid" "$expected_start"
}

failures=0
stopped_any=0
stopped_pids=" "
trap 'rm -f "$NEXT_STATE"' EXIT
: >"$NEXT_STATE"

if [[ -f "$STATE_FILE" ]]; then
  while IFS=$'\t' read -r name port pid started_at; do
    [[ -n "${name}${port}${pid}${started_at}" ]] || continue
    if [[ ! "$pid" =~ ^[0-9]+$ ]] || ((10#$pid <= 1)); then
      printf '%s\t%s\t%s\t%s\n' "$name" "$port" "$pid" "$started_at" >>"$NEXT_STATE"
      echo "[$name] invalid tracked PID '$pid'. Verify it manually, then repair or remove $STATE_FILE." >&2
      failures=1
      continue
    fi

    current_start="$(process_started_at "$pid")"
    if [[ -z "$current_start" ]]; then
      continue
    fi
    if [[ -z "$started_at" ]]; then
      printf '%s\t%s\t%s\t\n' "$name" "$port" "$pid" >>"$NEXT_STATE"
      echo "[$name] PID $pid has no recorded start identity. Refusing to signal it; verify and stop it manually, then remove $STATE_FILE." >&2
      failures=1
      continue
    fi
    if [[ "$current_start" != "$started_at" ]]; then
      echo "[$name] skipped stale PID $pid because its start identity changed (PID was reused)."
      continue
    fi
    if is_protected_pid "$pid"; then
      printf '%s\t%s\t%s\t%s\n' "$name" "$port" "$pid" "$started_at" >>"$NEXT_STATE"
      echo "[$name] refusing to stop PID $pid because it is this shell or an ancestor. The registry was preserved." >&2
      failures=1
      continue
    fi
    case "$stopped_pids" in
      *" $pid "*)
        continue
        ;;
    esac
    if kill_tree "$pid" "$started_at"; then
      stopped_pids="${stopped_pids}${pid} "
      stopped_any=1
      echo "[$name] stopped tracked PID $pid."
    else
      printf '%s\t%s\t%s\t%s\n' "$name" "$port" "$pid" "$started_at" >>"$NEXT_STATE"
      echo "[$name] failed to stop PID $pid after bounded TERM/KILL polling. The registry was preserved for retry." >&2
      failures=1
    fi
  done <"$STATE_FILE"
fi

if ((failures)); then
  mv "$NEXT_STATE" "$STATE_FILE"
  trap - EXIT
  echo "docs-agent5 stop incomplete; resolve the errors above and rerun dev-stop.sh." >&2
  exit 1
fi

rm -rf "$RUN_DIR"
trap - EXIT
if ((stopped_any)); then
  echo "docs-agent5 stopped."
else
  echo "docs-agent5 was not running."
fi
