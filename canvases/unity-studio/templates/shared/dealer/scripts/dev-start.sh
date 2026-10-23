#!/usr/bin/env bash
set -euo pipefail

for candidate_bin in \
  "/opt/homebrew/bin" \
  "/usr/local/bin" \
  "$HOME/.local/bin" \
  $(ls -d "$HOME/.nvm/versions/node/"*/bin 2>/dev/null | sort -V | tail -n 1); do
  if [[ -n "$candidate_bin" && -d "$candidate_bin" && ":$PATH:" != *":$candidate_bin:"* ]]; then
    export PATH="$candidate_bin:$PATH"
  fi
done

SCRIPT_DIR="${DEALER_SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
REPO_ROOT="${DEALER_REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
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
  --keep-existing Reuse live processes already tracked for this workspace
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

PORT_LOADER="$SCRIPT_DIR/load-ports.sh"
if [[ ! -f "$PORT_LOADER" ]]; then
  PORT_LOADER="$REPO_ROOT/canvases/unity-studio/templates/shared/load-ports.sh"
fi
if [[ ! -f "$PORT_LOADER" ]]; then
  echo "Port loader not found. Expected scripts/load-ports.sh or the Unity Studio shared loader." >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$PORT_LOADER"
load_unity_ports "$REPO_ROOT"

WEB_PORT="${WEB_PORT:-3000}"
AGENT_PORT="${AGENT_PORT:-8088}"
INVENTORY_SEARCH_PORT="${INVENTORY_SEARCH_PORT:-7071}"
TRADE_IN_VALUE_PORT="${TRADE_IN_VALUE_PORT:-7072}"
RATE_SHEET_PORT="${RATE_SHEET_PORT:-7073}"
DEAL_DOC_PORT="${DEAL_DOC_PORT:-7074}"
AZURITE_BLOB_PORT="${AZURITE_BLOB_PORT:-10000}"
AZURITE_QUEUE_PORT="${AZURITE_QUEUE_PORT:-10001}"
AZURITE_TABLE_PORT="${AZURITE_TABLE_PORT:-10002}"

