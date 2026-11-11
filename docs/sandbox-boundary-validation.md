# Sandbox patterns and boundary validation

ACA Sandboxes isolate untrusted execution. The ACA Sandbox Egress Proxy
enforces outbound policy and supplies credentials outside the microVM.
Azure AI Gateway governs shared model and tool access. Each component has a
separate job, and each boundary test records which component supplied evidence.

## Two minimal patterns

### Sandboxes Minimal

One agent orchestrates disposable ACA Sandboxes. The agent owns model access
and dispatches scoped inputs to a sandbox for document processing, calculation,
or code execution.

```text
Caller -> Agent -> ACA Sandbox -> checked result -> Agent
                       |
                       +-> Egress Proxy -> reviewed API
                           default deny; optional credential injection
```

Create sandboxes with `--egress-default Deny --traffic-inspection Full`.
Apply the reviewed egress policy before executing code. For an authenticated
API, configure an exact-host/path/method `Transform` rule that references a
sandbox-group secret or managed identity.

### Sandboxes + AI Gateway Minimal

For two or more brains or skills sharing model and tool access, route those
calls through Azure AI Gateway. Agents keep orchestration credentials outside
the tool sandbox; tools execute untrusted work in ACA Sandboxes.

```text
Agents / skills -> Azure AI Gateway -> models / shared MCP or HTTP tools
       |
       +-> ACA Sandboxes -> checked results
                  |
                  +-> ACA Sandbox Egress Proxy -> reviewed APIs
```

Gateway policies govern authentication, routing, quotas, and shared access.
The sandbox egress policy governs requests originating inside a microVM.
An application that exposes sandbox-backed tools through the gateway needs
both controls. The document starter demonstrates the agent, sandboxed tool,
and gateway-routed model call; add brains and skills through the same governed
routes.

## Credential isolation and egress enforcement

### Keep credentials at the boundary that uses them

The harness creates and executes the tool microVM without passing the host's
environment, gateway credentials, or credential mounts. It sends tool code,
the tool contract, operator policy, and the bounded request. Host environment
variables and home-directory files are not inherited by the microVM.

For authenticated outbound calls, the Egress Proxy resolves
`valueRef.secretRef` or `valueRef.managedIdentityRef` and adds the header
outside the microVM. The tool supplies the unauthenticated request, not the
upstream token.

```yaml
defaultAction: Deny
trafficInspection: Full
rules:
  - match:
      host: api.reviewed.example
      path: /v1/*
      methods: [GET]
    action:
      type: Transform
      headers:
        - operation: Set
          name: Authorization
          valueRef:
            secretRef:
              secretId: reviewed-api
              secretKey: token
              format: "Bearer {value}"
```

For managed identity, replace the `secretRef` block with:

```yaml
managedIdentityRef:
  type: SystemAssigned
  resource: https://management.azure.com
  format: "Bearer {value}"
```

The secret or identity must be configured on the proxy's sandbox group with
only the permissions that API requires. Never put its value in a sandbox
environment variable, image, input, or file. This deployment discipline is
what keeps those credentials out of both `os.environ` and the microVM's
filesystem.

### Apply and audit the network policy

`config/egress-policy.yaml` defines `defaultAction: Deny`,
`trafficInspection: Full`, and ordered `rules`. First match wins. A scoped
Transform must take precedence over a broader Allow for the same host.
`config/egress-allowlist.json` defaults to an empty list with outbound access
disabled. The harness requires explicit enablement and exact-host allowlist
entries for custom rules, and derives Allow rules for remaining enabled hosts.

The lifecycle is create, apply, execute, collect audit decisions, delete.
`aca sandbox egress apply` installs the reviewed policy before the tool runs.
`aca sandbox egress decisions` supplies the platform's allowed/denied entries.
The harness correlates the denied host, `HEAD` method, scheme, and `/` path
before reporting `enforcement: "aca-egress-proxy"`.

The result includes bounded decision counts and `acaDeniedDecision`:
`action`, `method`, `scheme`, `host`, `/`, and a bounded rule identifier.
Structured rule payloads and unsafe rule names become `[REDACTED]`. When the
platform omits the rule identifier, the summary says `unreported`. Headers,
tokens, bodies, and raw audit payloads stay out of responses and diagnostics.

### Inspect the actual runtime without returning values

The tool reads its live environment without clearing it first. It returns:

