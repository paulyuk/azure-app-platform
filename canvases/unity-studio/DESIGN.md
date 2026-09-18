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

The app interface has three main buttons: Build, Run & Debug, and Observe.
Build starts directly with customization areas and one focused preview rather
than a second heading/navigation bar. Its collapse control is right-aligned in
the customization header. When closed, a 40px rail retains a customization-icon reopen control;
Run and general App Map navigation remain in the top
bar. Guide's Build stage opens the existing map with brief, dismissible guidance and
highlights on the stage add/connect controls; it does not create a second
editor, select a component from the current file, or perform a mutation.
Connect preserves source-backed review, with an entry point to edit on the map.
Leaving the map, opening an inspector, or dismissing the guidance removes the
highlight. Build's selected preview is retained across these transitions.
They share one compact top bar whose Unity logo and name link home, with no
separate Home button. The same bar contains app identity,
runtime status and start/stop, Docs, and Settings. There is no separate
workspace header row at full width. Explicit grid areas keep Docs and Settings
at the top right. At 960px and below, workspace buttons move together to row two.
At 680px and below, app identity and runtime controls move to row three, leaving
the utilities on row one. App names truncate; controls never wrap independently.
Observe has App Map and Logs views, with the last-used view retained during
the current visit. Main buttons have a filled selected state, not tab
underlines; they do not claim readiness or successful execution. Every
workspace remains accessible before the app runs. Observe's two subordinate
tabs form a compact, outlined view switcher with map/log icons and a filled
selected state. They retain selected state, roving focus, and labeled tabpanel relationships.
Arrow keys, Home, and End move their focus without activation; Enter or Space
opens the focused view.
Build is the initial view. Build, Run, and Logs use the main content region; the graph and its
view/search controls are visible only in Map. Map details are a contextual
inspector, not the container for every app workflow.
The inspector opens below the map, never as another right-hand rail. Its
horizontal divider supports pointer and keyboard resizing, with a separately
persisted height bounded by the available workspace. Closing restores focus to
the selected map item. Build, Run, and Logs remain full-height workspaces.
Map search, filters, other-resource visibility, and reset share a top-right
floating palette, following the Logic Apps designer reference. Zoom and fit
are directly accessible; search/layout options open downward.
The options scroll within the map's available height; wheel input over them
does not zoom the graph.

Guide is a separate 280px right rail with evidence-derived progress and next
actions. It updates on readiness changes without switching the main view,
clearing map selection, or replacing Build/Run inputs. Its single toggle lives
inside the rail, not in the workspace navigation, and retains focus when closing.
Its top and right insets are identical in both states, so it does not move when
the rail expands or collapses, including in the narrow overlay.
Collapsed Guide occupies 46px and shows stable stage icons with non-color state
symbols and descriptive tooltips/accessibility labels. Clicking a stage expands
Guide and focuses its explanation without changing the selected workspace.
Status refreshes update the shortcuts in place without replacing focused
buttons. Narrow screens reserve the same strip; expanded Guide overlays the
workspace, collapsed by default unless the user has chosen otherwise.

Guide visibility is a per-app browser-origin preference, separate from map
layout and source files. An extension restart that changes the loopback origin
can reset browser preferences. Document-test drafts stay in memory across mode
switches but are not persisted by this layout. Build holds no source drafts.
Live runtime evidence takes precedence over unresolved static source evidence
in workflow progress. A running app reaches Observe & manage immediately;
Run is complete, while uncertain Build/Connect evidence remains marked Review.
Telemetry completeness is an improvement, not the admission rule for viewing
logs, health, or request paths. Start/stop transitions and failures return the
current step to Run, and preview-only operation is labeled explicitly.

### Build and enforcement ownership

Build exposes allowlisted app artifacts, not arbitrary filesystem reads/writes.
The catalog is app-aware: document-processing apps keep their recognized
instruction/tool/policy/runtime layout, while Dealer, Empty Unity, and custom apps
use source-discovered component files within their declared app scope. Inline
agent instructions remain in their original runtime file; the preview does not
extract or rewrite Python strings to manufacture a prompt file. Generic artifact
IDs are bound to file paths, and read and editor-open operations resolve the same
catalog. Inventory changes cannot redirect an existing file ID.
Both profiles use a short, evidence-backed customization navigation and one
selected read-only preview. **Agent behavior**, **Tools & contracts**, **Runtime**, and
**Policies & limits** appear only when supported by available source. Recognized
inline instruction declarations retain their original file and supply a 1-based
initial preview position. General implementation files and boilerplate are not
navigation items. This is a UI projection of the existing authorized catalog,
not a broader filesystem API or proof that a runtime loads a recognized file.

