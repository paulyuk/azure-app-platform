# Unity Studio

Opening the canvas plays the bundled, muted 12-second Unity logo animation.
The intro always uses a black background, independent of the saved appearance,
with only a small floating **Skip** button and no footer. Skip is available
immediately; Escape also skips it. Finishing or skipping the intro reveals the
start page in the user's selected light or dark theme without changing the saved
preference, using the same transparent Unity symbol as the workspace header
and the **Unity — The self-aware app platform** branding. Returning Home or
reloading the page does not replay the intro; opening the canvas again does.
Reduced-motion preferences bypass playback. If autoplay is blocked or the video
fails or stalls, Studio opens the start page with an explanatory notice.
The PNG and MP4 ship with the plugin and are served locally, with no CDN,
Downloads-folder dependency, or additional install step.

The start page shows the large Unity logo and tagline only; the compact header
branding appears on inner screens instead. Docs and the appearance toggle remain
available at the top right on every screen.

The workspace uses one compact top bar for the Unity logo/home navigation,
app name, runtime status and start/stop, workspace buttons, **Docs**, and the
light/dark toggle. Docs and appearance remain at the top right at every width.
At narrower widths, all three workspace buttons move together to a second row;
on the smallest canvases, app identity and runtime controls occupy a third row.
Long app names truncate rather than displacing controls. Studio defaults to light; the saved appearance applies
to the landing page and all workspaces, including after a provider restart.
This user-level preference lives under
`$COPILOT_HOME/extensions/unity-studio/artifacts/preferences.json`
(`~/.copilot` when `COPILOT_HOME` is unset), not in app source.

Unity Studio is the guided app builder for the generic nine-tier Unity platform
pattern. Its landing page keeps three equally styled, neutral journey cards visible:

1. **Create a new app** — choose the editable **Empty Unity app**, the headless
   **Sandbox & Gateway (Minimal)** template, or the complete **Dealer sample**,
   customize the supported inputs, review the deterministic materialization
   plan, and create the app in an isolated worktree.
2. **Open an app** — rediscover apps persisted as repository/worktree
   pairs, then open their workspace to build, run, inspect request flow and implementation inventory,
   source, runtime, or specialist studios. This is the local persistence
   mechanism until Unity apps register with a control plane.
3. **Assemble existing pieces** — explicitly map capabilities to source projects
   and, optionally, compatible Azure resources.

The canvas does not scan on launch. Source and Azure discovery happen only when
the selected journey needs them. Workspace requests preload relevant specialist
studios and may open the resulting worktree in the user's selected code editor.

