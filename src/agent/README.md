# deal-finder (Foundry Hosted Agent)

`deal-finder` is the Tier 2 hosted agent for Unity Demo #1 (car buying).  
It runs on the Foundry Hosted Agent runtime (`ResponsesHostServer`) and routes:

- **Model calls** through **AI Gateway** (`/default/models/openai/v1/`)
- **Tool calls** through **Foundry Toolbox** (which maps to AI Gateway MCP toolservers)

This follows the platform plan stack in `docs/azure-app-platform-plan.md` section 5.3.

## What this agent does

The agent orchestrates the car-buying conversation narrative (plan section 3):

1. Find matching cars (`inventory-search`)
2. Build quote inputs (`trade-in-value`, `rate-sheet`)
3. Assemble offer output (`deal-doc`)
4. Return a governed, explainable response stream

Hosted Skills are referenced by contract/name only here; implementation lives under `src/skills/`.

## Files

- `main.py` - agent entrypoint + gateway/toolbox wiring + `MOCK=1` offline mode
- `local_ports.py` - validated local agent/MCP port overrides used by Studio
- `agent.yaml` - Hosted Agent manifest (`kind: hosted`, responses protocol)
- `azure.yaml` - azd service definition for Foundry-hosted deployment
- `.env.example` - local configuration template
- `requirements.txt` - Python dependencies

## Local run against a real AI Gateway (with real tools)

Provision the standalone East US 2 Gateway/model slice from the repository
root. This requires Azure credentials and model quota:

```bash
cd infra-ai-gateway
azd env new app-platform-aigateway
azd provision
cd ../src/agent
```

`azd` will prompt you to select a subscription and region — choose **East US 2**
(preview region requirement, see `docs/azure-app-platform-plan.md` section 5.1).

For an existing environment, use
`azd env select app-platform-aigateway` instead of `azd env new`. Provisioning
writes the Gateway endpoint, deployment names, and API key to the gitignored
`src/agent/.env` with mode `0600`; it does not print the key.

Then start the local Responses protocol server with `uv` (no manual venv needed):

```bash
uv run main.py
```

In another terminal:

```bash
curl -sS -X POST http://127.0.0.1:8088/responses \
  -H "Content-Type: application/json" \
  -d '{"input":"Find me an EV under $40,000 with at least 250 miles of range","stream":false}' \
  | jq -r '.output[] | select(.type=="message") | .content[0].text'
```

The server uses port `8088` by default and honors `AGENT_PORT`. Model calls
always go to the real AI Gateway. **Tool calls also always work**:
if `TOOLBOX_ENDPOINT` is set (a real Foundry Toolbox has been provisioned and
registered — see `src/skills/README.md`), the agent uses it; otherwise it
connects to the four Hosted Skills over real MCP at `http://localhost:707{1..4}`
(see `src/skills/README.md` "Run the Hosted Skills locally" — start each with
`func start` first). `INVENTORY_SEARCH_PORT`, `TRADE_IN_VALUE_PORT`,
`RATE_SHEET_PORT`, and `DEAL_DOC_PORT` override those defaults. The
repository-level launchers set all five values from
`.azure-app-platform/ports.env`, so no manual wiring is needed. See the
repository-root `TESTING.md` for the verified response and all PR test paths.

## Manual local configuration

To use a separately provisioned Gateway, copy `.env.example` to `.env` and
replace the placeholders. By default, `uv run main.py` starts the Responses
host server on port 8088; `AGENT_PORT` selects another local port without
overriding the hosted runtime's standard `PORT` setting.

## Offline demo rehearsal (`MOCK=1`)

For plan section 5.4 / Phase 6 dry-runs with no network — this is a **one-shot
print, not a server**: it prints a fixed mock payload and exits immediately,
so there's nothing to `curl` afterward.

```bash
cd src/agent
MOCK=1 uv run main.py
```

This prints a deterministic mock payload and skips all gateway/tool calls.

## Running inside the GitHub Copilot CLI terminal

The Copilot CLI sets `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` for its own
telemetry. The `azure-ai-agentserver` observability layer only accepts
`http/protobuf` or `grpc` and raises `ValueError: Unsupported OTLP protocol
'http/json'` at startup if any `OTEL_EXPORTER_OTLP_*` var is set to `http/json`.
Unset those vars before running the agent directly. The repository
`dev-start.sh` and `dev-start.ps1` scripts do this automatically:

```bash
unset OTEL_EXPORTER_OTLP_ENDPOINT OTEL_EXPORTER_OTLP_PROTOCOL \
  OTEL_EXPORTER_OTLP_TRACES_PROTOCOL OTEL_EXPORTER_OTLP_METRICS_PROTOCOL
```

## Identity and secrets

- Do **not** hardcode keys.
- Use environment variables (or managed identity in hosted runtime) only.
- `main.py` uses `DefaultAzureCredential` for toolbox access in hosted scenarios.
