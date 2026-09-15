# Unity Studio

Unity Studio is the guided app builder for the generic nine-tier Unity platform
pattern. Its landing page keeps three journeys visible:

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
studios and may open the resulting worktree in VS Code.

After creation or selection, the app workspace becomes the primary interface.
An optional VS Code launch failure does not roll back the new worktree; the workspace
opens with a clear warning so the user can continue.
The top controls are **Build → Run/Debug → Observe/Map**, followed by an independent
**Guide** toggle. Build opens first. Each main view fills the workspace rather
than sharing it with an always-visible map. Guide is a compact vertical rail
on the far right, with workflow progress and the next useful action. Hide it
using its panel-collapse icon or the Guide toggle to reclaim the full width;
switching views never reopens it or discards editor/message drafts.
Guide visibility is remembered per app in the current browser origin.
On narrow screens it starts collapsed and opens as a dismissible overlay.
A persistent badge beside the app name distinguishes
**Not running**, **Local preview**, **Running locally**, and active lifecycle
transitions; selecting it opens the local runtime controls. A neighboring
contextual action starts the app or preview, stops a running app, or opens
required setup. Each request-flow stage and Implementation lane exposes a
contextual **Add component** action. Adjacent request-flow stages expose
**Connect** actions that list discovered relationships, require source and
destination selection, and review the source-backed change before delegating
implementation to the app session. Compact tier illustrations on each component
card make the architecture easier to scan without replacing source-derived names,
badges, or status. Guide stays focused on progress and one required action at a
time.
Additional recommendations are collapsed. In **Observe/Map**, **Request flow** and
**Implementation map** appear in a dedicated view bar, while search, filters, zoom,
and reset controls live under **Search & layout**. Wheel and trackpad gestures
zoom smoothly anywhere over the map surface. **Run/Debug** leads with
model connection, followed by local runtime controls, command activity,
Azure deployment, and deletion. Map inspection opens a separate resizable
details panel; **Back to Observe/Map** dismisses it without changing Guide.
Live stdout/stderr, component readiness,
endpoint buttons, and **Invoke agent** are expanded in the run loop.
New Minimal, Empty, and Dealer apps automatically receive available ports during
creation, before the child session or VS Code opens. The allocator excludes live
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

**Build** separates agent behavior from tool enforcement. Its cards identify the
exact instruction, document-tool, contract, policy, and runtime files. Every
available file has a compact editable source box and an **Edit in Code** button
with a VS Code icon. The button opens the whole app worktree and the selected
file together; it never silently saves an inline draft. Returning from Code
refreshes saved files while preserving inline drafts and blocking stale overwrites.
Inline edits require **Review changes → Save reviewed changes**; saves reject
stale versions and require the app to be stopped. Drafts survive switching between
Build and Run/Debug in the same panel.

The document contract and operator-owned policy are editable by the developer,
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
Existing apps are not regenerated or renamed: Build, **Edit in Code**, and
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
  session through session RPC and launch VS Code—without sending a creation
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
- `open_in_vscode` opens an explicitly selected, workspace-confined repository
  path in a new VS Code window.
- `activate_tier` opens a registered preferred studio, returns implementations to
  inspect, or returns a scaffold recipe when no implementation is observed.
- `trace_app` derives a generic App Map whose nodes and edges retain matched
  source locations, unresolved references, and diagnostics. Open its expanded
  Browser canvas to see a left-to-right **Request flow** across the experience,
  reasoning, models and capabilities, connected systems, and cross-cutting
  operations. Only evidence-backed paths are shown; disconnected components and
  workflow internals remain in the secondary **Implementation** tier view.
  Search or filter nodes, inspect connection evidence, highlight one-hop
  relationships, and open safe navigation actions with one click. Click the
  selected card again or click empty map space to return to the Guide.
  An Implementation tier's **Add** action can open its specialist studio or
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

When installed as a plugin, `bootstrap-extension.mjs` links the payload into the
user's Copilot extension directory without replacing an existing path.
