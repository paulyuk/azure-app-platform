# driveline-web

Buyer-facing chat UI scaffold for Unity Demo #1 (car-buying).  
This is tier **① Surface** from the platform plan, implemented as a TypeScript + Next.js App Router app.

## What this scaffold includes

- Chat interface for Maya-style prompts (streaming-friendly UI)
- `/api/chat` route that auto-detects the real `deal-finder` agent, falling
  back to a mock scenario generator for a fully standalone demo flow
- Vehicle shortlist results grid
- Deal status panel (pending Teams approval → approved → offer emailed)
- `embr.yaml` manifest with platform/run/database/cache/static/healthCheck placeholders

## Run locally

```bash
cd src/web
npm install
npm run dev
```

Open http://localhost:3000.

> By default (`NEXT_PUBLIC_MOCK` unset) the app tries the real agent first
> and falls back to mock responses if it's not reachable — see below. Set
> `NEXT_PUBLIC_MOCK=1` to always mock, or `NEXT_PUBLIC_MOCK=0` to always
> require the real agent (errors surface instead of falling back).

## Live mode: calling the real deal-finder agent

`src/app/api/chat/route.ts` calls the agent (`src/agent`, `ResponsesHostServer`)
server-side via `src/lib/agent-client.ts` — this must happen server-side (not
from the browser) because the agent server sends no CORS headers.

Since auto-detection is the default, no web app config is needed — just
start the real agent alongside the web app:

```bash
# needs real AI Gateway credentials in src/agent/.env — see ../agent/README.md
cd src/agent
uv run main.py
```

Then `npm run dev` (in another terminal) and chat — replies come from the
real model/agent. `AGENT_URL` in `.env.example` defaults to
`http://127.0.0.1:8088`, matching the agent's default port; override it in
`.env.local` if your agent runs elsewhere.

Tool-grounded updates from hosted skills (`inventory-search`, `rate-sheet`,
etc.) and approval-status events from the Durable Task Scheduler workflow are
still not wired into the chat/grid events — only the base agent reply is
live today. The same streaming event contract (`token`, `vehicles`, `status`,
`done`) is used either way, so UI components don't need to change as more of
the backend comes online.

