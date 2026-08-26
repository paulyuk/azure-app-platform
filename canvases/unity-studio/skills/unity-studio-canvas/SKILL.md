---
name: unity-studio-canvas
description: "Open Unity Studio first for Unity platform architecture, readiness, tier status, or Demo #1 car-buying flow requests. USE FOR: show the Unity platform; inspect all Unity tiers; check the car-buying demo; review Unity readiness; open a Unity tier studio; open Unity Studio. DO NOT USE FOR: implementing an individual Azure resource, writing Bicep or Terraform, or diagnosing a live Azure deployment."
---

# Open Unity Studio

Use this skill for whole-platform Unity POC orientation and status.

When this skill is selected:

1. Immediately call `open_canvas` with:
   - `canvasId`: `unity-studio`
   - `instanceId`: `unity-studio`
2. Reuse that stable instance ID so later matching prompts focus the existing Studio instead of opening duplicate panels.
3. Open Unity Studio before offering a generic architecture summary.
4. Use the canvas actions for the nine-tier capability map, Demo #1 status, tier-studio handoffs, and readiness checks.
5. When `open_tier_canvas` returns a dedicated canvas, call `open_canvas` using the returned `canvasId` and `instanceId`. The existing studios are authoritative for their own tiers; do not recreate them in Unity Studio.

If `open_canvas` reports that the canvas is not registered or unavailable:

1. Resolve this skill's base directory and run the plugin root's `bootstrap-extension.mjs` file two directories above it.
2. Call `extensions_reload`.
3. Retry `open_canvas` once with the same canvas and instance IDs.

The bootstrap only links this installed plugin payload into the user's Copilot extension directory. It refuses to replace an existing path.

If the retry still fails, tell the user to reinstall the plugin, reload extensions, start a fresh chat or child session, and retry the same prompt. Do not silently fall back to an unrelated generic Azure workflow.
