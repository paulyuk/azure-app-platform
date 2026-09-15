# Testing this PR

The web app, Python tests, canvas, and IaC build checks work without an Azure
deployment. The AI Gateway test requires Azure credentials and permission to
create resources in the target subscription.

## Rapid path: real AI Gateway + full local live stack

Use this path in order: provision the AI Gateway first, then run the local
start script once. Provisioning creates the gitignored `src/agent/.env` that
the agent and Hosted Skills require.

Prerequisites:

- Python 3.13, `az`, `azd`, `uv`, Node.js/npm, Azure Functions Core Tools (`func`), and
  Azurite (`npm install -g azurite`)
- Azure access and model quota described in section 4

### Step 1: provision the AI Gateway

Run this before starting any local processes. These commands are identical in
PowerShell, macOS, and Linux:

```shell
cd infra-ai-gateway
azd env new unity-poc-aigateway
azd provision
cd ..
```

### Step 2: start the full local stack

The script starts in-memory Azurite, all four Hosted Skills/MCP servers, the
deal-finder agent, then the web app. It waits for each layer before starting
the next one and prints every endpoint and log path.

Unity Studio-created workspaces have a `.unity-studio/ports.env` file. The
launchers load it as data and honor these names:

```text
WEB_PORT
AGENT_PORT
INVENTORY_SEARCH_PORT
TRADE_IN_VALUE_PORT
RATE_SHEET_PORT
DEAL_DOC_PORT
AZURITE_BLOB_PORT
AZURITE_QUEUE_PORT
AZURITE_TABLE_PORT
```

The defaults remain `3000`, `8088`, `7071`–`7074`, and `10000`–`10002` when
neither the saved file nor the environment provides overrides. Do not source
`ports.env`; let `scripts/load-ports.*` validate and import it.

From the repository root, use one terminal for the long-running stack.

Windows (PowerShell):

```powershell
.\scripts\dev-start.ps1
```

macOS/Linux:

```bash
./scripts/dev-start.sh
```

Open the web URL printed by the launcher (by default
<http://localhost:3000>) and use:

> Find me an EV under $40,000 with at least 250 miles of range

The startup script includes the standard Azurite compatibility workaround:
`--skipApiVersionCheck`. This is required when the current Functions Storage
client requests API version `2026-06-06`, which Azurite may reject even though
MCP tool discovery succeeds. Azurite also runs with
`--inMemoryPersistence`, so stopping the stack discards all emulator data.

Logs are under `.dev-run/logs/`. The agent log should report
`CONNECTED, discovered 1 tool(s)` for each of the four skills. Stop and clean
up only this workspace's ownership-tracked process trees from another
terminal. The stop scripts never sweep ports or terminate another app's
listener.

Windows (PowerShell):

```powershell
.\scripts\dev-stop.ps1
```

macOS/Linux:

```bash
./scripts/dev-stop.sh
```

## 1. Web app (local, no Azure)

```shell
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

```shell
cd infra-ai-gateway
azd env new unity-poc-aigateway
azd provision
cd ..
```

`azd` will prompt you to select a subscription and region — choose
**East US 2** (preview region requirement; see `docs/unity-platform-plan.md`
section 5.1).

The preprovision/postdown lifecycle hook deletes only an environment-owned,
terminal-failed Gateway, purges its APIM soft-delete record, and waits for
managed-identity cleanup. The postprovision hook verifies a real model call,
stores the secret in the gitignored azd environment, and writes a mode-`0600`
`src/agent/.env`. It never prints the key.

### Manual multi-terminal path

Use this only when diagnosing an individual layer. The rapid-path scripts
above automate the same commands and are the normal test path.
The commands below show the default ports and assume there is no
`.unity-studio/ports.env`. For a Studio-allocated workspace, use the root
launcher and the endpoints it prints so the web backend URL, MCP URLs, and
custom Azurite connection string stay consistent.

Each Hosted Skill needs a gitignored `local.settings.json`. Repeat this
one-time configuration in each of the four skill folders. `uv run` creates
and syncs `.venv` from each skill's `pyproject.toml` automatically.

Windows (PowerShell):

```powershell
cd src\skills\inventory-search
Copy-Item local.settings.json.example local.settings.json
# Copy AZURE_AI_GATEWAY_ENDPOINT and AZURE_AI_GATEWAY_API_KEY from src\agent\.env.
```

macOS/Linux:

```bash
cd src/skills/inventory-search
cp local.settings.json.example local.settings.json
# Copy AZURE_AI_GATEWAY_ENDPOINT and AZURE_AI_GATEWAY_API_KEY from src/agent/.env.
```

Start each long-running process in its own terminal.

#### Terminal 1: Azurite

```shell
azurite --silent --inMemoryPersistence --skipApiVersionCheck --disableTelemetry
```

#### Terminal 2: inventory-search

```shell
cd src/skills/inventory-search
uv run func start --port 7071
```

#### Terminal 3: trade-in-value

```shell
cd src/skills/trade-in-value
uv run func start --port 7072
```

#### Terminal 4: rate-sheet

```shell
cd src/skills/rate-sheet
uv run func start --port 7073
```

#### Terminal 5: deal-doc

```shell
cd src/skills/deal-doc
uv run func start --port 7074
```

#### Terminal 6: deal-finder agent

```shell
cd src/agent
uv run main.py
```

The agent log should print `CONNECTED, discovered 1 tool(s)` for each skill
before reporting the selected Responses server port (`8088` by default).

#### Terminal 7: direct agent smoke test

Windows (PowerShell):

```powershell
$body = @{
  input = "Find me an EV under `$40,000 with at least 250 miles of range"
  stream = $false
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8088/responses" `
  -ContentType "application/json" `
  -Body $body

($response.output | Where-Object type -eq "message").content[0].text
```

macOS/Linux:

```bash
curl -sS -X POST http://127.0.0.1:8088/responses \
  -H "Content-Type: application/json" \
  -d '{"input":"Find me an EV under $40,000 with at least 250 miles of range","stream":false}' \
  | jq -r '.output[] | select(.type=="message") | .content[0].text'
```

The raw response also includes a `"type":"reasoning"` item with encrypted
content. The commands above print only the assistant reply.

Verified on August 26, 2026 against
`https://aigw-unity-d7xjkqcu.azure-api.net/`, using the `gpt-latest`
deployment. The completed response was:

> Electric vehicles can reduce fuel and maintenance costs.

To tear down this standalone slice:

```shell
cd infra-ai-gateway
azd down --purge --force
```

## 5. IaC sanity checks (local, no deployment)

```shell
azd show
az bicep build --file infra/main.bicep
az bicep build --file infra-ai-gateway/main.bicep
```

`azd show` may require selecting or creating a local azd environment, but it
does not deploy resources.
