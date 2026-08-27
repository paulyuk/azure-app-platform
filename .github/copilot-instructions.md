# Copilot instructions for this repo

## Python tooling: use `uv` everywhere

Almost every Python component in this repo uses
[`uv`](https://docs.astral.sh/uv/) exclusively — never invoke `python`/`pip`
directly.

- `src/agent/`, `src/sandbox/prequal/`, `src/workflows/loan-approval/` each
  have their own `pyproject.toml`. Use `uv run <command>` from inside that
  directory (e.g. `uv run main.py`, `uv run pytest -q`) — it resolves and
  syncs dependencies automatically. Run executable scripts directly
  (`uv run main.py`, not `uv run python main.py`); use
  `uv run python -m <module>` only for Python module commands such as
  `compileall`. Never hand-create a venv or run `pip install` for these.

- `src/skills/*` (`inventory-search`, `trade-in-value`, `rate-sheet`,
  `deal-doc`) are Azure Functions apps, but each still owns a
  `pyproject.toml` for local development. Run `uv run func start --port
  <port>` from inside that skill folder and let uv create/sync `.venv`.
  Keep `requirements.txt` because Azure Functions deployment consumes it,
  and keep its dependencies aligned with `pyproject.toml`.

Before writing or changing anything Python-related, use the component's
`pyproject.toml` and `uv`. Do not introduce manual venv activation or direct
`pip install` steps.

### Corporate Python package index

Public `files.pythonhosted.org` is blocked by the Microsoft corporate proxy.
Do not diagnose its TLS handshake failure as an old-pip problem and do not
switch between pip and uv trying to bypass it. Follow the documented index
resolution in `src/README.md`:

1. Respect existing `UV_DEFAULT_INDEX` / `UV_INDEX_URL`.
2. Otherwise inherit pip's configured index when present.
3. Otherwise use `https://packagefeedproxy.microsoft.io/pypi/simple/`.

The dev-start scripts automate this exact order. Keep the scripts and README
in sync if the package-index policy changes.

## Windows/PowerShell parity

This repo is actively tested on Windows with PowerShell (pwsh) 7.x, not just
bash/macOS/Linux. When adding or editing setup/run instructions (READMEs,
`TESTING.md`, scripts), make sure they work on both:

- `source .venv/bin/activate` → `.venv\Scripts\Activate.ps1`
- `export VAR=val` → `$env:VAR = "val"`
- `cp a b` → `Copy-Item a b`
- `unset VAR` → `Remove-Item Env:VAR`
- bash `\` line continuation → PowerShell `` ` `` line continuation (or a
  single line)
- Do not assume `curl` works on Windows. Use native PowerShell HTTP commands
  such as `Invoke-RestMethod` or `Invoke-WebRequest` in Windows instructions.
- `cd -` isn't valid in PowerShell → `Push-Location`/`Pop-Location`

Use separate PowerShell and macOS/Linux blocks only when the commands differ.
When the same commands work unchanged in every shell, use one generic
`shell` block instead of duplicating it.

When instructions require multiple concurrently running terminal windows,
put each terminal's commands in its own independently copyable fenced shell
block. Never combine Terminal A/B/C/D commands into one enclosure. Label each
terminal and provide separate PowerShell and macOS/Linux blocks wherever the
commands differ.

## Dev-test orchestration scripts

`scripts/dev-start.ps1` / `scripts/dev-stop.ps1` and
`scripts/dev-start.sh` / `scripts/dev-stop.sh` automate the manual
multi-terminal setup described in `TESTING.md` / `src/skills/README.md` /
`src/agent/README.md` / `src/web/README.md`.

### Pit-of-success ordering

Documentation and automation must lead users through the successful order,
not use failure as control flow:

1. Provision the standalone AI Gateway first with `azd provision`; this
   creates the gitignored `src/agent/.env`.
2. Start ephemeral Azurite.
3. Start all four Hosted Skills and wait until ports 7071-7074 listen.
4. Start the deal-finder agent and wait for port 8088.
5. Start the web app and wait for port 3000.

Never instruct users to run dev-start, discover `.env` is missing, provision,
then run dev-start again. Do not silently skip a missing dependency and print
a success-shaped summary: either satisfy the prerequisite automatically or
fail before starting downstream components with a direct remediation message.

### README/script parity

The scripts automate the README commands; they must not introduce a separate
setup model. Use the same `cd <component>; uv run <command>` pattern. If a
README command, dependency, port, environment variable, or startup order
changes, update both PowerShell and POSIX scripts in the same change.

### Azurite requirements

Hosted Skill MCP discovery can succeed while invocation still fails when the
Functions runtime accesses Storage. Start local Azurite with all of:

```shell
azurite --silent --inMemoryPersistence --skipApiVersionCheck --disableTelemetry
```

- `--skipApiVersionCheck` is the standard workaround when Functions requests
  Storage API version `2026-06-06` (or another version newer than Azurite
  recognizes).
- `--inMemoryPersistence` keeps test storage ephemeral. Do not persist
  Azurite data in the worktree.

### Readiness and cleanup

Port readiness is necessary but not sufficient. The agent startup log must
show successful MCP connection and tool discovery for all four skills, and
an end-to-end test must invoke a real tool-backed prompt. A successful
`tools/list` alone does not prove tool invocation works.

Start fresh by default so dependency order is deterministic. Record launcher
PIDs immediately, capture per-process stdout/stderr, show log tails on
readiness failure, and clean up both tracked process trees and known listening
ports. `func start` and `npm run dev` spawn child processes, so killing only
the initial launcher PID is insufficient.
