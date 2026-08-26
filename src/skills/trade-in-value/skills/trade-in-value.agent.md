<!-- Inferred Hosted Skills metadata file for serverless agents runtime projects. -->
# trade-in-value

## Purpose
Estimate a shopper's trade-in value using deterministic synthetic rules (no external pricing APIs).

## Inputs
- `make`, `model`, `year`, `mileage`
- `condition` (`excellent|good|fair|rough`)
- `ev_battery_certified` (optional)

## Output
JSON with `estimated_trade_in_value` and transparent assumptions (base value, age, expected mileage).

## Tool
- `trade-in-value` (`tools/trade_in_value.py:trade_in_value_tool`)
