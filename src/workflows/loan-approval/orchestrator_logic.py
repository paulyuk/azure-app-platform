"""Replay-safe decision normalization for the loan approval orchestration."""

from __future__ import annotations

from typing import Any

VALID_DECISIONS = {"approve", "decline", "escalate"}


def resolve_decision(event_payload: Any, timed_out: bool = False) -> str:
    """Map an external event or timer result to a supported workflow outcome."""
    if timed_out:
        return "escalate"

    value = (
        event_payload.get("decision")
        if isinstance(event_payload, dict)
        else event_payload
    )
    normalized = str(value or "").strip().lower()
    return normalized if normalized in VALID_DECISIONS else "escalate"