Each area is a native details/summary disclosure above an indented list of file buttons in
Key files, not another selection step or dropdown in the preview. File icons and
names lead; parent paths disambiguate repeated filenames. Only the selected
file row is highlighted. A chevron indicates
expansion; the whole heading is clickable and supports native Enter/Space.
Sections start open, retain their open/closed state in-panel, and never replace
the preview when toggled. File selection and scroll positions survive in-panel
refreshes and workspace switches. Missing or no-longer-recognized points leave the
navigation after refresh; no unsaved source lives in Build.
The navigation has a right-aligned icon-only in-pane collapse control with a tooltip and accessible
label, and a bounded, pointer- and keyboard-resizable divider whose grip stays
centered on the rule in normal, hover, and focus states. Width and visibility changes leave the selected
preview intact. Below 600px of available pane width it replaces,
rather than crowds, the preview. Choosing a file returns focus to the content
heading. Reopening navigation focuses the selected file, or its section heading
if the file is collapsed. Hidden files leave the tab order. Native Tab/Enter/Space
behavior follows the displayed file order; long lists scroll within navigation.
Navigation surfaces use Studio-owned theme tokens, not the host's background
tokens, so choosing light mode inside a dark host retains readable labels.
The content pane leads with the customization's purpose, then the actual file
path and a consistent action bar. **Edit in Files** is the primary action, with
the supported external-editor split button secondary. Build explains which
files matter and why; the host Files canvas or external editor owns editing and
saving. Do not recreate editor inputs, in-memory source drafts, runtime forms,
review/save controls, or a second draft-durability contract in Build.
Filename-selected syntax highlighting uses a shipped, licensed Prism bundle,
not a runtime dependency or CDN. Highlighted source is accessible, selectable
read-only text, not an overlay on a hidden editor. A separate,
accessibility-hidden gutter renders one 1-based number per saved source line,
including a trailing blank line. It shares the preview scroller, grows for wider
line numbers, and remains fixed while long source lines scroll horizontally
inside the preview. It does not participate in selection. Unknown file types
remain plain text. Theme changes recolor tokens; forced-color mode retains
readable text. Highlighting failures surface an explicit error and fall back to
plain-text preview.
Plugin startup
never restores development dependencies, reads a checkout's `node_modules`, or
downloads browser assets. The preview uses Studio-owned light/dark tokens and
keeps horizontal overflow inside its compact scroller.
Top-level workspace navigation and Guide actions remain available during
discovery failures and empty states; Build does not repeat them. Discovery caveats live
in an expandable footer; file-specific errors remain beside the selected file.
Only document-capable profiles show document-test copy and runtime information.
Unsupported areas are omitted, not presented as incomplete
capabilities. Empty customization discovery explains the limitation and offers
the saved external-editor preference's workspace handoff.
Discovery coverage is heuristic: a component path does not identify every
editable artifact or semantic role. Unsupported filenames/frameworks and
dynamic or external configuration may not be recognized. A future explicit
artifact contract in the app inventory is a design discussion, not current
support; see README's discovery limitation and discussion with Paul.
Build source reads and handoffs reject symlink targets and preserve the catalog's
96 KiB bound and app-root authorization. The old Build diff/write endpoints are
removed. Edits made in Files or an external editor do not pass through a Build
stopped-app gate; developers restart or rebuild as needed.
The native handoff discovers the host editor canvas and uses repository scope
with the selected file's canonical session-worktree-relative path, never a
scratch buffer or copied content. Nested app roots retain their prefix. A file
outside the session worktree reports the limitation and stays available through
the external-editor option. Missing host support and launch failures are explicit.
Repeated opens reuse the file's canvas rather than creating duplicate drafts.

