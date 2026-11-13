# Service Architecture & Launch Checklist

## Overview
- **Service**: Northwind Customer Portal (`northwind-portal-prod`)
- **Frontend**: Azure App Service Builder (`builder.yaml`, Python 3.12 + FastAPI)
- **Model Governance**: Azure AI Gateway (`gw-northwind-prod`) routing `gpt-5.4-mini`
- **Owner**: Platform Engineering (`platform-eng@contoso.com`)
- **Target Launch Date**: 2026-05-15

## Key Decisions & Open Risks
1. **Authentication**: Managed Identity is configured for production model routing; local development uses short-lived gateway API keys.
2. **Rate Limiting**: Gateway token policy caps burst traffic at 60 requests/minute per client identity.
3. **Open Risk (High)**: Fallback model alias `chat-fallback` is not yet bound in `eastus2` for regional failover.
4. **Action Item**: Verify content safety policy and complete load test before final sign-off on 2026-05-10.
