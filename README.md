# Azure App Platform: The Self-Aware App Platform

<img src="docs/images/agentic-architecture.svg" alt="Agentic Cloud Application: reference architecture for an agent application over hosted skills, connectors, and human approval" width="720" />

Azure App Platform brings together Azure's modern serverless and AI-native building blocks—with **ACA Sandboxes** as the focal primitive for strongly isolated execution—into one coherent, end-to-end application platform: a fast web front end, a reasoning agent, governed model access, callable skills, isolated compute for sensitive work, durable workflows, and integration into Microsoft 365. It's opinionated about how these pieces fit together so a team can ship a real, production-shaped app quickly, instead of re-deriving the architecture each time.

The defining trait of an Azure App Platform app is that **it watches itself**. Observability, diagnosis, and safe self-healing are wired into the platform from day one via **SRE Agent**, attached across every tier. Alongside self-awareness sits **environment safety** (identity, ACA Sandbox isolation, and egress control enforced outside the agent's reach) and a **uniform interface** (every capability reachable as an API, SDK, spec, MCP server, and CLI). Car buying is Demo #1: a real, non-contrived job that exercises every tier of the platform.

[![Unity Overview PPT](https://img.shields.io/badge/Unity%20Overview-PowerPoint-B7472A?logo=microsoftpowerpoint&logoColor=white)](https://microsoft-my.sharepoint.com/:p:/p/nimashkowski/cQqDdkpwM7BrQr0GBXmwLjDrEgUCXlixIAEsKcBJJPJUXajf0Q)
&nbsp;
[![Unity Platform Plan](https://img.shields.io/badge/Unity%20Platform%20Plan-docs-blue?logo=markdown&logoColor=white)](docs/azure-app-platform-plan.md)

## Structure

- [`docs/`](docs) - the platform plan, diagrams, and design notes
- [`canvases/azure-app-platform/`](canvases/azure-app-platform) - Azure App Platform and its reusable app templates
- [`src/`](src) - application code for Demo #1, organized per platform tier (added as the POC build starts)
- [`tests/`](tests) - automated tests mirroring `src/` by tier

## Minimal template

**Sandbox & Gateway (Minimal)** is a headless starter: an agent and its harness,
a document validation tool, and a remote model through AI Gateway. It includes
a loan-application document demo, but stays reusable for other scenarios.
Local processing is a subprocess simulation; separate ACA sandboxes are optional.

Start with the [template shape and maintainer guide](canvases/azure-app-platform/MINIMAL-TEMPLATE.md)
for the complete file tree, editable files, token conventions, and generation
contract. The [template source](canvases/azure-app-platform/templates/sandbox-gateway-minimal)
is separate from the Dealer demo in this repository's `src/`.

See the [finished docagent sample](canvases/azure-app-platform/samples/README.md) for
the concrete application output, with local credentials and runtime state excluded.

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

When Azure App Platform creates a Dealer workspace, use the repository-level
`scripts/dev-start.*` launcher instead. Studio saves collision-free ports in
`.azure-app-platform/ports.env`; the launcher reads that file as data and prints the
actual web, agent, skill, and Azurite endpoints. `3000` is only the fallback
when no saved or environment override exists.

To run against the real `deal-finder` agent and AI Gateway (both terminals,
plus `azd` provisioning), see [`src/README.md`](src/README.md) for the full
walkthrough, including the demo script from the plan's
[section 5.5](docs/azure-app-platform-plan.md#55-demo-script-15-minutes).
