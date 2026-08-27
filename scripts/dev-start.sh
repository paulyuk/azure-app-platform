#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="$REPO_ROOT/.dev-run"
LOG_DIR="$RUN_DIR/logs"
STATE_FILE="$RUN_DIR/processes.posix.tsv"

SKIP_SKILLS=0
SKIP_AGENT=0
SKIP_WEB=0
KEEP_EXISTING=0

usage() {
  cat <<'EOF'
Usage: ./scripts/dev-start.sh [options]

Starts the local live stack in order:
  Azurite -> 4 Hosted Skills -> deal-finder agent -> web app

Options:
  --skip-skills   Do not start Azurite or the 4 Hosted Skills
  --skip-agent    Do not start the deal-finder agent
  --skip-web      Do not start the Next.js web app
  --keep-existing Keep processes already listening on known ports
  -h, --help      Show this help
EOF
}

while (($#)); do
  case "$1" in
    --skip-skills) SKIP_SKILLS=1 ;;
    --skip-agent) SKIP_AGENT=1 ;;
    --skip-web) SKIP_WEB=1 ;;
    --keep-existing) KEEP_EXISTING=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

mkdir -p "$LOG_DIR"

if ((KEEP_EXISTING == 0)); then
  echo "[setup] stopping leftovers so startup order is deterministic..."
  "$SCRIPT_DIR/dev-stop.sh"
  sleep 2
fi

command -v uv >/dev/null || {
  echo "uv was not found on PATH. Install uv, then rerun this script." >&2
  exit 1
}

# Automate src/README.md "Corporate network / proxy note" exactly.
if [[ -z "${UV_DEFAULT_INDEX:-}" && -z "${UV_INDEX_URL:-}" ]]; then
  index_url="${PIP_INDEX_URL:-}"
  if [[ -z "$index_url" ]] && command -v pip3 >/dev/null; then
    index_url="$(pip3 config get global.index-url 2>/dev/null || true)"
  fi
  if [[ -z "$index_url" ]]; then
    index_url="https://packagefeedproxy.microsoft.io/pypi/simple/"
  fi
  export UV_INDEX_URL="$index_url"
  export UV_DEFAULT_INDEX="$index_url"
  echo "[setup] uv index not set; using README-resolved package index: $index_url"
else
  echo "[setup] using caller-configured uv package index: ${UV_DEFAULT_INDEX:-$UV_INDEX_URL}"
fi

: >"$STATE_FILE"

port_listening() {
  (echo >/dev/tcp/127.0.0.1/"$1") >/dev/null 2>&1
}

tail_logs() {
  local name="$1"
  local path
  for path in "$LOG_DIR/$name.out.log" "$LOG_DIR/$name.err.log"; do
    if [[ -f "$path" ]]; then
      echo "--- tail: $path ---" >&2
      tail -n 40 "$path" >&2
    fi
  done
}

wait_port() {
  local name="$1" port="$2" timeout="${3:-120}"
  local deadline=$((SECONDS + timeout))
  while ((SECONDS < deadline)); do
    if port_listening "$port"; then
      echo "[$name] READY on port $port"
      return 0
    fi
    sleep 0.5
  done
  echo "[$name] FAILED to listen on port $port within ${timeout}s" >&2
  tail_logs "$name"
  return 1
}

start_tracked() {
  local name="$1" port="$2" workdir="$3"
  shift 3

  if port_listening "$port"; then
    echo "[$name] already something listening on port $port - skipping start"
    printf '%s\t%s\t%s\n' "$name" "$port" "" >>"$STATE_FILE"
    return 0
  fi

  local stdout="$LOG_DIR/$name.out.log"
  local stderr="$LOG_DIR/$name.err.log"
  echo "[$name] starting in $workdir -> port $port (log: $stdout)"
  (
    cd "$workdir"
    exec "$@"
  ) >"$stdout" 2>"$stderr" &
  local pid=$!
  printf '%s\t%s\t%s\n' "$name" "$port" "$pid" >>"$STATE_FILE"
}

fail_and_stop() {
  echo "$1" >&2
  "$SCRIPT_DIR/dev-stop.sh"
  exit 1
}

declare -a skill_names=(
  inventory-search
  trade-in-value
  rate-sheet
  deal-doc
)
declare -a skill_ports=(7071 7072 7073 7074)

