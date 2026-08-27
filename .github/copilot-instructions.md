# Copilot instructions for this repo

## Python tooling: use `uv` everywhere

Almost every Python component in this repo uses
[`uv`](https://docs.astral.sh/uv/) exclusively — never invoke `python`/`pip`
directly.

- `src/agent/`, `src/sandbox/prequal/`, `src/workflows/loan-approval/` each
  have their own `pyproject.toml`. Use `uv run <command>` from inside that
  directory (e.g. `uv run main.py`, `uv run pytest -q`) — it resolves and
  syncs dependencies automatically. Never add a `python` prefix
  (`uv run main.py`, not `uv run python main.py`) and never hand-create a
  venv or run `pip install` for these.

- `src/skills/*` (`inventory-search`, `trade-in-value`, `rate-sheet`,
  `deal-doc`) are Azure Functions apps, but each still owns a
  `pyproject.toml` for local development. Run `uv run func start --port
  <port>` from inside that skill folder and let uv create/sync `.venv`.
  Keep `requirements.txt` because Azure Functions deployment consumes it,
  and keep its dependencies aligned with `pyproject.toml`.

Before writing or changing anything Python-related, use the component's
`pyproject.toml` and `uv`. Do not introduce manual venv activation or direct
`pip install` steps.

## Windows/PowerShell parity

This repo is actively tested on Windows with PowerShell (pwsh) 7.x, not just
bash/macOS/Linux. When adding or editing setup/run instructions (READMEs,
`TESTING.md`, scripts), make sure they work on both:

- `source .venv/bin/activate` → `.venv\Scripts\Activate.ps1`
- `export VAR=val` → `$env:VAR = "val"`
- `cp a b` → `Copy-Item a b`
- `unset VAR` → `Remove-Item Env:VAR`
- bash `\` line continuation → PowerShell `` ` `` line continuation (or a
  single line) — and note `curl` on Windows here resolves to a real
  `curl.exe`, not a `PowerShell` alias, so flags behave the same either way,
  only the continuation syntax differs
- `cd -` isn't valid in PowerShell → `Push-Location`/`Pop-Location`

Prefer keeping the existing bash block as-is and adding a PowerShell block
immediately after it, rather than replacing bash outright — this repo's
docs target both platforms.

## Dev-test orchestration scripts

`scripts/dev-start.ps1` / `scripts/dev-stop.ps1` automate the manual
multi-terminal setup described in `TESTING.md` / `src/skills/README.md` /
`src/agent/README.md` / `src/web/README.md` (start the 4 Hosted Skills, then
the agent, then the web app; stop by port to catch orphaned child
processes). They must use the same `cd <component>; uv run <command>` pattern
the READMEs document. Keep the script and README commands in sync.
