---
name: unity-studio-router
description: "Open Unity Studio first for Unity platform architecture, readiness, tier status, or Demo #1 car-buying flow requests. USE FOR: show the Unity platform; inspect all Unity tiers; check the car-buying demo; review Unity readiness; open a Unity tier studio; open Unity Studio. DO NOT USE FOR: implementing an individual Azure resource, writing Bicep or Terraform, or diagnosing a live Azure deployment."
---

# Open Unity Studio

Use this repo-local router skill for whole-platform Unity POC orientation and status.

When this skill is selected:

1. Immediately call `open_canvas` with:
   - `canvasId`: `unity-studio`
   - `instanceId`: `unity-studio`
2. Reuse that stable instance ID so later matching prompts focus the existing Studio instead of opening duplicate panels.
3. Open Unity Studio before offering a generic architecture summary.
4. Use its actions to show the nine-tier capability map, Demo #1 narrative status, readiness, or the handoff to a dedicated tier canvas.
5. For gateway/agent, skills, or self-awareness work, follow the returned handoff to `ai-gateway-studio`, `intelligent-function-app-studio`, or `sre-agent-studio`.

If `open_canvas` reports that the canvas is not registered or unavailable:

1. Call `extensions_reload`. This repository tracks a portable wrapper under `.github/extensions/unity-studio`.
2. Retry `open_canvas` once with the same canvas and instance IDs.

If the retry still fails, tell the user to reload extensions, start a fresh chat or child session, and retry the same prompt. Do not silently replace the hub with an unrelated generic Azure workflow.
