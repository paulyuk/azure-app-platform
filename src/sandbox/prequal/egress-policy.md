# Intended production egress policy

This scaffold cannot enforce an Azure Container Apps SandboxGroup network policy
locally. The production `Microsoft.App/SandboxGroups` tier-S deployment must:

1. Default-deny all outbound traffic.
2. Allow HTTPS (TCP 443) only to the exact lender-stub FQDN. Do not use a
   wildcard domain.
3. Allow only the platform DNS path required to resolve that FQDN.
4. Explicitly deny private address ranges, the Embr/Postgres network, Azure
   metadata endpoints, and every other public destination.
5. Disable payload capture. Emit only create/execute/delete lifecycle events,
   duration, and exit status.
6. Auto-delete each sandbox after the verdict is read.

The checked-in `lender_stub.py` makes no network calls. When the production stub
is hosted separately, its hostname is the sole application destination in the
allow-list. Before a demo, verify the policy from inside a sandbox: the stub
must succeed, while the app database and an unrelated HTTPS endpoint must fail.
Treat failure of either negative test as a release blocker.
