# Unity Studio redesign

## Product model

Unity Studio is a guided builder for applications that use the Unity platform
pattern. It deliberately avoids a dashboard or platform cockpit. The first view
offers exactly two actions and performs no automatic discovery.

### Build a new app

Templates lead this journey:

1. **Empty Unity app** is a checked-in, versioned template. It creates a local
   web-agent vertical slice, an explicit gateway seam, editable domain and prompt
   files, and exactly one empty Hosted Skill. It includes POSIX and PowerShell
   whole-app start/stop scripts. The user names the skill; Unity Studio does not
   guess its tools or business behavior.
2. **Sandbox & Gateway (Minimal)** is a checked-in, versioned template covering
   only the headless Minimal Building Blocks tier of the [Sandbox & Gateway
   pattern](../../docs/sandbox-gateway-pattern.md): an HTTP/timer-triggered
   agent loop, an ACA Sandbox tool boundary that receives one request and
   returns only derived, non-identifying results, and an AI Gateway
   configuration seam. There is no web or Hosted Skill capability; the user
   supplies agent instructions and an egress allow-list domain, and Unity
   Studio does not invent the sandboxed computation.
3. **Dealer sample** is the complete reference app from the newest eligible
   pinned commit. Eligibility requires the agent manifest, web package, and
   `scripts/dev-start.sh` / `scripts/dev-stop.sh`. Hydration extracts the whole
   commit so tests, infrastructure, docs, shared contracts, and lifecycle scripts
   stay coherent. The canvas advertises the credential-free mock startup command;
   the full startup command remains visible but requires the settings documented
   by the sample.

Both local templates can be extended after creation. The finished sample preserves
its domain and is immediately useful for experiencing Unity Studio over a
working app.

### Assemble existing pieces

The user adds capabilities one at a time and explicitly selects the source
project that fulfills each one. Choices include the current and sibling Git
worktrees plus local folders the user authorizes for the current canvas
instance. Each choice shows its repository/worktree, branch, project path, and
clean or modified state. Compatible Azure resources are an optional mapping
step after source selection, not the primary source of truth.

Both journeys end with a review. Template creation follows a deterministic
worktree/materialization/session path; assembly creation remains a structured
model handoff because source integration requires semantic decisions.

### Deterministic versus model-driven work

Template creation uses session RPC to create the child session directly when the
host supports it, then `template-materializer.mjs` performs deterministic local
materialization. Older hosts get the materialized worktree without a chat
handoff:

- empty template: copy checked-in files, substitute validated user inputs,
  rename the one Hosted Skill, and set script permissions;
- complete sample: archive the pinned Git commit and extract it at the worktree
  root.

The child model verifies the result and reports it. It must not synthesize,
summarize, or manually recopy template files. Model reasoning remains appropriate
for domain-language refactors, prompt authoring beyond supplied instructions,
tool contracts the user has actually specified, compatibility/wiring decisions
while assembling independent projects, and diagnosis of runtime failures.

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

Each definition may include expected interfaces, source-project and Azure matching
rules, preferred dedicated canvas IDs, and a non-mutating scaffold recipe. It
never includes a canned deployment status.

## Source catalog and discovery

### Source projects

`discover_platform` resolves an explicit repository root or uses the canvas
session working directory. A bounded, recursive scan excludes source-control
internals, dependency caches, virtual environments, build output, and likely
secret material. It inspects project markers and source references such as agent
and function manifests, web configuration, orchestration APIs, sandbox
manifests, connector registrations, observability configuration, and data
resource declarations.

Classification uses recognizable files and source matches rather than relying
on directory names. Results identify project paths and matched files. Ambiguous
and unmatched items remain visible for inspection.

### Active-subscription Azure resources

Azure discovery is optional and read-only. It uses the subscription currently
selected by Azure CLI and executes bounded `az account show` and resource
inventory queries. Only fields needed for classification are requested, such as
resource ID, type, kind, location, tags, and selected non-secret metadata.

Discovery never reads or displays credentials, keys, connection strings, app
settings, or resource payload data. Azure CLI unavailable, signed-out,
permission-denied, timeout, and malformed-output conditions are reported as
diagnostics without discarding repository results.

## Matching, confidence, and diagnostics

Every implementation records its tier, kind (`source project` or `Azure
resource`), matched files or resource metadata, and confidence. Confidence
communicates the strength and agreement of scanner matches; it is not a health
or readiness score. Resource types,
file markers, names, and source references are signals, not proof that a system
is configured correctly or running.