Focus, visibility, workspace re-entry, and **Refresh preview** reload saved
source. Unchanged refreshes retain the source DOM and text selection. Changed
refreshes preserve selected file, disclosure state, and navigation/preview
scrolling. Failed refreshes retain the last preview with an error and retry.
`panel.hide()` invalidates outstanding loads and cancels scheduled refreshes.
Late responses cannot replace another workspace or newer results.
Every available artifact, including operator policy and tool contracts,
is editable by the developer in the selected editor. **Open in &lt;editor&gt;** resolves
an allowlisted, non-symlink artifact, then opens the whole worktree and the file.
A per-user supported-editor preference is shared by Build, app creation, and
source actions. Build combines opening and selection into a compact split button:
the editor name opens the file; the chevron exposes the native supported-editor
picker, retaining keyboard behavior and visible focus. Both halves use the same
hover background and disabled opacity, and disabled controls do not react to hover.
The fixed list is VS Code, VS Code Insiders, Cursor, Windsurf,
Zed, and Sublime Text; there are no custom commands. Preference persistence is
independent of theme settings and does not launch an editor.
Launchers use separate executable/argument values, macOS application fallbacks,
and direct Electron CLI invocation on Windows rather than `.cmd` shell execution.
Missing editors report remediation; an optional launch failure never deletes a
successfully created app. Explicit legacy VS Code actions remain compatible.
Completing an offscreen handoff never changes the selected file. Launch errors
remain associated with their file when navigating between previews.
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
Studio does not insert a separate workspace dashboard. **Observe → App Map** has one
customer-oriented request-flow architecture view. Discovered
paths move left to right through Experience, Reasoning, Models & capabilities,
and Connected systems, with observability shown as a cross-cutting operations
plane. Disconnected implementations are not mixed into the request path.
**Show other resources** reveals them in a labeled
region of the same map, retaining their source-backed relationships and
inspection actions. Its default is off, with the choice remembered per app in
the current browser origin. This does not classify resources as unused at runtime:
stopped services remain in discovered paths, and uncertain links remain uncertain.

Source-owned workflow operations and events are collapsed into their workflow
project by default. Explicit containment wins; otherwise a unique matching
workflow source root establishes ownership. Ambiguous ownership stays ungrouped.
Expanding a workflow opens a named internal-items region with at most two
columns, spacious call gutters, and source filenames rather than repeated
project paths. Collapse restores the pre-expansion camera. This explicit map
navigation is distinct from opening or resizing an inspector, which stays
camera-stable. Containment arrows are replaced by grouping; internal call labels
appear on hover, focus, or selection. Collapsed boundary calls project to the
owning workflow and equivalent edges share a visible connection while keeping
each original relationship and its evidence inspectable. Different confidence
or documentation/source evidence is not combined. Search can find the owner by
an internal item's name; Inspect can reveal an internal item directly.

The map uses directional evidence-backed edges, pan and zoom controls, search,
and tier filters. A floating palette keeps zoom and fit directly accessible;
search, filters, other-resource visibility, and reset are grouped under
**Search & layout**. These controls occupy map space only, not an extra header
row. Overall runtime state remains visible beside
the app name as **Not running**, **Local preview**, **Running locally**, or the
current lifecycle transition. A persistent adjacent action starts or stops the
local runtime and routes missing prerequisites into **Run/Debug**. Each
request-flow stage exposes a contextual **Add component** action. Single-tier locations open
their setup directly; multi-tier locations narrow the chooser to valid
component types. **Connect** controls between adjacent stages list existing
evidence-backed relationships, collect an explicit source and destination, and
show a confirmation before delegating source/configuration work to the app's
persisted child session. The deterministic Request flow layout is
not draggable because its position communicates architectural meaning. Revealing
other resources extends the map without moving the request-path cards or
changing source. Filtering out the inspected node or connection closes its
inspector rather than leaving a hidden selection active.

Selecting a node opens its details and highlights only its immediate graph
neighborhood. Clicking the selected node again, clicking empty map space, or
pressing Escape returns to the map without changing Guide visibility. Selecting a
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

The **Observe → Logs** view combines bounded, redacted local service tails with
service/stream selectors, text search, pause/resume, and explicit refresh.
Runtime component cards and inspectors open this same workspace with the
component's service selected; the Logs tab starts with all services,
including registered supporting services without map cards. Sources resolve
from the authorized app root and registered service identity, never a
caller-provided file path. Output stays grouped by service and stream because
untimestamped lines cannot establish a global chronological order. Automatic
refresh runs only while Logs is active and unpaused. Navigation cancels pending
reads and discards stale responses. Service tails remain separate from lifecycle
command history. Missing capture, partial read failures, and truncation remain
visible rather than implying a healthy service or an empty cloud log.

`control-styles.mjs` owns the shared action-button and single-line field
metrics used by Build, Run, Logs, and inspector actions: 32px controls,
12px text, 6px corners, and consistent padding. Navigation, icon-only controls,
and text links retain their distinct roles. Inspector actions sit in a wrapping
row below the source path, not inline with source metadata. Logs scopes its
heading, metadata, message, and output typography so generic inspector rules
cannot override its compact presentation; muted text uses the shared theme token.

