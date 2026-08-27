"""Synthetic-only loan pre-qualification calculator."""

from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass
from typing import Any

try:
    from .lender_stub import synthetic_soft_pull
except ImportError:
    from lender_stub import synthetic_soft_pull

TERM_MONTHS = 60


@dataclass(frozen=True)
class SyntheticApplication:
    name: str
    synthetic_id: str
    annual_income: float
    requested_loan_amount: float
    vehicle_price: float
    synthetic_data: bool


def _validate(application: SyntheticApplication) -> None:
    if application.synthetic_data is not True:
        raise ValueError("synthetic_data must be true; real PII is prohibited")
    if not application.name.startswith("Synthetic "):
        raise ValueError("name must begin with 'Synthetic '")
    if min(
        application.annual_income,
        application.requested_loan_amount,
        application.vehicle_price,
    ) <= 0:
        raise ValueError("income, requested amount, and vehicle price must be positive")
    if application.requested_loan_amount > application.vehicle_price * 1.20:
        raise ValueError("requested amount cannot exceed 120% of vehicle price")


def _monthly_payment(principal: float, annual_rate: float) -> float:
    monthly_rate = annual_rate / 100 / 12
    return principal * (
        monthly_rate * math.pow(1 + monthly_rate, TERM_MONTHS)
    ) / (math.pow(1 + monthly_rate, TERM_MONTHS) - 1)


def calculate_prequalification(
    application: SyntheticApplication,
) -> dict[str, Any]:
    """Calculate a deterministic demonstration verdict without retaining inputs."""
    _validate(application)
    profile = synthetic_soft_pull(application.synthetic_id)

    loan_to_value = application.requested_loan_amount / application.vehicle_price
    loan_to_income = application.requested_loan_amount / application.annual_income
    score = (
        (profile.credit_score - 580) / 180 * 55
        + (1 - profile.debt_to_income_ratio) * 25
        + max(0, 1 - loan_to_value) * 10
        + max(0, 1 - loan_to_income) * 10
    )
    approved = (
        score >= 55
        and profile.debt_to_income_ratio <= 0.42
        and loan_to_income <= 0.65
        and loan_to_value <= 1.10
    )

    if profile.credit_score >= 720:
        credit_band, apr = "prime", 5.9
    elif profile.credit_score >= 660:
        credit_band, apr = "near-prime", 8.4
    else:
        credit_band, apr = "developing", 12.9

    reasons: list[str] = []
    if not approved:
        if loan_to_income > 0.65:
            reasons.append("requested amount is high relative to synthetic income")
        if loan_to_value > 1.10:
            reasons.append("requested amount is high relative to vehicle price")
        if score < 55:
            reasons.append("synthetic affordability score is below the demo threshold")

    return {
        "decision": "approved" if approved else "declined",
        "approved": approved,
        "credit_band": credit_band,
        "estimated_apr": apr,
        "estimated_monthly_payment": round(
            _monthly_payment(application.requested_loan_amount, apr), 2
        ),
        "term_months": TERM_MONTHS,
        "reasons": reasons,
    }


def _application_from_json(payload: dict[str, Any]) -> SyntheticApplication:
    return SyntheticApplication(
        name=str(payload["name"]),
        synthetic_id=str(payload["synthetic_id"]),
        annual_income=float(payload["income"]),
        requested_loan_amount=float(payload["requested_loan_amount"]),
        vehicle_price=float(payload["vehicle_price"]),
        synthetic_data=payload.get("synthetic_data") is True,
    )


def main() -> int:
    """Read one synthetic application from stdin and emit only its verdict."""
    try:
        payload = json.load(sys.stdin)
        verdict = calculate_prequalification(_application_from_json(payload))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        return 2

    print(json.dumps(verdict, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
