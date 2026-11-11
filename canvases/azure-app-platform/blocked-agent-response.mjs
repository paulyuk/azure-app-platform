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
const TEST_KINDS = new Set(["document-input", "sandbox-boundary", "agent-output-policy"]);
const LIMITATIONS = new Set([
  "no-model-call",
  "no-hostile-outbound-probe",
  "local-process-not-isolation-boundary",
  "cloud-isolation-not-verified",
  "model-output-not-shown",
  "outbound-denial-unverified",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

export function normalizeSandboxProbe(value) {
  const keys = new Set(["credentialLikeVariableCount", "credentialValuesReturned", "outboundAttempted",
    "outboundOutcome", "enforcement", "httpStatus", "acaDecisionCount", "acaDeniedCount",
    "envKeys", "envKeyCount", "secretFilesPresent", "secretFileCount", "acaDeniedDecision",
    "identityEndpoint", "identityHeaderPresent", "identityHeaderLength", "identityTokenStatus",
    "identityTokenHttpStatus"]);
  if (!isRecord(value) || Object.keys(value).some(key => !keys.has(key))
    || !Number.isSafeInteger(value.credentialLikeVariableCount) || value.credentialLikeVariableCount < 0
    || value.credentialLikeVariableCount > 65536
    || value.credentialValuesReturned !== false || typeof value.outboundAttempted !== "boolean"
    || !["denied", "http-response", "transport-error", "not-attempted"].includes(value.outboundOutcome)
    || !["python-audit-hook", "aca-egress-proxy", "unverified", "not-applicable"].includes(value.enforcement)
    || !(value.httpStatus === null || (Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599))) return null;
  if (!value.outboundAttempted) {
    if (value.outboundOutcome !== "not-attempted"
      || value.enforcement !== "not-applicable"
      || value.httpStatus !== null) return null;
  } else if (value.outboundOutcome === "not-attempted" || value.enforcement === "not-applicable") {
    return null;
  }
  if (value.identityEndpoint !== undefined && value.identityEndpoint !== "http://100.64.100.2/msi/token") return null;
  if (value.identityHeaderPresent !== undefined && typeof value.identityHeaderPresent !== "boolean") return null;
  if (value.identityHeaderLength !== undefined && (!Number.isSafeInteger(value.identityHeaderLength)
    || value.identityHeaderLength < 0 || value.identityHeaderLength > 256)) return null;
  if (value.identityTokenStatus !== undefined && !["blocked-no-identity", "active-token-mintable",
    "http-error", "transport-error", "not-probed"].includes(value.identityTokenStatus)) return null;
  if (value.identityTokenHttpStatus !== undefined && !(value.identityTokenHttpStatus === null
    || (Number.isInteger(value.identityTokenHttpStatus) && value.identityTokenHttpStatus >= 100
      && value.identityTokenHttpStatus <= 599))) return null;
  for (const key of ["acaDecisionCount", "acaDeniedCount"]) {
    if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 100)) return null;
  }
  if (value.acaDecisionCount !== undefined && value.acaDeniedCount > value.acaDecisionCount) return null;
  if (value.envKeys !== undefined && (!Array.isArray(value.envKeys) || value.envKeys.length > 32
    || value.envKeys.some(key => !boundedString(key, 256) || /[=\u0000-\u001f\u007f]/u.test(key))
    || new Set(value.envKeys).size !== value.envKeys.length)) return null;
  if (value.envKeyCount !== undefined && (!Number.isSafeInteger(value.envKeyCount)
    || value.envKeyCount < 0 || value.envKeyCount > 65536 || !value.envKeys
    || value.envKeys.length !== Math.min(value.envKeyCount, 32)
    || value.credentialLikeVariableCount > value.envKeyCount)) return null;
  if (value.secretFilesPresent !== undefined && typeof value.secretFilesPresent !== "boolean") return null;
  if (value.secretFileCount !== undefined && (!Number.isSafeInteger(value.secretFileCount)
    || value.secretFileCount < 0 || value.secretFileCount > 5
    || value.secretFilesPresent !== (value.secretFileCount > 0))) return null;
  const decision = value.acaDeniedDecision;
  if (decision !== undefined && (!isRecord(decision)
    || Object.keys(decision).length !== 6
    || Object.keys(decision).some(key => !["action", "method", "scheme", "host", "path", "matchedRule"].includes(key))
    || decision.action !== "Denied" || decision.method !== "HEAD" || decision.path !== "/"
    || !["http", "https"].includes(decision.scheme)
    || !boundedString(decision.host, 253) || !/^[a-z0-9._:-]+$/.test(decision.host)
    || !boundedString(decision.matchedRule, 128)
    || !/^(?:[A-Za-z0-9][A-Za-z0-9_.:-]*|\[REDACTED\])$/.test(decision.matchedRule)
    || value.outboundOutcome !== "denied" || value.enforcement !== "aca-egress-proxy"
    || ![null, 403].includes(value.httpStatus)
    || !(value.acaDeniedCount > 0 && value.acaDeniedCount <= value.acaDecisionCount))) return null;
  return {
    ...value,
    ...(value.envKeys ? { envKeys: [...value.envKeys] } : {}),
    ...(decision ? { acaDeniedDecision: { ...decision } } : {}),
  };
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
    if (!isRecord(stage) || (stage.id !== STAGE_IDS[index] && !(index === 1 && stage.id === "sandbox-tool")) || !STAGE_STATES.has(stage.state)
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
  const attempted = response.evidence.outboundDenialProbeAttempted;
  const probe = response.evidence.sandboxProbe;
  if (response.evidence.modelAuthoredTextShown !== false
    || response.limitations.includes("no-hostile-outbound-probe") !== !attempted) return false;
  if (attempted) {
    if (!probe || !probe.outboundAttempted || response.reasonCode !== "unauthorized-egress") return false;
    if (probe.outboundOutcome !== "denied"
      && !response.limitations.includes("outbound-denial-unverified")) return false;
  } else if (probe && probe.outboundAttempted) return false;
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
  if (["document-input", "sandbox-boundary"].includes(response.testKind)) {
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
    || typeof value.evidence.outboundDenialProbeAttempted !== "boolean") return null;
  const stages = normalizeStages(value.stages);
  const runtime = normalizeRuntime(value.evidence.runtime);
  const sandboxProbe = value.evidence.sandboxProbe === undefined ? undefined : normalizeSandboxProbe(value.evidence.sandboxProbe);
  if (!stages || !runtime || sandboxProbe === null) return null;
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
      outboundDenialProbeAttempted: value.evidence.outboundDenialProbeAttempted,
      ...(sandboxProbe ? { sandboxProbe } : {}),
    },
  };
  return validatesClaims(response) ? response : null;
}
