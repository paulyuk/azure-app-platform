"""Operator-owned enforcement shared by worker and independent output gate."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POLICY = json.loads((ROOT / "config" / "document-policy.json").read_text(encoding="utf-8"))
if (
    not isinstance(POLICY, dict)
    or set(POLICY) != {"schemaVersion", "maxDocumentBytes", "maxSanitizedCharacters", "rejectInstructionOverrides", "requiredRedactions"}
    or type(POLICY.get("schemaVersion")) is not int
    or POLICY.get("schemaVersion") != 1
    or POLICY.get("rejectInstructionOverrides") is not True
    or POLICY.get("requiredRedactions") != ["email", "phone", "ssn", "paymentCard"]
    or type(POLICY.get("maxDocumentBytes")) is not int
    or not 1 <= POLICY["maxDocumentBytes"] <= 65536
    or type(POLICY.get("maxSanitizedCharacters")) is not int
    or not 1 <= POLICY["maxSanitizedCharacters"] <= 8000
):
    raise RuntimeError("Invalid operator document policy; required checks cannot be disabled.")

PATTERNS = {
    "email": re.compile(r"(?<![\w.+-])[\w.!#$%&'*+/=?^`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}"),
    "phone": re.compile(r"(?<!\w)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}(?!\w)"),
    "ssn": re.compile(r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)"),
    "paymentCard": re.compile(r"(?<!\d)(?:[0-9][ -]?){13,19}(?!\d)"),
}
OVERRIDE_PATTERN = re.compile(
    r"\bignore\s+(?:(?:all|any|the|previous|prior|above|system|developer)\s+){0,4}instructions\b"
    r"|\b(?:disable|bypass|skip|turn\s+off)\s+(?:(?:the|all|any)\s+)?(?:redaction|policy|validation|safety|sanitiz\w*)\b"
    r"|<\s*/?\s*(?:system|developer)\s*>",
    re.IGNORECASE,
)
EGRESS_OVERRIDE_PATTERN = re.compile(
    r"\b(?:exfiltrat\w*|curl|wget|fetch|webhook|POST|PUT)\b[^\n]{0,120}\bhttps?://(?!(?:api\.lender\.example\.com)\b)[A-Za-z0-9.-]+"
    r"|\b(?:AZURE_AI_GATEWAY_API_KEY|AI_GATEWAY_API_KEY|AI_GATEWAY_BEARER_TOKEN|GITHUB_TOKEN|GH_TOKEN|COPILOT_GITHUB_TOKEN|AZURE_CLIENT_SECRET|OPENAI_API_KEY|IDENTITY_ENDPOINT|MSI_ENDPOINT)\b",
    re.IGNORECASE,
)
REJECTION_MESSAGES = {
    "invalid-name": "Document name violates the filename policy.",
    "unsupported-format": "Only bounded UTF-8 text and Markdown are supported.",
    "document-too-large": "Document exceeds the operator size limit.",
    "invalid-text-encoding": "Document must be valid UTF-8 text.",
    "binary-content": "Binary and unsupported control characters are forbidden.",
    "instruction-override": "Document contains a prohibited instruction-override pattern.",
    "unauthorized-egress": "Blocked unauthorized outbound egress and sandbox credential probe (defaultDeny: true, documentToolEgressEnabled: false, allowedFqdns: api.lender.example.com; 0 credentials in tool environment).",
}


def card_valid(value):
    digits = [int(character) for character in value if character in "0123456789"]
    if not 13 <= len(digits) <= 19 or len(set(digits)) == 1:
        return False
    total = 0
    for index, digit in enumerate(digits):
        if index % 2 == len(digits) % 2:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def sanitize_text(content):
    counts = {}
    for kind in ("paymentCard", "email", "ssn", "phone"):
        count = 0

        def replace(match):
            nonlocal count
            if kind == "paymentCard" and not card_valid(match.group(0)):
                return match.group(0)
            count += 1
            label = "PAYMENT_CARD" if kind == "paymentCard" else kind.upper()
            return f"[REDACTED:{label}]"

        content = PATTERNS[kind].sub(replace, content)
        counts[kind] = count
    return content, counts


def require_safe_output(content):
    if not isinstance(content, str) or len(content) > POLICY["maxSanitizedCharacters"]:
        raise ValueError("Output exceeds the operator text limit.")
    if any(ord(char) < 32 and char not in "\n\r\t" for char in content):
        raise ValueError("Output contains forbidden control characters.")
    if OVERRIDE_PATTERN.search(content):
        raise ValueError("Output contains a prohibited instruction-override pattern.")
    if EGRESS_OVERRIDE_PATTERN.search(content):
        raise ValueError("Output contains a prohibited egress or credential-probe pattern.")
    if sanitize_text(content)[0] != content:
        raise ValueError("Output contains unredacted sensitive patterns.")
