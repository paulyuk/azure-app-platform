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

**Web app and hosted agent are two separate, independent long-running
processes — run each in its own terminal.** By default the web app
**auto-detects** the real agent: it tries calling it first and transparently
falls back to the built-in mock scenario generator if it's not reachable.
So starting only the web app still gives a fully standalone mock demo:

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

To force one mode instead of auto-detecting, set `NEXT_PUBLIC_MOCK` in
`src/web/.env.local` (copy from `.env.example`): `1` always mocks,
`0` always calls the agent and surfaces errors instead of falling back.

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
`http://127.0.0.1:8088` — the agent has no interactive CLI/REPL, so talk to
it with `curl` from a separate terminal:

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