Discovery returns per-tier implementations, source matches, diagnostics, and
whether a build path is available. Unsupported or conflicting matches are
reported rather than converted into invented links or statuses.

A root `unity.app.yaml` inventory is authoritative for app scope. Both the
`capabilities:` mapping emitted by templates and the legacy `components:` list
are supported. Discovery, metadata, operation tracing, and edges use the same
declared paths; undeclared inherited files do not become app implementations.
Invalid declarations produce diagnostics rather than falling back to broad
discovery. Nested inventories remain additive when no root inventory exists.
Manifest-backed headless apps are eligible for Open app without a web component;
Dealer sample eligibility remains based on the pinned complete sample.

`list_source_roots` builds a separate picker-oriented catalog. Source and root
IDs are opaque hashes, and selections are resolved against a fresh session-local
catalog before delegation. Clean projects use commit snapshots. Modified or
plain-folder projects use explicit working-tree snapshots. The destination
copies selected projects under its own app root; it never symlinks to or mutates
the source. Absolute local paths are transport data and must not be written to
`unity.app.yaml`.

## Deterministic actions

- `discover_platform` gathers repository and optional active-subscription Azure
  projects and Azure resources and returns the combined tier inventory.
- `list_source_roots` returns source-picker data for current/sibling worktrees
  and session-authorized folders. No source is selected automatically.
- `request_app_workspace` creates template worktrees and child sessions directly
  through session RPC, runs the exact materializer, and optionally launches VS
  Code. It persists the managed branch, runtime profile, and child session ID
  in `.unity-studio/app.json` and returns `workspace-created`. Assembly requests
  use the structured foreground-agent handoff and return `workspace-requested`.
- `open_in_vscode` resolves an explicit repository path inside the current
  workspace before invoking `code --new-window`, with the macOS application
  launcher as a fallback.
- `activate_tier` validates a tier and queries
  `session.rpc.canvas.list()`. If a preferred specialist canvas is registered,
  it calls `session.rpc.canvas.open()` with a stable instance ID and tier
  context, directly opening or focusing that studio. If none is registered, it
  returns discovered implementations or the tier's scaffold recipe. Candidate
  results identify what was found and replace discovery with a concrete next
  action rather than allowing an indistinguishable repeat.
- `trace_app` builds a source-derived App Map for an application root or
  discovered implementation.
- `run_doctor` is a compatibility action. It reports readiness metadata from
  the same probes used by discovery and is not a separate simulated status
  source.

Canvas buttons invoke the same action implementations as external callers.
Registration checks and stable instance IDs make studio activation
deterministic. Validation and RPC failures are surfaced explicitly.

Template creation does not use `session.send()` or a model-generated creation
prompt. It creates a Git worktree with `--no-checkout`, materializes only the
selected template's files, and opens the child session through the
host-provided session RPC, preserving the visible project/worktree UX while
keeping known-file creation deterministic. Assembly remains the deliberate
model boundary. Add-to-app work reuses that persisted app session; when the
extension SDK can only send through the parent session, the request carries the
target session ID and requires an immediate relay into the app worktree.

## Scaffold recipes

When no eligible implementation or dedicated studio is found, `activate_tier`
may return a structured recipe containing the intended interfaces, recognizable
project markers, and concrete next actions. Recipes are guidance only: Unity
Studio does not create files, provision resources, run deployments, or modify
the repository or subscription.

## Source-derived App Map

### Workspace and Guide

The app interface has three main views: Build, Run & manage, and Map. Build is
the initial view. Build and Run use the main content region; the graph and its
view/search controls are visible only in Map. Map details are a contextual
inspector, not the container for every app workflow.

Guide is a separate 280px right rail with evidence-derived progress and next
actions. It updates on readiness changes without switching the main view,
clearing map selection, or replacing Build/Run inputs. Its toggle and collapse
button are keyboard accessible and return focus to the toggle when closing.
Collapsed Guide consumes no workspace width. Narrow screens use an overlay,
collapsed by default unless the user has chosen otherwise.

Guide visibility is a per-app browser-origin preference, separate from map
layout and source files. An extension restart that changes the loopback origin
can reset browser preferences. Document and inline-edit drafts stay in memory
across mode switches but are not persisted by this layout.

### Build and enforcement ownership

