# Unity Car-Buying Demo Plan (`driveline`)

## Scenario Setup: From Car-Buying Web App to Distributed Dealer & Banking System

We are building **Driveline**, a modern car-buying application. On the surface, a shopper wants a single, conversational place to find the right vehicle, value their trade-in, check monthly financing options, and lock in a binding offer. Underneath, a real car purchase is a distributed systems problem that spans multiple trust boundaries and partners:

- **Buyer storefront & advisor (`driveline-web`)**: Needs fast, rich UI streaming paired with stateful multi-turn reasoning.
- **Dealer inventory & valuation (`inventory-search`, `trade-in-value`)**: Mixes live dealer pricing and incentives with authoritative EPA vehicle specifications and VIN condition appraisals.
- **Banking, rate sheets & borrower PII (`rate-sheet`, `prequal` sandbox, `docagent-hosted-skills`)**: Requires deterministic payment math and hardware-isolated credit pre-qualification where sensitive borrower PII (SSN, income, debt, uploaded loan applications) is evaluated without ever leaking into application databases, telemetry, or external networks.
- **Dealer desk & lender sign-off (`loan-approval`, `deal-doc`)**: Coordinates human-in-the-loop finance manager approvals in Microsoft Teams and sends binding offer sheets via Outlook.

This demo shows how we start fast with **App Service Builder (Embr)** to launch a compelling agentic web application built on best-practice Cloud Foundation building blocks, extend it across the full Unity architecture inside a single **Unity Studio** canvas experience, and operate it as a **self-aware application** where **SRE Agent** diagnoses and remediates production issues automatically.

---

## Quick Links & Local Endpoints

- **Unity Repository**: https://github.com/coreai-microsoft/unity
- **App Service Builder (Prod, try first)**: https://builder.appservice.azure.com/
- **App Service Builder (Staging fallback)**: https://builderapps.staging.azure.com/
- **App Service Builder Vite Starter Template**: https://github.com/Azure-Samples/app-service-builder-vite
- **Driveline Web Frontend (`src/web`)**: https://github.com/coreai-microsoft/unity/tree/main/src/web
- **Foundry Deal-Finder Agent (`src/agent`)**: https://github.com/coreai-microsoft/unity/tree/main/src/agent
- **Hosted Skills MCP (`src/skills`)**: https://github.com/coreai-microsoft/unity/tree/main/src/skills
- **PII Prequal Sandbox (`src/sandbox/prequal`)**: https://github.com/coreai-microsoft/unity/tree/main/src/sandbox/prequal
- **Minimal + Rate-Sheet MCP Sample (`docagent-hosted-skills`)**: https://github.com/coreai-microsoft/unity/tree/main/canvases/unity-studio/samples/docagent-hosted-skills
- **Durable Loan Approval Workflow (`src/workflows/loan-approval`)**: https://github.com/coreai-microsoft/unity/tree/main/src/workflows/loan-approval
- **Unity Studio Canvas (`canvases/unity-studio`)**: https://github.com/coreai-microsoft/unity/tree/main/canvases/unity-studio
- **Live Unity Studio (this workspace)**: http://127.0.0.1:55975/?intro=1
- **Local Runtime Ports**: Web UI (`http://localhost:3000`), Deal-Finder Agent (`http://localhost:8088`), Hosted Skills MCP (`http://localhost:7071` to `http://localhost:7074`)

---

## Macro Demo Flow

