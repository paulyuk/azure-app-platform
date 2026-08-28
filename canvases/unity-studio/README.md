# Unity Studio

Unity Studio is the guided app builder for the generic nine-tier Unity platform
pattern. Its landing page has three journeys:

1. **Create from template** — choose the editable **Empty Unity app** or the complete
   **Dealer sample**, customize the supported inputs, review the deterministic
   materialization plan, and create the app in an isolated worktree.
2. **Assemble from existing components** — add capabilities, explicitly map each one to a
   source project from a Git worktree or authorized local folder, optionally map
   compatible Azure resources, and create a portable assembled app.
3. **Open existing** — rediscover apps persisted as repository/worktree
   pairs, reopen one, inspect its inventory, open component source, or enter a
   specialist studio. This is the local persistence mechanism until Unity apps
   register with a control plane.

The canvas does not scan on launch. Source and Azure discovery happen only when
the selected journey needs them. Workspace requests preload relevant specialist
studios and may open the resulting worktree in VS Code.

After creation, Unity Studio immediately scans the new worktree and stays useful:
the app workspace view shows observed components by tier, source paths, evidence
files and confidence, plus counts and App Map statistics. Each source component
can be opened directly in VS Code, and each tier can be handed to its registered
specialist studio with the app worktree as context. Missing tiers are labeled as
scaffoldable rather than inferred from the platform catalog.

The app workspace also exposes deterministic lifecycle actions: **Run locally**
and **Stop local app** invoke the checked-in `dev-start`/`dev-stop` shell scripts
(or their `.ps1` equivalents on Windows), while **Provision
with azd** and **Deploy with azd up** run the corresponding commands in the app
worktree. Cloud actions are explicit and mutate Azure; review the selected
subscription and `azure.yaml` before using them.

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
from static metadata.

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
- `open_in_vscode` opens an explicitly selected, workspace-confined repository
  path in a new VS Code window.
- `activate_tier` opens a registered preferred studio, returns implementations to
  inspect, or returns a scaffold recipe when no implementation is observed.
- `trace_app` derives a generic App Map whose nodes and edges retain matched
  source locations, unresolved references, and diagnostics. Open its expanded
  Browser canvas to pan and zoom across tier swimlanes, search or filter nodes,
  reorder nodes within their evidence-derived tier, highlight one-hop
  relationships, and inspect evidence and safe navigation actions by
  double-clicking a node. A tier's **Add** action can open its specialist studio
  or explicitly request a new source capability without provisioning Azure.
- `run_doctor` remains a compatibility action backed by discovery probes; it
  reports repository and Azure discovery health rather than simulated platform
  status.

After local startup, the app workspace derives component status from the
lifecycle state. Ready endpoint URLs are actionable: the web surface opens in
the Browser canvas, Hosted Skill buttons open their MCP endpoints, and the
agent offers an inline Responses API prompt plus a specialist-studio handoff.

Discovery and scaffold results are informational. Workspace creation and
implementation happen in the child session, not in the source worktree. No
canvas action provisions Azure resources or retrieves secrets.

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