if ((SKIP_SKILLS == 0)); then
  command -v azurite >/dev/null || {
    echo "Azurite is required. Install it with 'npm install -g azurite', then rerun this script." >&2
    exit 1
  }

  start_tracked azurite 10000 "$REPO_ROOT" \
    azurite --silent --inMemoryPersistence --skipApiVersionCheck --disableTelemetry
  wait_port azurite 10000 30 ||
    fail_and_stop "Azurite failed to start. The Hosted Skills, agent, and web app were not started."

  agent_env="$REPO_ROOT/src/agent/.env"
  gateway_endpoint=""
  gateway_key=""
  if [[ -f "$agent_env" ]]; then
    gateway_endpoint="$(sed -n 's/^[[:space:]]*AZURE_AI_GATEWAY_ENDPOINT[[:space:]]*=[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}[[:space:]]*$/\1/p' "$agent_env" | head -n 1)"
    gateway_endpoint="${gateway_endpoint%/}"
    gateway_key="$(sed -n 's/^[[:space:]]*AZURE_AI_GATEWAY_API_KEY[[:space:]]*=[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}[[:space:]]*$/\1/p' "$agent_env" | head -n 1)"
  fi

  for i in "${!skill_names[@]}"; do
    name="${skill_names[$i]}"
    port="${skill_ports[$i]}"
    skill_dir="$REPO_ROOT/src/skills/$name"
    settings="$skill_dir/local.settings.json"
    example="$skill_dir/local.settings.json.example"

    if [[ ! -f "$settings" ]]; then
      if [[ -z "$gateway_endpoint" || -z "$gateway_key" ]]; then
        fail_and_stop "[$name] no local.settings.json and src/agent/.env is missing gateway settings. Run 'azd provision' in infra-ai-gateway first."
      fi
      echo "[$name] no local.settings.json yet - creating it from src/agent/.env..."
      GATEWAY_ENDPOINT="$gateway_endpoint" GATEWAY_KEY="$gateway_key" \
        uv run --project "$skill_dir" python - "$example" "$settings" <<'PY'
import os
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text()
source = source.replace("<AZURE_AI_GATEWAY_ENDPOINT>", os.environ["GATEWAY_ENDPOINT"])
source = source.replace("<AZURE_AI_GATEWAY_API_KEY>", os.environ["GATEWAY_KEY"])
Path(sys.argv[2]).write_text(source)
PY
    fi

    start_tracked "$name" "$port" "$skill_dir" uv run func start --port "$port"
  done

  skills_ready=1
  for i in "${!skill_names[@]}"; do
    wait_port "${skill_names[$i]}" "${skill_ports[$i]}" || skills_ready=0
  done
  ((skills_ready == 1)) ||
    fail_and_stop "One or more Hosted Skills failed to start. The agent and web app were not started."
fi

if ((SKIP_AGENT == 0)); then
  agent_dir="$REPO_ROOT/src/agent"
  [[ -f "$agent_dir/.env" ]] ||
    fail_and_stop "src/agent/.env is missing. Run 'azd provision' in infra-ai-gateway first."
  start_tracked agent 8088 "$agent_dir" uv run main.py
  wait_port agent 8088 ||
    fail_and_stop "The deal-finder agent failed to start. The web app was not started."
fi

if ((SKIP_WEB == 0)); then
  command -v npm >/dev/null || {
    fail_and_stop "npm was not found on PATH. Install Node.js/npm, then rerun this script."
  }
  start_tracked web 3000 "$REPO_ROOT/src/web" npm run dev
  wait_port web 3000 || fail_and_stop "The web app failed to start."
fi

echo
echo "=== dev-start summary ==="
while IFS=$'\t' read -r name port pid; do
  if [[ -n "$pid" ]]; then
    printf '%-18s port %-6s STARTED pid=%s\n' "$name" "$port" "$pid"
  else
    printf '%-18s port %-6s ALREADY RUNNING\n' "$name" "$port"
  fi
done <"$STATE_FILE"

cat <<'EOF'

Endpoints:
  azurite            http://127.0.0.1:10000 (Blob Storage emulator)
  inventory-search   http://localhost:7071/runtime/webhooks/mcp
  trade-in-value     http://localhost:7072/runtime/webhooks/mcp
  rate-sheet         http://localhost:7073/runtime/webhooks/mcp
  deal-doc           http://localhost:7074/runtime/webhooks/mcp
  agent              http://127.0.0.1:8088/responses
  web                http://localhost:3000
EOF

echo
echo "Logs: $LOG_DIR  (tail with: tail -f <file>)"
echo "State: $STATE_FILE"
echo "Watch the agent log for 'CONNECTED, discovered N tool(s)' or 'FAILED to connect' per skill."
echo "Stop everything this script started with: ./scripts/dev-stop.sh"
