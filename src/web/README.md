# driveline-web

Buyer-facing chat UI scaffold for Unity Demo #1 (car-buying).  
This is tier **① Surface** from the platform plan, implemented as a TypeScript + Next.js App Router app.

## What this scaffold includes

- Chat interface for Maya-style prompts (streaming-friendly UI)
- Mock `/api/chat` route for a fully standalone demo flow
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

> Mock mode is on by default (`NEXT_PUBLIC_MOCK=1` behavior).  
> Set `NEXT_PUBLIC_MOCK=0` to call the real `deal-finder` agent instead.

## Live mode: calling the real deal-finder agent

`src/app/api/chat/route.ts` calls the agent (`src/agent`, `ResponsesHostServer`)
server-side via `src/lib/agent-client.ts` — this must happen server-side (not
from the browser) because the agent server sends no CORS headers.

1. Start the agent in another terminal (needs real AI Gateway credentials in
   `src/agent/.env` — see `../agent/README.md`):
   ```bash
   cd src/agent
   uv run main.py
   ```
2. Point the web app at it:
   ```bash
   cp .env.example .env.local
   ```
   Then set `NEXT_PUBLIC_MOCK=0` in `.env.local` (`AGENT_URL` defaults to
   `http://127.0.0.1:8088`, matching the agent's default port).
3. `npm run dev` and chat — replies now come from the real model/agent.

Tool-grounded updates from hosted skills (`inventory-search`, `rate-sheet`,
etc.) and approval-status events from the Durable Task Scheduler workflow are
still not wired into the chat/grid events — only the base agent reply is
live today. The same streaming event contract (`token`, `vehicles`, `status`,
`done`) is used either way, so UI components don't need to change as more of
the backend comes online.

