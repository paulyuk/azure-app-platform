# Synthetic loan pre-qualification sandbox

This tier-S calculator demonstrates the financing boundary:

`prequal form → agent → SandboxGroup create → exec → read verdict → delete`

The form uses **synthetic PII-shaped data only**. `synthetic_data` must be
`true`, names must start with `Synthetic `, and IDs must match
`SYN-###-##-####`. Never submit real names, identifiers, or financial data.
Inputs exist only inside the ephemeral sandbox. The output contains a verdict,
synthetic credit band, estimated APR/payment, term, and generic reasons—never
the input. Payloads must not be logged or placed in prompts, telemetry, or a
database.

`lender_stub.py` is the mocked “credit-bureau soft pull.” It is deterministic,
canned, and performs no network I/O. Production keeps the real sandbox
lifecycle and deny-all egress posture, allowing only a separately hosted lender
stub as documented in [egress-policy.md](egress-policy.md).

Run locally with synthetic data:

```bash
echo '{"name":"Synthetic Maya","synthetic_id":"SYN-123-45-6789","income":90000,"requested_loan_amount":28000,"vehicle_price":35000,"synthetic_data":true}' \
  | python3 main.py
```

Build with `docker build -t unity-prequal .`. The container reads one JSON
object from stdin and writes one JSON verdict to stdout.
