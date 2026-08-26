"""Hosted Skill entry point for `deal-doc`, on the real
`azurefunctions-agents-runtime` (serverless agents runtime) package.

The runtime discovers `skills/deal-doc.agent.md` (front matter + instructions),
auto-discovers the `@tool`-decorated function in `tools/deal_doc.py`, and
registers the resulting agent's HTTP trigger plus its
`builtin_endpoints.mcp: true` MCP tool endpoint (`/runtime/webhooks/mcp`) -
the same Streamable HTTP transport a real Foundry Toolbox uses, just pointed
at localhost during local dev.
"""

from azure_functions_agents import create_function_app

app = create_function_app()
