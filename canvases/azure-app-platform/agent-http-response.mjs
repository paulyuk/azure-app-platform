import { summarizeAgentResult } from "./agent-result.mjs";
import { BLOCKED_AGENT_RESPONSE_VERSION, normalizeBlockedAgentResponse } from "./blocked-agent-response.mjs";
import { assessDocumentResult } from "./document-assessment.mjs";

function parseBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function fallbackPreModelBlockedResponse(result, status) {
  if (status !== 422 || result?.verdict !== "rejected" || !result?.toolResult || !result?.runtime) return null;
  const runtime = result.runtime;
  const mode = runtime.agentRuntime === "copilot-sdk-sandbox"
    ? "aca-session"
    : runtime.documentToolRuntime === "aca-custom-container-session"
      ? "aca-document-session"
      : "local-simulation";
  return {
    contractVersion: BLOCKED_AGENT_RESPONSE_VERSION,
    kind: "blocked-agent-response",
    responseOrigin: "agent-harness",
    upstreamHttpStatus: 422,
    executionKind: "agent-invocation",
    testKind: "document-input",
    mode,
    reasonCode: result.toolResult.reasonCode,
    operatorMessage: typeof result.message === "string" && result.message
      ? result.message
      : `Document rejected before any model call: ${result.toolResult.message || ""}`,
    summary: "The hostile document did not reach the model in this request.",
    stages: [
      { id: "agent-harness", state: "succeeded", detail: "Request received" },
      { id: "document-tool", state: "rejected", detail: "Rejected", reasonCode: result.toolResult.reasonCode },
      { id: "model", state: "not-attempted", detail: "Not attempted" },
      { id: "approval-disclosure", state: "not-applicable", detail: "Not part of this test" },
    ],
    limitations: [
      "no-model-call",
      "no-hostile-outbound-probe",
      mode === "local-simulation" ? "local-process-not-isolation-boundary" : "cloud-isolation-not-verified",
    ],
    evidence: {
      runtime,
      modelAuthoredTextShown: false,
      outboundDenialProbeAttempted: false,
    },
  };
}

export async function readAgentHttpResponse(response, { documentAssessmentAllowed = false } = {}) {
  const text = await response.text();
  const result = parseBody(text);
  if (response.ok) {
    return {
      statusCode: response.status,
      payload: {
        response: result,
        summary: summarizeAgentResult(result),
        ...(documentAssessmentAllowed ? { documentAssessment: assessDocumentResult(result) } : {}),
      },
    };
  }
  const candidate = result?.blockedResponse ?? fallbackPreModelBlockedResponse(result, response.status);
  const blockedResponse = normalizeBlockedAgentResponse(candidate, response.status);
  if (blockedResponse) {
    return {
      statusCode: response.status,
      payload: {
        error: blockedResponse.operatorMessage,
        blockedResponse,
        ...(documentAssessmentAllowed ? { documentAssessment: assessDocumentResult(result) } : {}),
      },
    };
  }
  return {
    statusCode: response.status,
    payload: {
      error: `Agent returned HTTP ${response.status}. No validated blocked-response evidence was provided.`,
      upstreamHttpStatus: response.status,
    },
  };
}
