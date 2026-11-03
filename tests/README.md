# tests

Automated tests for the Demo #1 POC. Mirrors `src/` by tier: unit tests for skills and the sandbox calculation, integration tests for the agent-to-gateway-to-skill path, and workflow tests for the durable approval flow (including the "kill mid-approval and resume" scenario called out in the plan).

See [`docs/azure-app-platform-plan.md`](../docs/azure-app-platform-plan.md), section 5.2 ("Real vs. mocked"), for what's real versus stubbed at each phase.