| Step&nbsp;# | Logical&nbsp;Step&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | Speaking Points |
| :--- | :--- | :--- |
| **1** | **Set&nbsp;the&nbsp;Stage:&nbsp;The&nbsp;Car&#8209;Buying&nbsp;Scenario**<br>Introduce `driveline` across buyer, dealer, and lender boundaries | "We are building Driveline, an AI-native car-buying experience. A shopper wants one seamless conversation to find a car, appraise their trade-in, and get financed. Behind the scenes, that touches dealer inventory, EPA data, bank rate sheets, sensitive credit PII, and dealer manager approvals." |
| **2** | **Start&nbsp;Fast&nbsp;with&nbsp;App&nbsp;Service&nbsp;Builder&nbsp;(Embr)**<br>Open https://builder.appservice.azure.com/ (or staging fallback) | "We start in App Service Builder (https://builder.appservice.azure.com/, or https://builderapps.staging.azure.com/ if prod is still propagating). App Service Builder gives us a rapid way to build agentic web applications on top of our best-practice building blocks, with infinite ability to extend as our architecture grows, and built-in self-awareness from day one." |
| **3** | **Onboard&nbsp;Template&nbsp;or&nbsp;Existing&nbsp;Repo&nbsp;onto&nbsp;Embr**<br>Inspect `src/web` or Vite starter and generate `embr.yaml` | "In the builder canvas, we can start from a curated template (such as https://github.com/Azure-Samples/app-service-builder-vite) or point the canvas at our existing car-buying web app (`src/web`). The canvas inspects the app and configures `embr.yaml` with the React/Vite UI, `/api/agent` streaming route, managed PostgreSQL, managed Valkey/Redis, Entra auth, and automatic OpenTelemetry (`OTLP`) export." |
| **4** | **Connect&nbsp;Reasoning&nbsp;Core&nbsp;&amp;&nbsp;Governed&nbsp;AI&nbsp;Gateway**<br>Wire `deal-finder` (`:8088`) behind AI Gateway policies | "Now we extend beyond the front end using Unity building blocks. Our `deal-finder` agent runs on Foundry Hosted Agents (`ResponsesHostServer` on port `8088`) with its own Entra Agent Identity. Every model call (`gpt-latest`, `gpt-mini-latest`) and every MCP tool call flows through AI Gateway, giving us one governed choke point for model routing, token budgets, and content safety." |
| **5** | **Extend&nbsp;to&nbsp;Dealer&nbsp;&amp;&nbsp;Banking&nbsp;Hosted&nbsp;Skills&nbsp;(MCP)**<br>Attach `inventory-search`, `trade-in-value`, `rate-sheet`, `deal-doc` | "Rather than stuffing domain logic into prompts, the agent calls four Azure Functions Hosted Skills over MCP (`/runtime/webhooks/mcp`): `inventory-search` (`:7071`, backed by real EPA FuelEconomy.gov specs and dealer pricing), `trade-in-value` (`:7072`), `rate-sheet` (`:7073`), and `deal-doc` (`:7074`). Each skill scales independently and exposes a typed MCP contract." |
| **6** | **Run&nbsp;Live&nbsp;Agentic&nbsp;Probes&nbsp;on&nbsp;Car&#8209;Deals&nbsp;Data**<br>Fan out across EPA inventory, trade-in appraisal, and APR math | "Let's probe the live data. First, we ask the agent to find an AWD electric SUV under $46,000 with 270+ miles of EPA range, appraise a 2021 Outback trade-in, and compare 36-, 48-, and 60-month payments. The agent fans out across `inventory-search`, `trade-in-value`, and `rate-sheet`, grounding every number in real inventory and deterministic rate math." |
| **7** | **Isolate&nbsp;Borrower&nbsp;PII&nbsp;&amp;&nbsp;Loan&nbsp;Docs&nbsp;in&nbsp;ACA&nbsp;Sandboxes**<br>Run untrusted loan validation + `rate-sheet` MCP inside boundary | "When a buyer submits a loan application or credit pre-qualification, we cross a strict banking trust boundary. Using ACA Sandboxes (`src/sandbox/prequal` and `canvases/unity-studio/samples/docagent-hosted-skills`), untrusted loan documents and borrower PII run inside an ephemeral, hardware-isolated container with default-deny egress. Raw SSNs and contact details are redacted inside the boundary, and only the sanitized credit verdict and rate-sheet payment comparison ($735.47, $573.49, $478.52 on $24,000 financed) come back." |
| **8** | **Coordinate&nbsp;Dealer&nbsp;&amp;&nbsp;Lender&nbsp;Sign&#8209;Off&nbsp;(Durable&nbsp;DTS)**<br>Trigger Teams Adaptive Card approval and Outlook offer delivery | "Once the buyer picks a payment plan, Durable Task Scheduler (`src/workflows/loan-approval`) orchestrates the long-running approval across partners: posting an Adaptive Card to the dealer finance manager in Microsoft Teams, waiting for human approval or timeout, and delivering the final offer sheet via Outlook Connectors." |
| **9** | **Unify&nbsp;the&nbsp;Dev&nbsp;Experience&nbsp;in&nbsp;Unity&nbsp;Studio&nbsp;Canvas**<br>Walk `Build` (Key files), `Run/Debug`, `Observe/Map`, and `Guide` | "Building a distributed system with nine moving parts used to mean juggling five terminals and three portals. In GitHub Copilot, **Unity Studio** brings the whole lifecycle into one canvas: scaffold or assemble templates with automatic port assignment, customize evidence-backed **Key files** (`Build`), start the local stack and fire test probes (`Run/Debug`), and inspect live source-derived architecture and logs (`Observe/Map` with the collapsible `Guide` rail)." |
| **10** | **Prove&nbsp;Self&#8209;Awareness:&nbsp;Automatic&nbsp;OTLP&nbsp;Telemetry**<br>Show end-to-end traces, `gen_ai.*` metrics, and PII-free logs | "Because we built on Embr and the Unity building blocks, the application is self-aware out of the box. Every tier automatically emits correlated OpenTelemetry traces, `gen_ai.*` gateway metrics, skill HTTP status codes, and PII-free sandbox lifecycle events into Application Insights and Log Analytics." |
| **11** | **Diagnose&nbsp;&amp;&nbsp;Self&#8209;Heal&nbsp;Live&nbsp;with&nbsp;SRE&nbsp;Agent**<br>Correlate fault to deploy and remediate in SRE Agent Studio | "Watch what happens when we inject a real production fault (such as `trade-in-value` returning 5xx after a config push or an overly tight AI Gateway token policy). **SRE Agent** detects the anomaly automatically, correlates Application Insights traces with AI Gateway metrics and recent Embr/Git deployment history, recalls our runbook memory, and explains the exact root cause in the **SRE Agent Studio** canvas. In staging (**Autonomous mode**) it heals itself; in production (**Review mode**) it presents a one-click `[Approve] / [Deny]` remediation card." |

