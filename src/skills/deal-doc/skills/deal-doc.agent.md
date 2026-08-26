<!-- Inferred Hosted Skills metadata file for serverless agents runtime projects. -->
# deal-doc

## Purpose
Build a deterministic summary object for the deal terms selected by the shopper and dealer.

## Inputs
- `vehicle`: year/make/model/price
- `financing`: term + APR + down payment
- `trade_in.value` (optional)
- `fees` + `tax_rate_percent` (optional)

## Output
Structured JSON document with a stable `quote_id`, totals, and estimated monthly payment.

## Tool
- `deal-doc` (`tools/deal_doc.py:deal_doc_tool`)
