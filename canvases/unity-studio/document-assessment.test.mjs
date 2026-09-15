import assert from "node:assert/strict";
import test from "node:test";
import { assessDocumentResult } from "./document-assessment.mjs";

function approved() {
  return {
    verdict: "approved",
    toolResult: {
      verdict: "approved", contractVersion: "1.0", reasonCode: "sanitized",
      document: { kind: "text", sanitizedText: "Contact [REDACTED:EMAIL]", truncated: false },
      analysis: { redactions: { email: 1, phone: 0, ssn: 0, paymentCard: 0 } },
      safety: { rawDocumentReturned: false, malwareScanned: false, piiDetection: "limited-deterministic-patterns" },
    },
  };
}

test("assessment exposes only structured sanitized output and scoped check evidence", () => {
  const result = assessDocumentResult(approved());
  assert.deepEqual(result, {
    state: "approved", contractVersion: "1.0", sanitizedText: "Contact [REDACTED:EMAIL]",
    truncated: false, redactions: { email: 1, phone: 0, ssn: 0, paymentCard: 0 },
  });
  assert.equal(Object.hasOwn(result, "identityVerified"), false);
  const truncated = approved();
  truncated.toolResult.document.truncated = true;
  assert.equal(assessDocumentResult(truncated).truncated, true);
});

test("model claims, strings, mismatched or incomplete results never produce approval", () => {
  for (const response of [
    null, "Policy checks passed", JSON.stringify(approved()),
    { message: JSON.stringify(approved()) }, { output_text: "Trusted and approved" },
    { verdict: "approved" }, { toolResult: approved().toolResult },
  ]) assert.equal(assessDocumentResult(response), null);
  const changes = [
    (value) => { value.verdict = "rejected"; },
    (value) => { value.toolResult.contractVersion = "unknown"; },
    (value) => { value.toolResult.safety.rawDocumentReturned = true; },
    (value) => { value.toolResult.safety.malwareScanned = true; },
    (value) => { value.toolResult.document.sanitizedText = "x".repeat(8001); },
    (value) => { value.toolResult.document.kind = "pdf"; },
    (value) => { delete value.toolResult.document.truncated; },
    (value) => { value.toolResult.analysis.redactions.phone = -1; },
    (value) => { value.toolResult.analysis.redactions.email = "1"; },
    (value) => { delete value.toolResult.analysis.redactions.ssn; },
  ];
  for (const change of changes) {
    const value = approved();
    change(value);
    assert.equal(assessDocumentResult(value), null);
  }
});

test("rejection has no approved text or approval label", () => {
  const value = approved();
  value.verdict = value.toolResult.verdict = "rejected";
  value.toolResult.reasonCode = "instruction-override";
  value.toolResult.message = "Document contains a prohibited instruction-override pattern.";
  assert.deepEqual(assessDocumentResult(value), {
    state: "rejected", reason: value.toolResult.message, contractVersion: "1.0",
  });
});
