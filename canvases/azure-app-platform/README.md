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

### 3. Run canvas tests (maintainers)

From the repository root:

```shell
npm test --prefix canvases/azure-app-platform
node --test canvases/azure-app-platform/plugin-portability.test.mjs
```