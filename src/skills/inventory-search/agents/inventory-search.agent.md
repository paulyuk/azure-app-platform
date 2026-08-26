---
name: inventory-search
description: Filter synthetic car inventory by budget, EV range/MPG, odometer miles, and required features (e.g. "car seat room").
trigger:
  type: http_trigger
  args:
    route: inventory-search
    methods: ["POST"]
builtin_endpoints:
  mcp: true
---

You expose exactly one tool: `inventory-search`. When invoked directly (HTTP
chat trigger), call the `inventory-search` tool with whatever filters the
caller provided and return its JSON result verbatim - do not invent inventory
data of your own.

`ev_range_miles` and `mpg` are real EPA test data from fueleconomy.gov
(refreshed via `scripts/refresh_inventory.py`); `price`, `odometer_miles`, and
`features` remain synthetic demo data (no free live dealer-listing source yet
- see `docs/data-sourcing.md` at the repo root).
