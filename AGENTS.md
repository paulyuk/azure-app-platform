# Agent instructions

## Model policy

- Do not use Claude models for work in this repository.
- Use GPT-5.6 Sol (`gpt-5.6-sol`) or a stronger approved GPT model for
  agent-driven implementation, architecture, review, and research.
- When the host supports reasoning controls, use the highest practical reasoning
  effort for product architecture and cross-cutting changes.
- Propagate this policy to child sessions and delegated agents.

## Azure App Platform product direction

- Optimize Azure App Platform around a small number of guided user journeys rather
  than exposing every platform action at once.
- Use **capabilities** for Unity pattern tiers, **implementations** as the
  umbrella term, and **source projects**, **Azure resources**, and **matched
  files** for concrete inventory.
- Prefer deterministic actions that create, select, map, or modify artifacts
  over instructions that require users to copy prompts between tools.
- Materialize known Unity templates with
  `canvases/azure-app-platform/template-materializer.mjs`; do not ask a model to
  recreate, summarize, or manually copy template files.
- Use model reasoning only for semantic customization, user-defined tool
  contracts, cross-project integration, and troubleshooting.

## Canvas plugin portability

- Installing/enabling a plugin in GitHub Copilot must be enough to open its
  canvas. Never require a manual `npm install`, build, or bootstrap step.
- Use the host-provided `@github/copilot-sdk`; do not declare or install a
  separate SDK dependency. Prefer Node built-ins. Ship any other runtime code
  and browser assets in the plugin; do not load them from a CDN or checkout
  `node_modules`.
- Resolve shipped assets relative to `import.meta.url` using `fileURLToPath`,
  not the current directory, an absolute developer path, or the source repo.
  The current workspace is the user's app, not the installed plugin.
- Keep the plugin manifest, launcher skill, and install/recovery docs aligned.
  Use native plugin discovery; do not link payloads into user extension folders.
- Separate canvas startup from generated-app dependency restoration. App setup
  may restore its own dependencies, but must do so through the documented
  setup/start flow with clear prerequisites and errors.
- Preserve macOS/Linux and Windows/PowerShell parity. For packaging or runtime
  changes, run `node --test canvases/azure-app-platform/plugin-portability.test.mjs`.
  Keep its isolated payload free of `node_modules` and its working directory
  unrelated to the source checkout; do not weaken isolation to make it pass.

## Python package policy

- Never fetch Python packages from `files.pythonhosted.org` or the public PyPI
  CDN on the Microsoft corporate network.
- Before running `uv`, export:

  ```bash
  export UV_INDEX_URL=https://packagefeedproxy.microsoft.io/pypi/simple/
  export UV_DEFAULT_INDEX=https://packagefeedproxy.microsoft.io/pypi/simple/
  ```

- Use the repository-configured pip index for `pip`. If it is unavailable, set
  `PIP_INDEX_URL=https://packagefeedproxy.microsoft.io/pypi/simple/`.
- Read project-specific README setup instructions before installing dependencies.
