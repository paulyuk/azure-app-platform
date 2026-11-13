from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable, Sequence
from typing import Protocol

from agent_framework import Agent, Message, SupportsChatGetResponse
from agent_framework.openai import OpenAIChatCompletionClient
from azure.core.credentials import TokenCredential
from azure.identity import DefaultAzureCredential, ManagedIdentityCredential
import httpx

from config import SampleConfig

AGENT_NAME = "app-service-builder-agent"
AGENT_INSTRUCTIONS = (
    "You are a concise Azure App Service Builder and Azure AI Gateway sample assistant. "
    "Answer the user's question directly and keep responses practical."
)
REQUEST_TIMEOUT_SECONDS = 30.0
CONNECT_TIMEOUT_SECONDS = 5.0
OPENAI_NO_BEARER_AUTH = "workload-identity-auth"


def _strip_placeholder_bearer_auth(chat_client: object) -> None:
    raw_client = getattr(chat_client, "client", None)
    if raw_client is None or not hasattr(raw_client, "_prepare_request"):
        return
    orig_prepare_request = raw_client._prepare_request

    async def _prepare_request_without_placeholder_bearer(request):
        await orig_prepare_request(request)
        if request.headers.get("authorization") == f"Bearer {OPENAI_NO_BEARER_AUTH}":
            del request.headers["authorization"]

    raw_client._prepare_request = _prepare_request_without_placeholder_bearer


class AgentStreamProvider(Protocol):
    async def aclose(self) -> None: ...

    def stream_text(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[str]: ...


class GatewayAgentService:
    def __init__(
        self,
        config: SampleConfig,
        *,
        chat_client: SupportsChatGetResponse | None = None,
        credential_factory: Callable[[str], TokenCredential] = ManagedIdentityCredential,
        http_client: httpx.AsyncClient | None = None,
        request_timeout: float = REQUEST_TIMEOUT_SECONDS,
    ) -> None:
        self._owns_http_client = http_client is None
        self._http_client = http_client or httpx.AsyncClient(
            timeout=httpx.Timeout(request_timeout, connect=CONNECT_TIMEOUT_SECONDS),
            trust_env=False,
        )
        self._owns_chat_client = chat_client is None
        self._request_timeout = request_timeout
        if chat_client is None:
            if config.api_key:
                chat_client = OpenAIChatCompletionClient(
                    model=config.model,
                    base_url=config.model_url,
                    api_key=OPENAI_NO_BEARER_AUTH,
                    default_headers={"api-key": config.api_key},
                )
                _strip_placeholder_bearer_auth(chat_client)
            elif config.client_id:
                credential = credential_factory(client_id=config.client_id)
                chat_client = OpenAIChatCompletionClient(
                    model=config.model,
                    base_url=config.model_url,
                    credential=credential,
                )
            else:
                credential = DefaultAzureCredential()
                chat_client = OpenAIChatCompletionClient(
                    model=config.model,
                    base_url=config.model_url,
                    credential=credential,
                )
        self._chat_client = chat_client
        self._agent = Agent(
            client=chat_client,
            name=AGENT_NAME,
            instructions=AGENT_INSTRUCTIONS,
        )

    async def aclose(self) -> None:
        if self._owns_chat_client and hasattr(self._chat_client, "close"):
            await self._chat_client.close()
        if self._owns_http_client:
            await self._http_client.aclose()

    async def stream_text(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[str]:
        agent_messages = [Message(item["role"], [item["content"]]) for item in messages]
        stream = self._agent.run(agent_messages, stream=True)
        iterator = stream.__aiter__()
        async with asyncio.timeout(self._request_timeout):
            while True:
                try:
                    update = await iterator.__anext__()
                except StopAsyncIteration:
                    break
                text = getattr(update, "text", "") or ""
                if text:
                    yield text
