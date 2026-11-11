import assert from "node:assert/strict";
import test from "node:test";

import { readAgentHttpResponse } from "./agent-http-response.mjs";
import { normalizeBlockedAgentResponse, normalizeSandboxProbe } from "./blocked-agent-response.mjs";

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

function probeBlocked(probeOverrides = {}) {
  const response = preModelBlocked({
    testKind: "sandbox-boundary",
    reasonCode: "unauthorized-egress",
    limitations: ["no-model-call", "local-process-not-isolation-boundary"],
  });
  response.stages[1] = { id: "sandbox-tool", state: "rejected", detail: "Rejected", reasonCode: "unauthorized-egress" };
  response.evidence.outboundDenialProbeAttempted = true;
  response.evidence.sandboxProbe = {
    credentialLikeVariableCount: 2, credentialValuesReturned: false, outboundAttempted: true,
    outboundOutcome: "denied", enforcement: "python-audit-hook", httpStatus: null,
    ...probeOverrides,
  };
  return response;
}

test("sandbox-boundary supports observed audit-hook and ACA proxy denials without claiming cloud isolation", async () => {
  for (const enforcement of ["python-audit-hook", "aca-egress-proxy"]) {
    const response = probeBlocked({ enforcement, acaDecisionCount: 3, acaDeniedCount: 1 });
    const result = await readAgentHttpResponse(new Response(JSON.stringify({ blockedResponse: response }), { status: 422 }));
    assert.deepEqual(result.payload.blockedResponse, response);
    assert.equal(result.payload.blockedResponse.evidence.runtime.cloudIsolationVerified, false);
    assert.equal(result.payload.blockedResponse.evidence.outboundDenialProbeAttempted, true);
    assert.equal(result.payload.blockedResponse.limitations.includes("no-hostile-outbound-probe"), false);
  }
});

test("attempted but unverified probes remain explicit, including older custom-container sessions", () => {
  for (const outboundOutcome of ["http-response", "transport-error"]) {
    const response = probeBlocked({ outboundOutcome, enforcement: "unverified", httpStatus: outboundOutcome === "http-response" ? 403 : null });
    assert.equal(normalizeBlockedAgentResponse(response, 422), null);
    response.limitations.push("outbound-denial-unverified");
    response.mode = "aca-document-session";
    response.evidence.runtime = runtime({ documentToolRuntime: "aca-custom-container-session", documentSessionDispatched: true });
    response.limitations = response.limitations.filter(value => value !== "local-process-not-isolation-boundary");
    response.limitations.push("cloud-isolation-not-verified");
    assert.deepEqual(normalizeBlockedAgentResponse(response, 422), response);
  }
  const legacyUnverified = probeBlocked({ enforcement: "unverified" });
  assert.deepEqual(normalizeBlockedAgentResponse(legacyUnverified, 422), legacyUnverified);
});

test("probe claims reject missing, contradictory, malformed or non-redacted evidence", () => {
  const cases = [
    response => { delete response.evidence.sandboxProbe; },
    response => { response.evidence.outboundDenialProbeAttempted = false; },
    response => { response.evidence.sandboxProbe.outboundAttempted = false; },
    response => { response.evidence.sandboxProbe.credentialValuesReturned = true; },
    response => { response.evidence.sandboxProbe.credentialLikeVariableCount = -1; },
    response => { response.evidence.sandboxProbe.credentialLikeVariableCount = 1.5; },
    response => { response.evidence.sandboxProbe.httpStatus = 999; },
    response => { response.evidence.sandboxProbe.url = "redacted-invalid-field"; },
    response => { response.evidence.sandboxProbe.credentialNames = ["redacted-invalid-field"]; },
    response => { response.evidence.sandboxProbe.acaDecisionCount = 1; response.evidence.sandboxProbe.acaDeniedCount = 2; },
    response => { response.limitations.push("no-hostile-outbound-probe"); },
    response => { response.evidence.runtime.cloudIsolationVerified = true; },
  ];
  for (const mutate of cases) {
    const response = probeBlocked();
    mutate(response);
    assert.equal(normalizeBlockedAgentResponse(response, 422), null);
  }
  const legacy = preModelBlocked();
  legacy.testKind = "sandbox-boundary";
  legacy.stages[1].id = "sandbox-tool";
  assert.deepEqual(normalizeBlockedAgentResponse(legacy, 422), legacy);
});

