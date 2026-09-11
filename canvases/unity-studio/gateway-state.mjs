function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function envValue(contents, name) {
  const match = contents.match(new RegExp(`^${name}\\s*=\\s*(.+)$`, "m"));
  if (!match) return "";
  const value = match[1].trim();
  if (
    value.length >= 2
    && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function normalizedEndpoint(value) {
  return text(value).replace(/\/+$/, "").toLowerCase();
}

export function normalizeGatewayCandidate(gateway) {
  const resourceId = text(gateway?.id);
  const resourceIdParts = resourceId.split("/");
  const resourceGroupIndex = resourceIdParts.findIndex((part) =>
    part.toLowerCase() === "resourcegroups");
  return {
    name: text(gateway?.name),
    resourceGroup: text(
      gateway?.resourceGroup
      || gateway?.resourceGroupName
      || (resourceGroupIndex >= 0 ? resourceIdParts[resourceGroupIndex + 1] : ""),
    ),
    location: text(gateway?.location),
    subscriptionId: text(resourceId.split("/")[2] || gateway?.subscriptionId),
    endpoint: text(gateway?.properties?.gatewayUrl || gateway?.endpoint),
  };
}

export function validateGatewayCandidate(gateway) {
  const active = normalizeGatewayCandidate(gateway);
  const missing = [];
  if (!active.name) missing.push("name");
  if (!active.resourceGroup) missing.push("resource group");
  if (!active.subscriptionId) missing.push("subscription");
  if (!active.endpoint) missing.push("runtime endpoint");
  if (missing.length > 0) {
    throw new Error(`The selected AI Gateway is missing ${missing.join(", ")} metadata.`);
  }
  return active;
}

export function gatewayCommandEnvironment(active) {
  const validated = validateGatewayCandidate(active);
  return {
    UNITY_GATEWAY_SELECTION: "1",
    AZURE_SUBSCRIPTION_ID: validated.subscriptionId,
    AI_GATEWAY_RESOURCE_GROUP: validated.resourceGroup,
    AI_GATEWAY_NAME: validated.name,
    AZURE_AI_GATEWAY_ENDPOINT: validated.endpoint,
    AZURE_AI_GATEWAY_MODEL: "",
    AZURE_AI_GATEWAY_MINI_MODEL: "",
  };
}

export function evaluateGatewayReadiness(agentConfiguration, activeGateway, configuring = false) {
  const endpoint = envValue(agentConfiguration, "AZURE_AI_GATEWAY_ENDPOINT");
  const apiKey = envValue(agentConfiguration, "AZURE_AI_GATEWAY_API_KEY");
  const model = envValue(agentConfiguration, "AZURE_AI_GATEWAY_MODEL");
  const configuredGatewayName = envValue(agentConfiguration, "AI_GATEWAY_NAME");
  const configuredResourceGroup = envValue(agentConfiguration, "AI_GATEWAY_RESOURCE_GROUP");
  const configuredSubscriptionId = envValue(agentConfiguration, "AZURE_SUBSCRIPTION_ID");
  const gatewayConfigured = Boolean(activeGateway)
    && !configuring
    && activeGateway.configurationStatus === "ready"
    && configuredGatewayName === activeGateway.name
    && configuredResourceGroup === activeGateway.resourceGroup
    && configuredSubscriptionId === activeGateway.subscriptionId
    && normalizedEndpoint(endpoint) === normalizedEndpoint(activeGateway.endpoint)
    && /^https:\/\//i.test(endpoint)
    && Boolean(apiKey)
    && Boolean(model);

  return {
    ready: gatewayConfigured,
    gatewayConfigured,
    activeGateway: activeGateway ?? null,
    missing: gatewayConfigured
      ? []
      : activeGateway
        ? ["Validated AI Gateway endpoint, API key, and model"]
        : ["Active AI Gateway selection"],
    guidance: gatewayConfigured
      ? "Gateway configuration is present. Run the local stack."
      : activeGateway
        ? configuring || activeGateway.configurationStatus === "configuring"
          ? "The selected gateway is being validated and applied. Review command output before running locally."
          : "The selected gateway needs validation. Reconfigure it before running locally."
        : "Choose an existing AI Gateway. Unity Studio will validate its model route and configure this app automatically.",
  };
}

export function requireGatewayReadiness(readiness) {
  if (readiness.ready) return readiness;
  const error = new Error(readiness.activeGateway
    ? "The selected AI Gateway is not configured yet. Review gateway configuration output and retry."
    : "Choose and configure an AI Gateway before running locally.");
  error.statusCode = 409;
  throw error;
}
