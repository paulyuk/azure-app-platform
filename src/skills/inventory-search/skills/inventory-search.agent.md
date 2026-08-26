<!--
Best-effort inferred Hosted Skills pattern:
- serverless agents runtime projects keep `.agent.md` descriptors in `skills/`
- callable implementations sit in `tools/`
- `mcp.json` maps the tool entrypoint and HTTP surface for MCP clients.
-->
# inventory-search

## Purpose
Return inventory matches for a shopper based on deterministic filters over vehicle
data. `ev_range_miles` and `mpg` are real EPA test data from fueleconomy.gov
(refreshed via `scripts/refresh_inventory.py`); `price`, `odometer_miles`, and
`features` remain synthetic demo data (no free live dealer-listing source yet —
see `docs/data-sourcing.md` at the repo root).

## Inputs
- `min_price`, `max_price`
- `min_ev_range_miles`, `min_mpg`
- `max_odometer_miles`
- `year_min`, `year_max`
- `required_features` (e.g., `["car seat room", "adaptive cruise"]`)
- `sort_by`, `sort_direction`, `limit`

## Output
JSON object with `match_count` and `matches` (vehicle records) plus normalized query echo.

## Tool
- `inventory-search` (`tools/inventory_search.py:inventory_search_tool`)
