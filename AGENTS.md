# Agent instructions

## Model policy

- Do not use Claude models for work in this repository.
- Use GPT-5.6 Sol (`gpt-5.6-sol`) or a stronger approved GPT model for
  agent-driven implementation, architecture, review, and research.
- When the host supports reasoning controls, use the highest practical reasoning
  effort for product architecture and cross-cutting changes.
- Propagate this policy to child sessions and delegated agents.

## Unity Studio product direction

- Optimize Unity Studio around a small number of guided user journeys rather
  than exposing every platform action at once.
- Use **capabilities** for Unity pattern tiers, **implementations** as the
  umbrella term, and **source projects**, **Azure resources**, and **matched
  files** for concrete inventory.
- Prefer deterministic actions that create, select, map, or modify artifacts
  over instructions that require users to copy prompts between tools.
- Materialize known Unity templates with
  `canvases/unity-studio/template-materializer.mjs`; do not ask a model to
  recreate, summarize, or manually copy template files.
- Use model reasoning only for semantic customization, user-defined tool
  contracts, cross-project integration, and troubleshooting.

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
