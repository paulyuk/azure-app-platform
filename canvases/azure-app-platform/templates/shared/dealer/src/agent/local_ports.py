"""Validated local port overrides for the Dealer agent."""

from __future__ import annotations

import os

DEFAULT_AGENT_PORT = 8088
DEFAULT_LOCAL_SKILL_PORTS = {
    "inventory-search": 7071,
    "trade-in-value": 7072,
    "rate-sheet": 7073,
    "deal-doc": 7074,
}

_SKILL_ENV_NAMES = {
    "inventory-search": "INVENTORY_SEARCH_PORT",
    "trade-in-value": "TRADE_IN_VALUE_PORT",
    "rate-sheet": "RATE_SHEET_PORT",
    "deal-doc": "DEAL_DOC_PORT",
}


def _optional_port(name: str) -> int | None:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return None
    if not raw.isascii() or not raw.isdecimal():
        raise RuntimeError(f"{name} must be an integer from 1024 to 65535.")
    port = int(raw, 10)
    if port < 1024 or port > 65535:
        raise RuntimeError(f"{name} must be an integer from 1024 to 65535.")
    return port


def agent_port_override() -> int | None:
    """Return the Unity-specific override, preserving host-runtime defaults."""

    return _optional_port("AGENT_PORT")


def agent_listen_port() -> int:
    """Return the effective port for local diagnostics."""

    override = agent_port_override()
    if override is not None:
        return override
    return _optional_port("PORT") or DEFAULT_AGENT_PORT


def local_skill_ports() -> dict[str, int]:
    """Resolve the four local MCP endpoints from validated environment values."""

    ports = {
        name: _optional_port(_SKILL_ENV_NAMES[name]) or default
        for name, default in DEFAULT_LOCAL_SKILL_PORTS.items()
    }
    if len(set(ports.values())) != len(ports):
        raise RuntimeError("Local Hosted Skill ports must be unique.")
    return ports
