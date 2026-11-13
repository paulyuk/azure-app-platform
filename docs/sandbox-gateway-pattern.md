# Sandbox & AI Gateway Pattern

When an agent runs code or processes untrusted files, you want to isolate that
work from your application host and control both what the tool can reach and
who can reach the tool.

Think of Agents and Hosted Skills as the brains and ACA Sandboxes tools as the
hands. That gives you two minimal starting points depending on whether a single
brain uses the sandboxed tool or multiple brains share it:

| Pattern | When to use it | How calls flow | What keeps it safe |
| --- | --- | --- | --- |
| Sandboxes Minimal | One agent calls its own sandboxed tools | Agent to ACA Sandboxes | ACA Sandboxes isolation and the Sandboxes egress proxy (default-deny egress with an explicit allowlist) keep execution and outbound network access safe without a gateway in front of the tool. |
| Sandboxes + AI Gateway Minimal | Start with one agent and plan for two or more agents or Hosted Skills to call the sandboxed tool | Agents and Skills to AI Gateway to ACA Sandboxes and models | All tool calls, including calls to sandboxed tools, and model calls sit behind AI Gateway to protect the hands from multiple brains, while the Sandboxes egress proxy enforces outbound network policy. |

Both patterns apply to code execution, data analysis, file conversion, document
processing, and any other workload that benefits from a strict execution
boundary.

For runtime diagnostics and boundary-validation steps, see
[Sandbox patterns and boundary validation](sandbox-boundary-validation.md).

---

## Sandboxes Minimal Pattern

![Sandboxes Minimal Pattern: 1 agent calling sandboxed tools protected by the Sandboxes egress proxy](images/sandboxes-minimal.svg)

When a single agent calls its own sandboxed tools, you can start with the
smallest architecture: an agent and ACA Sandboxes.

- Execution boundary: Untrusted files, scripts, and parsers execute inside a
  disposable ACA Sandbox with no host secrets or shared state.
- Sandboxes egress proxy: ACA Sandboxes' built-in egress proxy denies all
  outbound network traffic by default and permits only explicitly allowlisted
  domains. Even if an untrusted payload attempts prompt injection, SSRF, or
  data exfiltration, the egress proxy applies the configured policy at the
  sandbox perimeter. For authenticated outbound requests, it can resolve a
  sandbox-group secret or managed-identity token outside the microVM and add it
  to the request; tool code does not receive that credential.
- Checked result contract: The agent validates the structured output returned
  by the sandbox before acting on it.

Because only one agent calls the sandboxed tool, the Sandboxes egress proxy and
sandbox isolation are enough to keep the application safe.

---

## Sandboxes + AI Gateway Minimal Pattern

![Sandboxes + AI Gateway Minimal Pattern: protecting the hands from multiple brains](images/sandbox-gateway-minimal-building-blocks.svg)

When you move to the Sandboxes + AI Gateway minimal pattern, all tool calls,
including calls to sandboxed tools, as well as model calls sit behind AI
Gateway.

Why put a sandboxed tool behind AI Gateway when the Sandboxes egress proxy
already exists?

- The Sandboxes egress proxy controls what the hands can reach on the outbound
  network.
- AI Gateway controls which brains can reach the hands, at what rate, and with
  what credentials and audit trail.

You start with one agent in the starter template, but route its sandboxed tool
calls and model calls through AI Gateway from the beginning so that additional
agents or Hosted Skills can safely share that same sandboxed tool as the app
grows.

Regardless of whether a run starts from HTTP REST, a timer, or connector
events, the architecture separates three roles:

| Component | Role |
| --- | --- |
| Agent | The orchestration loop: accepts the trigger, routes model and tool calls through AI Gateway, and checks results before acting on them. Host it on Foundry Hosted Agents, ACA, App Service, or Functions, or run it locally during development. |
| AI Gateway | The governed front door for all tool calls (including sandboxed tools and Hosted Skills) and model calls, protecting shared tools and models across multiple callers with authentication, quotas, routing, and audit. |
| ACA Sandboxes + Egress Proxy | Disposable execution environments behind the gateway that run untrusted or high-risk tool work with scoped inputs and a default-deny egress proxy. |

### Decoupling the brain from the hands

When an agent loop, its credentials, and its code execution all live in the
same container, the brain and the hands share one environment. Any untrusted
file or generated script runs next to the agent's tokens and network access, so
a prompt injection only has to read the local environment to access credentials.
And if a tool crashes that container, it takes the agent session down with it.

This pattern separates the brains (one or more agents and Hosted Skills) from
the hands (ACA Sandboxes) and places AI Gateway between them:

- The hands run outside every agent's environment. Untrusted files, scripts,
  and parsers execute inside an ACA Sandbox, separate from the agent process,
  its memory, and its credentials.
- All callers reach the hands through AI Gateway. Starting with one agent and
  scaling to multiple agents or Hosted Skills, callers go through AI Gateway
  rather than invoking the sandboxed tool directly. AI Gateway enforces
  authentication, tool authorization, rate limits, and audit before a sandbox
  execution starts.
- Each tool run is isolated and bounded by the Sandboxes egress proxy. Outbound
  network traffic from the sandbox is denied by default unless allowlisted, and
  only checked output returns through the gateway to the calling agent.

### Sandbox protections

