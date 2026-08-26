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
`python`/`pip` directly. `uv run` provisions an ephemeral virtualenv per
command from each project's `requirements.txt`, so there is nothing to
activate by hand.

```bash
# Python checks (from the repository root)
uv run --with pytest pytest src/sandbox/prequal -q
uv run --with-requirements src/workflows/loan-approval/requirements.txt --with pytest pytest src/workflows/loan-approval -q
uv run python -m compileall src/agent src/skills

# Web app (no Azure required, from the repository root)
cd src/web
npm install
npm run dev

# Hosted agent, offline mock mode (no Azure required, from the repository root)
cd src/agent
uv run --with-requirements requirements.txt python main.py   # set MOCK=1 for a deterministic offline run
```

See [`../TESTING.md`](../TESTING.md) for the full test matrix, including
running the hosted agent against the already-provisioned real AI Gateway.

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
