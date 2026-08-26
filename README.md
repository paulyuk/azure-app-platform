# Unity: The Self-Aware App Platform

![Agentic Cloud Application: reference architecture for an agent application over hosted skills, connectors, and human approval](docs/images/agentic-architecture.svg)

Unity brings together Azure's modern serverless and AI-native building blocks into one coherent, end-to-end application platform: a fast web front end, a reasoning agent, governed model access, callable skills, isolated compute for sensitive work, durable workflows, and integration into Microsoft 365. It's opinionated about how these pieces fit together so a team can ship a real, production-shaped app quickly, instead of re-deriving the architecture each time.

The defining trait of a Unity app is that **it watches itself**. Observability, diagnosis, and safe self-healing are wired into the platform from day one via **SRE Agent**, attached across every tier. Alongside self-awareness sits **environment safety** (identity, isolation, and egress control enforced outside the agent's reach) and a **uniform interface** (every capability reachable as an API, SDK, spec, MCP server, and CLI). Car buying is Demo #1: a real, non-contrived job that exercises every tier of the platform.

See [`docs/unity-platform-plan.md`](docs/unity-platform-plan.md) for the full plan: architecture, identity and safety model, JTBD table, and phased POC scope.

## Structure

- [`docs/`](docs) - the platform plan, diagrams, and design notes
- [`src/`](src) - application code for Demo #1, organized per platform tier (added as the POC build starts)
- [`tests/`](tests) - automated tests mirroring `src/` by tier

## Quick run (mock)

The POC build hasn't started yet, so there's nothing to `run` today. Once it does, the walkthrough below (from the plan's [demo script](docs/unity-platform-plan.md#55-demo-script-15-minutes)) is the target quick-run path:

1. Open the web client and start a conversation: "EV under $38k, 250+ miles, room for a car seat."
2. The agent searches inventory, finds a shortlist, and quotes a price.
3. Ask "what's my payment?" - a sandbox spins up, computes the answer from PII that never leaves it, and is deleted.
4. Give an email address and tap "Apply" - a durable workflow posts an approval card to Teams.
5. Approve in Teams - the deal closes and the offer emails back to the customer.
6. Trigger a fault - SRE Agent notices, correlates, proposes a fix, and (in staging) applies it with no human in the loop.

Each step lands as a working slice in the phased build plan (plan section 5.4) as `src/` fills in.
