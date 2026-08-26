# Unity Studio redesign

## Purpose

Unity Studio is a generic app-workspace and navigation hub for applications
built with the Unity platform pattern. It creates or extends apps in isolated
worktrees, describes platform capabilities, discovers implementation evidence,
opens registered specialist studios, and traces application relationships. It
does not claim that a component is deployed, healthy, or production-ready.

## Nine-tier catalog

Tier definitions are immutable descriptions of roles and jobs to be done (JTBD).
Runtime state comes only from discovery.

| Tier | Role | Job to be done |
|---|---|---|
| Surface / web | User and operator experience | Present application workflows and invoke governed backend capabilities. |
| Agent | Goal-directed AI runtime | Interpret intent, plan work, and coordinate models and tools. |
| Gateway | Governed model access | Route model requests while enforcing identity, policy, quota, and observability. |
| Skills | Reusable hosted capabilities | Expose bounded business operations that agents and applications can invoke. |
| Sandbox | Isolated execution | Run generated or untrusted workloads with explicit resource and network boundaries. |
| Connectors | External-system integration | Provide authenticated, governed access to enterprise services and APIs. |
| Durable workflows | Stateful orchestration | Coordinate long-running, retryable, event-driven, and human-in-the-loop work. |
| Self-awareness / SRE | Operational intelligence | Observe the platform, diagnose failures, manage incidents, and support recovery. |
| Data | Durable application state | Store and retrieve operational, knowledge, trace, and analytical data. |

Each definition may include expected interfaces, repository and Azure evidence
rules, preferred dedicated canvas IDs, and a non-mutating scaffold recipe. It
never includes a canned deployment status.

## Discovery

### Repository evidence

`discover_platform` resolves an explicit repository root or uses the canvas
session working directory. A bounded, recursive scan excludes source-control
internals, dependency caches, virtual environments, build output, and likely
secret material. It inspects project markers and source references such as agent
and function manifests, web configuration, orchestration APIs, sandbox
manifests, connector registrations, observability configuration, and data
resource declarations.

Classification requires supporting evidence rather than relying on directory
names. Results identify paths and matched rules. Ambiguous and unmatched
evidence remains visible for inspection.

### Active-subscription Azure evidence

Azure discovery is optional and read-only. It uses the subscription currently
selected by Azure CLI and executes bounded `az account show` and resource
inventory queries. Only fields needed for classification are requested, such as
resource ID, type, kind, location, tags, and selected non-secret metadata.

Discovery never reads or displays credentials, keys, connection strings, app
settings, or resource payload data. Azure CLI unavailable, signed-out,
permission-denied, timeout, and malformed-output conditions are reported as
diagnostics without discarding repository results.

## Evidence, confidence, and diagnostics

Every candidate records its tier, source (`repository` or `azure`), provenance,
matched rules, and confidence. Confidence communicates the strength and
agreement of evidence; it is not a health or readiness score. Resource types,
file markers, names, and source references are signals, not proof that a system
is configured correctly or running.

Discovery returns per-tier candidates, evidence, confidence, diagnostics, and
whether a scaffold recipe is available. Unsupported or conflicting signals are
reported rather than converted into invented links or statuses.

## Deterministic actions

- `discover_platform` gathers repository and optional active-subscription Azure
  evidence and returns the combined tier inventory plus visible candidate-card
  view models.
- `request_app_workspace` validates an app workspace request and sends a
  structured, data-delimited handoff to the foreground Copilot agent. The agent
  must call the app-native `create_session` operation with a new worktree,
  selected tier kickoff, Unity Studio, registered specialist canvases, and an
  optional VS Code launch. The loopback endpoint returns HTTP 202 and
  `workspace-requested`; this means delegated, not created.
- `open_in_vscode` resolves an explicit repository path inside the current
  workspace before invoking `code --new-window`, with the macOS application
  launcher as a fallback.
- `activate_tier` validates a tier and queries
  `session.rpc.canvas.list()`. If a preferred specialist canvas is registered,
  it calls `session.rpc.canvas.open()` with a stable instance ID and tier
  context, directly opening or focusing that studio. If none is registered, it
  returns discovered candidates or the tier's scaffold recipe.
- `trace_app` builds an evidence-backed App Map for an application root or
  discovered candidate.
- `run_doctor` is a compatibility action. It reports readiness metadata from
  the same probes used by discovery and is not a separate simulated status
  source.

Canvas buttons invoke the same action implementations as external callers.
Registration checks and stable instance IDs make studio activation
deterministic. Validation and RPC failures are surfaced explicitly.

The extension SDK can open canvases in the current session but cannot directly
create app-native project sessions or worktrees. Workspace creation therefore
uses `session.send()` to hand the validated request to the foreground agent,
which owns the native session operation. This boundary preserves the visible
project/worktree UX instead of creating an SDK-only child process.

## Scaffold recipes

When no eligible implementation or dedicated studio is found, `activate_tier`
may return a structured recipe containing the intended interfaces, recognizable
project markers, and concrete next actions. Recipes are guidance only: Unity
Studio does not create files, provision resources, run deployments, or modify
the repository or subscription.

## Evidence-backed App Map

`trace_app` reuses repository discovery to create tier and project nodes, then
derives edges from source evidence. Supported signals can include HTTP clients
and endpoint references, model or gateway construction, MCP and tool
registrations, Function routes, durable orchestrator/activity/event
relationships, and connector or data references.

Every node and edge includes source path, line, rule, and confidence where
available. Unresolved references and parser diagnostics are first-class output.
The map is a source-evidence view, not a runtime topology, distributed trace, or
proof that a request path succeeds.

## Safety and limitations

- Repository scanning is bounded, local, and excludes common sensitive paths.
- Azure discovery is read-only and defaults to the user's active CLI
  subscription; it does not enumerate other subscriptions implicitly.
- Discovered values are treated as untrusted input and escaped before rendering.
- Workspace names use a constrained character set, prompt values are serialized
  as data, and candidate paths are canonicalized within the current workspace.
- Loopback JSON and action endpoints remain loopback-only.
- No discovery or scaffold action mutates files, resources, or configuration.
- Static analysis can miss dynamic registration, generated configuration,
  indirect dependencies, and runtime-only relationships.
- Missing evidence means “not observed,” not “absent.” High confidence means
  “well supported by observed evidence,” not “healthy” or “ready.”
