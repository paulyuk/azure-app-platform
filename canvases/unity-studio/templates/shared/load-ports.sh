load_unity_ports() {
  local file="$1/.unity-studio/ports.env" key value seen="|" used="|"
  [[ -f "$file" ]] || return 0
  while IFS='=' read -r key value || [[ -n "$key" ]]; do
    value="${value%$'\r'}"
    [[ -n "$key" ]] || continue
    case "$key" in
      AGENT_PORT|WEB_PORT|SKILL_PORT) ;;
      *) echo "Invalid port settings key in .unity-studio/ports.env" >&2; return 1 ;;
    esac
    if [[ ! "$value" =~ ^[0-9]{4,5}$ ]] || ((10#$value < 1024 || 10#$value > 65535)); then
      echo "Port settings must be integers from 1024 to 65535." >&2
      return 1
    fi
    value="$((10#$value))"
    if [[ "$seen" == *"|$key|"* || "$used" == *"|$value|"* ]]; then
      echo "Duplicate port settings are not allowed." >&2
      return 1
    fi
    seen="$seen$key|"
    used="$used$value|"
    export "$key=$value"
  done <"$file"
}