validate_ports() {
  local name value seen="|"
  for name in \
    WEB_PORT AGENT_PORT INVENTORY_SEARCH_PORT TRADE_IN_VALUE_PORT \
    RATE_SHEET_PORT DEAL_DOC_PORT AZURITE_BLOB_PORT AZURITE_QUEUE_PORT \
    AZURITE_TABLE_PORT; do
    value="${!name}"
    if [[ ! "$value" =~ ^[0-9]{4,5}$ ]] || ((10#$value < 1024 || 10#$value > 65535)); then
      echo "$name must be an integer from 1024 to 65535." >&2
      return 1
    fi
    value="$((10#$value))"
    printf -v "$name" '%s' "$value"
    export "$name"
    if [[ "$seen" == *"|$value|"* ]]; then
      echo "Dealer ports must be unique; port $value was selected more than once." >&2
      return 1
    fi
    seen="$seen$value|"
  done
}
validate_ports

mkdir -p "$LOG_DIR"

if ((KEEP_EXISTING == 0)); then
  echo "[setup] stopping this workspace's tracked processes so startup order is deterministic..."
  "$SCRIPT_DIR/dev-stop.sh"
  sleep 2
  : >"$STATE_FILE"
elif [[ ! -f "$STATE_FILE" ]]; then
  : >"$STATE_FILE"
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
  echo "[setup] uv index not set; using the README-resolved package index."
else
  echo "[setup] using the caller-configured uv package index."
fi

port_listening() {
  (echo >/dev/tcp/127.0.0.1/"$1") >/dev/null 2>&1
}

process_started_at() {
  ps -p "$1" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

tracked_pid() {
  local name="$1" port="$2"
  awk -F '\t' -v target_name="$name" -v target_port="$port" \
    '$1 == target_name && $2 == target_port { value = $3 } END { print value }' "$STATE_FILE"
}

tracked_process_alive() {
  local name="$1" port="$2" pid started current
  pid="$(tracked_pid "$name" "$port")"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null || return 1
  started="$(awk -F '\t' -v target_name="$name" -v target_port="$port" \
    '$1 == target_name && $2 == target_port { value = $4 } END { print value }' "$STATE_FILE")"
  if [[ -n "$started" ]]; then
    current="$(process_started_at "$pid")"
    [[ -n "$current" && "$current" == "$started" ]] || return 1
  fi
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
  local deadline=$((SECONDS + timeout)) pid
  pid="$(awk -F '\t' -v target="$name" '$1 == target { value = $3 } END { print value }' "$STATE_FILE")"
  while ((SECONDS < deadline)); do
    if port_listening "$port"; then
      echo "[$name] READY on port $port"
      return 0
    fi
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      echo "[$name] process exited before opening port $port" >&2
      tail_logs "$name"
      return 1
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
    if tracked_process_alive "$name" "$port"; then
      echo "[$name] already running for this workspace on port $port"
      return 0
    fi
    echo "[$name] cannot start: port $port is owned by an untracked process. Reallocate this app's ports and retry." >&2
    return 1
  fi

  local stdout="$LOG_DIR/$name.out.log"
  local stderr="$LOG_DIR/$name.err.log"
  echo "[$name] starting in $workdir -> port $port (log: $stdout)"
  (
    cd "$workdir"
    exec "$@"
  ) >"$stdout" 2>"$stderr" &
  local pid=$!
  local started_at
  started_at="$(process_started_at "$pid")"
  printf '%s\t%s\t%s\t%s\n' "$name" "$port" "$pid" "$started_at" >>"$STATE_FILE"
}

track_alias() {
  local name="$1" port="$2" source_name="$3" pid started_at
  pid="$(tracked_pid "$source_name" "$AZURITE_BLOB_PORT")"
  started_at="$(awk -F '\t' -v target_name="$source_name" -v target_port="$AZURITE_BLOB_PORT" \
    '$1 == target_name && $2 == target_port { value = $4 } END { print value }' "$STATE_FILE")"
  [[ -n "$pid" ]] || return 1
  if ! awk -F '\t' -v target_name="$name" -v target_port="$port" \
    '$1 == target_name && $2 == target_port { found = 1 } END { exit !found }' "$STATE_FILE"; then
    printf '%s\t%s\t%s\t%s\n' "$name" "$port" "$pid" "$started_at" >>"$STATE_FILE"
  fi
}

fail_and_stop() {
  echo "$1" >&2
  "$SCRIPT_DIR/dev-stop.sh"
  exit 1
}

interrupt_and_stop() {
  echo
  echo "Startup interrupted; stopping the partial local stack..." >&2
  "$SCRIPT_DIR/dev-stop.sh"
  exit 130
}

trap interrupt_and_stop INT TERM

declare -a skill_names=(
  inventory-search
  trade-in-value
  rate-sheet
  deal-doc
)
declare -a skill_ports=(
  "$INVENTORY_SEARCH_PORT"
  "$TRADE_IN_VALUE_PORT"
  "$RATE_SHEET_PORT"
  "$DEAL_DOC_PORT"
)

AZURITE_ACCOUNT_NAME="devstoreaccount1"
AZURITE_ACCOUNT_KEY="Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="
AZURITE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=$AZURITE_ACCOUNT_NAME;AccountKey=$AZURITE_ACCOUNT_KEY;BlobEndpoint=http://127.0.0.1:$AZURITE_BLOB_PORT/$AZURITE_ACCOUNT_NAME;QueueEndpoint=http://127.0.0.1:$AZURITE_QUEUE_PORT/$AZURITE_ACCOUNT_NAME;TableEndpoint=http://127.0.0.1:$AZURITE_TABLE_PORT/$AZURITE_ACCOUNT_NAME;"

if ((SKIP_SKILLS == 0)); then
  command -v azurite >/dev/null || {
    echo "Azurite is required. Install it with 'npm install -g azurite', then rerun this script." >&2
    exit 1
  }

  command -v node >/dev/null || {
    echo "Node.js is required to configure the Hosted Skills and run Azurite." >&2
    exit 1
  }

  for azurite_target in \
    "azurite:$AZURITE_BLOB_PORT" \
    "azurite-queue:$AZURITE_QUEUE_PORT" \
    "azurite-table:$AZURITE_TABLE_PORT"; do
    target_name="${azurite_target%%:*}"
    target_port="${azurite_target##*:}"
    if port_listening "$target_port" && ! tracked_process_alive "$target_name" "$target_port"; then
      fail_and_stop "[$target_name] port $target_port is owned by an untracked process. Reallocate this app's ports and retry."
    fi
  done

  start_tracked azurite "$AZURITE_BLOB_PORT" "$REPO_ROOT" \
    azurite --silent --inMemoryPersistence --skipApiVersionCheck --disableTelemetry \
      --blobPort "$AZURITE_BLOB_PORT" --queuePort "$AZURITE_QUEUE_PORT" --tablePort "$AZURITE_TABLE_PORT" ||
    fail_and_stop "Azurite could not start on the selected ports."
  track_alias azurite-queue "$AZURITE_QUEUE_PORT" azurite
  track_alias azurite-table "$AZURITE_TABLE_PORT" azurite
  wait_port azurite "$AZURITE_BLOB_PORT" 30 &&
    wait_port azurite-queue "$AZURITE_QUEUE_PORT" 30 &&
    wait_port azurite-table "$AZURITE_TABLE_PORT" 30 ||
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
        fail_and_stop "[$name] missing worktree-local gateway configuration. New git worktrees do not inherit gitignored .azure, src/agent/.env, or skill local.settings.json files. Copy them from an already-provisioned sibling worktree, or run 'azd provision' in infra-ai-gateway for this worktree."
      fi
      echo "[$name] no local.settings.json yet - creating it from src/agent/.env..."
    fi

    if ! SETTINGS_PATH="$settings" SETTINGS_EXAMPLE="$example" \
      GATEWAY_ENDPOINT="$gateway_endpoint" GATEWAY_KEY="$gateway_key" \
      AZURITE_CONNECTION_STRING="$AZURITE_CONNECTION_STRING" node <<'NODE'
const fs = require("node:fs");
const path = process.env.SETTINGS_PATH;
let source;
if (fs.existsSync(path)) {
  source = fs.readFileSync(path, "utf8");
} else {
  source = fs.readFileSync(process.env.SETTINGS_EXAMPLE, "utf8")
    .replaceAll("<AZURE_AI_GATEWAY_ENDPOINT>", process.env.GATEWAY_ENDPOINT)
    .replaceAll("<AZURE_AI_GATEWAY_API_KEY>", process.env.GATEWAY_KEY);
}
const settings = JSON.parse(source);
settings.Values ||= {};
settings.Values.AzureWebJobsStorage = process.env.AZURITE_CONNECTION_STRING;
fs.writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
NODE
    then
      fail_and_stop "[$name] could not update local.settings.json for the selected Azurite ports."
    fi

    start_tracked "$name" "$port" "$skill_dir" uv run func start --port "$port" ||
      fail_and_stop "[$name] could not start on port $port."
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
    fail_and_stop "src/agent/.env is missing. New git worktrees do not inherit gitignored Azure state or environment files. Copy .azure and the .env/local.settings.json files from an already-provisioned sibling worktree, or run 'azd provision' in infra-ai-gateway for this worktree."
  start_tracked agent "$AGENT_PORT" "$agent_dir" env \
    -u OTEL_EXPORTER_OTLP_ENDPOINT \
    -u OTEL_EXPORTER_OTLP_PROTOCOL \
    -u OTEL_EXPORTER_OTLP_TRACES_PROTOCOL \
    -u OTEL_EXPORTER_OTLP_METRICS_PROTOCOL \
    uv run main.py ||
    fail_and_stop "The deal-finder agent could not start on port $AGENT_PORT."
  wait_port agent "$AGENT_PORT" ||
    fail_and_stop "The deal-finder agent failed to start. The web app was not started."
fi

if ((SKIP_WEB == 0)); then
  command -v npm >/dev/null || {
    fail_and_stop "npm was not found on PATH. Install Node.js/npm, then rerun this script."
  }
  web_dir="$REPO_ROOT/src/web"
  echo "[web] installing/syncing npm dependencies..."
  (
    cd "$web_dir"
    npm install --no-audit --no-fund
  ) || fail_and_stop "The web app's npm dependencies failed to install. The local stack was stopped."
  start_tracked web "$WEB_PORT" "$web_dir" env \
    AGENT_URL="http://127.0.0.1:$AGENT_PORT" npm run dev -- --port "$WEB_PORT" ||
    fail_and_stop "The web app could not start on port $WEB_PORT."
  wait_port web "$WEB_PORT" || fail_and_stop "The web app failed to start."
fi

echo
echo "=== dev-start summary ==="
while IFS=$'\t' read -r name port pid _started_at; do
  if [[ -n "$pid" ]]; then
    printf '%-18s port %-6s STARTED pid=%s\n' "$name" "$port" "$pid"
  else
    printf '%-18s port %-6s ALREADY RUNNING\n' "$name" "$port"
  fi
done <"$STATE_FILE"

printf '\nEndpoints:\n'
printf '  %-18s http://127.0.0.1:%s (Blob Storage emulator)\n' azurite "$AZURITE_BLOB_PORT"
printf '  %-18s http://127.0.0.1:%s (Queue Storage emulator)\n' azurite-queue "$AZURITE_QUEUE_PORT"
printf '  %-18s http://127.0.0.1:%s (Table Storage emulator)\n' azurite-table "$AZURITE_TABLE_PORT"
printf '  %-18s http://localhost:%s/runtime/webhooks/mcp\n' inventory-search "$INVENTORY_SEARCH_PORT"
printf '  %-18s http://localhost:%s/runtime/webhooks/mcp\n' trade-in-value "$TRADE_IN_VALUE_PORT"
printf '  %-18s http://localhost:%s/runtime/webhooks/mcp\n' rate-sheet "$RATE_SHEET_PORT"
printf '  %-18s http://localhost:%s/runtime/webhooks/mcp\n' deal-doc "$DEAL_DOC_PORT"
printf '  %-18s http://127.0.0.1:%s/responses\n' agent "$AGENT_PORT"
printf '  %-18s http://localhost:%s\n' web "$WEB_PORT"

echo
echo "Logs: $LOG_DIR  (tail with: tail -f <file>)"
echo "State: $STATE_FILE"
echo "Watch the agent log for 'CONNECTED, discovered N tool(s)' or 'FAILED to connect' per skill."
echo "Stop everything this script started with: ./scripts/dev-stop.sh"
