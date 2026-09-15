#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.dev-run"
. "$ROOT/scripts/load-ports.sh"
load_unity_ports "$ROOT"
AGENT_PORT="${AGENT_PORT:-8088}"
RUNTIME_ARG=""

usage() {
  echo "Usage: ./scripts/dev-start.sh [--agent-runtime=local|copilot-sdk-sandbox]"
}

for argument in "$@"; do
  case "$argument" in
    --agent-runtime=local)
      RUNTIME_ARG="--agent-runtime=local"
      ;;
    --agent-runtime=copilot-sdk-sandbox)
      RUNTIME_ARG="--agent-runtime=copilot-sdk-sandbox"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $argument" >&2
      usage >&2
      exit 2
      ;;
  esac
done
set --
if [[ -n "$RUNTIME_ARG" ]]; then set -- "$RUNTIME_ARG"; fi

export UV_INDEX_URL="${UV_INDEX_URL:-https://packagefeedproxy.microsoft.io/pypi/simple/}"
export UV_DEFAULT_INDEX="${UV_DEFAULT_INDEX:-$UV_INDEX_URL}"
export PIP_INDEX_URL="${PIP_INDEX_URL:-$UV_INDEX_URL}"

command -v uv >/dev/null || { echo "uv is required." >&2; exit 1; }
command -v curl >/dev/null || { echo "curl is required for HTTP readiness." >&2; exit 1; }
(cd "$ROOT/src/agent" && uv run main.py "$@" --check-runtime)
"$ROOT/scripts/dev-stop.sh" >/dev/null
mkdir -p "$RUN_DIR"

port_listening() {
  (echo >/dev/tcp/127.0.0.1/"$1") >/dev/null 2>&1
}

wait_port() {
  local name="$1" port="$2" pid="$3" deadline=$((SECONDS + 30))
  while ((SECONDS < deadline)); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[$name] exited before opening port $port" >&2
      sed -n '1,120p' "$RUN_DIR/$name.log" >&2 || true
      "$ROOT/scripts/dev-stop.sh" >/dev/null 2>&1 || true
      exit 1
    fi
    if curl --max-time 2 -fsS "http://127.0.0.1:$port/health" 2>/dev/null | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
      echo "[$name] HEALTHY on port $port"
      return 0
    fi
    sleep 0.25
  done
  echo "[$name] timed out opening port $port" >&2
  sed -n '1,120p' "$RUN_DIR/$name.log" >&2 || true
  "$ROOT/scripts/dev-stop.sh" >/dev/null 2>&1 || true
  exit 1
}

if port_listening "$AGENT_PORT"; then
  echo "Port $AGENT_PORT is in use by another process. Stop that app before starting this one." >&2
  exit 1
fi
(
  cd "$ROOT/src/agent"
  exec env AGENT_PORT="$AGENT_PORT" uv run main.py "$@"
) >"$RUN_DIR/agent.log" 2>&1 &
agent_pid=$!
printf "agent\t%s\t%s\n" "$AGENT_PORT" "$agent_pid" >"$RUN_DIR/processes.posix.tsv"

wait_port agent "$AGENT_PORT" "$agent_pid"

echo "Inspect /health for the selected runtime. Local execution is not ACA isolation."
echo "__APP_NAME__ started: agent http://localhost:$AGENT_PORT"