After creation or selection, the app workspace becomes the primary interface.
The Unity logo and **Unity Studio** text link home; there is no separate Home button.
An optional editor launch failure does not roll back the new worktree; the workspace
opens with a clear warning so the user can continue.
The main buttons are **Build → Run & Debug → Observe**, with a filled selected
state marking the current workspace. Build opens first. Observe contains **App Map** and
**Logs** views and remembers the last one used during the current visit.
Build starts directly with customization areas and one focused editor, without a duplicate
Build/Run/Map toolbar. Use the top-level **Run & Debug** or **Observe → App Map**
navigation. The Guide's Build action opens the general map with a dismissible
hint highlighting the existing add-component and connection controls; it does
not select a component based on the current file. Connect retains its source
review and offers **Edit connections on App Map**. These entry points do not
change files, start the app, or discard inline drafts.
Every workspace remains accessible regardless of readiness: this is not a
locked wizard. The two Observe views use a compact, outlined switcher with
map/log icons, a filled selected state, and keyboard tab navigation.
Each view fills the workspace rather than sharing it
with an always-visible map. Guide owns workflow progress and the next useful
action, independently of the active workspace. Its inline toggle collapses the panel
to a 46px status rail at the far right instead of disappearing.
The toggle stays at the same top-right position in both states, including
when the expanded Guide overlays a narrow workspace.
The rail retains Build, Connect, Run, and Observe icons with checkmarks,
attention indicators, and descriptive tooltips. Selecting an icon expands
Guide at that stage's explanation without changing workspaces.
There is no separate Guide button in the top navigation;
switching views never reopens Guide or discards editor/message drafts.
Guide visibility is remembered per app in the current browser origin.
On narrow screens it starts collapsed and opens as a dismissible overlay.
A persistent badge beside the app name distinguishes
**Not running**, **Local preview**, **Running locally**, and active lifecycle
transitions; selecting it opens the local runtime controls. A neighboring
contextual action starts the app or preview, stops a running app, or opens
required setup. Each request-flow stage exposes a
contextual **Add component** action. Adjacent request-flow stages expose
**Connect** actions that list discovered relationships, require source and
destination selection, and review the source-backed change before delegating
implementation to the app session. Compact tier illustrations on each component
card make the architecture easier to scan without replacing source-derived names,
badges, or status. Guide stays focused on progress and one required action at a
time.
Additional recommendations are collapsed. **Observe → App Map** has one request-flow
map. Once the app is running, Guide marks Run complete and makes
**Observe & manage** current. **Open App Map** is offered from the other main
workspaces, not when the map or its inspector is already visible. Clicking
**Connect** opens a read-only connection review in the bottom inspector, with
source locations, possible destinations, and actions to inspect affected
components or resolve missing connections.
Uncertain source connections remain review items, not a gate on observing a
live app. Starting, stopping, failures, and previews retain explicit runtime
context; this does not claim full telemetry coverage or a successful agent test.
**Show other resources** reveals disconnected resources in a separate region
of that same map; it starts off and is remembered
per app in the current browser origin. This is a source-derived distinction,
not a claim that those resources are unused in production. Stopped services stay
on discovered request paths, and documentation-only links retain their uncertainty.
Workflow operations and events are grouped under their source-backed owning
workflow. **Show internal items** expands them into a separate, named region;
collapse returns to the overview. Cross-boundary calls connect to the workflow
while collapsed, with duplicate connections grouped without losing their source
evidence. Containment is conveyed by the group, not a fan of redundant arrows.
Search also matches collapsed internal items through their owner. Ambiguous
ownership stays ungrouped rather than assigning an operation speculatively.
Map controls float at the top right of the map rather than occupying
another header row or competing with the bottom inspector.
The compact palette exposes zoom and **Fit map**; **Search & layout** opens
downward with search, component/request-path filters, **Show other resources**,
and reset.
Wheel and trackpad gestures
zoom smoothly anywhere over the map surface. **Run/Debug** leads with
model connection, followed by local runtime controls, command activity,
Azure deployment, and deletion. Map inspection opens a separate resizable
bottom details panel, keeping the map's full width beside Guide. Drag the
horizontal divider or use its Up/Down keys to resize it; **Close details** or
Escape dismisses it without changing Guide. The inspector's height is
remembered and bounded to leave the map visible, including in compact panes.
New inspector content starts at the top. Opening, closing, or resizing the
inspector does not pan or zoom the map; use the map controls to adjust the view.
Live stdout/stderr, component readiness,
endpoint buttons, and **Invoke agent** are expanded in the run loop.
**Observe → Logs** is a dedicated view for all captured local service output, including
registered supporting services such as Azurite. Runtime component cards and their
inspectors open the same workspace with that service selected. Service and stream
filters, text search, **Pause**, **Resume**, and **Refresh** narrow a bounded recent
tail. Output is grouped by service and stream, not presented as a fabricated
global timeline. Automatic reads stop when paused or when you leave Logs.
Missing capture, partial read errors, and truncation are explicit. Lifecycle
command history remains in Run/Debug; Logs does not substitute command output
for missing service logs or fetch cloud logs.
Reads are bounded to 24 services, 1,200 lines, and 256 KiB across the response,
with at most 80 catalog entries; clipping is disclosed in the view.
Build, Run, Logs, and inspector actions share compact 32px controls with the same
typography, padding, and corner radius. Inspector actions form a wrapping row
below the source path; Logs uses the same field sizing, heading hierarchy,
muted metadata, and service-panel treatment as the other workspaces.
New Minimal, Empty, and Dealer apps automatically receive available ports during
creation, before the child session or code editor opens. The allocator excludes live
listeners and saved assignments in sibling worktrees, then persists the new app's
`.unity-studio/ports.env`. It does not stop or reassign existing apps.