---

## Copy-Paste Agentic Probes for the Live Demo

### Probe A: Multi-Skill Dealer Inventory + Trade-In + Financing Stress Test
> "Find me an AWD electric SUV under $46,000 with at least 270 miles of EPA range, appraise my 2021 Outback Touring XT with 38,000 miles in good condition, and compare 36-, 48-, and 60-month payments on the net amount financed."

- **What it proves**: Multi-tool orchestration through AI Gateway across `inventory-search` (real EPA range + dealer price), `trade-in-value` (equity deduction), and `rate-sheet` (monthly payment table).

### Probe B: Untrusted Loan Application Validation + Rate-Sheet MCP (`docagent-hosted-skills`)
> "Read this application, flag missing details, then compare 36-, 48-, and 60-month payments using demo credit band B."

- **Sample**: https://github.com/coreai-microsoft/unity/tree/main/canvases/unity-studio/samples/docagent-hosted-skills
- **What it proves**: Deterministic document validation and PII redaction inside the sandbox boundary, paired with real MCP invocation of `rate-sheet` (`/runtime/webhooks/mcp`) returning **$735.47/mo** (36 mo at 6.4%), **$573.49/mo** (48 mo at 6.9%), and **$478.52/mo** (60 mo at 7.3%) on $24,000 net financed.

### Probe C: Banking Trust Boundary & Guardrail Probe
> Submit a hostile loan document or attempt an unapproved outbound network call / raw SSN extraction from the pre-qualification sandbox.

- **What it proves**: AI Gateway policy enforcement at the model/tool edge, ACA Sandbox default-deny network egress blocking unauthorized calls, and zero raw PII in Application Insights or application tables.
