# src

Application code for Demo #1 (car buying) lives here once the POC build starts, organized per tier from the platform plan:

- `web/` - front end web client (Embr project, `driveline-web`)
- `agent/` - Foundry Hosted Agent definition (`deal-finder`)
- `skills/` - Hosted Skills (Functions apps): `inventory-search`, `trade-in-value`, `rate-sheet`, `deal-doc`
- `workflows/` - Durable Task Scheduler orchestrations (loan approval, human-in-the-loop)
- `sandbox/` - sandboxed financing calculation that never leaks PII

See [`docs/unity-platform-plan.md`](../docs/unity-platform-plan.md) for the full architecture and phased build plan (section 5).
