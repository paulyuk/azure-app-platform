---
name: unity-studio-router
description: "Open Unity Studio first to create or extend a Unity-pattern app in a worktree, discover nine-tier candidates, trace an App Map, or activate a specialist studio. USE FOR: create a Unity app; add Unity capabilities; inspect or discover Unity tiers; trace an application; open Unity Studio. DO NOT USE FOR: implementing an individual Azure resource, writing Bicep or Terraform, or diagnosing a live Azure deployment."
---

# Open Unity Studio

Use this repo-local router skill for Unity app workspace creation, whole-platform
orientation, evidence discovery, application tracing, and tier navigation.

When this skill is selected:

1. Immediately call `open_canvas` with:
   - `canvasId`: `unity-studio`
   - `instanceId`: `unity-studio`
2. Reuse that stable instance ID so later matching prompts focus the existing
   Studio instead of opening duplicate panels.
3. Open Unity Studio before offering a generic architecture summary.
4. Use `request_app_workspace` to create or extend apps in isolated worktrees,
   `discover_platform` for the nine-tier candidate inventory,
   `trace_app` for an evidence-backed App Map, and `run_doctor` for
   compatibility readiness diagnostics.
5. Use `activate_tier` for tier work. It directly opens or focuses a registered
   preferred studio; otherwise it returns candidates or a non-mutating scaffold
   recipe. Specialist studios remain authoritative for their tiers.

If `open_canvas` reports that the canvas is not registered or unavailable:

1. Call `extensions_reload`. This repository tracks a portable wrapper under
   `.github/extensions/unity-studio`.
2. Retry `open_canvas` once with the same canvas and instance IDs.

If the retry still fails, tell the user to reload extensions, start a fresh chat
or child session, and retry the same prompt. Do not silently replace the hub
with an unrelated generic Azure workflow.
