"""Document validation tool for the Sandbox & Gateway template.

The process accepts one strict JSON request and returns one strict JSON result.
It intentionally supports only UTF-8 text and Markdown. The deterministic
redactors cover a small set of common PII shapes; they are not a complete PII
detector and this tool does not perform malware scanning.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

TOOL_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOL_ROOT.parents[2] / "src" / "policy"))
from enforcement import EGRESS_OVERRIDE_PATTERN, OVERRIDE_PATTERN, POLICY, REJECTION_MESSAGES, require_safe_output, sanitize_text

CONTRACT_PATH = TOOL_ROOT / "contract.json"
FORBIDDEN_CREDENTIAL_ENV = {
    "AI_GATEWAY_API_KEY",
    "AI_GATEWAY_BEARER_TOKEN",
    "AZURE_CLIENT_CERTIFICATE_PATH",
    "AZURE_CLIENT_SECRET",
    "AZURE_AI_GATEWAY_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "COPILOT_GITHUB_TOKEN",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "IDENTITY_ENDPOINT",
    "MSI_ENDPOINT",
    "OPENAI_API_KEY",
}


class ProtocolError(ValueError):
    """The caller did not follow the tool request contract."""


class DocumentRejection(ValueError):
    """The document is valid JSON but is outside the supported safety boundary."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _load_contract() -> dict[str, Any]:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if contract.get("contractVersion") != "1.0":
        raise RuntimeError("Unsupported document tool contract version.")
    return contract


CONTRACT = _load_contract()
LIMITS = CONTRACT["limits"]
MAX_REQUEST_BYTES = int(LIMITS["maxRequestBytes"])
MAX_DOCUMENT_BYTES = min(int(LIMITS["maxDocumentBytes"]), POLICY["maxDocumentBytes"])
MAX_DOCUMENT_CHARS = int(LIMITS["maxDocumentCharacters"])
MAX_SANITIZED_CHARS = min(int(LIMITS["maxSanitizedCharacters"]), POLICY["maxSanitizedCharacters"])
MAX_NAME_CHARS = int(LIMITS["maxNameCharacters"])
ALLOWED_EXTENSIONS = frozenset(CONTRACT["allowedExtensions"])

WORD_PATTERN = re.compile(r"\b[\w'-]+\b", re.UNICODE)
HEADING_PATTERN = re.compile(r"^\s{0,3}#{1,6}\s+\S", re.MULTILINE)


def _reject_if_credentials_present() -> None:
    present = sorted(name for name in FORBIDDEN_CREDENTIAL_ENV if os.environ.get(name))
    if present:
        raise RuntimeError(
            "Document validation tool refuses to start with agent/model credential variables: "
            + ", ".join(present)
        )


