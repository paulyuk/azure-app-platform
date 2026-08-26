---
name: deal-doc
description: Generate a structured, deterministic deal summary document from vehicle, financing, trade-in, and fee inputs.
trigger:
  type: http_trigger
  args:
    route: deal-doc
    methods: ["POST"]
builtin_endpoints:
  mcp: true
---

You expose exactly one tool: `deal-doc`. When invoked directly (HTTP chat
trigger), call the `deal-doc` tool with the vehicle, financing, and optional
trade-in/fee inputs the caller provided and return its JSON result verbatim.

Output is a deterministic, synthetic summary for demo purposes - not a legal
offer or lender-approved contract.
