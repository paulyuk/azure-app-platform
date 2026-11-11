# Sandbox & AI Gateway Pattern

When an agent runs code or processes untrusted files, you want to isolate that
work from your application host and control what the agent can reach. This
pattern pairs ACA Sandboxes with AI Gateway so your agent can use tools
and models without exposing your host filesystem, credentials, or internal
network.

It applies to code execution, data analysis, file conversion, document
processing, and any other workload that benefits from a strict execution
boundary.

For runtime diagnostics, the three app shapes, and exact files and commands
to inspect, see [Sandbox patterns and boundary validation](sandbox-boundary-validation.md).

---

## Core architecture: isolate execution, govern shared access

![Sandbox & AI Gateway Pattern: tool isolation and shared model and tool access](images/sandbox-gateway-minimal-building-blocks.svg)

Requests can enter the Agent from HTTP REST, a Timer, or Connectors events.
Regardless of how a run starts, the architecture separates three jobs:

| Component | Role |
| --- | --- |
| **Agent** | The brain and orchestration loop: accepts the trigger, decides when to call a model or tool, and checks results before acting on them. Host it on Foundry Hosted Agents (FHA), ACA, App Service, or Functions, or run it locally during development. |
| **ACA Sandboxes** | The hands: disposable execution environments that run untrusted or high-risk tool work with scoped inputs and locked-down network access. |
| **AI Gateway** | The governed proxy for model calls and shared MCP or HTTP tools, handling routing, credentials, and rate limits outside the sandbox. |

### Decoupling the brain from the hands

When an agent loop, its credentials, and its code execution all live in the same container, the brain and the hands share one environment. Any untrusted file or generated script runs right next to the agent's tokens and network access, so a single prompt injection only has to read the local environment to steal credentials. And if a tool crashes that container, it takes the whole agent session down with it.

This pattern decouples the brain (the agent and its model calls through AI Gateway) from the hands (ACA Sandboxes and tools that perform actions):

- The hands work outside the brain's environment. Untrusted files, scripts, and parsers run inside an ACA Sandbox, separate from the agent process and memory. Host credentials are not inherited by the microVM. Do not explicitly inject them through environment variables, images, files, or inputs. For authenticated outbound calls, the ACA Sandbox Egress Proxy resolves a sandbox-group secret or managed-identity token and adds it to the request outside the microVM.
- Hands are provisioned on demand and replaceable. The brain reaches for a sandbox only when a tool call needs one (`execute(input) -> output`), and lets it go when finished. If a sandbox crashes or times out, the brain catches the error and can retry with a fresh sandbox without losing its own session state.
- The brain plans and reasons independently. Sessions that do not need a sandbox right away start inference immediately without waiting for a container to boot. Whenever the agent needs to plan, reason, or call shared MCP tools, it talks to AI Gateway and only receives bounded output back from the sandbox.

### Sandbox protections

Isolating tool execution in ACA Sandboxes gives you two direct security guarantees:

1. **Stopping harmful document instructions before they reach the model:**
   Untrusted files are parsed and checked inside a sandbox first. If a document
   contains prompt-injection attempts or policy violations, the workflow blocks
   it before making a model call.
2. **Stopping exfiltration of secrets or private data:** Sandboxes start with
   outbound network traffic denied (`--egress-default Deny`) and never receive
   the agent host's credentials. Even if tool code or a malicious file tries to
   phone home, it has no secrets to steal and no network path out.

### AI Gateway security and cost protections

Routing model and shared MCP tool traffic through AI Gateway adds a second set of controls for access, safety, and spend:

- **Credential isolation and centralized auth:** Agents authenticate to the gateway rather than holding raw provider API keys for every downstream model or MCP server. You can rotate keys, enforce Entra ID or key-based access, and revoke permissions in one place.
- **Token quotas and rate limiting:** Enforce requests-per-minute and tokens-per-minute limits per agent, user, or team so a runaway loop or traffic spike cannot exhaust your model capacity or run up unexpected bills.
- **Model routing and failover:** Route requests across model deployments by priority or weight, fall back automatically when a region or deployment is throttled, and swap or upgrade backing models without changing agent code.
- **Content safety and policy guardrails:** Apply centralized prompt shields, content filtering, and request/response logging at the gateway layer across all agents that share it.

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

1. **Validate in a sandbox:** When a request includes a document, the agent
   creates a fresh sandbox with outbound network access disabled
   (`aca sandbox create --egress-default Deny --traffic-inspection Full`),
   applies the reviewed egress policy, runs the validation and redaction tool
   (`exec`), and deletes the sandbox (`delete`).
2. **Block or redact:** If the tool flags harmful instructions, the request
   stops immediately. Otherwise, only bounded, redacted text is returned to the
   agent.
3. **Call the model through AI Gateway:** For approved requests, the agent
   sends the user prompt and sanitized text to the model through AI Gateway
   (using the Responses API). The raw document never goes to the model.

