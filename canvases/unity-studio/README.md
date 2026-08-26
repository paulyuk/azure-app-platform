# Unity Studio

Unity Studio is the hub canvas for creating, extending, and inspecting
applications built with the generic nine-tier Unity platform pattern. It helps
builders:

- understand each tier's role and job to be done;
- discover repository and read-only active-subscription Azure evidence;
- see eligible candidates as tier cards with confidence and source evidence;
- create a child project session in an isolated worktree with selected
  capabilities and relevant studios preloaded;
- add a discovered repository project or Azure resource to an app workspace;
- open a workspace-confined repository candidate in VS Code;
- open registered dedicated studios directly; and
- trace an evidence-backed App Map without changing files or resources.

See [DESIGN.md](./DESIGN.md) for the tier catalog, evidence model, action
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

If no preferred studio is registered, the action returns discovered candidates
or a structured, non-mutating scaffold recipe. It does not claim availability
from static metadata.

## Actions

- `discover_platform` discovers tier candidates from repository evidence and
  optional read-only Azure inventory in the active CLI subscription. Results
  include a candidate-card catalog grouped by tier.
- `request_app_workspace` validates an app name, purpose, selected tiers, and
  optional discovered candidate, then asks the foreground Copilot agent to use
  the app-native session API. The requested child session uses a new worktree,
  starts implementing the selected capabilities, and opens Unity Studio plus
  registered specialist canvases. The action reports a pending request; it does
  not claim that the worktree already exists.
- `open_in_vscode` opens an explicitly selected, workspace-confined repository
  path in a new VS Code window.
- `activate_tier` opens a registered preferred studio, returns candidates to
  inspect, or returns a scaffold recipe when no implementation is observed.
- `trace_app` derives a generic App Map whose nodes and edges retain source
  evidence, confidence, unresolved references, and diagnostics.
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