**Local ports** provides **Pick available ports** while the app is stopped.
It checks live IPv4/IPv6 listeners and other discovered apps' assignments, then
saves `.unity-studio/ports.env`. Run, readiness, endpoint links, and both
POSIX/PowerShell startup scripts use those same assignments. This is supported
by the Empty Unity app, Sandbox & Gateway template, and materialized Dealer
sample; older or custom scripts must implement the port-loading contract first.
Ports are not permanently reserved: startup still checks for conflicts.
**Stop apps using these ports** reviews listener PIDs, executables, and ports
before **Confirm stop**. Only the selected app's port owners and their children
are targeted, including known launchers from other workspaces. This is not a
machine-wide stop command. Reviews expire after one minute and reject changed
process identities; Studio and its host ancestors are protected. The operation
verifies that ports remain free and reports permission errors or respawning apps.
**AI model connection** is the first card, collapsed to model/gateway and a
Connected badge after validation. Run/Debug uses the Functions Hosted Skills
Studio visual treatment: soft panels, compact headers and status chips, consistent
form controls, and themed code blocks. Styles are isolated from the App Map.
**Commands** shows actual Azure discovery, lifecycle shell commands, and agent
HTTP calls with running/succeeded/failed status and elapsed time. Its latest 60
records survive a canvas reload; credentials are redacted before storage and
agent message bodies are excluded. There is no separate command-example or
troubleshooting card. The agent's
readable answer and raw response are separate, and **Hosted Skills & tools**
distinguishes source-discovered implementations from tool calls reported in the
last response; a reported call alone is not proof of successful execution.
**Home** returns to the landing screen. The active main view is highlighted
independently from Guide visibility; Search & layout does not change that view.
**Open app** lists the most recently opened apps first and shows their last-opened
date and time in the browser's local timezone. Opening an App Map records its
timestamp in `.unity-studio/last-opened.json`, separately from app identity and
runtime settings. Apps without recorded history appear last, labeled Not recorded;
inventory and readiness polling do not change the timestamp.
Missing tiers are scaffoldable rather than inferred from the platform catalog.

**Build** selects artifacts from the app's own source and `unity.app.yaml` scope,
not one universal template checklist. Its left navigation presents only supported
customization areas backed by available source: **Agent behavior**, **Tools &
contracts**, **Runtime**, and **Policies & limits**. Agent behavior appears first
when available. Each area is a heading with its relevant files listed directly
underneath in **Customize**. Click a file to open it; the selected row is
highlighted, with parent paths distinguishing repeated filenames. There is no
file dropdown in the editor pane. Files show their own unsaved, saving, and
save-failure indicators, and headings aggregate those states.

