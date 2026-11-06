const REDACTIONS = ["email", "phone", "ssn", "paymentCard"];

// Read the agent harness's structured tool result, never model-authored message text.
export function assessDocumentResult(response) {
  const tool = response?.toolResult;
  if (!tool || typeof tool !== "object" || Array.isArray(tool)
    || tool.contractVersion !== "1.0" || response.verdict !== tool.verdict
    || tool.safety?.rawDocumentReturned !== false
    || tool.safety?.malwareScanned !== false
    || tool.safety?.piiDetection !== "limited-deterministic-patterns") return null;
  if (tool.verdict === "rejected" && typeof tool.message === "string"
    && tool.message.length <= 1000 && typeof tool.reasonCode === "string") {
    return {
      state: "rejected", reason: tool.message, reasonCode: tool.reasonCode,
      contractVersion: tool.contractVersion,
    };
  }
  const document = tool.document;
  const redactions = tool.analysis?.redactions;
  if (tool.verdict !== "approved" || tool.reasonCode !== "sanitized"
    || !["text", "markdown"].includes(document?.kind)
    || typeof document.sanitizedText !== "string" || document.sanitizedText.length > 8000
    || typeof document.truncated !== "boolean" || !redactions
    || REDACTIONS.some((key) => !Number.isInteger(redactions[key]) || redactions[key] < 0 || redactions[key] > 65536)) return null;
  return {
    state: "approved", contractVersion: tool.contractVersion,
    sanitizedText: document.sanitizedText, truncated: document.truncated,
    redactions: Object.fromEntries(REDACTIONS.map((key) => [key, redactions[key]])),
  };
}
