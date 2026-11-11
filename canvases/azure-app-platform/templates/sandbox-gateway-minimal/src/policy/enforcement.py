"""Operator-owned enforcement shared by worker and independent output gate."""

import json
import re
import sys
import time
from pathlib import Path
from urllib import parse

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
OUTBOUND_REQUEST_PATTERN = re.compile(
    r"\b(?:exfiltrat\w*|curl|wget|fetch|webhook|POST|PUT)\b[^\n]{0,120}?"
    r"(https?://[^\s<>\"']+)",
    re.IGNORECASE,
)
REJECTION_MESSAGES = {
    "invalid-name": "Document name violates the filename policy.",
    "unsupported-format": "Only bounded UTF-8 text and Markdown are supported.",
    "document-too-large": "Document exceeds the operator size limit.",
    "invalid-text-encoding": "Document must be valid UTF-8 text.",
    "binary-content": "Binary and unsupported control characters are forbidden.",
    "instruction-override": "Document contains a prohibited instruction-override pattern.",
    "unauthorized-egress": "Outbound instructions were rejected before model access. The sandbox probe reports observed network enforcement and credential-variable counts.",
}


def outbound_probe_url(content):
    match = OUTBOUND_REQUEST_PATTERN.search(content)
    return match.group(1).rstrip(".,;)") if match else None


def probe_origin(url):
    target = parse.urlsplit(url)
    if target.scheme not in {"http", "https"} or not target.hostname:
        raise ValueError("invalid origin")
    host = target.hostname.encode("idna").decode("ascii")
    if not re.fullmatch(r"[a-zA-Z0-9._:-]{1,253}", host):
        raise ValueError("invalid host")
    if ":" in host:
        host = f"[{host}]"
    origin = f"{target.scheme}://{host}"
    if target.port is not None:
        origin += f":{target.port}"
    return origin


def log_sandbox_probe(probe, origin=None):
    keys = json.dumps(probe["envKeys"], ensure_ascii=True, separators=(",", ":"))
    print(
        f'[sandbox-env] env_keys={keys} env_key_count={probe["envKeyCount"]} '
        f'credential_like_vars={probe["credentialLikeVariableCount"]} '
        f'secret_files={probe["secretFileCount"]} values_returned=false',
        file=sys.stderr, flush=True,
    )
    if probe.get("identityEndpoint") == "http://100.64.100.2/msi/token":
        print(
            f'[sandbox-msi] endpoint={probe.get("identityEndpoint")} '
            f'header_present={str(bool(probe.get("identityHeaderPresent"))).lower()} '
            f'header_length={probe.get("identityHeaderLength", 0)} '
            f'token_status={runtime_log_token(probe.get("identityTokenStatus") or "not-probed")} '
            f'http_status={probe.get("identityTokenHttpStatus")}',
            file=sys.stderr, flush=True,
        )
    if origin is not None and probe.get("outboundAttempted"):
        print(
            f'[sandbox-net] probe={json.dumps("HEAD " + origin + "/")} '
            f'outcome={probe["outboundOutcome"]} enforcement={probe["enforcement"]} '
            f'http_status={probe["httpStatus"]}',
            file=sys.stderr, flush=True,
        )


def runtime_log_token(value):
    if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}", value):
        return value
    return "[REDACTED]"


def runtime_log_outcome(result):
    tool = result.get("toolResult")
    tool = tool if isinstance(tool, dict) else result
    verdict = result.get("verdict", "none")
    if verdict not in ("approved", "rejected", "error", "not-requested", "none"):
        verdict = "none"
    failure = result.get("error")
    reason = (
        failure.get("code") if isinstance(failure, dict)
        else tool.get("reasonCode")
    )
    redactions = tool.get("analysis", {}).get("redactions", {}) if isinstance(tool.get("analysis"), dict) else {}
    counts = {
        key: value for key, value in redactions.items()
        if key in ("email", "phone", "ssn", "paymentCard")
        and type(value) is int and 0 <= value <= 65536
    } if isinstance(redactions, dict) else {}
    return verdict, runtime_log_token(reason) if reason else "none", json.dumps(counts, separators=(",", ":"), sort_keys=True)


def log_http_outcome(route, status, result, started):
    route = route.split("?", 1)[0]
    if route not in ("/invoke", "/test-document", "/process"):
        route = "/[REDACTED]"
    verdict, reason, _ = runtime_log_outcome(result)
    elapsed = max(0, (time.perf_counter() - started) * 1000)
    print(
        f"[http] POST {route} status={status} verdict={verdict} reason={reason} duration_ms={elapsed:.1f}",
        file=sys.stderr, flush=True,
    )


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
    if outbound_probe_url(content):
        raise ValueError("Output contains an outbound-network instruction.")
    if sanitize_text(content)[0] != content:
        raise ValueError("Output contains unredacted sensitive patterns.")