Dealer exposes its inline instructions in `src/agent/main.py`, actual Hosted
Skills, and app settings. Empty Unity exposes its prompt, declared skill, and
runtime configuration, not its HTTP-server boilerplate. Inline instructions stay
in the original source file; a recognized declaration supplies the initial editor
position. Web implementation files, package manifests, container build files, and
other general source remain outside this focused UI. The existing scoped catalog
and read/open/save authorization are unchanged. Custom component paths reuse App
Map discovery. Unsupported areas are omitted, not shown as missing features.
An app with no supported customization points gets an explicit explanation and
an **Open in &lt;editor&gt;** workspace handoff.
The editor highlights source using its filename: Python, JavaScript/TypeScript
(including JSX/TSX), JSON, YAML, Markdown, Dockerfiles, and other supported source
languages. Unknown extensions stay plain text. Highlighting follows the Studio
theme, keeps native text selection and input, and never adds markup to saved files.
Normal editing includes a synchronized, noninteractive 1-based line-number
gutter, including the final blank line when the source ends with a newline. It
tracks edits, vertical scrolling, font metrics, and additional digits without
replacing or intercepting the native textarea. Long lines scroll horizontally
inside the editor without moving the gutter or widening the Build pane;
high-contrast mode and active IME composition use readable native text. A
tokenizer failure reports the problem and keeps plain-text editing available.
The customization navigation has a right-aligned icon-only collapse control with a tooltip and accessible
label, plus a draggable, keyboard-accessible divider with a centered grip.
Resizing and collapsing do not replace the
selected editor or discard drafts. Below 600px of available pane width, the
customization navigation replaces the editor rather than squeezing beside the Guide.
When closed, a thin 40px rail remains visible; its customization icon reopens the
navigation without floating over the editor or reserving an extra row above it.
Use the compact editor split button in Build: click the editor name to open the
file, or its chevron to choose an editor. The picker retains native keyboard
navigation and a visible focus outline. Both halves share hover and disabled
styling. A **Code editor** field is also available
when reviewing a new app. Supported choices are **VS Code**,
**VS Code Insiders**, **Cursor**, **Windsurf**, **Zed**, or **Sublime Text**.
The preference is saved per user in `editor-preferences.json`, independently of
appearance settings, and is shared by Build, App Map source actions, and app
creation. Custom executable paths and commands are not supported.
The chosen editor must already be installed, with its CLI available where
required; Studio reports launch failures rather than opening another editor.
Every available file has an editable source area and an **Open in &lt;editor&gt;**
button. It opens the whole app worktree and the selected
file together; it never silently saves an inline draft. Returning from the editor
refreshes saved files while preserving inline drafts and blocking stale overwrites.
Inline edits require **Review changes → Save reviewed changes**. Review temporarily
hides but retains the native textarea and opens a **read-only unified diff** of
the draft against the saved file, not Git HEAD. It shows addition/deletion
totals, old/new line numbers, explicit `-`/`+` markers, red removed lines, green
proposed lines, and three lines of context around changes. Gaps identify omitted
unchanged lines. Git's missing-final-newline notices and CRLF-to-LF normalization
remain visible; long lines scroll inside the review rather than widening Build.
**Back to editing** restores the same textarea, draft, selection, and scrolling.
Git produces the server-authorized comparison without staging or changing app files.
Failed, stale, or invalid comparisons cannot enable Save. A save failure retains
the draft and disables Save; return to editing and review again before retrying.

This deliberately stays smaller than an embedded IDE: general file exploration,
editable diff review, and per-hunk editing are deferred. Broader implementation
work belongs in the selected external editor.

Saves reject stale versions and require the app to be stopped. Saving snapshots
the approved content and hash before the request; typing can continue during a
pending save after returning to editing. Those newer edits remain unsaved and are
rebased onto the returned saved version when the save completes. Drafts survive
switching between customization areas/files and between Build and Run/Debug in
the same panel. Area/file selection and navigation width/visibility survive
in-panel refreshes. A point that disappears while it has a draft remains available
read-only so the draft can be copied before discarding it. Completing a save for another
file never changes the current selection; its outcome remains available when
that file is selected again.
Leaving Build invalidates pending review checks before another workspace is rendered.

Syntax highlighting ships as a licensed bundle in
`vendor/prism.mjs`; the static review needs no editor runtime. Installing or enabling the
plugin never runs `npm install`, restores dependencies, or fetches browser code
from a CDN. To update highlighting, maintainers change the pinned Prism
development dependency and lockfile, then regenerate and commit the shipped
files. These maintainer commands work in PowerShell and
macOS/Linux shells:

```shell
npm ci --prefix canvases/unity-studio
npm run vendor:syntax --prefix canvases/unity-studio
```

**Known discovery limitation (for design discussion):** this is best-effort
recognition, not a universal file catalog or language-aware parser. Component
directories can be arbitrary when mapped in `unity.app.yaml`, but Build selects
known per-tier filenames and source files matched by existing framework/code
patterns. A manifest path alone does not enumerate every file or identify its
role. Unfamiliar frameworks, filenames, external prompt/configuration storage,
or dynamically loaded implementations can be missed. Scans are also bounded
and skip dependencies, generated output, known `.env`/`local.settings.json`
files, and test files.
The document-processing profile still recognizes its specific canonical and
legacy layouts. "Not discovered" must not be interpreted as "not implemented."

