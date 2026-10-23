"""Hosted Skill entry point for `rate-sheet`, on the real
`azurefunctions-agents-runtime` (serverless agents runtime) package.

The runtime discovers `skills/rate-sheet.agent.md` (front matter + instructions),
auto-discovers the `@tool`-decorated function in `tools/rate_sheet.py`, and
registers the resulting agent's HTTP trigger plus its
`builtin_endpoints.mcp: true` MCP tool endpoint (`/runtime/webhooks/mcp`) -
the same Streamable HTTP transport a real Foundry Toolbox uses, just pointed
at localhost during local dev.
"""

from azure_functions_agents import create_function_app
from openai._client import AsyncOpenAI, WORKLOAD_IDENTITY_API_KEY_PLACEHOLDER

_orig_prepare_request = AsyncOpenAI._prepare_request


async def _strip_placeholder_bearer_auth(self, request):
    await _orig_prepare_request(self, request)
    if request.headers.get("authorization") == f"Bearer {WORKLOAD_IDENTITY_API_KEY_PLACEHOLDER}":
        del request.headers["authorization"]


AsyncOpenAI._prepare_request = _strip_placeholder_bearer_auth

app = create_function_app()
