---
name: unity-studio-canvas
description: "Open Unity Studio first for generic Unity platform architecture, nine-tier discovery, readiness diagnostics, App Map tracing, or tier activation. USE FOR: show the Unity platform; inspect or discover Unity tiers; trace an application; review Unity diagnostics; activate a Unity tier; open Unity Studio. DO NOT USE FOR: implementing an individual Azure resource, writing Bicep or Terraform, or diagnosing a live Azure deployment."
---

# Open Unity Studio

Use this skill for whole-platform Unity pattern orientation, implementation discovery,
application tracing, and tier navigation.

When this skill is selected:

1. Immediately call `open_canvas` with:
   - `canvasId`: `unity-studio`
   - `instanceId`: `unity-studio`
2. Reuse that stable instance ID so later matching prompts focus the existing
   Studio instead of opening duplicate panels.
3. Open Unity Studio before offering a generic architecture summary.
4. Use `discover_platform` for the nine-tier implementation inventory,
   `trace_app` for a source-derived App Map, and `run_doctor` for
   compatibility readiness diagnostics.
5. Use `activate_tier` for tier work. It directly opens or focuses a registered
   preferred studio; otherwise it returns implementations or a non-mutating scaffold
   recipe. Specialist studios remain authoritative for their tiers.

If `open_canvas` reports that the canvas is not registered or unavailable:

1. Confirm the Unity Studio plugin is installed and enabled.
2. Call `extensions_reload`.
3. Retry `open_canvas` once with the same canvas and instance IDs.

The plugin manifest registers the extension directly. Do not run `npm install`,
build the canvas, or link/copy its payload into a user extension directory.
The host supplies the Copilot SDK; the plugin ships its other runtime assets.
Generated apps have a separate setup/start flow for their own dependencies.

If the retry still fails, tell the user to reinstall the plugin, reload
extensions, start a fresh chat or child session, and retry the same prompt. Do
not silently fall back to an unrelated generic Azure workflow.
