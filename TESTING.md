# Testing this PR

The web app, Python tests, canvas, and IaC build checks work without an Azure
deployment. The AI Gateway test requires Azure credentials and permission to
create resources in the target subscription.

## Rapid path: real AI Gateway + full local live stack

Use this path for the normal end-user dev test. It starts every local piece in
the required order: in-memory Azurite, all four Hosted Skills/MCP servers, the
deal-finder agent, then the web app. The scripts wait for each layer to be
ready before starting the next one and print every endpoint and log path.

Prerequisites:

- `az`, `azd`, `uv`, Node.js/npm, Azure Functions Core Tools (`func`), and
  Azurite (`npm install -g azurite`)
- Azure access and model quota described in section 4

First provision or select the standalone AI Gateway environment. This creates
the gitignored `src/agent/.env` consumed by the local stack:

```powershell
cd infra-ai-gateway
azd env new unity-poc-aigateway      # first run only
# azd env select unity-poc-aigateway # later runs
azd provision
cd ..
```

Then start everything from the repository root:

```powershell
.\scripts\dev-start.ps1
```

Open <http://localhost:3000> and use:

> Find me an EV under $40,000 with at least 250 miles of range

The startup script includes the standard Azurite compatibility workaround:
`--skipApiVersionCheck`. This is required when the current Functions Storage
client requests API version `2026-06-06`, which Azurite may reject even though
MCP tool discovery succeeds. Azurite also runs with
`--inMemoryPersistence`, so stopping the stack discards all emulator data.

Logs are under `.dev-run/logs/`. The agent log should report
`CONNECTED, discovered 1 tool(s)` for each of the four skills. Stop and clean
up all tracked processes and known ports with:

```powershell
.\scripts\dev-stop.ps1
```

macOS/Linux uses the same flow and behavior:

```bash
cd infra-ai-gateway
azd env new unity-poc-aigateway      # first run only
# azd env select unity-poc-aigateway # later runs
azd provision
cd ..

./scripts/dev-start.sh
# test at http://localhost:3000
./scripts/dev-stop.sh
```

## 1. Web app (local, no Azure)

```bash
cd src/web
npm install
npm run dev
```

Open the URL printed by Vite. Walk through the mock car-buying flow: enter buyer
preferences, review matching vehicles, select a vehicle, inspect the quote, and
continue through the financing handoff.

## 2. Python checks (local, no Azure)