Each request-flow stage exposes an **Add component** handoff. A specialist studio can manage
existing or provisioned resources. Requesting a new source capability requires
an explicit second confirmation, delegates to the existing capability workflow,
and does not provision or deploy Azure resources. The new card appears only
after refreshed source discovery produces evidence for it.

The expanded map's default side panel is **Guide**, not an
infrastructure dashboard. It translates the current graph into a progressive
**Build → Connect → Run → Observe & manage** journey, presents runtime as the
immediate action, and shows one evidence-backed improvement at a time. Later
suggestions remain collapsed. The journey is a vertical progress view, not a
second workspace navigator: explanatory text stays visible, connected nodes communicate order,
and only the current stage is highlighted. Its matching **Next action** card
appears immediately below the stepper; unavailable runtime work and later
improvements do not compete with that action. For example, an agent without a
gateway gets model-connection guidance before it can run. Once running, the
current step is Observe & manage with a direct map/log inspection action;
uncertain references and missing telemetry remain separate review/improvement
items, not prerequisites for observing the app. Local readiness and lifecycle
state update progress through the
existing APIs, including the stricter gateway validation introduced by later
Studio changes.

Recommendations are deterministic and recomputed from a fresh trace. Runtime
progress updates automatically. Work delegated to another session does not
directly mutate the graph, so its completion screen offers **Check for changes**
to retrace the app. This is the first progressive-guidance layer; future history
or preference signals may refine ranking but must not weaken evidence requirements.

Guide has a single expand/collapse control in its own heading, available in
both the expanded panel and compact status rail. At narrow widths Guide starts
collapsed and can be opened as an overlay, dismissed using the toggle or Escape.
The Connect explanation retains its explicit connection-review action.
Guide visibility remains
independent of the selected workspace and component.

**Run/Debug** is a focused run/test surface, not an embedded IDE or debugger.
The main area contains state-specific startup/recovery guidance, an available
web-app action, **Invoke agent**, and its readable result. The connected model
summary links directly to Settings. Native **Services**, **Diagnostics**, and
**Deploy to Azure** disclosures preserve the full existing feature set without
competing with the primary task. They retain expansion across polling and
workspace switches. Starting, failing, provisioning, and deploying reveal
diagnostics without stealing focus; failure counts and read errors remain visible
when collapsed. Deeper investigation uses the existing Observe logs workspace,
not another custom log console. There is no resizable diagnostics dock.
An optional document disclosure appears beside the message when readiness advertises
document support. File reading, pasted-text limits, removal, and in-flight state
are shared by Invoke agent and Test enforcement; Build links to this single Run
surface rather than maintaining a separate test form. Document and message drafts
remain in panel memory across polling and mode switches, never in command history.
Actual command/HTTP
activity (bounded, redacted before storage, with status and timing) is the sole
Diagnostics operations list; separate command-example and troubleshooting cards are omitted. A scoped
`run-panel-styles.mjs` uses Studio-owned colors, compact forms, quiet dividers,
and readable response typography without changing the App Map. Agent answers are separate from raw
responses. Source-discovered Hosted Skills and sandbox implementations are not
presented as successful tool calls; only response-reported tool evidence is shown.
The persistent runtime badge opens this panel
directly, and starting an operation keeps the run panel visible.
The top-right Settings gear opens a native modal with appearance and app-scoped
model connection, local ports, and a separated Danger zone. Focus stays in the
dialog and returns to its trigger on close/Escape; underlying drafts remain intact.
Appearance persists at Studio scope; app operations use the current app root.
Opening Settings does not configure models or perform destructive actions.
Deleting the local worktree requires a separate confirmation, a stopped app, and
known lifecycle state; errors remain in the modal. Azure resources and source
repositories are not deleted. Landing Settings contains appearance only.
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
Explicit Connect/Apply receives the selected model and validates it before the
Run summary reports the connection. Creation remains an explicit specialist
action. Source projects without managed endpoints appear in Components & endpoints
as Source only, with Review source, and do not affect readiness. Azure deployment
remains a secondary disclosure; deletion lives only in app Settings, not Run.
Home returns to the landing screen, and Guide, Run/Debug, and
Search & layout use a colored active state. The
bottom details panel is pointer- and keyboard-resizable at all viewport widths,
with its per-app height stored locally.

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