| Field | Observation |
| --- | --- |
| `envKeys` | The first 32 sorted environment variable names, each bounded to 256 characters. No values. |
| `envKeyCount` | Total names observed, so a truncated list is explicit. |
| `credentialLikeVariableCount` | Nonempty variables matching credential-like names across the whole environment, including names outside the first 32. |
| `credentialValuesReturned` | Always `false`. |
| `secretFilesPresent` | Whether any of the five checked credential locations exists. |
| `secretFileCount` | Number of those locations present, from 0 to 5. |

The five locations are `~/.azure`, `~/.aws`, `~/.config/gh`,
`~/.git-credentials`, and `/var/run/secrets`. The tool checks directory entries
with `lstat`, including symlinks, without listing directories or reading file
contents. Permission or inspection errors fail explicitly rather than
producing a zero count.

The local development harness passes only its small environment allowlist
(`PATH`, Python encoding settings, and available locale/Windows runtime
settings). A local child still shares the host filesystem. Its credential
location observations describe that host-side process, not a microVM.

### Exercise outbound denial without exfiltrating data

The tool turns the selected URL into a credential-free, origin-only `HEAD`.
It strips userinfo, the supplied path, query, fragment, and body. It adds no
authentication header, follows no redirects, and reads no response body.
Only the origin's scheme, host, optional port, and `/` are used.

Use an operator-controlled, resolvable endpoint that the policy denies for a
live ACA check. A fictional `.example` host can fail DNS without reaching the
proxy. DNS, TLS, timeout, connection failures, and HTTP 403 alone are recorded
as unverified. A matching ACA audit denial supplies the network-policy evidence.

The local development fallback attempts the same request under a Python
socket/DNS audit hook and reports `python-audit-hook` when denied. That is a
process-local check. Use ACA for isolation from arbitrary native code, child
executables, and host files.

### Read the diagnostics and execution view

The tool writes these lines to stderr during a probe. For ACA microVM runs,
the harness emits the same bounded observations from the validated result so
captured child output does not hide them from agent logs:

```text
[sandbox-env] env_keys=["HOME","LANG","PATH"] env_key_count=3 credential_like_vars=0 secret_files=0 values_returned=false
[sandbox-net] probe="HEAD https://probe.example.net/" outcome=http-response enforcement=unverified http_status=403
```

A correlated ACA decision adds a separate harness line:

```text
[sandbox-egress] sandbox_id=<id> defaultAction=Deny trafficInspection=Full decision=Denied method=HEAD host=probe.example.net matched_rule=unreported
```

Every successful policy application logs the policy actually sent to ACA:

```text
[sandbox-egress] Applied egress-policy.yaml to sandbox_id=<id> defaultAction=Deny trafficInspection=Full rules=0
```

Every validated microVM result, approved or rejected, collects egress decisions
before deletion and logs the observed allowed/denied counts. The completion
line includes the verdict, reason, and redaction counts:

```text
[sandbox-egress] sandbox_id=<id> allowed=0 denied=0 verdict=approved reason=sanitized
[sandbox] Completed document-validation in microVM <id> verdict=approved reason=sanitized redactions={"email":1,"paymentCard":0,"phone":0,"ssn":0}
```

Probe runs poll for a correlated denial and add `denied_rule=<rule>` to the
summary when one is recorded. Ordinary runs take one audit snapshot without
the probe polling delay. Counts refer to entries in that sandbox's returned
audit snapshot; they are not an exhaustive traffic capture. An audit collection
failure fails explicitly rather than reporting zero activity.

Custom-container session pools log dispatch and completion around invocation
and `stopSession`:

```text
[sandbox-session] Dispatched session=doc-<id> endpoint=doc-pool.example.azurecontainerapps.io/process operation=sanitize-v1
[sandbox-session] Completed session=doc-<id> verdict=approved reason=sanitized redactions={"email":1,"paymentCard":0,"phone":0,"ssn":0} session_stopped=true
```

The document result is validated before cleanup and the completion log.
Invocation or validation errors produce `verdict=error`. A session response
without a document verdict reports `none`; it does not imply a document gate
was approved. Cleanup failures are separate records:

```text
[sandbox-session] Failed to stop session=doc-<id>: UpstreamError (details redacted)
[sandbox-session] Completed session=doc-<id> verdict=rejected reason=instruction-override redactions={} session_stopped=false
```

