# Sandbox & AI Gateway Pattern

Agents need to use tools without giving every tool the host's filesystem,
credentials, or network access. This pattern separates **agent orchestration**,
**isolated tool execution**, and **shared model and tool access**. It applies to code
execution, data analysis, file conversion, document processing, and other work
that needs an execution boundary.

Azure App Platform's built-in starter demonstrates the pattern with document
processing. That example is replaceable; neither loan documents nor document
validation define the architecture.

---

## Start here: isolate execution, govern shared access

![Sandbox & AI Gateway Pattern — tool isolation and shared model and tool access](images/sandbox-gateway-minimal-building-blocks.svg)

Three entry points feed the Agent: **HTTP REST**, **Timer**, and **Connectors
events**. Each starts the same orchestration and uses the same isolation and
shared-access boundaries.

| Layer | Responsibility |
| --- | --- |
| **Agent host / orchestration** | Accept a request, choose work, dispatch tools, check results, and decide what happens next. Host on Foundry Hosted Agents (FHA), ACA, App Service, or Functions. The starter runs locally for development. |
| **Tool isolation — ACA Sandboxes** | Execute selected tools in an ephemeral microVM with scoped inputs and explicit access policy, then clean it up. Isolation contains execution; it does not make tool output trustworthy. |
| **Shared model and tool access — AI Gateway** | Govern access to models and shared tools exposed through MCP or HTTP APIs with configured routing and policies. A gateway does not replace the sandbox's execution boundary. |

**ACA Sandboxes** names the service and architectural capability. A **Sandbox
Group** is the Azure resource configured for the built-in example; that setup
detail does not need to be the pattern's component label.

The agent calls models through the gateway and sends tool work to a sandbox.
Tool results return to orchestration for contract and policy checks before
being used in another model call or downstream action. Model and tool calls
can alternate; the pattern does not require every workflow to start with a
tool call.

Shared MCP tools can sit behind AI Gateway when centralized access control is
needed. Direct sandbox creation and execution remain separate; they do not
need to pass through the gateway. MCP in the diagrams describes shared tool
access, not a change to the starter's model inference protocol.

The sandbox lifecycle is **create → execute → cleanup**. Start with egress
denied; enable only the destinations a tool actually needs through an explicit
egress design. The starter needs none and has an empty allowlist. Do not copy
host credentials into a tool simply because the agent can access them.

### Different tools, same boundary

| Example workload | Isolated work | Result returned to the agent |
| --- | --- | --- |
| Data analysis | Run generated calculations over scoped data | Bounded metrics and checked artifacts |
| File conversion | Process an untrusted file with a parser or converter | Converted artifact and validation status |
| Code execution | Run a generated script or test in a disposable environment | Bounded output, exit status, and artifacts |
| Document processing | Extract, validate, and redact submitted content | Approved text or an explicit rejection |

These are applications of the pattern, not additional tools shipped by the
starter. Each needs its own tool contract, access policy, and result checks.

## Built-in example: document processing

The starter's local Python HTTP harness accepts a message and optional document.
With an ACA Sandbox Group configured, it runs the **document-validation tool**
in an ephemeral microVM:
`aca sandbox create --egress-default Deny` → `exec` → `delete` (cleanup attempted).
The tool returns bounded sanitized text and redaction counts; the harness
independently checks the result.

Rejected documents stop before inference. Approved sanitized output, the user
message, and agent instructions go through **AI Gateway → remote model**, using
the **Responses API** by default. The harness also checks the model reply.
Raw document content is not forwarded to the model. Sanitation is bounded
pattern matching, not complete PII detection or malware scanning; approved text
remains untrusted data.

### Example runtime configuration

The built-in example requires a configured **ACA Sandbox Group**, the **aca CLI**, and
an **AI Gateway with a model**. Connect those services before running the example.
`config/runtime.json` uses `agentRuntime: "local"` for orchestration on the
developer's machine; tool execution belongs in the sandbox, and model access
goes through the gateway. Local orchestration does not mean local tool execution.
The generated app's manifest is `azure-app.yaml`.

Whole-agent sandbox hosting is **not the default**. The optional
`copilot-sdk-sandbox` mode keeps the HTTP harness local but places the Copilot
SDK agent and document tool in **two separate ACA custom-container session
pools**, explicitly stopping each session after its request. It requires both
configured endpoints and has no local fallback.

**Test enforcement** (`POST /test-document`) runs the tool and result checks
without calling a model. **Invoke agent** (`POST /invoke`) applies those checks
before inference when processing a document. Missing gateway configuration
produces an error, not a simulated model reply.

---

## + Hosted Skills

![Minimal + Hosted Skills](images/sandbox-gateway-hosted-skills.svg)

**Optional extension:** add reusable intelligent capabilities hosted on Azure
Functions and exposed through MCP or HTTP. The Agent stays on its chosen host;
Hosted Skills do not replace it. Shared skill access can use AI Gateway for
centralized routing and policies, while sandbox dispatch remains separate.
Preserve tool isolation and result checks regardless of the host. These
additional skills are not shipped in the built-in starter.

---

## + Durability & Human-In-The-Loop

![Minimal + Durability & HITL](images/sandbox-gateway-durable-hitl.svg)

**Optional extension:** use durable orchestration when work outlives an HTTP
request or needs a human decision. Add checkpointing, an approval channel, and
an authenticated callback to resume the workflow. These are not shipped in the
starter. AI Gateway model routing does not itself deliver Teams/email
notifications or receive approval events; configure those integrations separately.

---

## + SRE & Continuous Evals

![Minimal + SRE & Evals](images/sandbox-gateway-sre-evals.svg)

**Optional extension:** add continuous evaluations and cross-component
observability to measure quality as well as availability. The starter logs
sandbox lifecycle activity, but does not ship a continuous-evaluation service
or SRE integration. When adding telemetry, avoid sensitive inputs and tool
payloads in traces; correlate lifecycle metadata instead.

---

## Complete Architecture

![Complete Architecture](images/sandbox-gateway-full-architecture.svg)

This reference view combines optional extensions around the isolated-tool and
gateway flow. It is not the starter's deployment inventory. Secure egress to
external systems would require separate policy and infrastructure; it is not
enabled in the built-in document-processing example.

---

## Reading the diagrams

- **Solid border** — core flow, with the cloud tool configuration noted above.
- **Dashed border / “optional” label** — extension, not built-in behavior.
- **Colour** — role, not decoration: slate blue = core, indigo = hosted skills, blue =
  durability, purple = evals, amber = egress. Hosts and shared primitives use
  muted neutrals so Sandboxes and AI Gateway remain the focal points.
- **Shared primitives** — recommended auth, OpenTelemetry, and audit concerns,
  not a claim that the starter provisions all three.

## Source reference

- [Starter runtime and mode selection](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/src/agent/main.py.template)
- [Runtime defaults](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/config/runtime.json.template),
  [egress policy](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/config/egress-allowlist.json.template),
  and [manifest](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/azure-app.yaml.template)
- [Starter usage and limitations](../canvases/azure-app-platform/templates/sandbox-gateway-minimal/README.md.template)