All Python components use [`uv`](https://docs.astral.sh/uv/) — do not invoke
`python`/`pip` directly. Each project has its own `pyproject.toml`, so plain
`uv run` from inside it resolves dependencies automatically.

```bash
cd src/sandbox/prequal
uv run pytest -q
cd -
cd src/workflows/loan-approval
uv run pytest -q
cd -
uv run python -m compileall src/agent src/skills
```

PowerShell (`cd -` isn't valid; use `Push-Location`/`Pop-Location`):

```powershell
Push-Location src/sandbox/prequal
uv run pytest -q
Pop-Location
Push-Location src/workflows/loan-approval
uv run pytest -q
Pop-Location
uv run python -m compileall src/agent src/skills
```

## 3. Unity Studio canvas (local Copilot extension, no Azure)

Open this repository in GitHub Copilot, reload extensions, then ask Copilot to
open the canvas:

1. Run `extensions_reload`.
2. Run/open `unity-studio` (for example, “Open Unity Studio”).
3. Confirm the platform overview loads and each Unity tier can be selected.

## 4. Real AI Gateway + local deal-finder (Azure required)

Prerequisites:

- Azure CLI authenticated to the intended tenant
- Azure Developer CLI (`azd`) 1.28.1 or later
- Permission to deploy APIM AI Gateway, Foundry models, and role assignments
- Available Global Standard model quota in East US 2

The standalone slice is intentionally separate from the future full-platform
`infra/` deployment. It provisions into `rg-unity-poc-aigateway` in East US 2.

```bash
cd infra-ai-gateway
azd env new unity-poc-aigateway
azd provision
cd ..
```

`azd` will prompt you to select a subscription and region — choose
**East US 2** (preview region requirement; see `docs/unity-platform-plan.md`
section 5.1).

If the environment already exists, replace `azd env new` with:

```bash
cd infra-ai-gateway
azd env select unity-poc-aigateway
```

The preprovision/postdown lifecycle hook deletes only an environment-owned,
terminal-failed Gateway, purges its APIM soft-delete record, and waits for
managed-identity cleanup. The postprovision hook verifies a real model call,
stores the secret in the gitignored azd environment, and writes a mode-`0600`
`src/agent/.env`. It never prints the key.

Run the hosted-agent protocol server locally with `uv` (no manual venv needed):

```bash
cd src/agent
uv run main.py
```

Watch its startup log: it now prints one line per MCP tool source
(`inventory-search`, `trade-in-value`, `rate-sheet`, `deal-doc`, or the
Foundry Toolbox if `TOOLBOX_ENDPOINT` is set) — `CONNECTED, discovered N
tool(s)` or `FAILED to connect/discover tools`. **A model-only smoke test
(below) succeeds even if every tool failed to connect** — the model call
doesn't need tools, so a green gateway reply here is not proof the agent's
tools are wired up. If any tool line says `FAILED`, start the four Hosted
Skills first (see the next subsection) before trusting a tool-using prompt.

In another terminal (PowerShell — `curl` in PowerShell is an alias for
`Invoke-WebRequest`, whose parameters differ from real curl, so use
`curl.exe` explicitly to get actual curl syntax, and `python -m json.tool`
since `jq` usually isn't installed on Windows):

```powershell
curl.exe -sS -X POST http://127.0.0.1:8088/responses `
  -H "Content-Type: application/json" `
  -d '{"input":"Reply in one short sentence: what is one benefit of an electric vehicle?","stream":false}' |
  python -c "import json,sys; d=json.load(sys.stdin); print(next(i for i in d[\"output\"] if i[\"type\"]==\"message\")[\"content\"][0][\"text\"])"
```

macOS/Linux:

```bash
curl -sS -X POST http://127.0.0.1:8088/responses \
  -H "Content-Type: application/json" \
  -d '{"input":"Reply in one short sentence: what is one benefit of an electric vehicle?","stream":false}' \
  | jq -r '.output[] | select(.type=="message") | .content[0].text'
```

The raw response also includes a `"type":"reasoning"` item with a long
`encrypted_content` blob — that's the model's encrypted chain-of-thought
trace, opaque by design. The commands above print just the assistant's
reply text.

### Start the 4 Hosted Skills for real tool calls

The smoke test above only proves the AI Gateway model path works. To
actually exercise `inventory-search`, `trade-in-value`, `rate-sheet`, and
`deal-doc` (the tools `deal-finder` calls), each one needs to be running
locally as its own `func start` process — the agent does **not** run them
in-process or fall back silently, so a tool-using prompt (e.g. "Find me an
EV under $40,000...") fails with `MCP server failed to initialize` until
all four are up. Full setup, ports, and credentials are in
[`src/skills/README.md`](src/skills/README.md) "Run the Hosted Skills
locally" — the short version, one-time configuration per skill. `uv run`
creates and syncs `.venv` from each skill's `pyproject.toml` automatically:

```bash
cd src/skills/inventory-search   # then trade-in-value, rate-sheet, deal-doc
cp local.settings.json.example local.settings.json
# edit local.settings.json: copy AZURE_AI_GATEWAY_ENDPOINT / AZURE_AI_GATEWAY_API_KEY
# in from src/agent/.env (each skill makes its own small model call)
```

PowerShell equivalent:

```powershell
cd src/skills/inventory-search   # then trade-in-value, rate-sheet, deal-doc
Copy-Item local.settings.json.example local.settings.json
# edit local.settings.json: copy AZURE_AI_GATEWAY_ENDPOINT / AZURE_AI_GATEWAY_API_KEY
# in from src/agent/.env (each skill makes its own small model call)
```

Then start all four in separate terminals (same on Windows and macOS/Linux,
`func` is the Azure Functions Core Tools CLI either way):

```bash
cd src/skills/inventory-search && uv run func start --port 7071
cd src/skills/trade-in-value    && uv run func start --port 7072
cd src/skills/rate-sheet        && uv run func start --port 7073
cd src/skills/deal-doc          && uv run func start --port 7074
```

For a normal Windows dev-test loop, `.\scripts\dev-start.ps1` automates
these README steps: package-index selection, Azurite startup,
`local.settings.json` creation from `src/agent/.env`, all four
`uv run func start` commands, readiness checks, then agent and web startup
in that order. Azurite runs with `--inMemoryPersistence`, so local skill-test
storage is discarded on stop and nothing is written into the worktree.

macOS/Linux uses the equivalent POSIX scripts:

```bash
./scripts/dev-start.sh
# test at http://localhost:3000
./scripts/dev-stop.sh
```

Restart `uv run main.py` (or just re-send a tool-using prompt — the agent
reconnects per-request) once all four show `CONNECTED, discovered N tool(s)`
in the agent's own startup log.

Verified on August 26, 2026 against
`https://aigw-unity-d7xjkqcu.azure-api.net/`, using the `gpt-latest`
deployment. The completed response was:

> Electric vehicles can reduce fuel and maintenance costs.

To tear down this standalone slice:

```bash
cd infra-ai-gateway
azd down --purge --force
```

## 5. IaC sanity checks (local, no deployment)

```bash
azd show
az bicep build --file infra/main.bicep
az bicep build --file infra-ai-gateway/main.bicep
```

`azd show` may require selecting or creating a local azd environment, but it
does not deploy resources.