**Discussion with Paul:** should an app explicitly declare Build artifacts
(path, role, component, editor/validation type), with discovery used only as a
fallback? That would make custom-app coverage deterministic while preserving
app-root authorization and reviewed-save protections. This explicit-artifact
contract is a proposed direction, not an implemented capability.

Generated browser snapshots, Playwright reports, test results, and local runtime
state are excluded from source discovery. Captured UI text must not create
phantom components or make a real connection appear ambiguous. The map is
source-derived and remains connected when the app is stopped.

The document-processing app retains its instruction, validation-tool, contract,
policy, and runtime cards, including the legacy tool layout. Only this app
profile gets document-test actions and the ACA sandbox runtime selector.
Genuinely missing expected files are labeled as missing files, not as proof that
a capability is unimplemented. An unrelated `config/runtime.json` does not enable
document input or block deployment of Dealer, Empty, or custom apps.

For document-processing apps, the document contract and operator-owned policy are editable by the developer,
not the runtime model. JSON syntax is checked when saving from the canvas;
Python runtime validation remains authoritative.
The running agent must not receive a tool for changing either policy or tool
code. Developer changes require source review, enforcement tests, and rebuilding
cloud images; agent instructions are not an enforcement mechanism.
`src/policy/enforcement.py` loads policy JSON through Python's `json` module
and applies mandatory checks. The document validation tool reads contract limits and
extensions and validates requests explicitly; the agent harness independently validates
results. The contract's `$defs` describe schemas but are not automatically
executed by a JSON Schema validation library. Changing a schema definition alone
does not rewrite the corresponding Python validation.
**Test enforcement** sends a text/Markdown document to the tool-only endpoint
without calling a model. Both it and **Invoke agent** use the message and optional
document together in **Run/Debug**. Choose a `.txt`/`.md` file up to 64 KiB,
paste text, or remove the document to send only a message. Invalid files and
oversized UTF-8 text are reported before sending; there is no PDF/Word extraction.
Document input appears only for document-capable agents. Drafts survive readiness
polling and switching between Build and Run in the same panel, but are not saved
to disk. Build's **Test with a document** links directly to this shared Run input.
These HTTP operations appear in Commands without document payloads.
Local processing is explicitly a subprocess simulation, not an isolation
boundary. The optional Copilot SDK runtime selects a separate ACA agent sandbox
and document sandbox; selecting it does not prove cloud deployment or isolation.
Whole-app `azd` actions are blocked for this document POC to prevent inherited
Dealer deployment manifests from provisioning unrelated services.

**Components & endpoints** also lists source-discovered runtime projects with no
declared endpoint as **Source only**, with **Review source**. They are not counted
as required services or presented as running. A root `unity.app.yaml` scopes the
App Map, tools, and component inventory to its declared capability paths. Older
apps may still contain inherited Dealer files, but those files are neither shown
as app components nor deleted. Adding a capability must update the manifest.
Repositories without a root inventory retain broad source discovery.

Model connection discovers the saved/current Azure subscription and gateway
models across providers, not a hardcoded provider called `foundry`. New
connections skip empty gateways when choosing a default. Existing bindings are
preserved, while an empty gateway explains how to select another or create a
model in AI Gateway Studio. The selected model is passed to both POSIX and
PowerShell configuration scripts before they validate a Responses call.
Subscription, gateway, and model selections remain visible until validation
succeeds, then collapse into the active model/gateway summary. Refresh preserves
valid choices, coalesces duplicate requests, and rejects stale discovery results.
Configuration failures remain visible instead of leaving a busy indicator.

