# Azure App Platform

Azure App Platform is a GitHub Copilot canvas for creating, assembling, and operating multi-tier agentic applications centered on **ACA Sandboxes** and **AI Gateway**.

## What it does

Azure App Platform guides you from a starter architecture or existing codebase to a runnable workspace in an isolated Git worktree:

- **Create a new app** — follow a three-step flow (**Choose a template → Describe app → Review app**) using **Sandboxes & AI Gateway Starter**, **App Service Builder (Vite Starter)**, **Dealership E2E Reference Sample**, or **Empty Starter App**, then materialize an isolated Git worktree.
- **Open an app** — reopen existing app worktrees (or pick from **Recent apps** on Home) to edit components in **Build**, configure **Connect**, test and inspect in **Run** and **Observe** (**App Map** and **Logs**), or **Deploy**.
- **Assemble existing projects** — map existing source directories and compatible Azure resources into a unified `azure-app.yaml` manifest.

## Why use it

- **Isolated tool execution** — separate untrusted tool and document execution in **ACA Sandboxes** from the agent, with local process simulation for fast development before cloud sandboxes are configured.
- **Governed shared access** — route model and tool calls through a configured **AI Gateway** so policy, rate limits, and credentials stay centralized across agents and skills.
- **Zero-install plugin** — ships as a self-contained GitHub Copilot plugin with bundled templates and browser assets; no manual `npm install` or build step is required to open the canvas.

## Quickstart

### 1. Install in GitHub Copilot

```text
/plugin marketplace add coreai-microsoft/azure-app-platform
/plugin install azure-app-platform@azure-app-platform
```

### 2. Open the canvas

Ask Copilot:

```text
open Azure App Platform
```

From **Home**, choose **Create a new app**, **Open an app**, or **Assemble existing projects**, then use the workspace tabs (**Build**, **Connect**, **Run**, **Observe**, **Deploy**) to customize, test, and operate your app.

Home refreshes recent apps in the background without blocking starting journeys, and built-in starter templates are available immediately while reference samples finish loading. Stacked skeleton cards share a 12px gap across Home, the picker, initial controls, and the workspace shell. Selecting an app opens a themed workspace shell while its source graph loads, and workspace creation streams real progress stages while keeping the submitted review form visible. Loading spinners keep rotating even when reduced motion is enabled so pending operations remain visibly active.

Catalog discovery bounds concurrent worktree inspection and resolves folder
aliases once, retaining the complete inventory without launching Git commands
for every worktree at the same time. Matching in-flight source-list requests
share one read within a canvas and its authorized-folder scope. Completed
results are not cached by the server; retries, changed folder scopes, and
creation or mutation checks still perform fresh discovery.

In **Build**, source previews fill the available pane without nested outer
gutters. Collections show the filenames that fit, followed by **+N more** for
only the hidden files. Widening the pane restores filenames and removes the
disclosure when all fit. Selecting a filename opens Page view; Stack view,
per-file line numbers, and **Add building block** remain available.

In **Run**, enter a prompt and attach documents on the invocation screen, with
**Try a boundary test** placed directly below **Event triggers**. **Invoke
agent** opens a separate execution view containing the execution layers,
document policy assessment, tool activity, and response output. These outputs
are not shown on the prompt-entry screen. The active layer has a clockwise
glowing border trail (or a steady highlight when reduced motion is enabled);
execution layers remain stacked directly above the response without a parent
summary accordion, and each layer opens inline as an accordion to inspect
runtime, harness, policy, or MCP tool details. Startup and request states follow
actual readiness and HTTP boundaries. Model and tool steps are not streamed:
tool reports and policy stages appear when returned, and an unconfirmed tool
call stays **Unverified**. **Back to input** returns to the prompt without
cancelling execution. Use **Clear input** to reset the task payload without
discarding the latest run. **View execution** in the input header or workspace
history revisits that run, while the **Output** tab exposes its logs.

**Connect** shows this app's saved gateway, model, and sandbox selection from
local configuration before refreshing Azure resources in the background. An
unconfigured app shows empty connection controls without waiting for Azure.
Discovery failures leave the saved connection visible; applying changes still
requires current app status and completed discovery.

The header's **More options** (three-dot) menu contains **Docs** and **Settings**
on both Home and the workspace. Docs opens in a new tab; closing Settings
returns focus to the menu button.

The runtime action bar groups **Stop app**, **Open app**, and **Logs** as
icon-only controls with accessible names and tooltips. Stop comes first with a
red outline icon and a divider before the other controls. **Open app** appears
only when the web endpoint is ready. During startup, a spinner marks
**Waiting for the agent** and **Invoke agent** is disabled; the stop control
remains **Cancel startup**. From a stopped app, **Invoke agent** still starts
the app and waits for its agent endpoint before sending the task.

### 3. Run canvas tests (maintainers)

From the repository root:

```shell
npm test --prefix canvases/azure-app-platform
node --test canvases/azure-app-platform/plugin-portability.test.mjs
```

## Delete a local app

Choose **Delete app** from a row's actions in Home or Open, or review deletion
in **App settings**. Deletion requires a stopped app and validates only the
selected app, without inspecting unrelated worktrees.

All three entry points share a modal confirmation showing the app name and
full worktree path, so apps with duplicate names remain unambiguous. Cancel
receives initial focus, Tab and Shift+Tab stay in the confirmation, and Escape
cancels before submission. Once submitted, deletion cannot be cancelled or
submitted again while pending.

Forced worktree removal permanently loses local uncommitted changes and
untracked files. It removes the local worktree and its Canvas-created branch,
not Azure resources, source repositories, or cloud deployments.

If worktree removal fails, the app stays in the list. If the worktree is
removed but its managed branch cannot be deleted, the app leaves the list and
the result identifies the remaining branch and the `git branch -D '<branch>'`
recovery command to run from the Canvas repository. Branch cleanup is never
retried automatically.

Home and Open refresh in place, retain the search query, and return focus to
a surviving row's actions or search field. A removed app leaves the cached
inventory even if refreshing fails; the refresh error does not hide the
deletion result or branch recovery instructions. During a refresh failure,
search stays visible but disabled and focus moves to an available recovery
control. Retrying Open preserves its search query.
