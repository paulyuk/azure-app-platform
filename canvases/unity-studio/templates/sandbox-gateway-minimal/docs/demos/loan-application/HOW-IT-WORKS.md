# How the loan application demo works

The **loan agent** checks a fictional loan application document, removes
supported sensitive patterns, and explains the application. It does not verify
the application, identity, income, or creditworthiness, and it does not approve
a loan.

## From diagram to code

Use four role labels consistently: **loan agent**, **loan agent harness**,
**document validation tool**, and **model**. The loan agent and its harness are
reusable code in `src/agent/`; the document validation tool is reusable code in
`src/tools/document-validation/`.

```text
Unity Studio: message + optional untrusted loan application
  |
  v
loan agent harness                         src/agent/main.py
  |
  +--> document validation tool             src/tools/document-validation/main.py
  |      reads contract.json explicitly     src/tools/document-validation/contract.json
  |      uses shared policy code            src/policy/enforcement.py
  |        and settings                     config/document-policy.json
  |
  |    Rejected? Stop. No model call.
  |    Approved? Return bounded sanitized text and redaction counts.
  v
loan agent harness: independently check the returned result
  |
  v
loan agent -> AI Gateway -> selected remote model
  |           instructions                  src/agent/prompts/system.md
  v
loan agent harness: check model output -> explanation / questions / estimate
```

The **loan agent harness** is the code around the loan agent's model calls. It
accepts HTTP requests, calls the document validation tool, independently checks
the tool result and final model output, and returns the answer. The Python class
is `AgentHarness`. In default local mode, the harness and loan agent share the
same local Python process; the validation tool is a separate local child
process, which is not an isolation boundary.

## Physical folders and edit points

Paths are relative to the template root and the generated app worktree.
Template-source links retain `.template`; materialization removes that suffix
from links in the generated Markdown.

| Diagram name | App files | Technology and job |
| --- | --- | --- |
| **loan agent harness** | [`src/agent/main.py`](../../../src/agent/main.py.template) | Plain Python `AgentHarness` and `ThreadingHTTPServer`; accepts requests, calls the tool, independently checks results and final model output |
| **loan agent** | Same `src/agent/main.py`; [`src/agent/prompts/system.md`](../../../src/agent/prompts/system.md.template) | Local direct Gateway HTTP client, or optional Python Copilot SDK adapter; the Markdown file contains generic behavior plus conditional loan-processing guidance |
| **document validation tool** | [`src/tools/document-validation/main.py`](../../../src/tools/document-validation/main.py.template); [`contract.json`](../../../src/tools/document-validation/contract.json) alongside it | Plain Python request/document validation and sanitation; JSON defines limits, extensions, and descriptive schemas that Python reads and enforces explicitly |
| **Shared policy code** | [`src/policy/enforcement.py`](../../../src/policy/enforcement.py); [`config/document-policy.json`](../../../config/document-policy.json) | Python checks used by the harness and tool, not a separate service |
| **Runtime selection** | [`config/runtime.json`](../../../config/runtime.json.template) | Selects local processing or separately configured ACA custom-container sandboxes; selection does not provision or deploy them |
| **AI Gateway / model** | **Run/Debug → AI model connection**; generated `src/agent/.env` | Remote model-access endpoint and model selection, not the Python or SDK runtime |

**Build** provides a file explorer and one selected editor for the instructions,
document validation tool, contract, policy, and runtime settings. **Edit in Code** opens the whole
worktree and selected file; use the Code file tree for the harness and shared
policy implementation. Inline saves require review, a stopped app, and an
unchanged base version. Developer editing does not grant the runtime model write
access.

For loan-specific behavior, edit `src/agent/prompts/system.md`. Its
loan-processing guidance is conditional; preserve the generic default behavior
for unrelated messages handled by the reusable agent.

Only newly generated apps use `src/tools/document-validation/`. Existing
generated apps retain their prior folder layout until deliberately migrated
with all runtime references, scripts, and tests.

## Which runtime actually runs?

