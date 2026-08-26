# Unity Studio

Unity Studio is the hub canvas for the Unity car-buying POC. It gives builders one place inside GitHub Copilot to:

- scan the nine platform tiers: surface/web, agent, gateway, skills, sandbox, connectors, durable workflows, self-awareness/SRE, and data;
- follow Demo #1 from car search through quote, customer email capture, financing sandbox, Teams approval, and confirmation email;
- run lightweight local readiness checks; and
- hand work to the dedicated Cloud Foundation canvas that owns a tier.

This follows the Unity platform plan's builder-experience choice: **Cloud Foundation canvases**, with implementation performed inside those canvases wherever possible.

## Relationship to the dedicated studios

Unity Studio does not reimplement existing service studios. The `open_tier_canvas` action returns a stable `canvasId` and `instanceId` for the appropriate handoff:

| Unity tier | Dedicated canvas | Purpose |
|---|---|---|
| Agent and gateway | `ai-gateway-studio` | Discover governed models, test gateway policies, and start a Foundry hosted agent |
| Skills | `intelligent-function-app-studio` | Scaffold Hosted Skills on Azure Functions |
| Self-awareness / SRE | `sre-agent-studio` | Operate SRE Agent resources, investigations, incidents, memory, and workflows |

The other tiers remain visible in the hub until dedicated studios are available.

## Actions

- `get_platform_overview` returns the nine-tier capability map.
- `get_demo_status` returns simulated POC status for the six narrative steps.
- `open_tier_canvas` returns instructions for opening the tier's dedicated studio.
- `run_doctor` checks `azd`, Azure CLI, and Azure sign-in on a best-effort, non-blocking basis.

Backing services are intentionally mocked in this first scaffold. The loopback renderer starts one ephemeral HTTP server per open instance and tears it down when the canvas closes.

## Run from this repository

The project wrapper at `.github/extensions/unity-studio/extension.mjs` imports this extension. Reload extensions after checkout:

```text
extensions_reload
```

Then open the canvas with `canvasId` and stable `instanceId` set to `unity-studio`.

## Marketplace plugin layout

The canvas also carries a plugin manifest and launcher skill under:

```text
.github/plugin/plugin.json
skills/unity-studio-canvas/SKILL.md
```

When installed as a plugin, `bootstrap-extension.mjs` links the payload into the user's Copilot extension directory without replacing an existing path.