Isolating tool execution in ACA Sandboxes provides two core guarantees:

1. Harmful document instructions are stopped before they reach the model.
   Untrusted files are parsed and checked inside a sandbox first. If a document
   contains prompt-injection attempts or policy violations, the workflow blocks
   it before making a model call.
2. The sandbox does not inherit the agent host's credentials, and outbound
   network traffic is denied by default. If the egress proxy is configured to
   allow a destination, it can add a sandbox-group secret or managed-identity
   token outside the microVM. Configure the allowlist and credentials narrowly.

### AI Gateway protections

Routing all tool calls (including sandboxed tools) and model calls through AI
Gateway adds inbound controls as more agents and Hosted Skills are added:

- Shared tool protection: AI Gateway sits in front of sandboxed tools, MCP
  servers, and models to enforce per-caller authentication, authorization, and
  rate limits before work is launched.
- Credential isolation: Agents authenticate to the gateway rather than holding
  provider API keys or direct credentials for downstream models and tools. Keys
  and permissions can be rotated or revoked in one place.
- Token and tool quotas: Per-caller request and token limits prevent a runaway
  loop or traffic spike from exhausting sandbox capacity or model budgets.
- Model routing and failover: Requests can route across model deployments by
  priority or weight and fail over automatically when a region or deployment is
  throttled.
- Content safety and audit: Prompt shields, content filtering, and
  request/response logging apply consistently across every agent using the
  gateway.

### Different workloads, same boundary

You can apply the same sandbox boundary across different kinds of tool work:

| Workload | What runs in the sandbox | What returns to the agent |
| --- | --- | --- |
| Document processing | Parse, validate, and redact uploaded files | Sanitized text or a rejection reason |
| Data analysis | Run generated calculations over a dataset | Summary metrics and checked output files |
| File conversion | Run parsers or media converters on untrusted inputs | Converted file and validation status |
| Code execution | Execute generated scripts or tests | Standard output, exit status, and artifacts |

---

## Built-in starter example

The Sandboxes & AI Gateway Starter in Azure App Platform demonstrates this
pattern using a document-processing workflow:

1. Validate in a sandbox: When a request includes a document, the agent creates
   a fresh sandbox with outbound network access disabled, runs the validation
   and redaction tool, and deletes the sandbox.
2. Block or redact: If the tool flags harmful instructions, the request stops
   immediately. Otherwise, only bounded, redacted text returns to the agent.
3. Call the model through AI Gateway: For approved requests, the agent sends
   the user prompt and sanitized text to the model through AI Gateway. The raw
   document never goes to the model.

### Running the starter

To run the starter locally, connect an ACA Sandbox resource (provisioned as an
ACA Sandbox Group), the `aca` CLI, and an AI Gateway with a model deployment.

When you run the starter on your machine (`agentRuntime: "local"` in
`config/runtime.json`), the agent loop runs locally for fast iteration while
dispatching tool execution to ACA Sandboxes and routing model calls through AI
Gateway.

Without an ACA Sandbox Group, the development fallback uses a minimal-environment
child process with a Python audit hook that denies socket and DNS operations.
That is a process-local policy, not an OS or microVM isolation boundary, and is
for synthetic inputs only. Configuring `ACA_SANDBOX_GROUP` without the `aca` CLI
fails explicitly rather than silently downgrading to the fallback.

The starter exposes two endpoints so you can test the boundary directly:
- `POST /test-document` runs the sandbox tool and policy checks on a document without calling a model.
- `POST /invoke` runs the full flow: sandbox check first, then model inference through AI Gateway.

---

## Optional extensions

You can layer additional platform capabilities onto the core pattern as your
application grows.

### + Hosted Skills

![Minimal + Hosted Skills](images/sandbox-gateway-hosted-skills.svg)

Add reusable capabilities hosted on Azure Functions and exposed over MCP or
HTTP. Your agent stays on its chosen host and calls Hosted Skills through AI
Gateway, while keeping ACA Sandboxes for isolated execution.

---

### + Durability & Human-In-The-Loop

![Minimal + Durability & HITL](images/sandbox-gateway-durable-hitl.svg)

For long-running workflows or high-stakes actions, add durable state and a
human approval step (such as Teams or email) before the agent completes the
action.

---

### + SRE & Continuous Evals

![Minimal + SRE & Evals](images/sandbox-gateway-sre-evals.svg)

Add OpenTelemetry tracing, continuous evaluation, and SRE monitoring across the
agent, gateway, and sandboxes to track both output quality and operational
health.

---

### Complete Architecture

![Complete Architecture](images/sandbox-gateway-full-architecture.svg)

This combined view shows how Hosted Skills, Durability & HITL, SRE & Evals, and
controlled egress fit around the core ACA Sandboxes and AI Gateway pattern.

---

## Source reference

- [Sandboxes & AI Gateway Starter template](https://github.com/coreai-microsoft/azure-app-platform/tree/main/canvases/azure-app-platform/templates/sandbox-gateway-minimal)
- [Starter agent implementation](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/src/agent/main.py.template)
- [Runtime config](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/config/runtime.json.template),
  [egress allowlist](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/config/egress-allowlist.json.template),
  and [app manifest](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/azure-app.yaml.template)
- [Starter README](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/README.md.template)
- [Sandbox patterns and boundary validation](sandbox-boundary-validation.md)