The default is `"agentRuntime": "local"` in `config/runtime.json`. A startup
`--agent-runtime=...` flag overrides that saved value. **Loan agent runtime**
means the software executing the loan agent, not the selected language model.

| Part | Default: `local` | Optional: `copilot-sdk-sandbox` |
| --- | --- | --- |
| **loan agent harness** | Plain Python local HTTP service | The same local Python HTTP service |
| **loan agent** | Direct Gateway HTTP model client in `src/agent/`; no SDK loop | Python GitHub Copilot SDK plus the bundled Copilot runtime in one ACA custom-container sandbox |
| **document validation tool** | Plain Python child process; JSON request on stdin and JSON result on stdout | The same Python tool with a standard-library HTTP server in a different ACA custom-container sandbox |
| **model** | Remote model reached through AI Gateway | Remote model reached through AI Gateway |

Thus, the default loan agent is a thin Python model-calling service, not a
Copilot SDK loop or Foundry hosted agent. The document validation tool is not an
Azure Functions or Hosted Skills app. The template uses Python and `uv`; ACA
supplies optional sandbox hosting, not the validation logic.

In SDK mode, the loan agent can call `approved_document_result` to read the
already-sanitized result. That adapter is different from the document validation
tool: it does not rerun validation or return the raw document. Built-in shell,
filesystem, MCP, skill, and sub-agent tools are disabled.

Local child processes provide **no OS or network isolation**: use synthetic
documents. SDK mode requires two separately provisioned ACA session pools,
images, identity, network policy, and configuration. Selecting the mode does not
create, deploy, or verify any of them. The model remains remote through AI
Gateway either way. Whole-app `azd` deployment remains blocked to avoid
inherited Dealer manifests.

## Does the document validation tool use plain Python?

**Yes.** Python's `json` module reads the request, contract, and policy.
Explicit Python checks validate fields and types, `pathlib` checks filename
extensions, UTF-8 encoding and length checks enforce bounds, and `re` patterns
locate supported PII and instruction overrides. Shared policy code also applies
a payment-card checksum check.

There is no validation model, general policy engine, or JSON Schema validation
library. The contract's `$defs` are descriptive schemas, not an executable
engine. Editing them alone does not rewrite Python request validation or the
loan agent harness's tool-result validation. Policy JSON is explicitly
validated, and mandatory checks cannot be disabled by document content or model
arguments.

The Studio picker accepts `.txt`/`.md` up to 64 KiB; the tool additionally
accepts `.markdown`, with its configured input-character and sanitized-output
limits. Redaction covers selected email, phone, SSN, and payment-card patterns.
This is not PDF/Word parsing, OCR, malware scanning, comprehensive PII
detection, business-fact verification, identity or income verification, or
guaranteed prompt-injection defense. Nor is it a deterministic loan calculator:
model-generated payments remain estimates.

## What do the Studio actions and labels mean?

**Run/Debug** holds one shared message-and-document input. **Test
enforcement** runs the document validation tool and loan agent harness result
check without a model call. **Invoke agent** repeats those checks before calling
the model. The raw attachment reaches the loan agent harness endpoint and, in
SDK mode, the document validation sandbox, but it is not included in the loan
agent sandbox request or the model request.

Raw input remains **Untrusted source**. **Policy checks passed** and **Approved
for agent processing -- sanitized text only** apply only to the displayed
sanitized output and structured evidence from that check. Studio derives them
through `document-assessment.mjs`, not model prose. Inspect the sanitized text,
truncation flag, and redaction counts. The labels are not signed credentials,
universal trust, verified identity or income, creditworthiness, loan approval,
or proof of isolation. Changing input, starting another check, or opening Build
clears them; pending and rejected results never receive them.

Studio assigns unused ports during new-app creation and saves them in
`.unity-studio/ports.env`, avoiding live listeners and sibling apps' saved ports.
Under **Run/Debug → Local ports**, **Pick available ports** can change that
assignment while the app is stopped. Startup, readiness, endpoint
links, and CLI requests use that same value; `8088` is only the default when no
saved or explicit `AGENT_PORT` exists. **Stop apps using these ports** requires
review of the exact listener processes before confirmation.
