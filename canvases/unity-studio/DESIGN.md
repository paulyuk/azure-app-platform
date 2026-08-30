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
2. **Dealer sample** is the complete reference app from the newest eligible
   pinned commit. Eligibility requires the agent manifest, web package, and
   `scripts/dev-start.sh` / `scripts/dev-stop.sh`. Hydration extracts the whole
   commit so tests, infrastructure, docs, shared contracts, and lifecycle scripts
   stay coherent. The canvas advertises the credential-free mock startup command;
   the full startup command remains visible but requires the settings documented
   by the sample.

The empty template can be extended after creation. The finished sample preserves
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
  returns discovered implementations or the tier's scaffold recipe.
- `trace_app` builds a source-derived App Map for an application root or
  discovered implementation.
- `run_doctor` is a compatibility action. It reports readiness metadata from
  the same probes used by discovery and is not a separate simulated status
  source.

Canvas buttons invoke the same action implementations as external callers.
Registration checks and stable instance IDs make studio activation
deterministic. Validation and RPC failures are surfaced explicitly.

Template creation does not use `session.send()` or a model-generated creation
prompt. It creates a Git worktree and opens the child session through the
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
controls, search, and tier filters. These advanced controls and the
Implementation switch are collapsed under **Map tools** so the default header
shows only **Guide** and **Manage**. Guide keeps **Add to app** visible without
requiring users to discover the Implementation lanes. The deterministic Request flow layout is
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
suggestions remain collapsed. For example, an agent without a
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

Manage is intentionally secondary. AI model connection, Azure deployment,
developer tools, technical output, and deletion are grouped into disclosures;
only model connection opens automatically when readiness says it needs action.

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
