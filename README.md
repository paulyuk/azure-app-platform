# Unity: The Self-Aware App Platform

![Agentic Cloud Application: reference architecture for an agent application over hosted skills, connectors, and human approval](docs/images/agentic-architecture.svg)

Unity brings together Azure's modern serverless and AI-native building blocks into one coherent, end-to-end application platform: a fast web front end, a reasoning agent, governed model access, callable skills, isolated compute for sensitive work, durable workflows, and integration into Microsoft 365. It's opinionated about how these pieces fit together so a team can ship a real, production-shaped app quickly, instead of re-deriving the architecture each time.

The defining trait of a Unity app is that **it watches itself**. Observability, diagnosis, and safe self-healing are wired into the platform from day one via **SRE Agent**, attached across every tier. Alongside self-awareness sits **environment safety** (identity, isolation, and egress control enforced outside the agent's reach) and a **uniform interface** (every capability reachable as an API, SDK, spec, MCP server, and CLI). Car buying is Demo #1: a real, non-contrived job that exercises every tier of the platform.

See [`docs/unity-platform-plan.md`](docs/unity-platform-plan.md) for the full plan: architecture, identity and safety model, JTBD table, and phased POC scope.

## Structure

- [`docs/`](docs) - the platform plan, diagrams, and design notes
- [`src/`](src) - application code for Demo #1, organized per platform tier (added as the POC build starts)
- [`tests/`](tests) - automated tests mirroring `src/` by tier

## Try it

PR #6 shipped the full POC — the web chat, the `deal-finder` Foundry Hosted
Agent, hosted skills, sandboxed financing, and the approval workflow all run
today.

![Deal finder chat: multi-turn conversation with the live agent, plus the deal workflow panel](docs/images/demo1-web-chat-screenshot.png)

The fastest path (no Azure needed, runs entirely on mock data):

```bash
cd src/web
npm install
npm run dev
```

Then open <http://localhost:3000> and use the chat panel's **"Copy & fill"**
button to try:

```
Find me an EV under $40,000 with at least 250 miles of range
```

The badge in the header tells you the truth about which agent answered —
green **"● Live agent"** or amber **"⚠ Mock agent"** — never a guess.

To run against the real `deal-finder` agent and AI Gateway (both terminals,
plus `azd` provisioning), see [`src/README.md`](src/README.md) for the full
walkthrough, including the demo script from the plan's
[section 5.5](docs/unity-platform-plan.md#55-demo-script-15-minutes).