### Egress policy and credential injection

`config/egress-policy.yaml` uses the schema printed by
`aca sandbox egress init` and `aca sandbox egress schema` in
`aca 1.0.0-preview.5`: `defaultAction: Deny`, `trafficInspection: Full`,
and ordered `rules`. That CLI rejects the older `hostRules` field used by
some earlier samples. Exact FQDNs in `config/egress-allowlist.json` become
host-matching Allow rules only when `documentToolEgressEnabled` is explicitly
enabled. The default document tool has no allowed hosts and needs no network.

The policy includes commented examples of `Transform` header injection using
`valueRef.secretRef` or `valueRef.managedIdentityRef`. The secret or identity
belongs to the sandbox group/proxy, not the document process. Use a scoped
Transform for authenticated APIs; do not put a broader Allow ahead of it.
Never pass the upstream credential through `--env` or a document payload.

The egress test is a runtime probe, not proof inferred from document text.
Text matching only selects a bounded probe request. Inside the tool, the probe
counts nonempty credential-like environment variables and attempts a
credential-free `HEAD` to the requested origin. It sends no document body,
path, query, userinfo, or custom authentication headers and follows no
redirects. ACA execution does not scrub the microVM environment before
observing it. The harness reads `aca sandbox egress decisions --id <id>
--output json` before deletion and correlates denied host/method entries.
Only a matching platform decision is reported as ACA proxy denial. DNS, TLS,
timeout, and upstream HTTP 403 responses alone are not proof.

`unauthorized-egress` remains an HTTP 422 application rejection before any
model call. Its structured `sandboxProbe` reports the observed count,
network outcome, enforcement source, and bounded audit counts. It also
reports sorted environment names (up to 32, with the total count), presence
at five common credential locations, and a sanitized matching ACA denial.
The `[sandbox-env]`, `[sandbox-net]`, and `[sandbox-egress]` stderr records
make these observations inspectable without credential values, file contents,
or raw audit payloads. A nonzero credential-like or credential-location count,
reachable unauthorized origin, or unverified denial needs investigation;
the rejection itself does not prove isolation.

### Running the starter

To run the starter locally, connect an ACA Sandbox resource (provisioned as
an ACA Sandbox Group), the `aca` CLI, and an AI Gateway with a model
deployment.

When you run the starter on your machine (`agentRuntime: "local"` in
`config/runtime.json`), the agent loop runs locally for fast iteration while
still dispatching tool execution to ACA Sandboxes and routing model calls
through AI Gateway.

Without an ACA Sandbox Group configured, the development fallback uses a
minimal-environment child process with a Python audit hook that denies socket
and DNS operations. That exercises a real process-local network policy, not
an OS/microVM security boundary. It is for synthetic inputs only. Configuring
`ACA_SANDBOX_GROUP` without the `aca` CLI fails explicitly rather than silently
downgrading to that fallback.

The starter exposes two endpoints so you can test the boundary directly:
- `POST /test-document` runs the sandbox tool and policy checks on a document without calling a model.
- `POST /invoke` runs the full flow: sandbox check first, then model inference through AI Gateway.

### Boundary tests after customization

Canvas exposes boundary-test staging for discovered sandbox capabilities,
not only this document tool's path. Document apps retain the user's attached
document or the app's declared sample and add domain-neutral probes. A
code-interpreter or calculation sandbox without document input gets the probe
in the agent message instead, with no synthetic attachment. Selecting a test
never invokes it automatically. The application must dispatch the work to its
own sandbox and return runtime evidence; Canvas text highlighting is not
network or credential enforcement.

---

## Optional extensions

You can layer additional platform capabilities onto the core pattern as your
application grows.

### + Hosted Skills

![Minimal + Hosted Skills](images/sandbox-gateway-hosted-skills.svg)

Add reusable capabilities hosted on Azure Functions and exposed over MCP or
HTTP. Your Agent stays on its chosen host and calls Hosted Skills
through AI Gateway, while keeping ACA Sandboxes for isolated execution.

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

This combined view shows how Hosted Skills, Durability & HITL,
SRE & Evals, and controlled egress fit around the core ACA Sandboxes and
AI Gateway pattern.

---

## Source reference

- [Sandboxes & AI Gateway Starter template](https://github.com/coreai-microsoft/azure-app-platform/tree/main/canvases/azure-app-platform/templates/sandbox-gateway-minimal)
- [Starter agent implementation](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/src/agent/main.py.template)
- [Runtime config](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/config/runtime.json.template),
  [egress allowlist](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/config/egress-allowlist.json.template),
  and [app manifest](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/azure-app.yaml.template)
- [Starter README](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/README.md.template)
- [ACA Sandbox egress policy model](https://github.com/microsoft/azure-container-apps/blob/main/docs/early/sandboxes-egress-policies.md)
- [Official ACA Sandbox samples](https://github.com/Azure-Samples/azure-container-apps-sandboxes)
