# Connector contract starter

`connector.json` records a desired external API, SaaS, or Microsoft Graph
connection. It is not an ARM deployment template, an existing Azure resource,
or an adapter that enforces the declared limits.

Choose the provider and allowed HTTPS endpoint. Confirm its authentication
support and least-privilege scopes before replacing the null fields. Define
bounded operations and implement an adapter with input validation, endpoint
allowlisting, timeouts, rate-limit handling, and safe retries. Reference secrets
through approved configuration, never inline in this file.

Use Adjust with AI to implement the adapter in the app's existing runtime.
Connect and test it separately; file discovery does not prove connectivity.