Build exposes allowlisted app artifacts, not arbitrary filesystem reads/writes.
Source edits use a content hash and atomic replacement, reject symlink targets,
and require a stopped app. The editor preserves drafts until an explicit review
and save. Every available artifact, including operator policy and tool contracts,
is editable by the developer in a compact box. Edit in Code resolves an allowlisted,
non-symlink artifact, then opens the whole worktree and the file in VS Code.
Returning focus refreshes saved source without overwriting pending inline drafts;
drafts retain their original base hash even across reloads within the panel.
The runtime model has no access to this loopback authoring API.

Document tests and invocations use an owned local agent endpoint and omit document
payloads from command activity. The document validation tool and agent harness, not
the model, own policy enforcement. Source editing by an authorized developer is a
different authority from tools available to the running model. A local subprocess
does not make policy or network access tamper-proof; cloud isolation must be
configured and verified separately. Existing Dealer deployment files are never
treated as a valid deployment plan for the document sandbox POC.

`trace_app` reuses repository discovery to create tier and project nodes, then
derives edges from matched source files. Supported matches can include HTTP clients
and endpoint references, model or gateway construction, MCP and tool
registrations, Function routes, durable orchestrator/activity/event
relationships, and connector or data references.

Every node and edge includes source path, line, rule, and confidence where
available. Unresolved references and parser diagnostics are first-class output.
The map is a source-code view, not a runtime topology, distributed trace, or
proof that a request path succeeds.

The App Map is the primary app interface after creation or selection; Unity
Studio does not insert a separate workspace dashboard. It opens on a
customer-oriented **Request flow** architecture view. Proven
paths move left to right through Experience, Reasoning, Models & capabilities,
and Connected systems, with observability shown as a cross-cutting operations
plane. Internal workflow operations and disconnected implementations are not
mixed into the request path. They remain available in the secondary
**Implementation** view, which preserves all nine Unity tier swimlanes.

Both views use the same directional evidence-backed edges, pan and zoom
controls, search, and tier filters. The **Request flow** and **Implementation
map** switch remains visible in a dedicated view bar. Search, filters,
zoom, fit, and reset controls are grouped under **Search & layout** so they do
not compete with the primary views. Overall runtime state remains visible beside
the app name as **Not running**, **Local preview**, **Running locally**, or the
current lifecycle transition. A persistent adjacent action starts or stops the
local runtime and routes missing prerequisites into **Run & manage**. Each
request-flow stage and Implementation
lane exposes a contextual **Add component** action. Single-tier locations open
their setup directly; multi-tier locations narrow the chooser to valid
component types. **Connect** controls between adjacent stages list existing
evidence-backed relationships, collect an explicit source and destination, and
show a confirmation before delegating source/configuration work to the app's
persisted child session. The deterministic Request flow layout is
not draggable because its position communicates architectural meaning. The
Implementation view permits vertical reordering inside the evidence-derived
tier only; a component cannot be moved into another tier. Those positions are
browser-local and versioned by the authorized app root plus a stable topology
fingerprint, so changing the graph starts a fresh layout without modifying the
repository.

Selecting a node opens its details and highlights only its immediate graph
neighborhood. Clicking the selected node again, clicking empty map space, or
pressing Escape returns to the Guide. Selecting a
connection explains how the request moves between the two components and shows
the exact source evidence, while explicitly distinguishing architecture
evidence from a successful live distributed trace.
Documentation-only paths remain visible but render as low-confidence dashed
connections until executable source confirms them.
The read-only details panel includes source evidence, bindings, incoming and outgoing
relationships, and safe navigation actions. Source, specialist-studio, and
ready local-endpoint actions continue through the existing authorized loopback
APIs. The graph renderer introduces no CDN or other external network
dependency.

Each Implementation tier lane exposes an **Add** handoff. A specialist studio can manage
existing or provisioned resources. Requesting a new source capability requires
an explicit second confirmation, delegates to the existing capability workflow,
and does not provision or deploy Azure resources. The new card appears only
after refreshed source discovery produces evidence for it.

The expanded map's default side panel is **Guide**, not an
infrastructure dashboard. It translates the current graph into a progressive
**Build → Connect → Run → Observe & manage** journey, presents runtime as the
immediate action, and shows one evidence-backed improvement at a time. Later
suggestions remain collapsed. The journey is a non-interactive vertical
stepper: explanatory text stays visible, connected nodes communicate order,
and only the current stage is highlighted. Its matching **Next action** card
appears immediately below the stepper; unavailable runtime work and later
improvements do not compete with that action. For example, an agent without a
gateway gets model-connection guidance, unresolved references get an evidence
review, and an app without telemetry gets a plain-language observability setup
action. Local readiness and lifecycle state update the Run step through the
existing APIs, including the stricter gateway validation introduced by later
Studio changes.

