"""Foundry hosted-agent entry point for Unity Demo #1 (deal-finder)."""

import asyncio
import json
import logging
import os
import sys

from dotenv import load_dotenv

load_dotenv()

# SDKStats probes Azure VM metadata; skip that for local runs.
if not os.environ.get("FOUNDRY_HOSTING_ENVIRONMENT"):
    os.environ.setdefault("MICROSOFT_OTEL_SDKSTATS_DISABLED", "true")

from agent_framework import (
    Agent,
    ChatResponse,
    ChatResponseUpdate,
    Content,
    ResponseStream,
)
from agent_framework.openai import OpenAIChatClient
from agent_framework_foundry_hosting import FoundryToolbox, ResponsesHostServer
from azure.identity import DefaultAzureCredential

DEFAULT_GATEWAY_MODEL = "gpt-latest"
DEFAULT_GATEWAY_MINI_MODEL = "gpt-mini-latest"
DEFAULT_MAX_OUTPUT_TOKENS = 2_048
OPENAI_NO_BEARER_AUTH = "workload-identity-auth"

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("deal-finder")


class BufferedGatewayChatClient(OpenAIChatClient):
    """Adapt AI Gateway's buffered Responses route to Agent Framework streaming."""

    def get_response(self, messages, *, stream=False, **kwargs):
        if not stream:
            return super().get_response(messages, stream=False, **kwargs)

        async def buffered_updates():
            response = await super(BufferedGatewayChatClient, self).get_response(
                messages,
                stream=False,
                **kwargs,
            )
            last_index = len(response.messages) - 1
            for index, message in enumerate(response.messages):
                contents = list(message.contents)
                if index == last_index and response.usage_details:
                    contents.append(Content.from_usage(response.usage_details))
                yield ChatResponseUpdate(
                    contents=contents,
                    role=message.role,
                    author_name=message.author_name,
                    response_id=response.response_id,
                    message_id=message.message_id,
                    conversation_id=response.conversation_id,
                    model=response.model,
                    created_at=response.created_at,
                    finish_reason=response.finish_reason if index == last_index else None,
                    continuation_token=response.continuation_token,
                )

        return ResponseStream(buffered_updates(), finalizer=ChatResponse.from_updates)


INSTRUCTIONS = """
You are deal-finder, the Unity Demo #1 car-buying hosted agent.

Narrative flow to follow:
1) Help the shopper discover matching vehicles.
2) Assemble a quote with price and terms.
3) Collect contact context needed to close the loop.
4) Prepare financing inputs and outputs for the workflow handoff.

You must use hosted skills via the Foundry Toolbox instead of inventing data:
- inventory-search: search inventory and filters
- trade-in-value: estimate trade-in value
- rate-sheet: fetch lender rate options
- deal-doc: generate the customer-facing offer summary

Tooling and governance rules:
- Route all model calls through AI Gateway.
- Route all tool calls through Foundry Toolbox (toolbox -> AI Gateway MCP toolserver).
- Use gpt-mini-latest for simple classification/filtering turns.
- Use gpt-latest for final synthesis and customer-facing summaries.
- Never expose secrets. Never claim a tool result you did not receive.
"""


def _gateway_settings() -> tuple[str, str]:
    gateway_endpoint = os.environ.get("AZURE_AI_GATEWAY_ENDPOINT")
    if not gateway_endpoint:
        raise RuntimeError("Set AZURE_AI_GATEWAY_ENDPOINT to the AI Gateway endpoint.")

    gateway_key = os.environ.get("AZURE_AI_GATEWAY_API_KEY")
    if not gateway_key:
        raise RuntimeError("Set AZURE_AI_GATEWAY_API_KEY to an AI Gateway key.")

    return gateway_endpoint.rstrip("/"), gateway_key


def _gateway_client() -> OpenAIChatClient:
    gateway_endpoint, gateway_key = _gateway_settings()
    return BufferedGatewayChatClient(
        model=os.environ.get("AZURE_AI_GATEWAY_MODEL", DEFAULT_GATEWAY_MODEL),
        base_url=gateway_endpoint + "/default/models/openai/v1/",
        # Transport placeholder so auth comes from Api-Key header.
        api_key=OPENAI_NO_BEARER_AUTH,
        default_headers={"Api-Key": gateway_key},
    )


def _foundry_toolbox() -> FoundryToolbox:
    # FoundryToolbox resolves the configured toolbox endpoint/name from env and uses
    # Entra identity for hosted scenarios.
    return FoundryToolbox(
        DefaultAzureCredential(
            exclude_managed_identity_credential=not bool(
                os.environ.get("FOUNDRY_HOSTING_ENVIRONMENT")
            )
        ),
        timeout=60,
    )


# Local Hosted Skills run as separate `func start` processes (real Azure
# Functions apps on the serverless agents runtime), each on its own port, each
# exposing itself as a real MCP tool at /runtime/webhooks/mcp. See
# `src/skills/README.md` "Run the Hosted Skills locally" for how to start them.
LOCAL_SKILL_PORTS: dict[str, int] = {
    "inventory-search": 7071,
    "trade-in-value": 7072,
    "rate-sheet": 7073,
    "deal-doc": 7074,
}


