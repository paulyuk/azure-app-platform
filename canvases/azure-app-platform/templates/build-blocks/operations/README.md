# Operations / SRE Agent starter

`sre-agent.yaml` is a desired configuration and runbook seam, not a deployed SRE
Agent, supported Azure deployment schema, active alert, or healthy connection.

Select real telemetry resources and measurable health signals. Record alert
thresholds, ownership, incident evidence, and escalation before connecting an
operations runtime. Keep remediation disabled until scope, least-privilege
permissions, explicit approval, rollback, and audit logging are implemented.
Do not store secrets or raw customer payloads in the runbook.

Use Adjust with AI to adapt this starter to the app's existing observability
stack. Monitoring and Azure SRE Agent provisioning are separate operations.
