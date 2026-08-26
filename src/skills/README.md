# Hosted Skills (`src/skills`)

POC scaffold for Unity Demo #1's **Hosted Skills tier** (plan §5.3 row ④, plus phases 1 and 3). Each folder is a separate Python Azure Functions app built on the real [`azurefunctions-agents-runtime`](https://azure.github.io/azure-functions-agents-runtime/) (serverless agents runtime) package — a markdown-first programming model for building agents/tools on Azure Functions, powered by Microsoft Agent Framework.

## Skills

| Skill | Folder | Scope | Real vs canned |
|---|---|---|---|
| `inventory-search` | `inventory-search/` | Filter car inventory by budget, EV range/MPG, odometer miles, and required features like "car seat room" | **Real EPA specs (fueleconomy.gov) + synthetic price/dealer/features** — see below |
| `trade-in-value` | `trade-in-value/` | Deterministic trade-in estimate from make/model/year/mileage/condition | Synthetic deterministic |
| `rate-sheet` | `rate-sheet/` | APR + term options by credit band (`A-D`) with optional monthly payment estimates | **Canned** lookup |
| `deal-doc` | `deal-doc/` | Build structured deal summary JSON from vehicle, trade-in, tax/fees, and financing terms | **Canned/simple** document build |

## Function app layout per skill

```text
<skill>/
  function_app.py           # app = create_function_app() - that's it
  agents.config.yaml         # global runtime defaults (model, timeout)
  agents/
    <skill>.agent.md         # front matter (trigger, builtin_endpoints.mcp) + instructions
  tools/
    <tool_logic>.py          # pure logic + one @tool-decorated wrapper (auto-discovered)
  host.json
  local.settings.json.example
  requirements.txt            # azurefunctions-agents-runtime
```

`tools/*.py` holds the pure business logic functions (unit-test friendly) plus one `@tool`-decorated function per skill; the runtime auto-discovers every `@tool` in `tools/` and wires it into whichever agent(s) declare it. `function_app.py` is just `create_function_app()` — the runtime does the rest: it reads `agents/<skill>.agent.md`, registers the declared `http_trigger`, and (because `builtin_endpoints.mcp: true`) also exposes the skill as a real MCP tool server at `/runtime/webhooks/mcp`.

## Input/output contracts (high level)

- **inventory-search**
  - Input: `min_price`, `max_price`, `min_ev_range_miles`, `min_mpg`, `max_odometer_miles`, `year_min`, `year_max`, `required_features[]`, `limit`, sort options.
  - Output: `match_count`, `matches[]`, query echo.
  - **Data grounding**: `ev_range_miles` and `mpg` are real EPA test data pulled live from [fueleconomy.gov](https://www.fueleconomy.gov)'s free, no-key REST API (`scripts/refresh_inventory.py`, run manually to refresh). Each record's `epa_source_id` is the fueleconomy.gov vehicle ID it was sourced from. `price`, `odometer_miles`, `features`, and dealer/ZIP data remain synthetic demo data — fueleconomy.gov has no pricing or dealer inventory. See `docs/data-sourcing.md` at the repo root for the researched path to real dealer listings (Auto.dev) and its cost, saved for a future iteration.
- **trade-in-value**
  - Input: `make`, `model`, `year`, `mileage`, `condition`, optional `ev_battery_certified`.
  - Output: `estimated_trade_in_value` + assumptions.
- **rate-sheet**
  - Input: `credit_band`, optional `loan_amount`, `down_payment`.
  - Output: `options[]` (`term_months`, `apr_percent`, optional monthly payment).
- **deal-doc**
  - Input: `vehicle`, `financing`, optional `trade_in`, `fees`, `tax_rate_percent`.
  - Output: structured summary (`quote_id`, pricing breakdown, estimated monthly payment).

## Hosted registration pattern (AI Gateway + Foundry Toolbox)

Per the platform plan, these Functions apps are exposed as MCP tools through a toolserver chain:

1. Deploy each skill app on **Flex Consumption**.
2. Its `builtin_endpoints.mcp: true` front matter makes the app self-publish an MCP tool server (no separate `mcp.json` needed for what it *exposes* — `mcp.json` is only for MCP servers the skill *itself* would consume, which none of these do today).
3. Register the skill endpoint in **Foundry Toolbox** as a remote MCP toolserver.
4. Attach the toolbox to the hosted agent.
5. Route agent/tool traffic through **AI Gateway** policy cards.

## Run the Hosted Skills locally

Each skill runs as its own `func start` process on its own port (`inventory-search` → `7071`, `trade-in-value` → `7072`, `rate-sheet` → `7073`, `deal-doc` → `7074` — matches `LOCAL_SKILL_PORTS` in `src/agent/main.py`). One-time per skill:

```bash
cd src/skills/<skill>
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp local.settings.json.example local.settings.json
func start --port 7071   # 7072 / 7073 / 7074 for the other three skills
```

Each Hosted Skill is itself a tiny chat agent: it makes its own model call (via
`azurefunctions-agents-runtime`'s `ClientManager`) to decide how to invoke its
`@tool`-decorated function. That call needs its own model credentials,
separate from the outer deal-finder agent's. `local.settings.json.example`
defaults to the **`openai` provider pointed at the same AI Gateway** the agent
itself uses (`src/agent/.env`'s `AZURE_AI_GATEWAY_ENDPOINT` /
`AZURE_AI_GATEWAY_API_KEY`) — copy those two values in and no `az login` or
Foundry project is needed:

```jsonc
"AZURE_FUNCTIONS_AGENTS_PROVIDER": "openai",
"OPENAI_BASE_URL": "<AZURE_AI_GATEWAY_ENDPOINT>/default/models/openai/v1/",
"OPENAI_API_KEY": "workload-identity-auth",       // placeholder; auth is via the header below
"OPENAI_CUSTOM_HEADERS": "Api-Key: <AZURE_AI_GATEWAY_API_KEY>",
"AZURE_FUNCTIONS_AGENTS_MODEL": "gpt-mini-latest"  // provider-agnostic model override
```

**Alternative:** point a skill directly at a real Foundry *project* (one with
an actual model deployment) instead of the AI Gateway. Replace the four keys
above with:

```jsonc
"AZURE_FUNCTIONS_AGENTS_PROVIDER": "foundry",
"FOUNDRY_PROJECT_ENDPOINT": "https://<project-name>.<region>.services.ai.azure.com/api/projects/<project-name>",
"FOUNDRY_MODEL": "gpt-mini-latest"
```

This needs Entra credentials (`az login` first if using
`DefaultAzureCredential`) and a project that actually has `gpt-mini-latest` (or
your chosen model) deployed — an endpoint with zero deployments fails with an
opaque `DeploymentNotFound: 404` from inside the skill's own model call, which
is easy to mistake for a broken tool.

> **Note:** `agents.config.yaml`'s `model:` key is intentionally left unset in
> each skill so the runtime auto-resolves the right env var for whichever
> provider is active (see table above). Do not hardcode a `$FOUNDRY_MODEL`-style
> placeholder there — it only works for `provider=foundry` and silently breaks
> every other provider.

`func start` logs both surfaces once the app is up:

```text
Functions:
        inventory_search: [POST] http://localhost:7071/api/inventory-search
        agent_inventory_search_builtin_mcp: mcpToolTrigger
```

Smoke-test the MCP surface directly (the same one `src/agent/main.py` connects to):

```bash
curl -sS -X POST http://localhost:7071/runtime/webhooks/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Start all 4 skills (4 terminals or background processes) before starting `src/agent` — see `src/agent/README.md`.
