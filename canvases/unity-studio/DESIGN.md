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

Both journeys end with a review and a delegated app-native worktree request.
The UI reports that the request was sent; it does not claim that a workspace was
created before the host returns that result.

### Deterministic versus model-driven work

The extension SDK cannot directly register an app-native project session or
worktree. The foreground model is therefore used only to call the host's
`create_session` operation. Once the child worktree exists,
`template-materializer.mjs` performs deterministic local materialization:

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
  returns discovered implementations or the tier's scaffold recipe.
- `trace_app` builds a source-derived App Map for an application root or
  discovered implementation.
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
- Loopback JSON and action endpoints remain loopback-only.
- No discovery or scaffold action mutates files, resources, or configuration.
- Static analysis can miss dynamic registration, generated configuration,
  indirect dependencies, and runtime-only relationships.
- **Not added** means no matching implementation was found in the current
  worktree; it does not mean the capability is unavailable.
