# Unity Studio

Unity Studio is the guided app builder for the generic nine-tier Unity platform
pattern. Its landing page keeps three journeys visible:

1. **Create a new app** — choose the editable **Empty Unity app** or the complete
   **Dealer sample**, customize the supported inputs, review the deterministic
   materialization plan, and create the app in an isolated worktree.
2. **Open an app** — rediscover apps persisted as repository/worktree
   pairs, then open their App Map to inspect request flow, implementation inventory,
   source, runtime, or specialist studios. This is the local persistence
   mechanism until Unity apps register with a control plane.
3. **Assemble existing pieces** — explicitly map capabilities to source projects
   and, optionally, compatible Azure resources.

The canvas does not scan on launch. Source and Azure discovery happen only when
the selected journey needs them. Workspace requests preload relevant specialist
studios and may open the resulting worktree in VS Code.

After creation or selection, the App Map becomes the primary app interface.
An optional VS Code launch failure does not roll back the new worktree; App Map
opens with a clear warning so the user can continue.
The default surface keeps **Guide**, **Run & manage**, and the request-flow diagram
visually primary. A persistent badge beside the app name distinguishes
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
Additional recommendations are collapsed. **Request flow** and **Implementation
map** remain visible in a dedicated view bar, while search, filters, zoom,
and reset controls live under **Search & layout**. **Run & manage** leads with
local runtime controls, followed by model connection, testing and
troubleshooting, Azure deployment, and deletion. Its desktop panel width is
adjustable and remembered per app; command output stays collapsed until opened.
Missing tiers are scaffoldable rather than inferred from the platform catalog.

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

- **Empty Unity app** is a versioned local template with web, agent, gateway,
  editable domain configuration, editable agent instructions, and exactly one
  intentionally empty Hosted Skill. It includes whole-app `dev-start` and
  `dev-stop` scripts and never asks a model to invent tools.
- **Dealer sample** is the complete nine-capability reference application. Unity
  Studio selects the newest eligible pinned commit containing the web app,
  agent manifest, and whole-app lifecycle scripts, then extracts that entire
  commit into the destination instead of copying scanner matches piecemeal. Its
  credential-free experience starts with
  `./scripts/dev-start.sh --skip-skills --skip-agent`; the full stack uses
  `./scripts/dev-start.sh` after worktree-local Azure settings are supplied.

`template-materializer.mjs` owns initial files for both templates. The model is
not allowed to synthesize or manually copy them.

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
running agent offers an inline Responses API prompt under **Run & manage → Test
& troubleshoot** plus a specialist-studio handoff. The same section preserves startup
and deployment command output for troubleshooting.

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
