from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path
from unittest.mock import patch


def _load_tool_module():
    root = Path(__file__).resolve().parents[1]
    source = root / "main.py"
    if not source.exists():
        source = root / "main.py.template"
    loader = SourceFileLoader("document_validation_tool", str(source))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    sys.modules[loader.name] = module
    loader.exec_module(module)
    return module


tool = _load_tool_module()


class DocumentToolTests(unittest.TestCase):
    def test_redacts_supported_pii_without_returning_raw_values(self):
        payload = {
            "operation": "sanitize-v1",
            "document": {
                "name": "notes.md",
                "content": (
                    "# Applicant\n"
                    "Email jane@example.com, phone 425-555-0100, "
                    "SSN 123-45-6789, card 4111 1111 1111 1111."
                ),
            },
        }

        result = tool.process_document(payload)

        self.assertEqual(result["verdict"], "approved")
        serialized = str(result)
        for raw_value in (
            "jane@example.com",
            "425-555-0100",
            "123-45-6789",
            "4111 1111 1111 1111",
        ):
            self.assertNotIn(raw_value, serialized)
        self.assertEqual(
            result["analysis"]["redactions"],
            {"email": 1, "phone": 1, "ssn": 1, "paymentCard": 1},
        )
        self.assertEqual(result["analysis"]["markdownHeadings"], 1)
        self.assertFalse(result["safety"]["malwareScanned"])

    def test_rejects_unsupported_binary_extension(self):
        result = tool.process_document(
            {
                "operation": "sanitize-v1",
                "document": {"name": "scan.pdf", "content": "not actually a PDF"},
            }
        )

        self.assertEqual(result["verdict"], "rejected")
        self.assertEqual(result["reasonCode"], "unsupported-format")
        self.assertNotIn("not actually a PDF", str(result))

    def test_rejects_binary_control_characters(self):
        result = tool.process_document(
            {
                "operation": "sanitize-v1",
                "document": {"name": "payload.txt", "content": "hello\u0000world"},
            }
        )

        self.assertEqual(result["verdict"], "rejected")
        self.assertEqual(result["reasonCode"], "binary-content")

    def test_rejects_oversized_text(self):
        result = tool.process_document(
            {
                "operation": "sanitize-v1",
                "document": {
                    "name": "large.txt",
                    "content": "x" * (tool.MAX_DOCUMENT_CHARS + 1),
                },
            }
        )

        self.assertEqual(result["verdict"], "rejected")
        self.assertEqual(result["reasonCode"], "document-too-large")

    def test_rejects_unknown_contract_fields(self):
        with self.assertRaisesRegex(tool.ProtocolError, "only 'operation' and 'document'"):
            tool.process_document(
                {
                    "operation": "sanitize-v1",
                    "document": {"name": "safe.txt", "content": "safe"},
                    "unexpected": True,
                }
            )

    def test_worker_refuses_agent_credentials(self):
        with patch.dict(os.environ, {"AI_GATEWAY_API_KEY": "must-not-reach-tool"}):
            with self.assertRaisesRegex(RuntimeError, "AI_GATEWAY_API_KEY"):
                tool._reject_if_credentials_present()


if __name__ == "__main__":
    unittest.main()
