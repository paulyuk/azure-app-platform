# AI Gateway binding

Bind the app to an OpenAI-compatible endpoint exposed through API Management
AI Gateway. The runtime never returns a fake model answer: `/invoke` calls this
endpoint, or returns an explicit `gateway-not-configured`/upstream error.

`config/runtime.json` maps these environment variables:

| Variable | Purpose |
| --- | --- |
| `AI_GATEWAY_BASE_URL` | Required OpenAI-compatible base URL, ending before `chat/completions`. |
| `AI_GATEWAY_MODEL` | Optional deployment/model override; defaults to `gpt-5.6-sol`. |
| `AI_GATEWAY_API_KEY` | Optional key sent using `gateway.apiKeyHeader`. |
| `AI_GATEWAY_BEARER_TOKEN` | Optional static bearer token. |
| `AI_GATEWAY_SUBSCRIPTION_KEY` | Optional APIM subscription key. |
| `AI_GATEWAY_USE_AZURE_IDENTITY` | Set to `true` to use `DefaultAzureCredential`. |

At least one configured authentication method is required unless
`gateway.allowAnonymous` is deliberately changed to `true`. Prefer managed
identity in Azure. Do not put gateway credentials in the document-tool image or
session pool.

The local runtime uses the Chat Completions path configured by
`gateway.chatCompletionsPath`. The Copilot SDK worker uses the same base URL as
a BYOK provider and the `gateway.wireApi` setting.
