# Inventory data sourcing: what's real vs synthetic, and what's next

The `inventory-search` Hosted Skill (`src/skills/inventory-search/`) originally used
100% hand-authored synthetic vehicle records. This note tracks what was upgraded to
real data, why, and what a future paid upgrade would cost.

## Implemented: EPA specs from fueleconomy.gov (free, no key)

[fueleconomy.gov](https://www.fueleconomy.gov) is the U.S. government's public fuel
economy database (EPA + DOE). It has a REST API that requires **no API key** and
returns real test data as JSON (`Accept: application/json`).

- `scripts/refresh_inventory.py` resolves each inventory vehicle to its
  fueleconomy.gov vehicle ID (year → make → model/trim → numeric ID), fetches its
  detail record, and merges in the **real** `ev_range_miles` and `mpg` fields.
- Every refreshed record carries an `epa_source_id` so the exact source row is
  traceable.
- PHEVs use `rangeA` (electric-only miles) rather than the blended `range` field,
  since fueleconomy.gov reports PHEV `range` as combined gas+electric.
- Re-run any time with: `python3 scripts/refresh_inventory.py` (no dependencies
  beyond the Python standard library).

**Coverage/limits:** fueleconomy.gov has zero pricing, dealer, ZIP, or
availability data — it's spec-only EPA test data. `price`, `odometer_miles`,
`features[]`, and any notion of "dealer" therefore remain **clearly synthetic**
demo data layered on top of the real specs, and are not sourced from any live
feed today.

## Saved for later: real dealer listings via Auto.dev (paid)

[Auto.dev](https://www.auto.dev) has a real vehicle-listings API with live
dealer inventory, pricing, mileage, and ZIP-radius search — the piece
fueleconomy.gov can't provide. Not implemented yet; parking the idea + cost
research here so it isn't lost.

**Pricing (confirmed directly from `auto.dev/pricing`):**

| Tier | Monthly | Included calls | Overage | Rate limit |
|---|---|---|---|---|
| Free | $0 | 1,000 calls/mo | — | 5 req/sec |
| Growth | $299/mo | unlimited volume | $0.0015/call | 10 req/sec |
| Scale | $599/mo | unlimited volume | $0.001/call | 50 req/sec |

For a demo/POC, the **Free tier (1,000 calls/mo, $0)** is almost certainly
sufficient — that's ~33 calls/day, well above expected demo traffic.

**Endpoint shape** (per community docs, *not yet verified live* — no API key
tested — re-confirm against Auto.dev's official docs before implementing):
`GET https://api.auto.dev/listings` with dot-notated query params, e.g.
`vehicle.make`, `vehicle.model`, `retailListing.price=min-max`, `zip`, `distance`.

**If/when we build this:** add it as a second data source alongside
fueleconomy.gov — Auto.dev would supply live `price`/`zip`/`dealer` fields,
fueleconomy.gov would keep supplying EPA `range`/`mpg`, joined by make/model/year.
Requires signing up for a free Auto.dev API key first (self-serve, no cost at
free tier).
