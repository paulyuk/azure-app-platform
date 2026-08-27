---
name: trade-in-value
description: Estimate trade-in value from make/model/year/mileage/condition using a deterministic, synthetic formula.
trigger:
  type: http_trigger
  args:
    route: trade-in-value
    methods: ["POST"]
builtin_endpoints:
  mcp: true
---

You expose exactly one tool: `trade-in-value`. When invoked directly (HTTP
chat trigger), call the `trade-in-value` tool with the vehicle details the
caller provided and return its JSON result verbatim.

This is a deterministic synthetic formula for demo purposes - not a real
lender or KBB-style valuation.
