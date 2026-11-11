# Sandbox tool starter

Implement a bounded tool, then connect it to an ACA Sandbox through the app.
Creation saves source only; it does not provision a Sandbox or change networking.

`main.py` reads one UTF-8 JSON object from stdin, limited to 64 KiB, with a `text`
field of at most 4096 characters. Invalid input exits with code 2. Valid input
currently reports `not_implemented` on stderr and exits with code 1; stdout stays
empty. Replace that explicit failure with the operation and a bounded JSON result
matching `contract.json`. Do not acknowledge unfinished work as successful.

## Local development

Use Python 3.12+ and uv. There are no third-party dependencies to restore.
Run from this directory; this local command is not isolated, so use synthetic data.

```shell
uv run --offline main.py
```

Paste `{"text":"Synthetic sample"}` into stdin, then end input with Ctrl+D on
macOS/Linux or Ctrl+Z followed by Enter on Windows.

The Dockerfile restores the dependency-free environment offline and runs as a
non-root user. Building requires Docker and access to the uv Python base image:

```shell
docker build -t sandbox-tool .
```

To exercise the container with local networking disabled:

**PowerShell**

```powershell
'{"text":"Synthetic sample"}' | docker run --rm -i --network none --read-only --cap-drop ALL --security-opt no-new-privileges sandbox-tool
```

**macOS/Linux**

```bash
printf '%s\n' '{"text":"Synthetic sample"}' | docker run --rm -i --network none --read-only --cap-drop ALL --security-opt no-new-privileges sandbox-tool
```

## Connect and verify

Keep the agent loop, model calls, and gateway credentials outside this tool.
Configure the actual ACA Sandbox connection, execution timeout, output limit,
and deny-by-default egress policy before using untrusted input.
`egress-policy.yaml` defines `defaultAction: Deny`, `trafficInspection: Full`,
and commented proxy-side `Transform` examples. Apply it to the existing Sandbox
and inspect the platform decisions, substituting the actual identifiers:

```shell
aca sandbox egress apply --id <sandbox-id> --group <group> --resource-group <resource-group> --region <region> --file egress-policy.yaml
aca sandbox egress decisions --id <sandbox-id> --group <group> --resource-group <resource-group> --region <region> --output json
```

Saving the policy does not apply it. Keep authenticated headers in proxy-side
`secretRef` or `managedIdentityRef` references, not environment variables or
mounted files. `egress-policy.md` provides additional guidance.
Test invalid and oversized inputs, operation failures, and output bounds.
Do not log raw documents or secrets, provision resources, or deploy as part of
an AI source adjustment.
