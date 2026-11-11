# Loan document sample

A loan agent that reads an application, summarizes it, and points out missing
details. A **document validation tool** checks the document before the agent
sends it to a **model** through AI Gateway.

This is the app used in the Azure App Platform demo. Start with the
[fake loan application](examples/loan-application.txt), not a real customer's file.

## How it works

1. The **loan agent harness** receives your message and document.
2. The **document validation tool** checks the file and hides common email,
   phone, SSN, and card-number patterns. If the checks fail, the request stops.
3. The harness checks the tool's result. The **loan agent** sends the checked
   text to the **model** through AI Gateway, then the harness checks the answer.

![Sandbox and Gateway Minimal pattern](../../../../docs/images/sandbox-gateway-minimal-building-blocks.svg)

**The diagram shows the cloud pattern.** The quick start below runs the Python
loan agent and document validation tool on your machine. Only the model is
remote unless an ACA Sandbox Group is configured. A local child process is not
a secure sandbox. See [runtime options](docs/demos/loan-application/HOW-IT-WORKS.md#which-runtime-actually-runs)
for the Azure Container Apps option.

## Try it locally

You need **Python 3.13** and **uv**. From the repo root:

```shell
cd canvases/azure-app-platform/samples/docagent
```

For model answers, save your gateway settings in `src/agent/.env`. Don't commit
this file. You can skip it to try the document checks without a model.

```dotenv
AI_GATEWAY_BASE_URL=https://<gateway-host>/default/models/openai/v1
AI_GATEWAY_MODEL=<your-model>
AI_GATEWAY_API_KEY=<your-key>
```

Use your gateway's actual base URL. [Other connection options](infra-ai-gateway/README.md).

Choose a free port; `8095` below is just an example. The start script restores
Python packages and waits for the agent to be ready.

**macOS/Linux**

```bash
export AGENT_PORT=8095
./scripts/dev-start.sh --agent-runtime=local
```

**PowerShell 7 on Windows**

```powershell
$env:AGENT_PORT = "8095"
.\scripts\dev-start.ps1 --agent-runtime=local
```

Once the script reports **HEALTHY**, try the built-in test document in the same
terminal. This checks the tool without calling a model.

**macOS/Linux**

```bash
curl --fail --silent --show-error "http://127.0.0.1:${AGENT_PORT}/test-document" \
  -H "Content-Type: application/json" -d '{}'
```

**PowerShell 7 on Windows**

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:${env:AGENT_PORT}/test-document" -ContentType "application/json" -Body "{}"
```

Look for `"verdict": "approved"` and placeholders such as `[REDACTED:EMAIL]`.
For the full loan example, follow the [Azure App Platform walkthrough](docs/demos/loan-application/README.md).
Its older **Run & manage** label is now **Run/Debug**.

Stop the agent with `./scripts/dev-stop.sh` on macOS/Linux, or
`.\scripts\dev-stop.ps1` on Windows.

The launchers record each process ID together with its OS-reported start
identity. The stop scripts terminate only an exact identity match and protect
the current shell and its ancestors. If identity is missing or termination
cannot be confirmed, `.dev-run` is preserved, the stop command returns
nonzero, and the next start aborts instead of overwriting ownership. Follow the
reported remediation, then rerun the stop command before starting again.

## Change the sample

| What to change | File |
| --- | --- |
| What the loan agent should do | [Agent instructions](src/agent/prompts/system.md) |
| How the agent and harness run | [src/agent/main.py](src/agent/main.py) |
| How documents are checked | [Document validation tool](src/tools/document-validation/main.py) |
| File types and size limits | [Tool contract](src/tools/document-validation/contract.json) |
| Rules the tool and harness must follow | [Document policy](config/document-policy.json) |
| Local or Azure runtime settings | [Runtime settings](config/runtime.json) |
| Default-deny egress and optional proxy authentication | [Egress policy](config/egress-policy.yaml), [allowlist](config/egress-allowlist.json), and [policy notes](src/tools/document-validation/egress-policy.md) |

In Azure App Platform, **Customize** groups read-only source previews by purpose.
Use **Edit in Files** to change the actual file in the native Files canvas,
or **Open in &lt;editor&gt;** for an external editor. Set the preferred external
editor in **Settings**; VS Code is the default.

## ACA Sandbox boundary

With `ACA_SANDBOX_GROUP`, `ACA_RESOURCE_GROUP`, `ACA_REGION`, and
`ACA_SUBSCRIPTION` configured on the harness, the normal start script uses the
`aca` CLI to create a fresh document-tool microVM with
`--egress-default Deny --traffic-inspection Full`, apply the reviewed policy,
execute the tool, and delete the sandbox. Configure those variables with
`export NAME="value"` on macOS/Linux or `$env:NAME = "value"` in PowerShell.
A configured group without the CLI fails explicitly; it never silently
downgrades to a local process.

The microVM does not inherit the host's credentials. Do not explicitly inject
them through images, files, inputs, or environment variables. Authenticated
outbound APIs use the ACA Sandbox Egress Proxy's `Transform` rules with
`valueRef.secretRef` or `valueRef.managedIdentityRef`, resolved and injected
outside the microVM. The checked-in policy defaults to no outbound access.
The current CLI uses ordered `rules`, not the legacy `hostRules` field.

An egress test actually inspects the tool's environment and attempts a
credential-free `HEAD` to the requested origin, with no document body, path,
query, userinfo, authentication headers, or redirects. The harness polls ACA
egress decisions before deletion. `sandboxProbe` reports up to 32 sorted
environment names with a total count, credential-like variable counts,
presence at five common credential locations, network outcome, matching
decision counts, and a sanitized `acaDeniedDecision`. No values or file
contents are read into the result. Inspection errors fail explicitly.
DNS/TLS failures and upstream HTTP 403 remain unverified without a matching
platform denial.

The `[sandbox-env]`, `[sandbox-net]`, and `[sandbox-egress]` stderr records
show the observations and correlated platform denial. In Canvas, expand the
sandbox execution layer for **Outbound probe**, **Sandbox env keys**,
**ACA matched rule**, and **Verify in code**. Start with
`config/egress-policy.yaml`, `src/tools/document-validation/main.py`, and
`src/agent/main.py`. The
[pattern and validation guide](../../../../docs/sandbox-boundary-validation.md)
maps every check to its source and verification commands.

Every microVM run logs the applied egress policy, allowed/denied audit counts,
verdict, reason, and redaction counts. `[sandbox-session]` records custom-pool
dispatch and completion after `stopSession`, including cleanup success.
Cleanup failures are logged without replacing the invocation outcome.
`[http]` records one timed outcome per POST; GET readiness stays quiet.
No tokens, query strings, document text, or raw upstream errors are logged.
Local tool calls emit no invocation logs or replayed child diagnostics.

Without ACA configured, the tool gets a minimal environment and a Python
audit hook that denies socket/DNS access. That is a real process-local check,
not OS or microVM isolation. Use synthetic data. A nonzero credential-like
count, reachable unauthorized origin, or unverified ACA denial needs
investigation even though the application rejects the request before a model
call.

Canvas boundary tests also work with customized documents and sandbox apps
that accept no documents. Attached content is preserved; prompt-only/code
apps stage the probe in the message instead. Selection never runs the test
automatically, and Canvas highlights do not prove sandbox enforcement.

## What the checks don't prove

**Policy checks passed** means the returned text passed this demo's checks.
It does not verify the applicant's identity or income, or approve a loan.

Use fake data only. The checks do not catch every personal detail or every
harmful instruction in a document. Text and Markdown files are supported, up
to 64 KiB; PDF and Word files are not.
