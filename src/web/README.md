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
> Set `NEXT_PUBLIC_MOCK=0` to turn off mock behavior once backend integration is available.

## Integration TODO (real agent path)

Today, `src/app/api/chat/route.ts` returns scripted mock responses.  
To wire the real flow, replace its mock responder with:

1. **AI Gateway call** to the Foundry-hosted `deal-finder` agent endpoint (Responses protocol/streaming events).
2. **Tool-grounded updates** from hosted skills (`inventory-search`, `rate-sheet`, etc.) mapped into chat + grid events.
3. **Approval status events** from Durable Task Scheduler workflow state.

Recommended extension point: keep the same streaming event contract (`token`, `vehicles`, `status`, `done`) so UI components remain unchanged while backend moves from mock to production.

