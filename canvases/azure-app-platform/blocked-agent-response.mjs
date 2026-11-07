export const BLOCKED_AGENT_RESPONSE_VERSION = "agent-blocked-response/1.0";

const STAGE_IDS = ["agent-harness", "document-tool", "model", "approval-disclosure"];
const STAGE_STATES = new Set([
  "not-applicable",
  "not-attempted",
  "started",
  "succeeded",
  "rejected",
  "blocked",
  "failed",
]);
const MODES = new Set(["local-simulation", "aca-session", "aca-document-session"]);
const TEST_KINDS = new Set(["document-input", "agent-output-policy"]);
const LIMITATIONS = new Set([
  "no-model-call",
  "no-hostile-outbound-probe",
  "local-process-not-isolation-boundary",
  "cloud-isolation-not-verified",
  "model-output-not-shown",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function normalizeRuntime(value) {
  if (!isRecord(value)
    || !["local", "copilot-sdk-sandbox"].includes(value.agentRuntime)
    || !["local-process", "aca-custom-container-session"].includes(value.agentIsolation)
    || !["local-process-simulation", "aca-custom-container-session"].includes(value.documentToolRuntime)
    || typeof value.agentSessionDispatched !== "boolean"
    || typeof value.documentSessionDispatched !== "boolean"
    || ![true, false, null].includes(value.gatewayConfigured)
    || !["control-plane", "agent-sandbox"].includes(value.gatewayConfigurationScope)
    || value.rawDocumentSentToAgent !== false
    || value.cloudIsolationVerified !== false) return null;
  const runtime = {
    agentRuntime: value.agentRuntime,
    agentIsolation: value.agentIsolation,
    documentToolRuntime: value.documentToolRuntime,
    agentSessionDispatched: value.agentSessionDispatched,
    documentSessionDispatched: value.documentSessionDispatched,
    gatewayConfigured: value.gatewayConfigured,
    gatewayConfigurationScope: value.gatewayConfigurationScope,
    rawDocumentSentToAgent: false,
    cloudIsolationVerified: false,
  };
  for (const key of ["instructionFile", "acaSandboxGroup", "lastSandboxId"]) {
    if (boundedString(value[key], 500)) runtime[key] = value[key];
  }
  if (isRecord(value.gatewayResponse)) runtime.gatewayResponse = value.gatewayResponse;
  return runtime;
}

function normalizeStages(value) {
  if (!Array.isArray(value) || value.length !== STAGE_IDS.length) return null;
  const stages = [];
  for (let index = 0; index < STAGE_IDS.length; index += 1) {
    const stage = value[index];
    if (!isRecord(stage) || stage.id !== STAGE_IDS[index] || !STAGE_STATES.has(stage.state)
      || !boundedString(stage.detail, 240)) return null;
    const normalized = { id: stage.id, state: stage.state, detail: stage.detail };
    if (stage.reasonCode !== undefined) {
      if (!boundedString(stage.reasonCode, 128)) return null;
      normalized.reasonCode = stage.reasonCode;
    }
    stages.push(normalized);
  }
  return stages;
}

function validatesClaims(response) {
  const [harness, documentTool, model, disclosure] = response.stages;
  const runtime = response.evidence.runtime;
  if (harness.state !== "succeeded" || harness.detail !== "Request received") return false;
  if (!response.limitations.includes("no-hostile-outbound-probe")
    || response.evidence.outboundDenialProbeAttempted !== false
    || response.evidence.modelAuthoredTextShown !== false) return false;
  if (response.mode === "local-simulation") {
    if (!response.limitations.includes("local-process-not-isolation-boundary")
      || runtime.agentRuntime !== "local"
      || runtime.agentIsolation !== "local-process"
      || runtime.documentToolRuntime !== "local-process-simulation") return false;
  } else if (response.mode === "aca-session") {
    if (!response.limitations.includes("cloud-isolation-not-verified")
      || runtime.agentRuntime !== "copilot-sdk-sandbox"
      || runtime.agentIsolation !== "aca-custom-container-session"
      || runtime.documentToolRuntime !== "aca-custom-container-session") return false;
  } else if (!response.limitations.includes("cloud-isolation-not-verified")
    || runtime.agentRuntime !== "local"
    || runtime.agentIsolation !== "local-process"
    || runtime.documentToolRuntime !== "aca-custom-container-session"
    || runtime.agentSessionDispatched) {
    return false;
  }
  if (response.testKind === "document-input") {
    return response.upstreamHttpStatus === 422
      && documentTool.state === "rejected"
      && documentTool.reasonCode === response.reasonCode
      && model.state === "not-attempted"
      && disclosure.state === "not-applicable"
      && runtime.agentSessionDispatched === false
      && (runtime.documentToolRuntime !== "aca-custom-container-session"
        || runtime.documentSessionDispatched === true)
      && response.limitations.includes("no-model-call")
      && !response.limitations.includes("model-output-not-shown");
  }
  return response.reasonCode === "agent-output-policy-blocked"
    && response.upstreamHttpStatus === 502
    && ["succeeded", "not-applicable"].includes(documentTool.state)
    && model.state === "succeeded"
    && disclosure.state === "blocked"
    && disclosure.reasonCode === response.reasonCode
    && (response.mode !== "aca-session" || runtime.agentSessionDispatched === true)
    && response.limitations.includes("model-output-not-shown")
    && !response.limitations.includes("no-model-call");
}

export function normalizeBlockedAgentResponse(value, upstreamHttpStatus) {
  if (!isRecord(value)
    || value.contractVersion !== BLOCKED_AGENT_RESPONSE_VERSION
    || value.kind !== "blocked-agent-response"
    || value.responseOrigin !== "agent-harness"
    || !Number.isInteger(value.upstreamHttpStatus)
    || value.upstreamHttpStatus !== upstreamHttpStatus
    || value.executionKind !== "agent-invocation"
    || !TEST_KINDS.has(value.testKind)
    || !MODES.has(value.mode)
    || !boundedString(value.reasonCode, 128)
    || !boundedString(value.operatorMessage, 1000)
    || !boundedString(value.summary, 500)
    || !Array.isArray(value.limitations)
    || value.limitations.length < 2
    || value.limitations.some((item) => !LIMITATIONS.has(item))
    || new Set(value.limitations).size !== value.limitations.length
    || !isRecord(value.evidence)
    || value.evidence.modelAuthoredTextShown !== false
    || value.evidence.outboundDenialProbeAttempted !== false) return null;
  const stages = normalizeStages(value.stages);
  const runtime = normalizeRuntime(value.evidence.runtime);
  if (!stages || !runtime) return null;
  const response = {
    contractVersion: value.contractVersion,
    kind: value.kind,
    responseOrigin: value.responseOrigin,
    upstreamHttpStatus: value.upstreamHttpStatus,
    executionKind: value.executionKind,
    testKind: value.testKind,
    mode: value.mode,
    reasonCode: value.reasonCode,
    operatorMessage: value.operatorMessage,
    summary: value.summary,
    stages,
    limitations: [...value.limitations],
    evidence: {
      runtime,
      modelAuthoredTextShown: false,
      outboundDenialProbeAttempted: false,
    },
  };
  return validatesClaims(response) ? response : null;
}