test("fallback harness responses retain top-level tool probe evidence only after validation", async () => {
  const response = probeBlocked();
  const body = {
    verdict: "rejected", testKind: "sandbox-boundary", runtime: runtime(),
    toolResult: { reasonCode: "unauthorized-egress", message: "Outbound rejected", sandboxProbe: response.evidence.sandboxProbe },
  };
  const result = await readAgentHttpResponse(new Response(JSON.stringify(body), { status: 422 }));
  assert.equal(result.payload.blockedResponse.testKind, "sandbox-boundary");
  assert.equal(result.payload.blockedResponse.stages[1].id, "sandbox-tool");
  assert.deepEqual(result.payload.blockedResponse.evidence.sandboxProbe, response.evidence.sandboxProbe);
  body.toolResult.sandboxProbe.credentialValuesReturned = true;
  const invalid = await readAgentHttpResponse(new Response(JSON.stringify(body), { status: 422 }));
  assert.equal(invalid.payload.blockedResponse, undefined);
});

function verifiableProbe(overrides = {}) {
  return {
    credentialLikeVariableCount: 0, credentialValuesReturned: false, outboundAttempted: true,
    envKeys: ["HOME", "LANG", "PATH"], envKeyCount: 3,
    secretFilesPresent: false, secretFileCount: 0,
    outboundOutcome: "denied", enforcement: "aca-egress-proxy", httpStatus: 403,
    acaDecisionCount: 2, acaDeniedCount: 1,
    acaDeniedDecision: {
      action: "Denied", method: "HEAD", scheme: "https", host: "collector.example",
      path: "/", matchedRule: "deny-external",
    },
    ...overrides,
  };
}

test("HTTP evidence retains bounded environment names and sanitized ACA decision summaries", async () => {
  const probe = verifiableProbe();
  const response = probeBlocked(probe);
  const result = await readAgentHttpResponse(new Response(JSON.stringify({ blockedResponse: response }), { status: 422 }));
  assert.deepEqual(result.payload.blockedResponse.evidence.sandboxProbe, probe);
  const normalized = normalizeSandboxProbe(probe);
  probe.envKeys.push("LATER_MUTATION");
  probe.acaDeniedDecision.matchedRule = "LATER_MUTATION";
  assert.deepEqual(normalized.envKeys, ["HOME", "LANG", "PATH"]);
  assert.equal(normalized.acaDeniedDecision.matchedRule, "deny-external");
  assert.deepEqual(normalizeSandboxProbe(verifiableProbe({ envKeys: [], envKeyCount: 0 })).envKeys, []);
  const keys = Array.from({ length: 32 }, (_, index) => "KEY_" + index);
  assert.equal(normalizeSandboxProbe(verifiableProbe({ envKeys: keys, envKeyCount: 40 })).envKeyCount, 40);
  assert.equal(normalizeSandboxProbe(verifiableProbe({ secretFilesPresent: true, secretFileCount: 2 })).secretFileCount, 2);
});

test("environment and ACA summary normalization rejects values, oversized payloads, and conflicting evidence", () => {
  for (const change of [
    { envKeys: "PATH" }, { envKeys: [1] }, { envKeys: ["PATH", "PATH", "PATH"] },
    { envKeys: ["A".repeat(257)] }, { envKeys: ["NAME=value"] }, { envKeys: ["UNSAFE\nNAME"] },
    { envKeys: Array(33).fill("PATH") }, { envKeyCount: -1 }, { envKeyCount: 2 },
    { envKeyCount: true }, { envKeys: undefined },
    { credentialLikeVariableCount: 4 }, { secretFilesPresent: "false" },
    { secretFileCount: 1 }, { secretFileCount: true }, { secretFileCount: 6 },
    { acaDeniedDecision: [] }, { acaDecisionCount: 101 }, { acaDeniedCount: 0 },
    { enforcement: "python-audit-hook" }, { outboundOutcome: "transport-error" }, { httpStatus: 200 },
    ...[
      { host: "host/path?private" }, { host: "evil\ninjected" }, { method: "POST" },
      { path: "/private?data=never-return" }, { headers: { Authorization: "never-return" } },
      { matchedRule: { token: "never-return" } }, { matchedRule: "rule\ninjected" },
      { matchedRule: "x".repeat(129) }, { scheme: "file" }, { action: "Allowed" },
    ].map(fields => ({ acaDeniedDecision: { ...verifiableProbe().acaDeniedDecision, ...fields } })),
  ]) assert.equal(normalizeSandboxProbe(verifiableProbe(change)), null, Object.keys(change).join(", "));
});
