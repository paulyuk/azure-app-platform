from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from config import load_config
from gateway import GatewayAgentService


def valid_env() -> dict[str, str]:
    return {
        "APP_PUBLIC_HOST": "sample-agent.app.westus2.builderapps.dev",
        "SAMPLE_EXPIRES_AT": "2026-04-20T01:30:00Z",
        "AZURE_CLIENT_ID": "11111111-2222-3333-4444-555555555555",
        "AZURE_AI_GATEWAY_HOST": "sample-gw.ai.gateway.azure.com",
    }


def fixed_now() -> datetime:
    return datetime(2026, 4, 20, 0, 0, tzinfo=timezone.utc)


def test_load_config_builds_gateway_url_and_origin() -> None:
    config = load_config(valid_env(), now=fixed_now())
    assert config.origin == "https://sample-agent.app.westus2.builderapps.dev"
    assert (
        config.model_url
        == "https://sample-gw.ai.gateway.azure.com/default/models/openai/v1/"
    )
    assert config.model == "appservice-chat"
    assert config.is_expired(fixed_now()) is False


def test_load_config_supports_local_ai_gateway_env() -> None:
    config = load_config(
        {
            "AI_GATEWAY_BASE_URL": "https://my-gw.ai.gateway.azure.com/default/models/openai/v1",
            "AI_GATEWAY_API_KEY": "secret-key",
            "AI_GATEWAY_MODEL": "gpt-5.4",
        },
        now=fixed_now(),
    )
    assert config.gateway_host == "my-gw.ai.gateway.azure.com"
    assert config.model_url == "https://my-gw.ai.gateway.azure.com/default/models/openai/v1/"
    assert config.model == "gpt-5.4"
    assert config.api_key == "secret-key"
    assert config.is_expired(fixed_now()) is False
    assert config.allowed_origin("http://127.0.0.1:8080") is True
    assert config.allowed_origin("http://localhost:8080") is True


@pytest.mark.parametrize(
    ("overrides", "expected_message"),
    [
        ({"APP_PUBLIC_HOST": "localhost"}, "APP_PUBLIC_HOST"),
        ({"AZURE_AI_GATEWAY_HOST": "example.com"}, "AZURE_AI_GATEWAY_HOST"),
        ({"AZURE_CLIENT_ID": "00000000-0000-0000-0000-000000000000"}, "AZURE_CLIENT_ID"),
        ({"SAMPLE_EXPIRES_AT": "2026-04-19T23:59:00Z"}, "future"),
        ({"SAMPLE_EXPIRES_AT": "2026-04-20T03:00:00Z"}, "2 hours"),
    ],
)
def test_load_config_rejects_invalid_settings(
    overrides: dict[str, str],
    expected_message: str,
) -> None:
    env = valid_env() | overrides
    with pytest.raises(ValueError, match=expected_message):
        load_config(env, now=fixed_now())


def test_gateway_agent_service_streams_non_empty_updates() -> None:
    from agent_framework import ChatResponseUpdate, Content, ResponseStream

    config = load_config(valid_env(), now=fixed_now())
    seen_messages = []

    class FakeChatClient:
        def get_response(self, messages, *, stream: bool = False, options=None, **kwargs):
            assert stream is True
            seen_messages.extend(messages)

            async def generator():
                yield ChatResponseUpdate(contents=[Content.from_text("Hello")])
                yield ChatResponseUpdate(contents=[Content.from_text("")])
                yield ChatResponseUpdate(contents=[Content.from_text(" from gateway")])

            return ResponseStream(generator())

    async def collect() -> list[str]:
        service = GatewayAgentService(config, chat_client=FakeChatClient())
        try:
            chunks = []
            async for item in service.stream_text(
                [{"role": "user", "content": "Test the gateway"}]
            ):
                chunks.append(item)
            return chunks
        finally:
            await service.aclose()

    chunks = asyncio.run(collect())
    assert chunks == ["Hello", " from gateway"]
    assert len(seen_messages) == 1
    assert seen_messages[0].role == "user"
    assert seen_messages[0].text == "Test the gateway"


def test_gateway_agent_service_initializes_default_openai_client_with_api_key() -> None:
    config = load_config(
        {
            "AI_GATEWAY_BASE_URL": "https://my-gw.ai.gateway.azure.com/default/models/openai/v1",
            "AI_GATEWAY_API_KEY": "secret-key",
            "AI_GATEWAY_MODEL": "gpt-5-mini",
        },
        now=fixed_now(),
    )

    async def build_and_close() -> None:
        service = GatewayAgentService(config)
        try:
            assert service._chat_client.default_headers == {"api-key": "secret-key"}
        finally:
            await service.aclose()

    asyncio.run(build_and_close())

