import sys
from pathlib import Path

PREQUAL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PREQUAL_DIR))

from main import SyntheticApplication, calculate_prequalification


def test_high_income_synthetic_application_is_approved_and_deterministic():
    application = SyntheticApplication(
        name="Synthetic Maya",
        synthetic_id="SYN-000-00-0005",
        annual_income=120_000,
        requested_loan_amount=20_000,
        vehicle_price=30_000,
        synthetic_data=True,
    )

    first = calculate_prequalification(application)
    second = calculate_prequalification(application)

    assert first == second
    assert first["decision"] == "approved"
    assert first["estimated_monthly_payment"] > 0
    assert "synthetic_id" not in first


def test_unaffordable_synthetic_application_is_declined():
    result = calculate_prequalification(
        SyntheticApplication(
            name="Synthetic Jordan",
            synthetic_id="SYN-987-65-4321",
            annual_income=20_000,
            requested_loan_amount=45_000,
            vehicle_price=45_000,
            synthetic_data=True,
        )
    )

    assert result["decision"] == "declined"
    assert result["reasons"]


def test_real_pii_guard_must_be_explicitly_enabled_for_synthetic_data():
    application = SyntheticApplication(
        name="Synthetic Test",
        synthetic_id="SYN-111-22-3333",
        annual_income=80_000,
        requested_loan_amount=25_000,
        vehicle_price=30_000,
        synthetic_data=False,
    )

    try:
        calculate_prequalification(application)
    except ValueError as error:
        assert "real PII is prohibited" in str(error)
    else:
        raise AssertionError("non-synthetic input was accepted")
