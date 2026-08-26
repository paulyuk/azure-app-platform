# deal-finder (Foundry Hosted Agent)

`deal-finder` is the Tier 2 hosted agent for Unity Demo #1 (car buying).  
It runs on the Foundry Hosted Agent runtime (`ResponsesHostServer`) and routes:

- **Model calls** through **AI Gateway** (`/default/models/openai/v1/`)
- **Tool calls** through **Foundry Toolbox** (which maps to AI Gateway MCP toolservers)

This follows the platform plan stack in `docs/unity-platform-plan.md` section 5.3.

## What this agent does

The agent orchestrates the car-buying conversation narrative (plan section 3):

1. Find matching cars (`inventory-search`)
2. Build quote inputs (`trade-in-value`, `rate-sheet`)
3. Assemble offer output (`deal-doc`)
4. Return a governed, explainable response stream

Hosted Skills are referenced by contract/name only here; implementation lives under `src/skills/`.

## Files

- `main.py` - agent entrypoint + gateway/toolbox wiring + `MOCK=1` offline mode
- `agent.yaml` - Hosted Agent manifest (`kind: hosted`, responses protocol)
- `azure.yaml` - azd service definition for Foundry-hosted deployment
- `.env.example` - local configuration template
- `requirements.txt` - Python dependencies

## Local run against a real AI Gateway

Provision the standalone East US 2 Gateway/model slice from the repository
root. This requires Azure credentials and model quota:

```bash
cd infra-ai-gateway
azd env new unity-poc-aigateway --no-prompt
azd env set AZURE_SUBSCRIPTION_ID <subscription-id>
azd env set AZURE_LOCATION eastus2
azd provision --no-prompt
cd ../src/agent
```

For an existing environment, use
`azd env select unity-poc-aigateway` instead of `azd env new`. Provisioning
writes the Gateway endpoint, deployment names, and API key to the gitignored
`src/agent/.env` with mode `0600`; it does not print the key.

Then start the local Responses protocol server with `uv` (no manual venv needed):

```bash
uv run --with-requirements requirements.txt python main.py
```

In another terminal:

```bash
curl -sS -X POST http://127.0.0.1:8088/responses \
  -H "Content-Type: application/json" \
  -d '{"input":"Reply in one short sentence: what is one benefit of an electric vehicle?","stream":false}'
```

The generated environment sets `AI_GATEWAY_MODEL_ONLY=1`, so model calls use
the real Gateway while tools remain disabled until the Foundry Toolbox slice is
provisioned. See the repository-root `TESTING.md` for the verified response and
all PR test paths.

## Manual local configuration

To use a separately provisioned Gateway, copy `.env.example` to `.env`, replace
the placeholders, and set `AI_GATEWAY_MODEL_ONLY=1` if Toolbox is unavailable.
By default, `uv run --with-requirements requirements.txt python main.py`
starts the Responses host server on port 8088.

## Offline demo rehearsal (`MOCK=1`)

For plan section 5.4 / Phase 6 dry-runs with no network:

```bash
cd src/agent
MOCK=1 uv run --with-requirements requirements.txt python main.py
```

This prints a deterministic mock payload and skips all gateway/tool calls.

## Running inside the GitHub Copilot CLI terminal

The Copilot CLI sets `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` for its own
telemetry. The `azure-ai-agentserver` observability layer only accepts
`http/protobuf` or `grpc` and raises `ValueError: Unsupported OTLP protocol
'http/json'` at startup if any `OTEL_EXPORTER_OTLP_*` var is set to `http/json`.
Unset those vars before running the agent:

```bash
unset OTEL_EXPORTER_OTLP_ENDPOINT OTEL_EXPORTER_OTLP_PROTOCOL \
  OTEL_EXPORTER_OTLP_TRACES_PROTOCOL OTEL_EXPORTER_OTLP_METRICS_PROTOCOL
```

## Identity and secrets

- Do **not** hardcode keys.
- Use environment variables (or managed identity in hosted runtime) only.
- `main.py` uses `DefaultAzureCredential` for toolbox access in hosted scenarios.
