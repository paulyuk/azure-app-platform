# Durable loan approval

`LoanApprovalOrchestrator` implements the Durable Functions
human-in-the-loop pattern on the Python isolated worker:

1. Start with a synthetic deal ID and pre-qualification verdict (no PII).
2. Call the stubbed `PostTeamsAdaptiveCard` activity.
3. Race the `LoanApprovalDecision` external event against a durable timer.
4. Run the approve, decline, or escalation activity.

The timeout is compressed to approximately 90 seconds for the demo. Production
would use the lender's real approval window. Unknown event values and timer
expiry safely escalate.

The orchestration is deterministic and replay-safe: external work occurs only
in activities, and the deadline uses the durable context clock. State is
checkpointed by Durable Functions/Durable Task Scheduler. The key demo beat is:
**restart the Functions app mid-approval; the orchestration resumes**. Start an
instance, wait for the Teams-card activity, restart the host, and then raise the
event; the existing instance continues rather than starting over.

## Local scaffold

Create local settings from `local.settings.json.example`, install
`requirements.txt`, and run with Azure Functions Core Tools. Start via
`POST /api/loan-approval/start`, then submit a synthetic decision to
`POST /api/loan-approval/{instanceId}/decision`:

```json
{"decision": "approve"}
```

The Teams activity is intentionally stubbed. A production connector activity
must send only a synthetic/non-sensitive deal reference and must keep customer
data out of orchestration history and telemetry.
