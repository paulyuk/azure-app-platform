from __future__ import annotations

import json
from typing import Any

from azure_functions_agents import tool

TOOL_NAME = "rate-sheet"
TOOL_DESCRIPTION = "Return deterministic rate/term options by credit band."
TOOL_INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["credit_band"],
    "properties": {
        "credit_band": {
            "type": "string",
            "description": "A, B, C, D or labels like super_prime / near_prime / subprime"
        },
        "loan_amount": {"type": "number"},
        "down_payment": {"type": "number"}
    }
}

RATE_SHEET = {
    "A": {36: 5.49, 48: 5.79, 60: 6.19, 72: 6.79},
    "B": {36: 6.49, 48: 6.89, 60: 7.29, 72: 7.99},
    "C": {36: 8.49, 48: 8.99, 60: 9.49, 72: 10.19},
    "D": {36: 11.49, 48: 12.19, 60: 12.89, 72: 13.79},
}

BAND_ALIASES = {
    "super_prime": "A",
    "prime": "A",
    "near_prime": "B",
    "non_prime": "C",
    "subprime": "D",
}


def normalize_credit_band(credit_band: str) -> str:
    normalized = "".join(credit_band.upper().split())
    if normalized in RATE_SHEET:
        return normalized

    alias_key = credit_band.casefold().replace(" ", "_")
    return BAND_ALIASES.get(alias_key, "C")


def monthly_payment(principal: float, apr_percent: float, term_months: int) -> float:
    if principal <= 0:
        return 0.0

    monthly_rate = (apr_percent / 100.0) / 12.0
    if monthly_rate == 0:
        return principal / term_months

    numerator = principal * monthly_rate
    denominator = 1 - (1 + monthly_rate) ** (-term_months)
    return numerator / denominator


def get_rate_options(payload: dict[str, Any]) -> dict[str, Any]:
    credit_band = normalize_credit_band(str(payload.get("credit_band", "C")))
    options = RATE_SHEET[credit_band]

    loan_amount = float(payload.get("loan_amount", 0) or 0)
    down_payment = float(payload.get("down_payment", 0) or 0)
    principal = max(0.0, loan_amount - down_payment)

    rows: list[dict[str, Any]] = []
    for term_months, apr in sorted(options.items()):
        row: dict[str, Any] = {
            "term_months": term_months,
            "apr_percent": apr,
        }
        if principal > 0:
            row["estimated_monthly_payment"] = round(monthly_payment(principal, apr, term_months), 2)
        rows.append(row)

    return {
        "tool": TOOL_NAME,
        "credit_band": credit_band,
        "loan_amount": loan_amount,
        "down_payment": down_payment,
        "amount_financed": principal,
        "options": rows,
        "currency": "USD",
    }


def rate_sheet_tool(arguments: dict[str, Any]) -> dict[str, Any]:
    return get_rate_options(arguments)


@tool(name=TOOL_NAME, description=TOOL_DESCRIPTION)
def rate_sheet_agent_tool(
    credit_band: str,
    loan_amount: float | None = None,
    down_payment: float | None = None,
) -> str:
    """Return deterministic rate/term options by credit band.

    Auto-discovered by the `azurefunctions-agents-runtime` runtime and wired
    into the agent defined in `skills/rate-sheet.agent.md`.
    """
    return json.dumps(
        get_rate_options(
            {
                "credit_band": credit_band,
                "loan_amount": loan_amount,
                "down_payment": down_payment,
            }
        )
    )
