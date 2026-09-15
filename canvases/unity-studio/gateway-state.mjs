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
    model: text(gateway?.model),
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
    AZURE_AI_GATEWAY_MODEL: validated.model,
    AZURE_AI_GATEWAY_MINI_MODEL: validated.model,
  };
}

export async function discoverGatewayModels(commandRunner, gateway) {
  const active = validateGatewayCandidate(gateway);
  const segments = [active.subscriptionId, active.resourceGroup, active.name].map(encodeURIComponent);
  const uri = `https://management.azure.com/subscriptions/${segments[0]}/resourceGroups/${segments[1]}/providers/Microsoft.ApiManagement/service/${segments[2]}/workspaces/default/models?api-version=2025-09-01-preview`;
  const items = [];
  const seen = new Set();
  let next = uri;
  while (next) {
    const target = new URL(next, uri);
    if (target.origin !== "https://management.azure.com" || target.pathname !== new URL(uri).pathname
      || target.username || target.password || seen.has(target.href) || seen.size >= 100) {
      throw new Error("Gateway model discovery returned an invalid continuation URL.");
    }
    seen.add(target.href);
    const result = await commandRunner("az", ["rest", "--method", "get", "--uri", target.href, "-o", "json"]);
    if (!result.ok) throw new Error(result.stderr || result.error || "Unable to discover gateway models.");
    const payload = JSON.parse(result.stdout);
    if (!Array.isArray(payload.value)) throw new Error("Gateway model discovery returned an invalid inventory.");
    items.push(...payload.value);
    next = payload.nextLink;
  }
  const models = items.map((item) => ({
    id: text(item.name), label: text(item.properties?.displayName || item.name),
  })).filter((item) => item.id).sort((a, b) => a.id.localeCompare(b.id));
  return models;
}

export async function loadGatewayModelOptions(commandRunner, options, requestedGateway) {
  const requested = options.gateways.find((gateway) => gateway.name === requestedGateway?.name
    && gateway.resourceGroup === requestedGateway?.resourceGroup);
  const candidates = requested || options.active
    ? [requested || options.suggested].filter(Boolean)
    : [...options.gateways].sort((a, b) => a.name.localeCompare(b.name));
  const warnings = [];
  for (const gateway of candidates) {
    try {
      const models = await discoverGatewayModels(commandRunner, gateway);
      if (models.length || requested || options.active) {
        return { ...options, suggested: gateway, models, warnings };
      }
    } catch (error) {
      warnings.push(`${gateway.name}: ${error.message}`);
    }
  }
  return { ...options, models: [], warnings };
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
    && Boolean(model)
    && (!activeGateway.model || activeGateway.model === model);

  return {
    ready: gatewayConfigured,
    gatewayConfigured,
    model: model || null,
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

export async function discoverGatewayOptions(commandRunner, active, requestedSubscriptionId) {
  const accountsResult = await commandRunner("az", ["account", "list", "-o", "json"]);
  if (!accountsResult.ok) throw new Error(accountsResult.stderr || accountsResult.error || "Sign in to Azure to select a subscription.");
  const subscriptions = JSON.parse(accountsResult.stdout)
    .filter((account) => account.state === "Enabled")
    .map(({ id, name, isDefault }) => ({ id, name, isDefault: Boolean(isDefault) }));
  const subscription = subscriptions.find((item) => item.id === requestedSubscriptionId)
    ?? (!requestedSubscriptionId && subscriptions.find((item) => item.id === active?.subscriptionId))
    ?? (!requestedSubscriptionId && subscriptions.find((item) => item.isDefault))
    ?? (!requestedSubscriptionId && subscriptions[0]);
  if (!subscription) throw new Error("The selected Azure subscription is unavailable. Sign in or choose an enabled subscription.");
  const result = await commandRunner("az", ["aigateway", "list", "--subscription", subscription.id, "-o", "json"]);
  if (!result.ok) throw new Error(result.stderr || result.error || "Unable to list AI Gateways.");
  const gateways = JSON.parse(result.stdout).map(normalizeGatewayCandidate);
  const matching = gateways.find((item) => item.name === active?.name
    && item.resourceGroup === active?.resourceGroup && item.subscriptionId === active?.subscriptionId);
  const suggested = matching ?? [...gateways]
    .filter((item) => item.name && item.resourceGroup && item.subscriptionId && /^https:\/\//i.test(item.endpoint))
    .sort((left, right) => left.name.localeCompare(right.name))[0] ?? null;
  return { subscriptions, subscription, gateways, active: active ?? null, suggested };
}

export function requireGatewayReadiness(readiness) {
  if (readiness.ready) return readiness;
  const error = new Error(readiness.activeGateway
    ? "The selected AI Gateway is not configured yet. Review gateway configuration output and retry."
    : "Choose and configure an AI Gateway before running locally.");
  error.statusCode = 409;
  throw error;
}
