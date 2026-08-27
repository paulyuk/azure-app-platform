# Unity Studio

Unity Studio is the hub canvas for creating, extending, and inspecting
applications built with the generic nine-tier Unity platform pattern. It helps
builders:

- understand each tier's role and job to be done;
- inventory source projects and read-only active-subscription Azure resources;
- see implementations as tier cards with matched files and configuration;
- create a child project session in an isolated worktree with selected
  capabilities and relevant studios preloaded;
- add a discovered repository project or Azure resource to an app workspace;
- open a workspace-confined source project in VS Code;
- open registered dedicated studios directly; and
- trace a source-derived App Map without changing files or resources.

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

- `discover_platform` inventories tier implementations from source projects and
  optional read-only Azure inventory in the active CLI subscription. Results
  include an implementation inventory grouped by tier.
- `request_app_workspace` validates an app name, purpose, selected tiers, and
  optional discovered source project, then asks the foreground Copilot agent to use
  the app-native session API. The requested child session uses a new worktree,
  creates a `unity.app.yaml` capability inventory, implements a runnable local
  vertical slice with tests, and opens Unity Studio plus registered specialist
  canvases. The action reports a pending request; it does not claim that the
  worktree already exists.
- `build_capability` adds or improves one tier in the current app worktree,
  updates `unity.app.yaml`, wires it to adjacent tiers, and runs focused tests.
- `open_in_vscode` opens an explicitly selected, workspace-confined repository
  path in a new VS Code window.
- `activate_tier` opens a registered preferred studio, returns implementations to
  inspect, or returns a scaffold recipe when no implementation is observed.
- `trace_app` derives a generic App Map whose nodes and edges retain matched
  source locations, unresolved references, and diagnostics.
- `run_doctor` remains a compatibility action backed by discovery probes; it
  reports repository and Azure discovery health rather than simulated platform
  status.

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
