<!-- Inferred Hosted Skills metadata file for serverless agents runtime projects. -->
# rate-sheet

## Purpose
Return canned finance terms for POC flows where real lender integrations are out of scope.

## Inputs
- `credit_band` (A/B/C/D or `super_prime|near_prime|subprime` aliases)
- `loan_amount` and `down_payment` (optional, for monthly-payment estimates)

## Output
JSON containing deterministic APR options by term and optional monthly payment estimates.

## Tool
- `rate-sheet` (`tools/rate_sheet.py:rate_sheet_tool`)
