from __future__ import annotations

import json
from typing import Any

from azure_functions_agents import tool

TOOL_NAME = "trade-in-value"
TOOL_DESCRIPTION = "Estimate trade-in value with a deterministic, synthetic formula."
TOOL_INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["make", "model", "year", "mileage", "condition"],
    "properties": {
        "make": {"type": "string"},
        "model": {"type": "string"},
        "year": {"type": "integer"},
        "mileage": {"type": "integer"},
        "condition": {
            "type": "string",
            "enum": ["excellent", "good", "fair", "rough"],
        },
        "ev_battery_certified": {"type": "boolean"},
    },
}

BASE_VALUE_BY_MODEL = {
    ("tesla", "model 3"): 36000,
    ("tesla", "model y"): 42000,
    ("hyundai", "ioniq 5"): 39000,
    ("kia", "ev6"): 38000,
    ("toyota", "rav4 hybrid"): 33500,
    ("honda", "cr-v hybrid"): 32000,
    ("ford", "mustang mach-e"): 41000,
    ("chevrolet", "bolt euv"): 30000,
    ("subaru", "outback"): 32000,
    ("honda", "odyssey"): 37000,
}

CONDITION_MULTIPLIER = {
    "excellent": 1.05,
    "good": 1.0,
    "fair": 0.9,
    "rough": 0.78,
}


def _normalize(value: str) -> str:
    return " ".join(value.casefold().strip().split())


def _round_to_50(value: float) -> int:
    return int(round(value / 50.0) * 50)


def estimate_trade_in_value(payload: dict[str, Any], *, valuation_year: int = 2026) -> dict[str, Any]:
    make = str(payload.get("make", "")).strip()
    model = str(payload.get("model", "")).strip()
    year = int(payload.get("year", valuation_year))
    mileage = int(payload.get("mileage", 0))
    condition = _normalize(str(payload.get("condition", "good")))

    base_value = BASE_VALUE_BY_MODEL.get((_normalize(make), _normalize(model)), 28500)

    age = max(0, valuation_year - year)
    age_factor = 0.86**age

    expected_mileage = age * 12_000
    mileage_delta = mileage - expected_mileage
    if mileage_delta > 0:
        mileage_factor = max(0.70, 1 - (mileage_delta / 100_000) * 0.45)
    else:
        mileage_factor = min(1.10, 1 + (abs(mileage_delta) / 100_000) * 0.20)

    condition_factor = CONDITION_MULTIPLIER.get(condition, CONDITION_MULTIPLIER["good"])

    estimated_value = base_value * age_factor * mileage_factor * condition_factor

    if bool(payload.get("ev_battery_certified")):
        estimated_value += 750

    estimated_value = max(1500, estimated_value)
    rounded_value = _round_to_50(estimated_value)

    return {
        "tool": TOOL_NAME,
        "vehicle": {
            "make": make,
            "model": model,
            "year": year,
            "mileage": mileage,
            "condition": condition,
        },
        "assumptions": {
            "valuation_year": valuation_year,
            "base_value": base_value,
            "age_years": age,
            "expected_mileage": expected_mileage,
            "battery_certified_bonus": 750 if bool(payload.get("ev_battery_certified")) else 0,
        },
        "estimated_trade_in_value": rounded_value,
        "currency": "USD",
    }


def trade_in_value_tool(arguments: dict[str, Any]) -> dict[str, Any]:
    return estimate_trade_in_value(arguments)


@tool(name=TOOL_NAME, description=TOOL_DESCRIPTION)
def trade_in_value_agent_tool(
    make: str,
    model: str,
    year: int,
    mileage: int,
    condition: str,
    ev_battery_certified: bool | None = None,
) -> str:
    """Estimate trade-in value with a deterministic, synthetic formula.

    Auto-discovered by the `azurefunctions-agents-runtime` runtime and wired
    into the agent defined in `skills/trade-in-value.agent.md`.
    """
    return json.dumps(
        estimate_trade_in_value(
            {
                "make": make,
                "model": model,
                "year": year,
                "mileage": mileage,
                "condition": condition,
                "ev_battery_certified": bool(ev_battery_certified),
            }
        )
    )
