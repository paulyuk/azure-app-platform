"""Deterministic stand-in for a credit-bureau soft pull.

This module never performs network I/O and accepts synthetic identifiers only.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

SYNTHETIC_ID_PATTERN = re.compile(r"^SYN-\d{3}-\d{2}-\d{4}$")


@dataclass(frozen=True)
class SyntheticCreditProfile:
    credit_score: int
    debt_to_income_ratio: float


def synthetic_soft_pull(synthetic_id: str) -> SyntheticCreditProfile:
    """Return stable, canned credit data derived from a synthetic identifier."""
    if not SYNTHETIC_ID_PATTERN.fullmatch(synthetic_id):
        raise ValueError("synthetic_id must match SYN-###-##-####")

    digest = hashlib.sha256(synthetic_id.encode("ascii")).digest()
    credit_score = 580 + digest[0] % 181
    debt_to_income_ratio = round(0.10 + (digest[1] / 255) * 0.30, 3)
    return SyntheticCreditProfile(credit_score, debt_to_income_ratio)
