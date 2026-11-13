#!/usr/bin/env bash
load_app_ports() {
  local root="${1:-$(pwd)}"
  local ports_file="$root/.azure-app-platform/ports.json"
  WEB_PORT="${WEB_PORT:-8080}"
  AGENT_PORT="${AGENT_PORT:-8088}"
  if [ -f "$ports_file" ] && command -v node >/dev/null 2>&1; then
    local parsed_web
    parsed_web="$(node -e 'try { const p = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); if (p.webPort) process.stdout.write(String(p.webPort)); } catch {}' "$ports_file")"
    if [ -n "$parsed_web" ]; then
      WEB_PORT="$parsed_web"
    fi
    local parsed_agent
    parsed_agent="$(node -e 'try { const p = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); if (p.agentPort) process.stdout.write(String(p.agentPort)); } catch {}' "$ports_file")"
    if [ -n "$parsed_agent" ]; then
      AGENT_PORT="$parsed_agent"
    fi
  fi
  export WEB_PORT AGENT_PORT
}
