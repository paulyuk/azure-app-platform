---
name: azure-app-platform-block-authoring
description: "Customize saved Azure App Platform web, trigger, connector, orchestration, and operations starters. Use for Build creation instructions or Adjust with AI on these blocks, not for deployments or coding-assistant skills."
---

# Author a platform building block

Read the selected file, its project configuration, nearby contracts, and the
app's instructions. Start with the saved template; preserve unrelated work and
existing connections. Use GPT-5.6 Sol or a stronger approved GPT model, never
Claude. Keep changes inside the authorized app root.

## Match the implementation

- **User Experience:** Preserve App Service Builder's static output contract.
  Use semantic HTML, accessible names, keyboard navigation, responsive layouts,
  and existing design tokens. Keep credentials server-side. Connect only to
  confirmed application endpoints; show loading, empty, and error states.
- **Triggers:** Confirm the actual decorator in `function_app.py` before editing;
  HTTP, timer, Event Grid, and queue triggers are not interchangeable. Validate
  bounded inputs. Preserve HTTP authentication, return explicit errors, and do
  not log secrets or raw user payloads. Queue and event handlers must be
  idempotent and tolerate duplicate delivery; let failures reach the runtime's
  retry/poison handling. Timer schedules use UTC unless explicitly configured.
  Do not disable storage monitoring or enable run-on-startup to hide setup errors.
- **Connectors:** The JSON is a design contract, not a provisioned connection.
  Confirm the actual API, operations, authentication flow, and permitted scopes.
  Use managed identity or a secret reference, never inline credentials. Enforce
  endpoint allowlists, timeouts, bounded responses, pagination, and rate limits
  in an actual adapter before claiming the contract is enforced. Retry only
  safe/idempotent operations; handle authorization and downstream failures.
- **Orchestrations:** Keep Durable orchestrators deterministic. Perform network,
  time, random, and filesystem operations in activities, not orchestrators.
  Validate input before scheduling. Make activities idempotent; use bounded
  retries, explicit failures, and compensation for irreversible operations.
  Keep status/history endpoints authenticated and avoid exposing sensitive input.
- **Operations / SRE Agent:** This starter is a runbook and desired configuration,
  not a deployed agent or active monitor. Base health signals and alerts on real
  telemetry. Keep remediation disabled until permissions, approval gates, scope,
  rollback, and audit evidence exist. Never infer health from file presence or
  enable autonomous writes to satisfy a request for observability.

## Validate and hand off

Use the component's `pyproject.toml` and `uv` for Python; never invoke pip or
create a virtualenv manually. Read the app README first and follow its corporate
package-index policy. Keep deployment `requirements.txt` aligned. Use native
PowerShell examples alongside POSIX commands when commands differ.

Add focused tests for the requested behavior, validation failures, unavailable
dependencies, and boundary conditions. Exercise duplicate delivery for event
handlers and deterministic replay for workflows where the app's harness allows
it. Use synthetic data; do not make unapproved live calls. For configuration-only
starters, validate structure and report the missing implementation explicitly.

Report saved changes and unresolved dependencies. Do not deploy, provision,
assign permissions, start background workloads, or claim runtime readiness.
