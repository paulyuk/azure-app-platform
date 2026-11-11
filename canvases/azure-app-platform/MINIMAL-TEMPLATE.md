# Sandbox & Gateway (Minimal): template shape

This is the maintainer entry point for `builtin-sandbox-gateway-minimal-v1`.
The [template source](templates/sandbox-gateway-minimal/) produces a standalone,
headless app, not an overlay on the Dealer demo in the repository's `src/`.
There is no web app or Hosted Skills runtime in this template.

For concrete finished output, browse the [docagent sample](samples/docagent/README.md).
The peer [samples directory](samples/README.md) explains its origin and what
local state was excluded.

The flow is **message + untrusted document -> agent harness -> document
validation tool -> checked sanitized result -> model through AI Gateway**.
The loan application is a worked scenario, not a required app identity.

## Generated app files

```text
<app>/
  .gitignore
  README.md
  azure-app.yaml
  config/
    domain.json
    document-policy.json
    egress-allowlist.json
    egress-policy.yaml
    runtime.json
  src/
    agent/
      main.py
      agent.yaml
      pyproject.toml
      Dockerfile
      prompts/system.md
      tests/test_runtime.py
    tools/
      document-validation/
        main.py
        contract.json
        pyproject.toml
        Dockerfile
        egress-policy.md
        tests/test_main.py
    policy/
      enforcement.py
  infra-ai-gateway/
    README.md
  scripts/
    dev-start.sh
    dev-start.ps1
    dev-stop.sh
    dev-stop.ps1
    load-ports.sh
    load-ports.ps1
  docs/demos/loan-application/
    README.md
    HOW-IT-WORKS.md
  examples/
    loan-application.txt
```

Everything above comes from the template directory except `load-ports.sh` and
`load-ports.ps1`, which the materializer adds from [`templates/shared/`](templates/shared/).
The generated POSIX start/stop scripts are made executable.

| What to change | Source within the template |
| --- | --- |
| Agent behavior | `src/agent/prompts/system.md.template` |
| Agent harness, model calls, and runtime adapters | `src/agent/main.py.template` (`AgentHarness`, `GatewayClient`, `CopilotSdkResponder`) |
| Document validation tool logic | `src/tools/document-validation/main.py.template` |
| Tool limits and descriptive request/result schemas | `src/tools/document-validation/contract.json` |
| Mandatory enforcement | `src/policy/enforcement.py` and `config/document-policy.json` |
| ACA egress policy and approved destinations | `config/egress-policy.yaml.template` and `config/egress-allowlist.json.template` |
| Runtime defaults and endpoint environment bindings | `config/runtime.json.template` |
| Capability inventory and component paths | `azure-app.yaml.template` |
| Setup/run guidance | `README.md.template`, both platform scripts, and the loan demo docs |

The default is a local Python harness with direct model HTTP calls and a
Python document validation subprocess. That subprocess is **not isolation**.
The opt-in Copilot SDK mode uses separate ACA custom-container sandboxes for
the agent and tool; the harness remains local. Model access goes through AI
Gateway in either mode. Neither mode selection nor these files provision Azure.

## Template files and tokens

Files ending in `.template` are rendered with the suffix removed. Files without
that suffix keep their names and are also included. For example,
`src/agent/main.py.template` becomes `src/agent/main.py`, while `contract.json`
keeps its name.

| Token | Value |
| --- | --- |
| `__APP_NAME__` | Validated display name |
| `__APP_SLUG__` | Lowercase, hyphenated app identifier |
| `__PURPOSE__` | Validated app purpose |
| `__PURPOSE_JSON__` | Purpose escaped for a JSON-style quoted string |
| `__AGENT_INSTRUCTIONS__` | Supplied agent instructions, or purpose-based default |
| `__EGRESS_ALLOW_DOMAIN__` | Validated exact domain for a reviewed future integration; it does not enable tool egress |

The materializer rewrites relative Markdown links ending in `.template` to
their generated paths. Keep the canonical scenario docs inside the template
so they ship with the Studio plugin and every new app. Repository-level
`docs/demos/loan-application/` pages are entry links, not duplicate copies.

## Generation contract

- [`source-catalog.mjs`](source-catalog.mjs), `SANDBOX_GATEWAY_TEMPLATE`, declares
  the ID, capabilities (`agent`, `sandbox`, `gateway`), startup defaults, and
  complete `requiredPaths` list.
- [`template-materializer.mjs`](template-materializer.mjs), `materializeLocalTemplate`,
  stages template files, adds shared port loaders, replaces tokens, validates
  required paths, and copies the rendered result. Known files are not recreated
  by a model.
- [`workspace-actions.mjs`](workspace-actions.mjs) creates the isolated worktree
  and records app/session identity and startup metadata in
  `.azure-app-platform/app.json`.

Saved ports (`.azure-app-platform/ports.env`), runtime logs (`.dev-run/`), credentials
(`src/agent/.env`), and dependency environments are local app state, not template
payload. The selected port overrides the default `8088`. Changing the template
does not migrate existing apps or overwrite their instructions and credentials.
Studio's Customize and document-test paths also support the older
`src/sandbox/tool/` layout.

Build puts `src/agent/main.py` first in the **Agent** collection. The
**Document validation** collection starts with the tool's `main.py` and
`config/egress-policy.yaml`, followed by its contract and validation policy.
The YAML is the deployable ACA policy; `egress-policy.md` remains supplementary
documentation in Files. Generic sandbox blocks expose their own
`egress-policy.yaml` alongside code, contract, container, and project settings.

Studio allocates unused ports during template-workspace creation, before
opening the child session or VS Code. It saves `.azure-app-platform/ports.env` using
the same allocator as **Pick available ports**, checking live listeners and
persisted sibling-worktree reservations. This applies to Minimal, Empty, and
Dealer templates. A direct materializer invocation does not allocate ports.

## Changing the template

Update file references together: runtime code, Dockerfiles, manifests,
`requiredPaths`, Studio Customize mappings, docs, and tests. For startup changes,
keep POSIX and PowerShell 7 scripts aligned. Python components use `uv` and the
documented corporate package index.

Run these checks from the Unity repository root:

```shell
node --test canvases/azure-app-platform/template-alignment.test.mjs canvases/azure-app-platform/sandbox-gateway-runtime.test.mjs canvases/azure-app-platform/app-scope.test.mjs canvases/azure-app-platform/build-workspace.test.mjs
```

These cover fresh generation, required files, portable documentation links,
component discovery, runtime contracts, and legacy/current Customize paths.
For runtime behavior changes, create a fresh app through Azure App Platform and run
the Python tests described in its generated README. Do not run unrendered
`.template` projects as if they were generated apps.

For the user-facing walkthrough, see the [loan demo](templates/sandbox-gateway-minimal/docs/demos/loan-application/README.md)
and [how it works](templates/sandbox-gateway-minimal/docs/demos/loan-application/HOW-IT-WORKS.md).
