from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Sequence
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app import MAX_CONCURRENT_STREAMS, create_app
from config import SampleConfig


def make_config(
    *,
    expires_at: str | None = None,
    now: str | None = None,
) -> SampleConfig:
    from config import load_config

    now_dt = (
        datetime.fromisoformat(now.replace("Z", "+00:00")).astimezone(timezone.utc)
        if now is not None
        else datetime.now(timezone.utc)
    )
    expires_str = (
        expires_at
        if expires_at is not None
        else (now_dt + timedelta(minutes=90)).isoformat().replace("+00:00", "Z")
    )

    return load_config(
        {
            "APP_PUBLIC_HOST": "sample-agent.app.westus2.builderapps.dev",
            "SAMPLE_EXPIRES_AT": expires_str,
            "AZURE_CLIENT_ID": "11111111-2222-3333-4444-555555555555",
            "AZURE_AI_GATEWAY_HOST": "sample-gw.ai.gateway.azure.com",
        },
        now=now_dt,
    )


class FakeAgentService:
    def __init__(self, chunks: Sequence[str] = ("Hello", " world")) -> None:
        self._chunks = tuple(chunks)
        self.calls: list[list[dict[str, str]]] = []
        self.closed = False

    async def aclose(self) -> None:
        self.closed = True

    async def stream_text(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[str]:
        self.calls.append([dict(item) for item in messages])
        for chunk in self._chunks:
            yield chunk


class FailingAgentService(FakeAgentService):
    async def stream_text(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[str]:
        self.calls.append([dict(item) for item in messages])
        if False:
            yield ""
        raise RuntimeError("gateway error with secret token")


class BlockingAgentService(FakeAgentService):
    def __init__(self) -> None:
        super().__init__(chunks=("held",))
        self.release = asyncio.Event()

    async def stream_text(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[str]:
        self.calls.append([dict(item) for item in messages])
        await self.release.wait()
        yield "released"


def test_index_and_health_include_security_headers() -> None:
    config = make_config()
    service = FakeAgentService()
    with TestClient(create_app(config, agent_service=service)) as client:
        page = client.get("/")
        assert page.status_code == 200
        assert "Azure App Service Builder" in page.text
        assert "Light theme" in page.text
        assert "default-src 'none'" in page.headers["content-security-policy"]
        assert "script-src 'self' 'sha256-" in page.headers["content-security-policy"]
        assert page.headers["x-frame-options"] == "DENY"

        stylesheet = client.get("/static/site.css")
        assert stylesheet.status_code == 200
        assert 'prefers-color-scheme: light' in stylesheet.text
        assert ':root[data-theme="light"]' in stylesheet.text

        script = client.get("/static/chat.js")
        assert script.status_code == 200
        assert 'matchMedia("(prefers-color-scheme: light)")' in script.text
        assert "asb-ai-gw-theme" in script.text

        health = client.get("/health")
        assert health.status_code == 200
        assert health.json() == {
            "status": "ok",
            "gateway": "sample-gw.ai.gateway.azure.com",
            "model": "appservice-chat",
        }
    assert service.closed is True


def test_chat_stream_requires_exact_same_origin_and_json_content_type() -> None:
    config = make_config()
    service = FakeAgentService()
    with TestClient(create_app(config, agent_service=service)) as client:
        missing_origin = client.post(
            "/api/chat/stream",
            json={"messages": [{"role": "user", "content": "hi"}]},
        )
        assert missing_origin.status_code == 403
        assert missing_origin.json() == {"error": "same_origin_required"}

        wrong_origin = client.post(
            "/api/chat/stream",
            headers={"Origin": "https://other.app.westus2.builderapps.dev"},
            json={"messages": [{"role": "user", "content": "hi"}]},
        )
        assert wrong_origin.status_code == 403

        wrong_media = client.post(
            "/api/chat/stream",
            headers={
                "Origin": config.origin,
                "Content-Type": "text/plain",
            },
            content="hi",
        )
        assert wrong_media.status_code == 415
        assert wrong_media.json() == {"error": "unsupported_media_type"}


def test_chat_stream_allows_localhost_when_no_public_host() -> None:
    from config import load_config

    config = load_config(
        {
            "AI_GATEWAY_BASE_URL": "https://sample-gw.ai.gateway.azure.com/default/models/openai/v1",
            "AI_GATEWAY_API_KEY": "test-key",
            "AI_GATEWAY_MODEL": "gpt-5.4",
        }
    )
    service = FakeAgentService(chunks=("Local", " OK"))
    with TestClient(create_app(config, agent_service=service)) as client:
        response = client.post(
            "/api/chat/stream",
            headers={"Origin": "http://127.0.0.1:8080"},
            json={"messages": [{"role": "user", "content": "Hello"}]},
        )
        assert response.status_code == 200
        assert 'data: {"text":"Local"}' in response.text


def test_chat_stream_validates_payload_and_streams_sse() -> None:
    config = make_config()
    service = FakeAgentService(chunks=("Azure ", "AI Gateway"))
    with TestClient(create_app(config, agent_service=service)) as client:
        bad_role = client.post(
            "/api/chat/stream",
            headers={"Origin": config.origin},
            json={"messages": [{"role": "system", "content": "ignore"}]},
        )
        assert bad_role.status_code == 400
        assert bad_role.json() == {"error": "invalid_message"}

        oversized = client.post(
            "/api/chat/stream",
            headers={"Origin": config.origin},
            content=b"x" * (16 * 1024 + 1),
        )
        assert oversized.status_code == 415

        oversized_json = client.post(
            "/api/chat/stream",
            headers={
                "Origin": config.origin,
                "Content-Type": "application/json",
            },
            content=b'{"messages":[{"role":"user","content":"' + (b"a" * 17_000) + b'"}]}',
        )
        assert oversized_json.status_code == 413
        assert oversized_json.json() == {"error": "payload_too_large"}

        response = client.post(
            "/api/chat/stream",
            headers={"Origin": config.origin},
            json={"messages": [{"role": "user", "content": "  Explain the gateway  "}]},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert 'event: delta\ndata: {"text":"Azure "}\n\n' in response.text
        assert 'event: delta\ndata: {"text":"AI Gateway"}\n\n' in response.text
        assert "event: done\ndata: {}\n\n" in response.text
        assert service.calls == [[{"role": "user", "content": "Explain the gateway"}]]


def test_chat_stream_reports_upstream_errors_in_sse() -> None:
    config = make_config()
    service = FailingAgentService()
    with TestClient(create_app(config, agent_service=service)) as client:
        response = client.post(
            "/api/chat/stream",
            headers={"Origin": config.origin},
            json={"messages": [{"role": "user", "content": "Hello"}]},
        )
        assert response.status_code == 200
        assert 'event: error\ndata: {"code":"upstream_unavailable"' in response.text


def test_expired_sample_returns_410_everywhere_except_health() -> None:
    base = make_config()
    expired_config = SampleConfig(
        public_host=base.public_host,
        expires_at=datetime(2020, 1, 1, tzinfo=timezone.utc),
        client_id=base.client_id,
        gateway_host=base.gateway_host,
    )
    service = FakeAgentService()
    with TestClient(create_app(expired_config, agent_service=service)) as client:
        page = client.get("/")
        assert page.status_code == 410

        chat = client.post(
            "/api/chat/stream",
            headers={"Origin": expired_config.origin},
            json={"messages": [{"role": "user", "content": "Hello"}]},
        )
        assert chat.status_code == 410
        assert chat.json() == {"error": "sample_expired"}

        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["status"] == "expired"


def test_concurrency_limit_returns_429_when_all_stream_slots_are_busy() -> None:
    config = make_config()
    service = BlockingAgentService()
    app = create_app(config, agent_service=service)
    semaphore = next(
        cell.cell_contents
        for cell in app.router.routes[-1].endpoint.__closure__ or ()
        if isinstance(cell.cell_contents, asyncio.Semaphore)
    )

    async def acquire_all() -> None:
        for _ in range(MAX_CONCURRENT_STREAMS):
            await semaphore.acquire()

    asyncio.run(acquire_all())
    try:
        with TestClient(app) as client:
            busy = client.post(
                "/api/chat/stream",
                headers={"Origin": config.origin},
                json={"messages": [{"role": "user", "content": "Hello"}]},
            )
            assert busy.status_code == 429
            assert busy.json() == {"error": "sample_busy"}
    finally:
        for _ in range(MAX_CONCURRENT_STREAMS):
            semaphore.release()