These interaction patterns are grounded in
[Functions Hosted Skills Studio](https://github.com/coreai-microsoft/canvases-cloud-foundation/tree/28664edc74095bfadbb7ffb751844d2febf688b1/canvases/intelligent-function-app-studio):
generation-guarded Azure selection, actual command activity, and a readable
agent digest. Unity keeps its own app orchestration and source-based tool evidence.

The App Map exposes deterministic lifecycle actions: **Run locally** and **Stop
local app** invoke the checked-in `dev-start`/`dev-stop` shell scripts
(or their `.ps1` equivalents on Windows), while **Provision
with azd** and **Deploy with azd up** run the corresponding commands in the app
worktree. Cloud actions are explicit and mutate Azure; review the selected
subscription and `azure.yaml` before using them.

Each created app persists a runtime profile in `.unity-studio/app.json`.
The profile defines the exact start arguments, expected entrypoints, and all
reserved ports. This lets an empty app run without cloud credentials and lets
the Dealer sample use a credential-free preview without mistaking another
worktree's listeners for its own services.

## First-class templates

For the Minimal template's complete file tree, token conventions, and generation
contract, see the [maintainer guide](MINIMAL-TEMPLATE.md).

For a finished output to compare with the template, see
[`samples/docagent/`](samples/docagent/README.md). The peer
[`samples/`](samples/README.md) directory contains a source-only snapshot of
the completed loan-document app, not another template.

- **Empty Unity app** is a versioned local template with web, agent, gateway,
  editable domain configuration, editable agent instructions, and exactly one
  intentionally empty Hosted Skill. It includes whole-app `dev-start` and
  `dev-stop` scripts and never asks a model to invent tools.
- **Sandbox & Gateway (Minimal)** is a versioned local template with the
  headless Minimal Building Blocks from the [Sandbox & Gateway
  pattern](../../docs/sandbox-gateway-pattern.md): an agent and its Python harness
  at `src/agent/`, a document validation tool at `src/tools/document-validation/`,
  and a remote model through AI Gateway. The tool returns bounded, sanitized
  text, not verified facts or comprehensively de-identified data.
  Local subprocess simulation is the default; separate ACA sandboxes for the
  Copilot SDK agent and document validation tool are optional. It
  has no web or Hosted Skill capability and a single `dev-start`/`dev-stop`
  entrypoint (`src/agent`). Try the focused
  [loan application document demo](./templates/sandbox-gateway-minimal/docs/demos/loan-application/README.md),
  which ships in every generated app alongside its how-it-works guide and
  synthetic input. The template stays reusable; loan-specific guidance applies
  only when processing a loan application.
- **Dealer sample** is the complete nine-capability reference application. Unity
  Studio selects the newest eligible pinned commit containing the web app,
  agent manifest, and whole-app lifecycle scripts, then extracts that entire
  commit into the destination instead of copying scanner matches piecemeal. Its
  archived lifecycle scripts and agent port wiring are upgraded from packaged,
  version-checked Dealer assets before port allocation, so older pinned samples
  receive the same local-port behavior without regenerating the application.
  Unsupported source layouts fail with a descriptive compatibility error.
  Its
  credential-free experience starts with
  `./scripts/dev-start.sh --skip-skills --skip-agent`; the full stack uses
  `./scripts/dev-start.sh` after worktree-local Azure settings are supplied.

`template-materializer.mjs` owns initial files for all local templates. The
model is not allowed to synthesize or manually copy them. New template worktrees
use `git worktree add --no-checkout`, so local templates start with only their own
files rather than an overlay on the Dealer app. Templates include their own
ignore rules for credentials, dependencies, and local runtime state.
For a complete Dealer sample, materialization copies the pinned archive, calls
`materializePortLoaders(destination)`, then calls
`prepareDealerPortOverrides(destination)` from
`dealer-port-materializer.mjs` before allocating ports. The helper validates
the known Dealer layout before replacing lifecycle scripts or adapting the
agent, so an unsupported pinned version is never partially upgraded.
Generation checks the Sandbox & Gateway catalog's full required-file list.
Scenario docs live inside the template as the single source of truth, and their
source links are rewritten to rendered files during materialization.
Existing apps are not regenerated or renamed: Build, **Open in &lt;editor&gt;**, and
document testing also support the earlier `src/sandbox/tool/` layout. New apps
use only `src/tools/document-validation/`; a partial new layout never silently
borrows a contract from the old folder.

See [DESIGN.md](./DESIGN.md) for the tier catalog, implementation inventory, action
semantics, safety boundaries, and tracing limitations.

## Dedicated studios

Unity Studio does not reimplement specialist experiences. `activate_tier`
checks canvases registered in the current session and directly opens or focuses
the preferred studio through `session.rpc.canvas.open()` with a stable instance
ID and tier context.

Current preferred studios include:

| Unity tier | Dedicated canvas | Purpose |
|---|---|---|
| Agent and gateway | `ai-gateway-studio` | Inspect governed model access and Foundry agent workflows |
| Skills | `intelligent-function-app-studio` | Work with hosted skills on Azure Functions |
| Self-awareness / SRE | `sre-agent-studio` | Operate SRE Agent investigations, incidents, memory, and workflows |

If no preferred studio is registered, the action returns discovered implementations
or a structured, non-mutating scaffold recipe. It does not claim availability
from static metadata. Candidate results identify what was found and replace the
discovery action with a concrete next step; Gateway candidates route directly
to the AI Gateway selector instead of repeating discovery.

## Actions

- `list_source_roots` inventories source projects across the current and sibling
  Git worktrees. The guided assembler can authorize an additional local folder
  for the current canvas instance.
- `discover_platform` inventories tier implementations from source projects and
  optional read-only Azure inventory in the active CLI subscription. Results
  include an implementation inventory grouped by tier.
- `request_app_workspace` validates a template or assembly request and resolves
  opaque source IDs immediately before execution. Template requests create a Git
  worktree, hydrate the pinned template, and optionally open a named child
  session through session RPC and launch the selected editor—without sending a creation
  prompt to chat. Older hosts without child-session RPC still receive the
  usable materialized worktree. Assemblies still use a structured model handoff
  because integrating independently built projects requires semantic decisions.

The exact materializer owns known template files. Model reasoning is reserved
for semantic domain rewrites, user-defined tool contracts, integrating
independently built source projects, adding non-template capabilities, and
troubleshooting—not known-file creation.
- `build_capability` adds or improves one tier in the current app worktree,
  updates `unity.app.yaml`, wires it to adjacent tiers, and runs focused tests.
  Add-to-app requests resolve or create the app's persisted child session and
  direct the parent agent to relay the implementation there, so source changes
  occur in the selected app rather than the Unity Studio worktree.
- App Map connection requests follow the same persisted app-session boundary.
  They validate portable component paths, distinguish new from already-discovered
  relationships, and require confirmation before requesting source/configuration
  changes and an updated `unity.app.yaml`.
- `open_in_editor` opens a workspace-confined source path in the saved supported
  editor, or an explicit supported `editorId`. `request_app_workspace` accepts
  `openInEditor` and an optional supported `editorId`.
- `open_in_vscode` and the legacy `openInVsCode` request option retain their
  explicit VS Code behavior for existing integrations.
- `activate_tier` opens a registered preferred studio, returns implementations to
  inspect, or returns a scaffold recipe when no implementation is observed.
- `trace_app` derives a generic App Map whose nodes and edges retain matched
  source locations, unresolved references, and diagnostics. Open its expanded
  Browser canvas to see a left-to-right **Request flow** across the experience,
  reasoning, models and capabilities, connected systems, and cross-cutting
  operations. Discovered request paths are shown by default; **Show other
  resources** reveals disconnected components and workflow internals without
  switching to a different map or moving the request-path cards.
  Search or filter nodes, inspect connection evidence, highlight one-hop
  relationships, and open safe navigation actions with one click. Click the
  selected card again or click empty map space to return to the Guide.
  A request-flow stage's **Add component** action can open its specialist studio or
  explicitly request a new source capability without provisioning Azure.
  **Connect** controls between adjacent stages expose existing evidence and a
  confirmation-gated path to create or improve real source wiring.
  The default **Guide** turns current app evidence into a progressive
  **Build → Connect → Run → Observe & manage** journey. It prioritizes missing
  foundations, uncertain connections, local readiness, and observability while
  keeping later suggestions collapsed.
- `run_doctor` remains a compatibility action backed by discovery probes; it
  reports repository and Azure discovery health rather than simulated platform
  status.

After local startup, the App Map derives component status from lifecycle state.
If Unity Studio reloads while the app is still live, its process registry or
root-owned web and agent listeners recover the running state even when the
in-memory launcher record is gone. Listeners from another app are not attributed
to the selected worktree. Run is idempotent and will not restart an
already-running or partially starting app.
While startup is active, Guide shows how many local services are ready instead
of presenting an indefinite spinner or generic in-progress message.
Detached lifecycle and configuration commands write to a private
`unity-studio-command-logs` directory under the system temporary directory, so
closing Studio does not terminate the operation or discard its diagnostics.
Ready endpoint URLs are actionable: the web surface opens in
the Browser canvas, Hosted Skill buttons open their MCP endpoints, and the
running agent offers **Invoke agent** with a message directly under
**Run/Debug → Local runtime**, plus a specialist-studio handoff. Invocation
uses the app's supported source-backed HTTP contract, not a guessed endpoint.
Command output refreshes continuously while this panel is open. TCP-only
services are labeled Listening, not Healthy; web/agent/Functions HTTP checks
report their actual health, and all expected services must be ready before
the app is considered running.
Hosted Skills retain their Functions health checks and MCP links after port
reassignment. Runtime profiles can declare `kind: "function"` (or `type: "function"`)
for custom-named Functions endpoints; existing Dealer skill names
remain compatible without metadata.

**Cancel startup** stays available in the header and Run/Debug while services
are starting. It terminates the tracked startup command before running cleanup,
so the launcher cannot continue starting services afterward. If the launcher is
already gone but components remain, the header shows **Partial startup** with
**Stop partial startup**, rather than an indefinitely disabled Starting button.

Model connection defaults to the saved subscription, or the active Azure CLI
subscription, and a valid gateway in that subscription. A new default selection
is validated and applied once while the app is stopped; failures stay visible
and require an explicit retry. The subscription and gateway remain editable,
and **Create or manage gateways** opens specialist setup if no gateway exists.
Once validated, the model connection card collapses to its model, gateway, and
subscription summary. No Azure resources are created automatically.

Discovery and scaffold results are informational. Workspace creation and
implementation happen in the app child session, not in the Unity Studio
worktree. Explicit gateway configuration retrieves the selected gateway key,
validates a real Responses request, and writes worktree-local agent settings;
the key is never returned to the browser.

## Run from this repository

The project wrapper at `.github/extensions/unity-studio/extension.mjs` imports
this extension. Reload extensions after checkout:

```text
extensions_reload
```

Then open the canvas with `canvasId` and stable `instanceId` set to
`unity-studio`.

## Marketplace plugin layout

The canvas also carries a plugin manifest and launcher skill under:

```text
.github/plugin/plugin.json
skills/unity-studio-canvas/SKILL.md
```

The manifest's `"extensions": "."` registers the installed payload directly.
Install and enable the plugin, then open Unity Studio: no manual `npm install`,
build, or bootstrap step is required. The host supplies the Copilot SDK. Runtime
modules and template assets ship inside this folder and resolve relative to
their module, not the user's working directory. Generated apps restore their
own dependencies through their separate setup/start flows.

If the canvas is unavailable, confirm the plugin is enabled, reload extensions,
and retry once. If it remains unavailable, inspect the extension log and repair
the installation; do not create a second copy under the user extensions folder.

Maintainers: run the dependency-free packaging smoke check with Node 24:

```shell
node --test canvases/unity-studio/plugin-portability.test.mjs
```

It copies only the plugin payload into a path containing spaces, excludes
`node_modules`, rejects non-bundled imports, opens the actual loopback UI from an
unrelated workspace, and materializes both local templates. Only the SDK host
registration boundary is stubbed; this does not replace testing actual plugin
installation in GitHub Copilot. CI runs it on Linux, macOS, and Windows.
Workspace authorization uses the canonical filesystem path, so aliases such as
Windows short paths do not reject the workspace itself. The smoke check also
exercises a noncanonical session path and verifies that parent directories and
unregistered subdirectories remain unauthorized.
