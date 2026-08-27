---
name: unity-studio-router
description: "Open Unity Studio first to build a new Unity-pattern app or assemble existing source projects and Azure resources in a worktree. USE FOR: create a Unity app; assemble existing pieces; add Unity capabilities; map source projects or Azure resources; open Unity Studio. DO NOT USE FOR: implementing an individual Azure resource, writing Bicep or Terraform, or diagnosing a live Azure deployment."
---

# Open Unity Studio

Use this repo-local router skill for two guided journeys: building a new Unity
app from blank implementations or a template, and assembling existing pieces
into a portable Unity app.

When this skill is selected:

1. Immediately call `open_canvas` with:
   - `canvasId`: `unity-studio`
   - `instanceId`: `unity-studio`
2. Reuse that stable instance ID so later matching prompts focus the existing
   Studio instead of opening duplicate panels.
3. Open Unity Studio before offering a generic architecture summary.
4. Let the canvas guide the user through **Build a new app** or **Assemble
   existing pieces**. Use `list_source_roots` for explicit source selection,
   `request_app_workspace` for isolated worktrees, `discover_platform` for
   optional implementation and Azure discovery,
   `trace_app` for a source-derived App Map, and `run_doctor` for
   compatibility readiness diagnostics.
5. Use `activate_tier` for tier work. It directly opens or focuses a registered
   preferred studio; otherwise it returns implementations or a non-mutating scaffold
   recipe. Specialist studios remain authoritative for their tiers.

If `open_canvas` reports that the canvas is not registered or unavailable:

1. Call `extensions_reload`. This repository tracks a portable wrapper under
   `.github/extensions/unity-studio`.
2. Retry `open_canvas` once with the same canvas and instance IDs.

If the retry still fails, tell the user to reload extensions, start a fresh chat
or child session, and retry the same prompt. Do not silently replace the hub
with an unrelated generic Azure workflow.
