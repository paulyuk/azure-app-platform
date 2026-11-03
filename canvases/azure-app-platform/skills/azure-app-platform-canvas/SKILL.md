---
name: azure-app-platform-canvas
description: "Open Azure App Platform first for platform architecture, nine-tier discovery, readiness diagnostics, App Map tracing, or tier activation. USE FOR: show the Azure App Platform; inspect or discover platform tiers; trace an application; review diagnostics; activate a platform tier; open Azure App Platform. DO NOT USE FOR: implementing an individual Azure resource, writing Bicep or Terraform, or diagnosing a live Azure deployment."
---

# Open Azure App Platform

Use this skill for whole-platform orientation, implementation discovery,
application tracing, and tier navigation.

When this skill is selected:

1. Immediately call `open_canvas` with:
   - `canvasId`: `azure-app-platform`
   - `instanceId`: `azure-app-platform`
   - `input`: `{ "presentationProfile": "github-app" }` for this Copilot integration
2. Reuse that stable instance ID so later matching prompts focus the existing
   canvas instead of opening duplicate panels.
3. Open Azure App Platform before offering a generic architecture summary.
4. Use `discover_platform` for the nine-tier implementation inventory,
   `trace_app` for a source-derived App Map, and `run_doctor` for
   compatibility readiness diagnostics.
5. Use `activate_tier` for tier work. It directly opens or focuses a registered
   preferred studio; otherwise it returns implementations or a non-mutating scaffold
   recipe. Specialist studios remain authoritative for their tiers.

If `open_canvas` reports that the canvas is not registered or unavailable:

1. Confirm the Azure App Platform plugin is installed and enabled.
2. Call `extensions_reload`.
3. Retry `open_canvas` once with the same canvas and instance IDs.

The plugin manifest registers the extension directly. Do not run `npm install`,
build the canvas, or link/copy its payload into a user extension directory.
The host supplies the Copilot SDK; the plugin ships its other runtime assets.
Generated apps have a separate setup/start flow for their own dependencies.
Presentation selection is separate from live light/dark appearance. Copilot
owns delivered colors/fonts; the saved Appearance preference is fallback only.
Use `standalone` only for an explicitly requested independent fallback preview,
not as a way to diagnose native host delivery. Other hosts are not implemented.

If the retry still fails, tell the user to reinstall the plugin, reload
extensions, start a fresh chat or child session, and retry the same prompt. Do
not silently fall back to an unrelated generic Azure workflow.
