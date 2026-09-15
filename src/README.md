# src

Application code for Demo #1 (car buying) lives here once the POC build starts, organized per tier from the platform plan:

- `web/` - front end web client (Embr project, `driveline-web`)
- `agent/` - Foundry Hosted Agent definition (`deal-finder`)
- `skills/` - Hosted Skills (Functions apps): `inventory-search`, `trade-in-value`, `rate-sheet`, `deal-doc`
- `workflows/` - Durable Task Scheduler orchestrations (loan approval, human-in-the-loop)
- `sandbox/` - sandboxed financing calculation that never leaks PII

See [`docs/unity-platform-plan.md`](../docs/unity-platform-plan.md) for the full architecture and phased build plan (section 5).

## Quick local test

All Python components use [`uv`](https://docs.astral.sh/uv/) — never invoke
`python`/`pip` directly. Each Python project (`agent/`, `sandbox/prequal/`,
`workflows/loan-approval/`) has its own `pyproject.toml`, so a plain
`uv run <command>` from inside that directory resolves and syncs its
dependencies automatically — no `--with`/`--with-requirements` flags, and no
`python` prefix needed to run a script (`uv run main.py`, not
`uv run python main.py`).

The four Hosted Skills (`inventory-search`, `trade-in-value`, `rate-sheet`,
`deal-doc`) are also uv projects. Each owns a `pyproject.toml` for local
development and keeps `requirements.txt` for Azure Functions deployment.
From inside a skill folder, use `uv run func start --port <port>`; uv creates
and syncs `.venv` automatically.

```bash
# Python checks
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

**Web app and hosted agent are two separate, independent long-running
processes — run each in its own terminal.** By default the web app
**auto-detects** the real agent: it tries calling it first and transparently
falls back to the built-in mock scenario generator if it's not reachable.
So starting only the web app still gives a fully standalone mock demo:

For a Unity Studio-created Dealer workspace, prefer `scripts/dev-start.sh` or
`scripts/dev-start.ps1` from the repository root. Those launchers read the
validated `.unity-studio/ports.env`, wire every component together, and print
the selected URLs. The manual commands in this document use the fallback
ports.

```bash
# Terminal — web app (no Azure required); works standalone via mock fallback
cd src/web
npm install
npm run dev
```

```bash
# Optional — hosted agent offline one-shot rehearsal (no Azure required,
# prints a mock payload and exits — does not start a server; see below)
cd src/agent
MOCK=1 uv run main.py
```

### Live mode: web app calling the real agent

The web app **can** call the real deal-finder agent — the Next.js
`/api/chat` route calls it server-side (avoiding CORS, since the agent
server sends no `Access-Control-Allow-Origin` headers and a direct
browser→agent `fetch()` would be blocked). Since auto-detection is the
default, you only need to start the real agent — no web app config change
required:

```bash
# Terminal 1 — start the real agent (needs src/agent/.env from azd provision,
# see "Exercising the agent" below)
cd src/agent
uv run main.py
```

```bash
# Terminal 2 — web app; auto-detects the agent above with no config
cd src/web
npm install
npm run dev
```

Open `http://localhost:3000` and chat — replies come from the real
agent/model. If you stop the agent, the web app falls back to mock
responses on the next request (a warning is logged server-side, no
restart needed).

Once both terminals are running, use this prompt to verify the live agent
path end-to-end — the chat panel shows it above the input with a **"Copy &
fill"** button (copies it to your clipboard and drops it into the input box)
so you don't have to retype it:

```
Find me an EV under $40,000 with at least 250 miles of range
```

Watch the badge in the top-right of the page header: it reads the actual
per-response `source` reported by `/api/chat`, not a guess from env vars —
**"● Live agent"** (green) means the reply came from the real agent, while
**"⚠ Mock agent (no live agent reachable)"** (amber) means it silently fell
back because nothing is listening on the agent port, and **"✖ Live agent
reachable, turn failed"** (red) means the agent process itself answered but
the turn failed server-side — most commonly its MCP tool sources (the
Hosted Skills below) aren't connected yet. The chat bubble shows the actual
error message in that case; see "Start the Hosted Skills locally" below.

To force one mode instead of auto-detecting, set `NEXT_PUBLIC_MOCK` in
`src/web/.env.local` (copy from `.env.example`): `1` always mocks,
`0` always calls the agent and surfaces errors instead of falling back.

### Start the Hosted Skills locally (required for real tool calls)

The agent's model calls always go to the real AI Gateway, but its **tool**
calls (`inventory-search`, `trade-in-value`, `rate-sheet`, `deal-doc`) need
somewhere to land. Unless `TOOLBOX_ENDPOINT` is set in `src/agent/.env` (a
real Foundry Toolbox has been deployed), the agent expects each of the four
Hosted Skills to be running **locally as its own `func start` process** on
its own port — it does **not** run them in-process or fall back silently.
Watch the agent's own startup log for a `CONNECTED, discovered N tool(s)` or
`FAILED to connect/discover tools` line per skill; that tells you immediately
which of the four (if any) aren't up, without needing a tool-using prompt
first.

One-time configuration per skill (repeat for all four: `inventory-search`,
`trade-in-value`, `rate-sheet`, `deal-doc`). Dependency setup is automatic:
`uv run` creates and syncs `.venv` from the skill's `pyproject.toml`.

```bash
cd src/skills/<skill>
cp local.settings.json.example local.settings.json
# edit local.settings.json: copy in your AZURE_AI_GATEWAY_ENDPOINT /
# AZURE_AI_GATEWAY_API_KEY from src/agent/.env — each skill runs its own tiny
# model call and defaults to routing it through the same AI Gateway the agent
# uses, no az login or Foundry project needed. See src/skills/README.md for
# the Foundry-project alternative.
```

PowerShell:

```powershell
cd src/skills/<skill>
Copy-Item local.settings.json.example local.settings.json
# edit local.settings.json: copy in your AZURE_AI_GATEWAY_ENDPOINT /
# AZURE_AI_GATEWAY_API_KEY from src/agent/.env — each skill runs its own tiny
# model call and defaults to routing it through the same AI Gateway the agent
# uses, no az login or Foundry project needed. See src/skills/README.md for
# the Foundry-project alternative.
```

Then, in **four separate terminals** (each skill keeps running as a
foreground server — this is on top of the agent's own terminal and the web
app's terminal), paste one block per terminal:

Terminal A — `inventory-search`:

```bash
cd src/skills/inventory-search
uv run func start --port 7071
```

```powershell
cd src/skills/inventory-search
uv run func start --port 7071
```

Terminal B — `trade-in-value`:

```bash
cd src/skills/trade-in-value
uv run func start --port 7072
```

```powershell
cd src/skills/trade-in-value
uv run func start --port 7072
```

Terminal C — `rate-sheet`:

```bash
cd src/skills/rate-sheet
uv run func start --port 7073
```

```powershell
cd src/skills/rate-sheet
uv run func start --port 7073
```

Terminal D — `deal-doc`:

```bash
cd src/skills/deal-doc
uv run func start --port 7074
```

```powershell
cd src/skills/deal-doc
uv run func start --port 7074
```

Each one logs both an HTTP route and a real MCP tool trigger once it's up:

```text
Functions:
        inventory_search: [POST] http://localhost:7071/api/inventory-search
        agent_inventory_search_builtin_mcp: mcpToolTrigger
```

`src/agent/main.py` auto-connects to all four over MCP at
`http://localhost:707{1..4}/runtime/webhooks/mcp` by default. The root
launcher supplies `INVENTORY_SEARCH_PORT`, `TRADE_IN_VALUE_PORT`,
`RATE_SHEET_PORT`, and `DEAL_DOC_PORT` when Studio allocates different
ports. See [`skills/README.md`](skills/README.md) for the full file layout and an
MCP `tools/list` smoke test you can run against a single skill directly.

### Exercising the agent

`MOCK=1 uv run main.py` is a **one-shot rehearsal**: it prints a fixed mock
vehicle-match payload to the terminal and exits — no server starts. Use it
when you just want confirmation the agent code and deps are wired correctly.

To actually exercise the agent as a running service you can send requests to,
you need real AI Gateway credentials in `src/agent/.env` — provision the
gateway **once** (see [`../TESTING.md`](../TESTING.md) section 4):

```bash
cd infra-ai-gateway
azd env new unity-poc-aigateway
azd provision
cd -
```

`azd provision`'s postprovision hook writes the Gateway endpoint, model
names, and API key straight into `src/agent/.env` (mode `0600`). You only
need to do this once — the `.env` file persists across runs.

Then, every time you want to run the agent as a real server, drop `MOCK=1`.
`main.py` calls `load_dotenv()` on startup, so it reads `src/agent/.env`
automatically — **no manual env exports are needed**, and none of the
`azd provision` values need to be re-set by hand:

```bash
cd src/agent
uv run main.py
```

This starts an HTTP server implementing the Responses protocol on
`http://127.0.0.1:8088` by default. Set `AGENT_PORT` to override it; the
repository launcher does that automatically for a Studio-allocated
workspace. The agent has no interactive CLI/REPL, so talk to it with `curl`
from a separate terminal:

```bash
curl -sS -X POST http://127.0.0.1:8088/responses \
  -H "Content-Type: application/json" \
  -d '{"input":"Find me an EV under $40,000 with at least 250 miles of range","stream":false}' \
  | jq -r '.output[] | select(.type=="message") | .content[0].text'
```

The raw JSON response also includes a `"type":"reasoning"` output item with a
long `encrypted_content` blob — that's the model's encrypted chain-of-thought
trace (kept opaque by design, for continuity across turns), not something to
decode. Piping through `jq` as above filters it out and prints just the
assistant's reply text. Drop the `jq` if you want to see the full raw
response, including `agent_session_id`, token/turn metadata, etc.

That path uses the real `INSTRUCTIONS` system prompt and routes through
Hosted Skills, so you can vary the `input` text to explore matching, quoting,
and financing-handoff behavior.

See [`../TESTING.md`](../TESTING.md) for the full test matrix.

### Corporate network / proxy note

`uv` does not read `pip`'s configured index (`pip.conf` / `PIP_INDEX_URL`) the
way `pip` does, so on a Microsoft corp network it falls back to the public
`files.pythonhosted.org` CDN, which the corp proxy blocks (fails with
`Recv failure: Socket is not connected`, on or off VPN). If `uv run` fails
fetching packages, point it at the same internal mirror `pip` already uses:

```bash
export UV_INDEX_URL="$(pip3 config list 2>/dev/null | sed -n "s/global.index-url='\(.*\)'/\1/p")"
export UV_DEFAULT_INDEX="$UV_INDEX_URL"
```

or hardcode it directly if `pip3 config list` returns nothing:

```bash
export UV_INDEX_URL=https://packagefeedproxy.microsoft.io/pypi/simple/
export UV_DEFAULT_INDEX=https://packagefeedproxy.microsoft.io/pypi/simple/
```

PowerShell:

```powershell
$env:UV_INDEX_URL = python -m pip config get global.index-url 2>$null
if (-not $env:UV_INDEX_URL) {
  $env:UV_INDEX_URL = "https://packagefeedproxy.microsoft.io/pypi/simple/"
}
$env:UV_DEFAULT_INDEX = $env:UV_INDEX_URL
```

`scripts/dev-start.ps1` automates this exact resolution before starting any
component: it respects an existing uv index, otherwise uses pip's configured
index, otherwise falls back to the Microsoft package feed proxy.
