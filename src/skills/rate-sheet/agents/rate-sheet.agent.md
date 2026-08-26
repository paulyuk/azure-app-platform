---
name: rate-sheet
description: Return canned APR/term financing options by credit band (A-D), with optional monthly payment estimates.
trigger:
  type: http_trigger
  args:
    route: rate-sheet
    methods: ["POST"]
builtin_endpoints:
  mcp: true
---

You expose exactly one tool: `rate-sheet`. When invoked directly (HTTP chat
trigger), call the `rate-sheet` tool with the credit band and optional loan
amount/down payment the caller provided and return its JSON result verbatim.

Rates are a canned lookup table for demo purposes only - not connected to any
real lender.
