from __future__ import annotations

import json
import uuid
from datetime import datetime, UTC
from typing import Any

from azure_functions_agents import tool

TOOL_NAME = "deal-doc"
TOOL_DESCRIPTION = "Generate a structured, deterministic deal summary document."
TOOL_INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["vehicle", "financing"],
    "properties": {
        "vehicle": {
            "type": "object",
            "required": ["year", "make", "model", "price"],
        },
        "financing": {
            "type": "object",
            "required": ["term_months", "apr_percent", "down_payment"],
        },
        "trade_in": {"type": "object"},
        "fees": {"type": "object"},
        "tax_rate_percent": {"type": "number"},
        "customer_alias": {"type": "string"}
    }
}


def _monthly_payment(principal: float, apr_percent: float, term_months: int) -> float:
    if principal <= 0:
        return 0.0

    monthly_rate = (apr_percent / 100.0) / 12.0
    if monthly_rate == 0:
        return principal / term_months

    numerator = principal * monthly_rate
    denominator = 1 - (1 + monthly_rate) ** (-term_months)
    return numerator / denominator


def build_deal_summary(payload: dict[str, Any]) -> dict[str, Any]:
    vehicle = payload.get("vehicle", {})
    financing = payload.get("financing", {})
    trade_in = payload.get("trade_in", {})
    fees = payload.get("fees", {})

    sale_price = float(vehicle.get("price", 0) or 0)
    trade_in_value = float(trade_in.get("value", 0) or 0)
    down_payment = float(financing.get("down_payment", 0) or 0)
    term_months = int(financing.get("term_months", 60) or 60)
    apr_percent = float(financing.get("apr_percent", 0) or 0)
    tax_rate_percent = float(payload.get("tax_rate_percent", 8.5) or 8.5)

    doc_fee = float(fees.get("doc_fee", 499) or 499)
    registration_fee = float(fees.get("registration_fee", 350) or 350)
    destination_fee = float(fees.get("destination_fee", 0) or 0)

    taxable_subtotal = max(0.0, sale_price - trade_in_value)
    tax_amount = round(taxable_subtotal * (tax_rate_percent / 100.0), 2)

    total_fees = round(doc_fee + registration_fee + destination_fee, 2)
    amount_financed = max(0.0, sale_price - trade_in_value - down_payment + tax_amount + total_fees)
    monthly = round(_monthly_payment(amount_financed, apr_percent, term_months), 2)

    canonical_quote = {
        "vehicle": vehicle,
        "financing": financing,
        "trade_in": trade_in,
        "fees": {
            "doc_fee": doc_fee,
            "registration_fee": registration_fee,
            "destination_fee": destination_fee,
        },
        "tax_rate_percent": tax_rate_percent,
        "customer_alias": payload.get("customer_alias", "demo-customer"),
    }
    quote_id = str(uuid.uuid5(uuid.NAMESPACE_URL, json.dumps(canonical_quote, sort_keys=True)))

    return {
        "tool": TOOL_NAME,
        "quote_id": quote_id,
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "customer_alias": canonical_quote["customer_alias"],
        "vehicle": {
            "year": vehicle.get("year"),
            "make": vehicle.get("make"),
            "model": vehicle.get("model"),
            "price": sale_price,
        },
        "pricing": {
            "sale_price": sale_price,
            "trade_in_credit": trade_in_value,
            "down_payment": down_payment,
            "tax_rate_percent": tax_rate_percent,
            "tax_amount": tax_amount,
            "fees_total": total_fees,
            "amount_financed": round(amount_financed, 2),
        },
        "financing": {
            "term_months": term_months,
            "apr_percent": apr_percent,
            "estimated_monthly_payment": monthly,
        },
        "currency": "USD",
        "notes": "POC synthetic output; not a legal offer or lender-approved contract.",
    }


def deal_doc_tool(arguments: dict[str, Any]) -> dict[str, Any]:
    return build_deal_summary(arguments)


@tool(name=TOOL_NAME, description=TOOL_DESCRIPTION)
def deal_doc_agent_tool(
    vehicle: dict[str, Any],
    financing: dict[str, Any],
    trade_in: dict[str, Any] | None = None,
    fees: dict[str, Any] | None = None,
    tax_rate_percent: float | None = None,
    customer_alias: str | None = None,
) -> str:
    """Generate a structured, deterministic deal summary document.

    Auto-discovered by the `azurefunctions-agents-runtime` runtime and wired
    into the agent defined in `skills/deal-doc.agent.md`.
    """
    return json.dumps(
        build_deal_summary(
            {
                "vehicle": vehicle,
                "financing": financing,
                "trade_in": trade_in or {},
                "fees": fees or {},
                "tax_rate_percent": tax_rate_percent,
                "customer_alias": customer_alias,
            }
        )
    )
