import assert from "node:assert/strict";
import test from "node:test";

import { readAgentHttpResponse } from "./agent-http-response.mjs";
import { normalizeBlockedAgentResponse } from "./blocked-agent-response.mjs";

function runtime(overrides = {}) {
  return {
    agentRuntime: "local",
    agentIsolation: "local-process",
    documentToolRuntime: "local-process-simulation",
    agentSessionDispatched: false,
    documentSessionDispatched: false,
    gatewayConfigured: true,
    gatewayConfigurationScope: "control-plane",
    instructionFile: "src/agent/prompts/system.md",
    rawDocumentSentToAgent: false,
    cloudIsolationVerified: false,
    ...overrides,
  };
}

function preModelBlocked(overrides = {}) {
  return {
    contractVersion: "agent-blocked-response/1.0",
    kind: "blocked-agent-response",
    responseOrigin: "agent-harness",
    upstreamHttpStatus: 422,
    executionKind: "agent-invocation",
    testKind: "document-input",
    mode: "local-simulation",
    reasonCode: "instruction-override",
    operatorMessage: "Document rejected before any model call: prohibited instruction override.",
    summary: "The hostile document did not reach the model in this request.",
    stages: [
      { id: "agent-harness", state: "succeeded", detail: "Request received" },
      { id: "document-tool", state: "rejected", detail: "Rejected", reasonCode: "instruction-override" },
      { id: "model", state: "not-attempted", detail: "Not attempted" },
      { id: "approval-disclosure", state: "not-applicable", detail: "Not part of this test" },
    ],
    limitations: [
      "no-model-call",
      "no-hostile-outbound-probe",
      "local-process-not-isolation-boundary",
    ],
    evidence: {
      runtime: runtime(),
      modelAuthoredTextShown: false,
      outboundDenialProbeAttempted: false,
    },
    ...overrides,
  };
}

test("structured upstream 422 survives with validated stop-path and rejection reason", async () => {
  const blockedResponse = preModelBlocked();
  const toolResult = {
    contractVersion: "1.0",
    verdict: "rejected",
    reasonCode: "instruction-override",
    message: "Document contains a prohibited instruction-override pattern.",
    safety: {
      rawDocumentReturned: false,
      malwareScanned: false,
      piiDetection: "limited-deterministic-patterns",
    },
  };
  const result = await readAgentHttpResponse(new Response(JSON.stringify({
    verdict: "rejected", toolResult, blockedResponse,
  }), { status: 422 }), { documentAssessmentAllowed: true });
  assert.equal(result.statusCode, 422);
  assert.deepEqual(result.payload.blockedResponse, blockedResponse);
  assert.deepEqual(result.payload.documentAssessment, {
    state: "rejected",
    reason: toolResult.message,
    reasonCode: "instruction-override",
    contractVersion: "1.0",
  });
});

test("ACA evidence requires explicit cloud-isolation limitation without denying real traffic", () => {
  const response = preModelBlocked({
    mode: "aca-document-session",
    limitations: ["no-model-call", "no-hostile-outbound-probe", "cloud-isolation-not-verified"],
    evidence: {
      runtime: runtime({
        documentToolRuntime: "aca-custom-container-session",
        documentSessionDispatched: true,
      }),
      modelAuthoredTextShown: false,
      outboundDenialProbeAttempted: false,
    },
  });
  const normalized = normalizeBlockedAgentResponse(response, 422);
  assert.equal(normalized.mode, "aca-document-session");
  assert.equal(normalized.evidence.runtime.documentSessionDispatched, true);
  const missingLimit = structuredClone(response);
  missingLimit.limitations.pop();
  assert.equal(normalizeBlockedAgentResponse(missingLimit, 422), null);
  const contradictoryMode = structuredClone(response);
  contradictoryMode.mode = "aca-session";
  assert.equal(normalizeBlockedAgentResponse(contradictoryMode, 422), null);
});

test("post-model output policy block proves response receipt and suppresses model text", async () => {
  const blockedResponse = {
    contractVersion: "agent-blocked-response/1.0",
    kind: "blocked-agent-response",
    responseOrigin: "agent-harness",
    upstreamHttpStatus: 502,
    executionKind: "agent-invocation",
    testKind: "agent-output-policy",
    mode: "local-simulation",
    reasonCode: "agent-output-policy-blocked",
    operatorMessage: "Agent output was blocked by deterministic policy.",
    summary: "A model response was received but blocked before disclosure.",
    stages: [
      { id: "agent-harness", state: "succeeded", detail: "Request received" },
      { id: "document-tool", state: "not-applicable", detail: "Not part of this request" },
      { id: "model", state: "succeeded", detail: "Response received" },
      {
        id: "approval-disclosure",
        state: "blocked",
        detail: "Output blocked by policy",
        reasonCode: "agent-output-policy-blocked",
      },
    ],
    limitations: [
      "model-output-not-shown",
      "no-hostile-outbound-probe",
      "local-process-not-isolation-boundary",
    ],
    evidence: {
      runtime: runtime(),
      modelAuthoredTextShown: false,
      outboundDenialProbeAttempted: false,
    },
  };
  const result = await readAgentHttpResponse(new Response(JSON.stringify({
    message: blockedResponse.operatorMessage,
    blockedResponse,
  }), { status: 502 }));
  assert.equal(result.statusCode, 502);
  assert.equal(result.payload.blockedResponse.stages[2].detail, "Response received");
  assert.equal(result.payload.blockedResponse.evidence.modelAuthoredTextShown, false);
  assert.equal(Object.hasOwn(result.payload, "response"), false);
});

test("unstructured failures remain explicit and do not become evidence cards", async () => {
  const result = await readAgentHttpResponse(
    new Response("<html>upstream details</html>", { status: 503 }),
  );
  assert.deepEqual(result, {
    statusCode: 503,
    payload: {
      error: "Agent returned HTTP 503. No validated blocked-response evidence was provided.",
      upstreamHttpStatus: 503,
    },
  });
  const invalid = preModelBlocked();
  invalid.stages.splice(2, 1);
  assert.equal(normalizeBlockedAgentResponse(invalid, 422), null);
});
