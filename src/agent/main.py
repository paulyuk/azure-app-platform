"""Foundry hosted-agent entry point for Unity Demo #1 (deal-finder)."""

import json
import os

from dotenv import load_dotenv

load_dotenv()

# SDKStats probes Azure VM metadata; skip that for local runs.
if not os.environ.get("FOUNDRY_HOSTING_ENVIRONMENT"):
    os.environ.setdefault("MICROSOFT_OTEL_SDKSTATS_DISABLED", "true")

from agent_framework import Agent
from agent_framework.openai import OpenAIChatClient
from agent_framework_foundry_hosting import FoundryToolbox, ResponsesHostServer
from azure.identity import DefaultAzureCredential

DEFAULT_GATEWAY_MODEL = "gpt-latest"
DEFAULT_GATEWAY_MINI_MODEL = "gpt-mini-latest"
DEFAULT_MAX_OUTPUT_TOKENS = 2_048
OPENAI_NO_BEARER_AUTH = "workload-identity-auth"

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
    return OpenAIChatClient(
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


def _resolve_tools() -> list:
    """Always try to give the agent real tools; no explicit mode switches.

    If a Foundry Toolbox has been provisioned (`TOOLBOX_ENDPOINT` set), use it
    - that's the real production path. Otherwise, run the Hosted Skills
    in-process from `src/skills/` via `local_skills.py` so the agent still has
    real, working tools without requiring cloud provisioning first.
    """
    if os.environ.get("TOOLBOX_ENDPOINT"):
        return [_foundry_toolbox()]

    from local_skills import load_local_skill_tools

    return load_local_skill_tools()


def build_agent() -> Agent:
    return Agent(
        client=_gateway_client(),
        name="deal-finder",
        description="Car-buying assistant for Unity Demo #1, routed through AI Gateway.",
        instructions=INSTRUCTIONS,
        tools=_resolve_tools(),
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
    ResponsesHostServer(build_agent()).run()


if __name__ == "__main__":
    main()
