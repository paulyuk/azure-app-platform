# Hosted Skills (`src/skills`)

POC scaffold for Unity Demo #1's **Hosted Skills tier** (plan §5.3 row ④, plus phases 1 and 3). Each folder is a separate Python v2 Azure Functions app shaped for the serverless agents runtime pattern (`mcp.json` + `tools/` + `skills/*.agent.md`).

## Skills

| Skill | Folder | Scope | Real vs canned |
|---|---|---|---|
| `inventory-search` | `inventory-search/` | Filter synthetic car inventory by budget, EV range/MPG, odometer miles, and required features like "car seat room" | **Real POC logic on synthetic data** |
| `trade-in-value` | `trade-in-value/` | Deterministic trade-in estimate from make/model/year/mileage/condition | Synthetic deterministic |
| `rate-sheet` | `rate-sheet/` | APR + term options by credit band (`A-D`) with optional monthly payment estimates | **Canned** lookup |
| `deal-doc` | `deal-doc/` | Build structured deal summary JSON from vehicle, trade-in, tax/fees, and financing terms | **Canned/simple** document build |

## Function app layout per skill

```text
<skill>/
  function_app.py
  host.json
  local.settings.json.example
  requirements.txt
  mcp.json
  tools/
    <tool_logic>.py
  skills/
    <skill>.agent.md
```

`tools/*.py` holds pure business logic functions (unit-test friendly), while `function_app.py` is the thin HTTP binding layer.

## Input/output contracts (high level)

- **inventory-search**
  - Input: `min_price`, `max_price`, `min_ev_range_miles`, `min_mpg`, `max_odometer_miles`, `year_min`, `year_max`, `required_features[]`, `limit`, sort options.
  - Output: `match_count`, `matches[]`, query echo.
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

Per the platform plan, these Functions apps are intended to be exposed as MCP tools through a toolserver chain:

1. Deploy each skill app on **Flex Consumption**.
2. Publish its MCP metadata (`mcp.json`) so the app exposes tool definitions.
3. Register the skill endpoint in **Foundry Toolbox** as a remote MCP toolserver.
4. Attach the toolbox to the hosted agent.
5. Route agent/tool traffic through **AI Gateway** policy cards.

> Note: `.agent.md` + `mcp.json` conventions here are a best-effort scaffold inferred from current serverless agents runtime docs and this repo's architecture plan.

## Local smoke test (per skill)

```bash
cd src/skills/<skill>
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
func start
```

Then POST JSON to `http://localhost:7071/api/<skill-route>`.
