# Azure App Platform

Standalone GitHub Copilot plugin marketplace for **Azure App Platform** (`0.5.0`), built from `main` (`d8d28fee97bc97090a7b126aecde2da9d70fd982`).

| Plugin | Version | Type | What it does |
| --- | --- | --- | --- |
| [Azure App Platform](canvases/azure-app-platform) | `0.5.0` | Canvas + skills | Create, assemble, trace, and operate multi-tier agentic applications centered on ACA Sandboxes and AI Gateway. |

## Install in GitHub Copilot

Add this marketplace and install the plugin:

```sh
copilot plugin marketplace add paulyuk/azure-app-platform
copilot plugin install azure-app-platform@azure-app-platform
```

Or inside a GitHub Copilot chat session:

```text
/plugin marketplace add paulyuk/azure-app-platform
/plugin install azure-app-platform@azure-app-platform
```

In GitHub Copilot desktop, you can also open **Customize → Plugins**, add `paulyuk/azure-app-platform`, and install **Azure App Platform**. Reopen Copilot or start a fresh chat after installing.

## Try it

Start a new chat and ask:

> Open Azure App Platform

Or try one of these flows:

> Create an Azure App Platform app using the Sandboxes & AI Gateway starter.

> Open Azure App Platform and test the document validation sandbox boundary.

## Verify portable package locally

```sh
node --test canvases/azure-app-platform/plugin-portability.test.mjs
```
