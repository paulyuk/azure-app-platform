# Loan document sample

A loan agent that reads an application, summarizes it, and points out missing
details. A **document validation tool** checks the document before the agent
sends it to a **model** through AI Gateway.

This is the app used in the Unity Studio demo. Start with the
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
remote. It does not create Azure sandboxes, and a local child process is not a
secure sandbox. See [runtime options](docs/demos/loan-application/HOW-IT-WORKS.md#which-runtime-actually-runs)
for the Azure Container Apps option.

## Try it locally

You need **Python 3.13** and **uv**. From the repo root:

```shell
cd canvases/unity-studio/samples/docagent
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
For the full loan example, follow the [Unity Studio walkthrough](docs/demos/loan-application/README.md).
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

In Unity Studio, **Build** groups read-only source previews by purpose.
Use **Edit in Files** to change the actual file in the native Files canvas,
or **Open in &lt;editor&gt;** for an external editor. Set the preferred external
editor in **Settings**; VS Code is the default.

## What the checks don't prove

**Policy checks passed** means the returned text passed this demo's checks.
It does not verify the applicant's identity or income, or approve a loan.

Use fake data only. The checks do not catch every personal detail or every
harmful instruction in a document. Text and Markdown files are supported, up
to 64 KiB; PDF and Word files are not.