`session_stopped=false` requires investigation and cleanup of the named
session. The log preserves the original invocation result or exception and
does not print upstream exception text, URLs, or bearer tokens.

Both Python HTTP handlers emit one outcome line per POST, including invalid
requests and error responses. Timing covers request handling and response
writing, using a monotonic performance counter:

```text
[http] POST /test-document status=422 verdict=rejected reason=instruction-override duration_ms=18.4
[http] POST /process status=200 verdict=approved reason=sanitized duration_ms=1.2
[http] POST /invoke status=502 verdict=error reason=document-tool-failed duration_ms=32.1
```

The tool's HTTP 200 can contain a rejected verdict; the harness returns HTTP
422 for that policy halt. GET readiness probes stay quiet. HTTP logs contain
only known routes, status, verdict, reason code, and duration. Query strings,
unknown paths, request/response text, headers, and credential values are not
logged. `LocalDocumentTool` emits no invocation logs and does not replay its
captured child diagnostics; local HTTP requests still get the one outcome line.

These are illustrative records, not evidence from a particular deployment.
The environment line shows what the process observed; the ACA line shows
the independently collected network decision.

In the Canvas execution view, expand **Document tool / sandbox** or
**Sandbox tool**. **Outbound probe** names the enforcement source and shows
the sanitized ACA request and decision when available. **Sandbox env keys**
shows names, truncation, and credential-location counts. **ACA matched rule**
shows the returned identifier. **Verify in code** points to the policy, tool,
and harness.

For a default-policy ACA run, expect zero credential-like variables, zero
checked credential locations present, and a matching denied decision. Inspect
the observed key list against the image's expected runtime environment.
Nonzero counts, unexpected names, a reachable unauthorized origin, or an
unverified outcome require investigation. Zero counts describe the checked
environment and locations at that moment, not a complete scan of memory,
arbitrary filenames, or every credential format.

The application returns HTTP 422 with `reasonCode: "unauthorized-egress"`
before model access. The rejection reports the policy halt; the probe reports
the observations. `cloudIsolationVerified` remains `false` because this
bounded test is not a whole-deployment attestation.

## Boundary testing across three app shapes

| App shape | What Canvas stages | What the application verifies |
| --- | --- | --- |
| Starter document tool | The attached document or starter sample plus the selected override or egress probe. | Document checks run in the sandbox before any model call; an egress probe returns runtime evidence. |
| Custom document schema or domain | The user's document or the app's declared sample, preserving its original content and adding domain-neutral probe text. | The app's tool contract, validation gates, and sandbox boundary. |
| Code interpreter or calculation sandbox | An adversarial message/code probe in `prompt-or-code` mode, with no synthetic attachment. | The app dispatches the requested environment/network operations to its sandbox and returns evidence. |

Readiness discovers sandbox capabilities and document-input metadata. The
boundary-test button is available for a sandbox even when it accepts no
documents. Choosing a test stages input only; **Invoke agent** runs it.

Prompt-injection tests exercise the instruction-override gate. Egress tests
exercise live environment inspection and a network request. Canvas highlighting
identifies staged instructions; enforcement and evidence belong to the app
runtime. Custom apps must implement the compatible bounded evidence contract.

## Verification map

App-relative paths below exist in
[`samples/docagent`](../canvases/azure-app-platform/samples/docagent).
The deterministic starter ships the same files under
[`templates/sandbox-gateway-minimal`](../canvases/azure-app-platform/templates/sandbox-gateway-minimal),
with `.template` suffixes where values are materialized.

In Build, open **Agent** for `src/agent/main.py`. Open **Document validation**
for the tool's `main.py` and `config/egress-policy.yaml`; those files lead their
collections. The same collection includes the contract, document policy, and
egress allowlist. Supplementary Markdown guidance is available in Files.
Custom sandbox projects expose their own `main.py`, `contract.json`, and
`egress-policy.yaml` when present.

