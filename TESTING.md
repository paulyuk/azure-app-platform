# Testing this PR

The web app, Python tests, canvas, and IaC build checks work without an Azure
deployment. The AI Gateway test requires Azure credentials and permission to
create resources in the target subscription.

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
az account set --subscription ca5ce512-88e1-44b1-97c6-22caf84fb2b0
cd infra-ai-gateway
azd env new unity-poc-aigateway --no-prompt
azd env set AZURE_SUBSCRIPTION_ID ca5ce512-88e1-44b1-97c6-22caf84fb2b0
azd env set AZURE_LOCATION eastus2
azd provision --no-prompt
cd ..
```

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
uv run python main.py
```

In another terminal:

```bash
curl -sS -X POST http://127.0.0.1:8088/responses \
  -H "Content-Type: application/json" \
  -d '{"input":"Reply in one short sentence: what is one benefit of an electric vehicle?","stream":false}'
```

Verified on August 26, 2026 against
`https://aigw-unity-d7xjkqcu.azure-api.net/`, using the `gpt-latest`
deployment. The completed response was:

> Electric vehicles can reduce fuel and maintenance costs.

`AI_GATEWAY_MODEL_ONLY=1` in the generated `.env` tests real model routing
without requiring the later Foundry Toolbox/Hosted Skills deployment. Remove
that setting only after `TOOLBOX_ENDPOINT` and `TOOLBOX_NAME` are configured.

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
