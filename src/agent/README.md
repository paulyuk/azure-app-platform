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

## Local run

```bash
cd src/agent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```

By default, `python main.py` starts the Responses host server.

## Offline demo rehearsal (`MOCK=1`)

For plan section 5.4 / Phase 6 dry-runs with no network:

```bash
cd src/agent
MOCK=1 python main.py
```

This prints a deterministic mock payload and skips all gateway/tool calls.

## Identity and secrets

- Do **not** hardcode keys.
- Use environment variables (or managed identity in hosted runtime) only.
- `main.py` uses `DefaultAzureCredential` for toolbox access in hosted scenarios.
