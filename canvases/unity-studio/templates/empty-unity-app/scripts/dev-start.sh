#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.dev-run"
WEB_PORT="${WEB_PORT:-3000}"
AGENT_PORT="${AGENT_PORT:-8088}"
SKILL_PORT="${SKILL_PORT:-7071}"
SKIP_SKILL=0
if [[ "${1:-}" == "--skip-skill" ]]; then
  SKIP_SKILL=1
elif [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: ./scripts/dev-start.sh [--skip-skill]"
  exit 0
elif (($#)); then
  echo "Unknown option: $1" >&2
  exit 2
fi
"$ROOT/scripts/dev-stop.sh" >/dev/null 2>&1 || true
mkdir -p "$RUN_DIR"

export UV_INDEX_URL="${UV_INDEX_URL:-https://packagefeedproxy.microsoft.io/pypi/simple/}"
export UV_DEFAULT_INDEX="${UV_DEFAULT_INDEX:-$UV_INDEX_URL}"
export PIP_INDEX_URL="${PIP_INDEX_URL:-$UV_INDEX_URL}"

command -v uv >/dev/null || { echo "uv is required." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required." >&2; exit 1; }

port_listening() {
  (echo >/dev/tcp/127.0.0.1/"$1") >/dev/null 2>&1
}

wait_port() {
  local name="$1" port="$2" pid="$3" deadline=$((SECONDS + 30))
  while ((SECONDS < deadline)); do
    if port_listening "$port"; then
      echo "[$name] READY on port $port"
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[$name] exited before opening port $port" >&2
      sed -n '1,100p' "$RUN_DIR/$name.log" >&2 || true
      "$ROOT/scripts/dev-stop.sh" >/dev/null 2>&1 || true
      exit 1
    fi
    sleep 0.25
  done
  echo "[$name] timed out opening port $port" >&2
  "$ROOT/scripts/dev-stop.sh" >/dev/null 2>&1 || true
  exit 1
}

(
  cd "$ROOT/src/agent"
  exec env AGENT_PORT="$AGENT_PORT" uv run main.py
) >"$RUN_DIR/agent.log" 2>&1 &
agent_pid=$!
printf "agent\t%s\t%s\n" "$AGENT_PORT" "$agent_pid" >"$RUN_DIR/processes.posix.tsv"
(
  cd "$ROOT/src/web"
  exec env WEB_PORT="$WEB_PORT" AGENT_URL="http://127.0.0.1:$AGENT_PORT" npm run dev
) >"$RUN_DIR/web.log" 2>&1 &
web_pid=$!
printf "web\t%s\t%s\n" "$WEB_PORT" "$web_pid" >>"$RUN_DIR/processes.posix.tsv"

wait_port agent "$AGENT_PORT" "$agent_pid"
wait_port web "$WEB_PORT" "$web_pid"

skill_dir="$ROOT/src/skills/__SKILL_NAME__"
if ((SKIP_SKILL)); then
  echo "Hosted Skill skipped."
elif command -v uv >/dev/null && command -v func >/dev/null; then
  (
    cd "$skill_dir"
    exec uv run --with-requirements requirements.txt func start --port "$SKILL_PORT"
  ) >"$RUN_DIR/skill.log" 2>&1 &
  skill_pid=$!
  printf "skill\t%s\t%s\n" "$SKILL_PORT" "$skill_pid" >>"$RUN_DIR/processes.posix.tsv"
  wait_port skill "$SKILL_PORT" "$skill_pid"
else
  echo "Hosted Skill not started: install uv and Azure Functions Core Tools when you are ready to edit it."
fi

echo "__APP_NAME__ started: web http://localhost:$WEB_PORT, agent http://localhost:$AGENT_PORT"