def _local_skill_tools() -> list:
    """Connect to the 4 Hosted Skills running locally via `func start`.

    Each skill is a real Azure Functions app built on the
    `azurefunctions-agents-runtime` package, exposing its tool as a real MCP
    server at `http://localhost:<port>/runtime/webhooks/mcp`. `FoundryToolbox`
    (used in `_foundry_toolbox()` for the cloud path) is itself a subclass of
    `agent_framework.MCPStreamableHTTPTool`, so the same Streamable HTTP
    transport is used here - just pointed at localhost instead of a
    provisioned toolbox endpoint.
    """
    from agent_framework import MCPStreamableHTTPTool

    return [
        MCPStreamableHTTPTool(
            name=skill_name,
            url=f"http://localhost:{port}/runtime/webhooks/mcp",
        )
        for skill_name, port in LOCAL_SKILL_PORTS.items()
    ]


def _resolve_tools() -> list:
    """Always try to give the agent real tools; no explicit mode switches.

    If a Foundry Toolbox has been provisioned (`TOOLBOX_ENDPOINT` set), use it
    - that's the real production path. Otherwise, connect to the 4 Hosted
    Skills running locally (`func start`, one per skill) over real MCP.
    """
    if os.environ.get("TOOLBOX_ENDPOINT"):
        return [_foundry_toolbox()]

    return _local_skill_tools()


async def _diagnose_mcp_tools(tools: list) -> bool:
    """Eagerly connect to every MCP tool at startup and log what happened.

    This makes the three layers of "is it live" visible independently:
    1) did the process start and load config (gateway settings, imports)?
    2) is each MCP tool server reachable (TCP/HTTP connect)?
    3) did tool discovery succeed (did it enumerate real tool functions)?

    A request-time-only failure ("MCP server failed to initialize") gives no
    hint which of the N skills is down or whether it's a connectivity vs.
    protocol problem. Doing this eagerly at boot, per-tool, with clear
    PASS/FAIL lines, means a broken skill is visible in agent stdout before
    the web app ever sends a request.
    """
    all_ok = True
    for tool in tools:
        tool_name = getattr(tool, "name", tool.__class__.__name__)
        tool_url = getattr(tool, "url", None)
        location = f" ({tool_url})" if tool_url else ""
        try:
            await tool.connect()
            await tool.load_tools()
            function_names = [fn.name for fn in tool.functions]
            logger.info(
                "MCP tool '%s'%s: CONNECTED, discovered %d tool(s): %s",
                tool_name,
                location,
                len(function_names),
                ", ".join(function_names) if function_names else "(none)",
            )
        except Exception as exc:  # noqa: BLE001 - report every failure, don't stop at the first
            all_ok = False
            logger.error(
                "MCP tool '%s'%s: FAILED to connect/discover tools - %s: %s",
                tool_name,
                location,
                type(exc).__name__,
                exc,
            )
        finally:
            try:
                await tool.close()
            except Exception:  # noqa: BLE001 - best-effort cleanup, don't mask the real error above
                pass
    return all_ok


def build_agent() -> Agent:
    tools = _resolve_tools()

    logger.info(
        "Resolving agent tools: %s mode, %d tool source(s) configured.",
        "Foundry Toolbox" if os.environ.get("TOOLBOX_ENDPOINT") else "local Hosted Skills",
        len(tools),
    )
    tools_ok = asyncio.run(_diagnose_mcp_tools(tools))
    if not tools_ok:
        logger.warning(
            "One or more MCP tool sources failed to connect at startup. "
            "The agent will still start, but tool-dependent requests will fail "
            "with 'MCP server failed to initialize' until this is fixed. "
            "For local Hosted Skills, see src/skills/README.md 'Run the Hosted "
            "Skills locally' (each skill needs `func start` on its own port)."
        )
    else:
        logger.info("All MCP tool sources connected successfully.")

    return Agent(
        client=_gateway_client(),
        name="deal-finder",
        description="Car-buying assistant for Unity Demo #1, routed through AI Gateway.",
        instructions=INSTRUCTIONS,
        tools=tools,
        default_options={"store": False, "max_tokens": DEFAULT_MAX_OUTPUT_TOKENS},
    )


def _run_mock_mode() -> None:
    """Offline mode for Phase 6 demo rehearsal (`MOCK=1`)."""
    mock_payload = {
        "mode": "MOCK",
        "agent": "deal-finder",
        "note": "Offline scaffold mode: no model/tool network calls were made.",
        "vehicle_matches": [
            {"vin": "MOCK-EV-1001", "price": 36995, "range_miles": 282},
            {"vin": "MOCK-EV-1002", "price": 37950, "range_miles": 301},
        ],
        "skills_referenced": [
            "inventory-search",
            "trade-in-value",
            "rate-sheet",
            "deal-doc",
        ],
    }
    print(json.dumps(mock_payload, indent=2))


def main() -> None:
    if os.environ.get("MOCK") == "1":
        _run_mock_mode()
        return

    logger.info("Starting deal-finder agent process...")
    try:
        gateway_endpoint, _ = _gateway_settings()
        logger.info(
            "AI Gateway config loaded: endpoint=%s model=%s mini_model=%s",
            gateway_endpoint,
            os.environ.get("AZURE_AI_GATEWAY_MODEL", DEFAULT_GATEWAY_MODEL),
            os.environ.get("AZURE_AI_GATEWAY_MINI_MODEL", DEFAULT_GATEWAY_MINI_MODEL),
        )
    except RuntimeError as exc:
        logger.error("AI Gateway config missing: %s", exc)
        raise

    agent = build_agent()
    logger.info("Agent built. Starting Responses host server on http://127.0.0.1:8088 ...")
    ResponsesHostServer(agent).run()


if __name__ == "__main__":
    main()