def _validate_request(payload: Any) -> tuple[str, str]:
    if not isinstance(payload, dict):
        raise ProtocolError("input must be a JSON object")
    if set(payload) != {"operation", "document"}:
        raise ProtocolError("input must contain only 'operation' and 'document'")
    if payload["operation"] != "sanitize-v1":
        raise ProtocolError("operation must be 'sanitize-v1'")

    document = payload["document"]
    if not isinstance(document, dict) or set(document) != {"name", "content"}:
        raise ProtocolError("document must contain only string fields 'name' and 'content'")
    name = document["name"]
    content = document["content"]
    if not isinstance(name, str) or not isinstance(content, str):
        raise ProtocolError("document.name and document.content must be strings")
    if not name or len(name) > MAX_NAME_CHARS:
        raise DocumentRejection("invalid-name", f"document name must be 1-{MAX_NAME_CHARS} characters")
    if "/" in name or "\\" in name or name in {".", ".."}:
        raise DocumentRejection("invalid-name", "document name must not contain a path")
    if any(ord(character) < 32 or ord(character) == 127 for character in name):
        raise DocumentRejection("invalid-name", "document name contains a control character")

    extension = Path(name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        supported = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise DocumentRejection(
            "unsupported-format",
            f"only bounded UTF-8 text or Markdown is supported ({supported}); binary files are rejected",
        )
    if len(content) > MAX_DOCUMENT_CHARS:
        raise DocumentRejection(
            "document-too-large",
            f"document exceeds the {MAX_DOCUMENT_CHARS} character limit",
        )
    try:
        encoded = content.encode("utf-8")
    except UnicodeEncodeError as error:
        raise DocumentRejection("invalid-text-encoding", "document must be valid UTF-8 text") from error
    if len(encoded) > MAX_DOCUMENT_BYTES:
        raise DocumentRejection(
            "document-too-large",
            f"document exceeds the {MAX_DOCUMENT_BYTES} byte limit",
        )
    if _looks_binary(content):
        raise DocumentRejection(
            "binary-content",
            "document contains binary or unsupported control characters",
        )
    if OVERRIDE_PATTERN.search(content):
        raise DocumentRejection("instruction-override", REJECTION_MESSAGES["instruction-override"])
    if EGRESS_OVERRIDE_PATTERN.search(content):
        raise DocumentRejection("unauthorized-egress", REJECTION_MESSAGES["unauthorized-egress"])
    return extension, content.replace("\r\n", "\n").replace("\r", "\n")


def _looks_binary(content: str) -> bool:
    if "\x00" in content:
        return True
    disallowed = sum(
        1 for character in content if ord(character) < 32 and character not in {"\n", "\r", "\t"}
    )
    return disallowed > 0


def _rejected(error: DocumentRejection) -> dict[str, Any]:
    return {
        "contractVersion": "1.0",
        "verdict": "rejected",
        "reasonCode": error.code,
        "message": REJECTION_MESSAGES[error.code],
        "safety": {
            "piiDetection": "limited-deterministic-patterns",
            "malwareScanned": False,
            "rawDocumentReturned": False,
        },
    }


def process_document(payload: Any) -> dict[str, Any]:
    try:
        extension, content = _validate_request(payload)
    except DocumentRejection as error:
        return _rejected(error)

    sanitized, redactions = sanitize_text(content)
    truncated = len(sanitized) > MAX_SANITIZED_CHARS
    bounded_text = sanitized[:MAX_SANITIZED_CHARS]
    require_safe_output(bounded_text)
    document_kind = "markdown" if extension in {".md", ".markdown"} else "text"
    return {
        "contractVersion": "1.0",
        "verdict": "approved",
        "reasonCode": "sanitized",
        "document": {
            "kind": document_kind,
            "sanitizedText": bounded_text,
            "truncated": truncated,
        },
        "analysis": {
            "characters": len(content),
            "words": len(WORD_PATTERN.findall(content)),
            "lines": content.count("\n") + 1,
            "markdownHeadings": len(HEADING_PATTERN.findall(content)) if document_kind == "markdown" else 0,
            "redactions": redactions,
        },
        "safety": {
            "piiDetection": "limited-deterministic-patterns",
            "malwareScanned": False,
            "rawDocumentReturned": False,
        },
    }


def _read_json_body(handler: BaseHTTPRequestHandler) -> Any:
    raw_length = handler.headers.get("Content-Length")
    try:
        length = int(raw_length or "0")
    except ValueError as error:
        raise ProtocolError("invalid Content-Length") from error
    if length < 0 or length > MAX_REQUEST_BYTES:
        raise ProtocolError(f"request exceeds the {MAX_REQUEST_BYTES} byte limit")
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw or b"{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProtocolError("request body must be valid UTF-8 JSON") from error


class Handler(BaseHTTPRequestHandler):
    server_version = "UnityDocumentTool/1.0"

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path != "/health":
            self._send_json(404, {"error": {"code": "not-found", "message": "route not found"}})
            return
        self._send_json(
            200,
            {
                "status": "ok",
                "contractVersion": "1.0",
                "worker": "document-tool",
                "credentialBoundaryEnforced": True,
            },
        )

    def do_POST(self) -> None:
        if self.path.split("?", 1)[0] != "/process":
            self._send_json(404, {"error": {"code": "not-found", "message": "route not found"}})
            return
        try:
            result = process_document(_read_json_body(self))
        except ProtocolError as error:
            self._send_json(
                400,
                {"error": {"code": "invalid-tool-request", "message": str(error)}},
            )
            return
        self._send_json(200, result)


def _run_stdio() -> int:
    try:
        raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
        if len(raw) > MAX_REQUEST_BYTES:
            raise ProtocolError(f"request exceeds the {MAX_REQUEST_BYTES} byte limit")
        payload = json.loads(raw or b"{}")
        result = process_document(payload)
    except (ProtocolError, UnicodeDecodeError, json.JSONDecodeError) as error:
        print(
            json.dumps({"error": {"code": "invalid-tool-request", "message": str(error)}}),
            file=sys.stderr,
        )
        return 2
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bounded document sanitizer")
    parser.add_argument("--serve", action="store_true", help="serve the ACA custom-container HTTP contract")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args(argv)

    try:
        _reject_if_credentials_present()
    except RuntimeError as error:
        print(f"Configuration error: {error}", file=sys.stderr)
        return 2
    if not args.serve:
        return _run_stdio()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"document-tool listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