Recommendations are deterministic and recomputed from a fresh trace. Runtime
progress updates automatically. Work delegated to another session does not
directly mutate the graph, so its completion screen offers **Check for changes**
to retrace the app. This is the first progressive-guidance layer; future history
or preference signals may refine ranking but must not weaken evidence requirements.

At narrow mobile widths, the request-flow diagram and Guide stack vertically.
The Guide must not become an overlay that hides the architecture the user is
trying to understand.

**Run & manage** is the explicit operational surface. AI model connection comes
first, followed by expanded local runtime controls, visible live stdout/stderr, per-component health and
open-endpoint buttons, and **Invoke agent** with a message.
An optional document appears beside the message when readiness advertises
document support. File reading, pasted-text limits, removal, and in-flight state
are shared by Invoke agent and Test enforcement; Build links to this single Run
surface rather than maintaining a separate test form. Document and message drafts
remain in panel memory across polling and mode switches, never in command history.
Actual command/HTTP
activity (bounded, redacted before storage, with status and timing) is the sole
Commands card; separate command-example and troubleshooting cards are omitted. A scoped
`run-panel-styles.mjs` adapts Functions Studio's panel, form, command, and badge
treatments without changing the App Map or its global tokens. Agent answers are separate from raw
responses. Source-discovered Hosted Skills and sandbox implementations are not
presented as successful tool calls; only response-reported tool evidence is shown.
The persistent runtime badge opens this panel
directly, and starting an operation keeps the run panel visible.
Local port controls persist validated assignments in `.unity-studio/ports.env`.
Allocation is serialized and checks both live loopback bindings and other
discovered app profiles. The same settings feed scripts, readiness, and links;
unsupported startup scripts fail explicitly instead of partially remapping.
Stopping port owners requires a short-lived server-owned review of PIDs and
process creation times, followed by explicit confirmation. Only listeners on the
selected app's ports and their reviewed launcher trees are eligible. Confirmation
rechecks identities, protects the Studio host ancestry, and verifies freed ports;
it never escalates automatically to newly respawned owners.
AI model connection defaults to the saved/current subscription and a valid
gateway with models; model discovery uses the workspace-wide ARM models
collection across providers. Saved selections are preserved, stale discovery
cannot overwrite user choices, and empty gateways cannot be applied.
Configuration receives the selected model and validates it before the card collapses to a
model/gateway/subscription summary. Creation remains an explicit specialist
action. Source projects without managed endpoints appear in Components & endpoints
as Source only, with Review source, and do not affect readiness. Azure deployment and deletion remain secondary
disclosures. Home returns to the landing screen, and Guide, Run & manage, and
Search & layout use a colored active state. The
desktop details panel is pointer- and keyboard-resizable with its per-app width
stored locally.

## Safety and limitations

- Repository scanning is bounded, local, and excludes common sensitive paths.
- Azure discovery is read-only and defaults to the user's active CLI
  subscription; it does not enumerate other subscriptions implicitly.
- Discovered values are treated as untrusted input and escaped before rendering.
- Workspace names use a constrained character set, prompt values are serialized
  as data, and source project paths are canonicalized within the current workspace.
- Additional local folders are canonicalized with `realpath`, remain authorized
  only for that canvas server instance, and are referenced through opaque IDs.
- Template and assembly requests reject stale or tier-incompatible source IDs.
- Runtime profiles define start arguments, expected entrypoints, and reserved
  ports; ownership checks reject listeners rooted in another worktree.
- Gateway selection is persisted atomically with a unique configuration ID.
  The configuration script validates a readable Responses result and verifies
  that ID under a cross-process lock before writing local credentials. A
  superseded process cannot overwrite a newer selection.
- Deleting a Unity-created app removes its worktree and only the explicitly
  recorded managed branch; unrelated branches are never inferred or removed.
- Loopback JSON and action endpoints remain loopback-only.
- No discovery or scaffold action mutates files, resources, or configuration.
- Static analysis can miss dynamic registration, generated configuration,
  indirect dependencies, and runtime-only relationships.
- **Not added** means no matching implementation was found in the current
  worktree; it does not mean the capability is unavailable.
