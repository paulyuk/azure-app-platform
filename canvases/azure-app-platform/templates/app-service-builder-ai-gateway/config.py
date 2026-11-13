from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import re
from typing import Mapping
from urllib.parse import urlparse
import uuid

from dotenv import dotenv_values

HOST_PATTERN = re.compile(
    r"^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$"
)
APP_HOST_SUFFIX = ".app.westus2.builderapps.dev"
GATEWAY_HOST_SUFFIX = ".ai.gateway.azure.com"
MODEL_ALIAS = "appservice-chat"
MAX_TTL = timedelta(hours=2)
NIL_UUID = uuid.UUID(int=0)


def _merge_default_env(env: Mapping[str, str] | None) -> Mapping[str, str]:
    if env is not None:
        return env
    root = Path(__file__).resolve().parent
    merged: dict[str, str] = {}
    for candidate in (root / "src" / "agent" / ".env", root / ".env"):
        if candidate.is_file():
            for key, val in dotenv_values(candidate).items():
                if key and val is not None and val.strip():
                    merged[key] = val.strip()
    for key, val in os.environ.items():
        if val is not None and val.strip():
            merged[key] = val
    return merged


@dataclass(frozen=True)
class SampleConfig:
    public_host: str
    expires_at: datetime | None
    client_id: str | None
    gateway_host: str
    model: str = MODEL_ALIAS
    api_key: str | None = None
    explicit_base_url: str | None = None

    @property
    def origin(self) -> str:
        if not self.public_host:
            return ""
        if self.public_host.startswith(("http://", "https://")):
            return self.public_host.rstrip("/")
        if self.public_host.startswith(("127.0.0.1", "localhost")):
            return f"http://{self.public_host}"
        return f"https://{self.public_host}"

    @property
    def model_url(self) -> str:
        if self.explicit_base_url:
            base = self.explicit_base_url.rstrip("/")
            return f"{base}/"
        return f"https://{self.gateway_host}/default/models/openai/v1/"

    def is_expired(self, now: datetime | None = None) -> bool:
        if self.expires_at is None:
            return False
        current = now or datetime.now(timezone.utc)
        return current >= self.expires_at

    def allowed_origin(self, origin_header: str, request_host: str = "") -> bool:
        candidate = (origin_header or "").strip().rstrip("/")
        if not candidate:
            return False
        if self.origin and candidate == self.origin:
            return True
        parsed = urlparse(candidate)
        if not self.public_host and parsed.scheme in ("http", "https"):
            if parsed.hostname in ("127.0.0.1", "localhost"):
                return True
            if request_host and parsed.netloc == request_host:
                return True
        return False


def load_config(
    env: Mapping[str, str] | None = None,
    *,
    now: datetime | None = None,
) -> SampleConfig:
    explicit_env_passed = env is not None
    source = _merge_default_env(env)
    current = now or datetime.now(timezone.utc)

    raw_public_host = source.get("APP_PUBLIC_HOST", "").strip().lower()
    if raw_public_host:
        public_host = _require_host(raw_public_host, "APP_PUBLIC_HOST", APP_HOST_SUFFIX)
    elif explicit_env_passed and not any(
        source.get(k, "").strip()
        for k in ("AI_GATEWAY_BASE_URL", "AZURE_AI_GATEWAY_ENDPOINT", "AI_GATEWAY_API_KEY", "AZURE_AI_GATEWAY_API_KEY")
    ):
        public_host = _require_host("", "APP_PUBLIC_HOST", APP_HOST_SUFFIX)
    else:
        public_host = ""

    raw_expires = source.get("SAMPLE_EXPIRES_AT", "").strip()
    if raw_expires or (
        explicit_env_passed
        and raw_public_host
        and not any(
            source.get(k, "").strip()
            for k in ("AI_GATEWAY_BASE_URL", "AZURE_AI_GATEWAY_ENDPOINT", "AI_GATEWAY_API_KEY")
        )
    ):
        expires_at = _parse_expiry(raw_expires, current)
    else:
        expires_at = None

    api_key = (
        source.get("AI_GATEWAY_API_KEY", "").strip()
        or source.get("AZURE_AI_GATEWAY_API_KEY", "").strip()
        or None
    )

    raw_client_id = source.get("AZURE_CLIENT_ID", "").strip()
    if raw_client_id or not api_key:
        if raw_client_id or explicit_env_passed:
            client_id = _require_uuid(raw_client_id, "AZURE_CLIENT_ID")
        else:
            client_id = None
    else:
        client_id = None

    explicit_base_url = (
        source.get("AI_GATEWAY_BASE_URL", "").strip()
        or source.get("AZURE_AI_GATEWAY_ENDPOINT", "").strip()
        or None
    )
    if explicit_base_url and not explicit_base_url.endswith("/openai/v1") and not explicit_base_url.endswith("/openai/v1/"):
        explicit_base_url = f"{explicit_base_url.rstrip('/')}/default/models/openai/v1"

    raw_gateway_host = source.get("AZURE_AI_GATEWAY_HOST", "").strip().lower()
    if not raw_gateway_host and explicit_base_url:
        parsed_url = urlparse(explicit_base_url)
        raw_gateway_host = (parsed_url.hostname or "").strip().lower()

    if explicit_base_url and raw_gateway_host:
        gateway_host = raw_gateway_host
    else:
        gateway_host = _require_host(
            raw_gateway_host,
            "AZURE_AI_GATEWAY_HOST",
            GATEWAY_HOST_SUFFIX,
        )

    model = (
        source.get("AI_GATEWAY_MODEL", "").strip()
        or source.get("AZURE_AI_GATEWAY_MODEL", "").strip()
        or source.get("OPENAI_MODEL", "").strip()
        or MODEL_ALIAS
    )

    return SampleConfig(
        public_host=public_host,
        expires_at=expires_at,
        client_id=client_id,
        gateway_host=gateway_host,
        model=model,
        api_key=api_key,
        explicit_base_url=explicit_base_url,
    )


def _require_host(raw: str, name: str, suffix: str) -> str:
    value = raw.strip().lower()
    if not value or not HOST_PATTERN.fullmatch(value) or not value.endswith(suffix):
        raise ValueError(f"{name} must be a valid hostname ending with {suffix}.")
    if value == suffix.lstrip("."):
        raise ValueError(f"{name} must include a resource label before {suffix}.")
    return value


def _require_uuid(raw: str, name: str) -> str:
    try:
        parsed = uuid.UUID(raw.strip())
    except ValueError as exc:
        raise ValueError(f"{name} must be a valid UUID.") from exc
    if parsed == NIL_UUID:
        raise ValueError(f"{name} must not be the all-zero UUID.")
    return str(parsed)


def _parse_expiry(raw: str, now: datetime) -> datetime:
    value = raw.strip()
    if not value:
        raise ValueError("SAMPLE_EXPIRES_AT is required.")
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError("SAMPLE_EXPIRES_AT must be an ISO-8601 UTC timestamp.") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise ValueError("SAMPLE_EXPIRES_AT must use UTC.")
    if parsed <= now:
        raise ValueError("SAMPLE_EXPIRES_AT must be in the future.")
    if parsed - now > MAX_TTL:
        raise ValueError("SAMPLE_EXPIRES_AT must not be more than 2 hours in the future.")
    return parsed.astimezone(timezone.utc)