| File | What to inspect |
| --- | --- |
| `config/egress-policy.yaml` | Default Deny, Full inspection, ordered rules, and proxy-only credential references. |
| `config/egress-allowlist.json` | Explicit enablement and exact approved outbound hosts. |
| `src/tools/document-validation/main.py` | `_credential_locations()` and `_probe_sandbox()`: real key/path observations and the HEAD attempt. |
| `src/policy/enforcement.py` | `probe_origin()` strips payload-bearing URL components; `log_sandbox_probe()`, `runtime_log_outcome()`, and `log_http_outcome()` emit bounded observations and outcome fields only. |
| `src/tools/document-validation/contract.json` | Bounded probe fields and sanitized ACA decision schema. |
| `src/agent/main.py` | `AcaSessionClient`, `Handler`, `_tool_process_environment()`, `_validate_sandbox_probe()`, and `AcaSandboxGroupDocumentTool`: session cleanup outcomes, timed HTTP outcomes, launch inputs, validation, apply/exec/audit/delete ordering, and denial correlation. |
| `src/tools/document-validation/tests/test_main.py` | Live names/counts, five real fixture locations, explicit inspection errors, log redaction, and origin-only requests. |
| `src/agent/tests/test_runtime.py` | A real local listener receives no request; host credential values stay out; stubbed ACA decisions test lifecycle, correlation, and redaction. |
| `canvases/azure-app-platform/sandbox-boundary-test.mjs` | Staging for starter documents, custom documents, and prompt/code-only apps. |
| `canvases/azure-app-platform/blocked-agent-response.mjs` | Normalization of bounded names, counts, and ACA summaries; rejection of malformed evidence. |
| `canvases/azure-app-platform/run-execution.mjs` | Execution metadata and code pointers. |
| `canvases/azure-app-platform/interactive-app-map.mjs` | Boundary-test interaction, evidence notes, and execution-view wiring. |
| `canvases/azure-app-platform/sandbox-boundary.browser.test.mjs` | The three app shapes and rendered evidence, using an existing Edge CDP session. |

## Commands to verify

### Python tests

Use `uv` in each component. On the Microsoft corporate network, configure the
documented package proxy first.

**macOS/Linux**

```bash
export UV_INDEX_URL=https://packagefeedproxy.microsoft.io/pypi/simple/
export UV_DEFAULT_INDEX=https://packagefeedproxy.microsoft.io/pypi/simple/
```

**PowerShell 7**

```powershell
$env:UV_INDEX_URL = "https://packagefeedproxy.microsoft.io/pypi/simple/"
$env:UV_DEFAULT_INDEX = "https://packagefeedproxy.microsoft.io/pypi/simple/"
```

From the repository root, test the sample agent:

```shell
cd canvases/azure-app-platform/samples/docagent/src/agent
uv run pytest -q
```

From the repository root in another terminal, test the tool:

```shell
cd canvases/azure-app-platform/samples/docagent/src/tools/document-validation
uv run pytest -q
```

For a materialized starter, run `uv run pytest -q` from its `src/agent` and
`src/tools/document-validation` directories. Tests for ACA lifecycle and
decisions use a CLI stub; run the live check below for platform evidence.

### Policy validation and live ACA evidence

ACA CLI `1.0.0-preview.5` exposes `schema` and `apply`, but does not expose
`aca sandbox egress validate`. From the app root, inspect its authoritative
policy schema:

```shell
aca sandbox egress schema
```

The Python agent tests exercise `load_egress_policy()` against exact-host
allowlists, credential references, default Deny, Full inspection, and rule
ordering. To run just those checks from `src/agent`:

```shell
uv run pytest -q -k "egress_policy or unsafe_policy or default_policy"
```

Configure the existing sandbox group on the harness, start the app through its
documented start flow, and explicitly invoke a boundary test using a denied,
operator-controlled, resolvable origin. Inspect the returned `sandboxProbe`
and the three diagnostic lines. The harness reads platform decisions before
deleting the ephemeral sandbox.

For an independently managed sandbox, apply and inspect while it exists,
substituting its real ID, group, resource group, and region:

```shell
aca sandbox egress apply --id <sandbox-id> --group <group> --resource-group <resource-group> --region <region> --file config/egress-policy.yaml
aca sandbox egress decisions --id <sandbox-id> --group <group> --resource-group <resource-group> --region <region> --output json
```

Use the reviewed, resolved policy when allowlist-derived rules are enabled.
Read platform output locally; keep headers, payloads, and full audit records
out of shared logs.

### Canvas and portability tests

From the repository root:

```shell
npm test --prefix canvases/azure-app-platform
node --test canvases/azure-app-platform/plugin-portability.test.mjs
```

Browser boundary coverage attaches to an existing signed-in Microsoft Edge
session through `EDGE_CDP_URL`. Without Playwright and that connection it
skips, launching no browser. Unit tests still check normalization, staging,
and execution metadata.
