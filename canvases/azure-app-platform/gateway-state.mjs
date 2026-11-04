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

function normalizeGatewayEndpoint(gateway) {
  const explicit = text(gateway?.properties?.gatewayUrl || gateway?.endpoint);
  if (explicit) return /^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`;
  const hostname = text(
    gateway?.properties?.frontend?.defaultHostname
    || gateway?.properties?.runtimeHostname,
  );
  if (!hostname) return "";
  return /^https?:\/\//i.test(hostname) ? hostname : `https://${hostname}`;
}

export function selectPreferredModelId(models, activeModel = "") {
  if (!Array.isArray(models) || !models.length) return "";
  if (activeModel) {
    const matched = models.find((item) => item.id === activeModel);
    if (matched) return matched.id;
  }
  const latest = models.find((item) => /^gpt-latest$/i.test(item.id));
  if (latest) return latest.id;
  const nonMini = models.find((item) => !/mini|nano/i.test(item.id));
  if (nonMini) return nonMini.id;
  return models[0].id;
}

export function normalizeSandboxGroupCandidate(group) {
  const resourceId = text(group?.id);
  const resourceIdParts = resourceId.split("/");
  const resourceGroupIndex = resourceIdParts.findIndex((part) =>
    part.toLowerCase() === "resourcegroups");
  const nestedSandbox = group?.sandbox && typeof group.sandbox === "object" ? group.sandbox : null;
  return {
    name: text(group?.name || group?.sandbox_group || group?.group || nestedSandbox?.group || nestedSandbox?.name),
    resourceGroup: text(
      group?.resourceGroup
      || group?.resource_group
      || nestedSandbox?.resource_group
      || nestedSandbox?.resourceGroup
      || (resourceGroupIndex >= 0 ? resourceIdParts[resourceGroupIndex + 1] : ""),
    ),
    location: text(group?.location || group?.region || nestedSandbox?.region || nestedSandbox?.location),
    subscriptionId: text(
      resourceId.split("/")[2]
      || group?.subscriptionId
      || group?.subscription
      || nestedSandbox?.subscription
      || nestedSandbox?.subscriptionId,
    ),
  };
}

export async function discoverSandboxGroups(
  commandRunner,
  subscriptionId = "",
  configuredGroup = null,
  { includeAll = false, fallbackAllSubscriptions = false } = {},
) {
  const configured = configuredGroup ? normalizeSandboxGroupCandidate(configuredGroup) : null;
  const matchesSub = (candidateSub, targetSub) =>
    !targetSub || !candidateSub || candidateSub.toLowerCase() === targetSub.toLowerCase();
  const configuredMatchesSubscription = Boolean(
    configured?.name
    && configured?.resourceGroup
    && matchesSub(configured.subscriptionId, subscriptionId),
  );
  if (!includeAll && configuredMatchesSubscription) {
    return { sandboxGroups: [configured], suggested: configured, subscriptionId: subscriptionId || configured.subscriptionId || "" };
  }

  const parseGroupsFromStdout = (stdout, filterSub = "") => {
    const found = [];
    if (!stdout) return found;
    try {
      const parsed = JSON.parse(stdout);
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : []);
      for (const item of list) {
        const candidate = normalizeSandboxGroupCandidate(item);
        if (candidate.name && candidate.resourceGroup && matchesSub(candidate.subscriptionId, filterSub)) {
          if (!found.some((existing) =>
            existing.name === candidate.name
            && existing.resourceGroup === candidate.resourceGroup
            && (existing.subscriptionId || "").toLowerCase() === (candidate.subscriptionId || "").toLowerCase()
          )) {
            found.push(candidate);
          }
        }
      }
    } catch {
      // Ignore parse failures
    }
    return found;
  };

  let resolvedSubscriptionId = subscriptionId;
  let groups = [];
  if (subscriptionId === "*") {
    const graphResult = await commandRunner("az", [
      "rest",
      "--method",
      "post",
      "--uri",
      "https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01",
      "--body",
      JSON.stringify({
        query: "Resources | where type =~ 'microsoft.app/sandboxgroups' | project id, name, resourceGroup, location, subscriptionId",
      }),
      "-o",
      "json",
    ]);
    if (graphResult?.ok && graphResult.stdout) {
      groups = parseGroupsFromStdout(graphResult.stdout, "");
    }
  } else {
    const args = ["resource", "list", "--resource-type", "Microsoft.App/sandboxGroups", "-o", "json"];
    if (subscriptionId) args.splice(4, 0, "--subscription", subscriptionId);
    const result = await commandRunner("az", args);
    if (result?.ok && result.stdout) {
      groups = parseGroupsFromStdout(result.stdout, subscriptionId);
    }
    if (!groups.length && fallbackAllSubscriptions && subscriptionId) {
      const graphResult = await commandRunner("az", [
        "rest",
        "--method",
        "post",
        "--uri",
        "https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01",
        "--body",
        JSON.stringify({
          query: "Resources | where type =~ 'microsoft.app/sandboxgroups' | project id, name, resourceGroup, location, subscriptionId",
        }),
        "-o",
        "json",
      ]);
      if (graphResult?.ok && graphResult.stdout) {
        const crossSubGroups = parseGroupsFromStdout(graphResult.stdout, "");
        if (crossSubGroups.length) {
          groups = crossSubGroups;
          resolvedSubscriptionId = "*";
        }
      }
    }
  }

  const effectiveFilterSub = resolvedSubscriptionId === "*" ? "" : resolvedSubscriptionId;
  if (
    configured?.name
    && configured?.resourceGroup
    && matchesSub(configured.subscriptionId, effectiveFilterSub)
    && !groups.some((item) =>
      item.name === configured.name && item.resourceGroup === configured.resourceGroup
    )
  ) {
    groups.unshift(configured);
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  const suggested = (
    configured?.name
    && configured?.resourceGroup
    && matchesSub(configured.subscriptionId, effectiveFilterSub)
      ? groups.find((item) => item.name === configured.name && item.resourceGroup === configured.resourceGroup)
      : null
  )
    ?? groups[0]
    ?? null;
  return { sandboxGroups: groups, suggested, subscriptionId: resolvedSubscriptionId };
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
    endpoint: normalizeGatewayEndpoint(gateway),
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
  const env = {
    APP_PLATFORM_GATEWAY_SELECTION: "1",
    AZURE_SUBSCRIPTION_ID: validated.subscriptionId,
    AI_GATEWAY_RESOURCE_GROUP: validated.resourceGroup,
    AI_GATEWAY_NAME: validated.name,
    AZURE_AI_GATEWAY_ENDPOINT: validated.endpoint,
    AZURE_AI_GATEWAY_MODEL: validated.model,
    AZURE_AI_GATEWAY_MINI_MODEL: validated.model,
  };
  if (active?.sandboxGroup?.name) {
    env.ACA_SANDBOX_GROUP = text(active.sandboxGroup.name);
    env.ACA_RESOURCE_GROUP = text(active.sandboxGroup.resourceGroup || validated.resourceGroup);
    env.ACA_REGION = text(active.sandboxGroup.location || validated.location || "eastus2");
    env.ACA_SUBSCRIPTION = text(active.sandboxGroup.subscriptionId || validated.subscriptionId);
  } else if (active && "sandboxGroup" in active && !active.sandboxGroup) {
    env.ACA_SANDBOX_DISABLE = "1";
  }
  return env;
}

function normalizeModelEntry({ id, name, displayName, kind = "model", targets = [] }) {
  const callableId = text(id || name);
  if (!callableId) return null;
  const display = text(displayName);
  let label = callableId;
  if (kind === "alias") {
    const targetSuffix = targets.length ? ` → ${targets.join(", ")}` : "";
    const aliasResource = text(name);
    const resourceNote = aliasResource && aliasResource !== callableId ? ` (${aliasResource})` : "";
    label = `${callableId} · alias${targetSuffix}${resourceNote}`;
  } else if (display && display !== callableId) {
    label = `${callableId} (${display})`;
  }
  return { id: callableId, label, kind };
}

function extractAliasTargetModelNames(item) {
  const backends = Array.isArray(item?.properties?.backendModels) ? item.properties.backendModels : [];
  const names = [];
  for (const backend of backends) {
    const resourceId = text(backend?.resourceId);
    const parts = resourceId.split("/").filter(Boolean);
    const modelsIdx = parts.findIndex((part) => part.toLowerCase() === "models");
    const modelName = modelsIdx >= 0 ? text(parts[modelsIdx + 1]) : text(parts.at(-1));
    if (modelName && !names.includes(modelName)) names.push(modelName);
  }
  return names;
}

export async function discoverGatewayModels(commandRunner, gateway) {
  const active = validateGatewayCandidate(gateway);
  const segments = [active.subscriptionId, active.resourceGroup, active.name].map(encodeURIComponent);
  const resourceTypes = ["aigateways", "service"];
  const collected = new Map();
  const addEntry = (entry) => {
    if (!entry?.id) return;
    const existing = collected.get(entry.id);
    if (!existing || (existing.kind !== "alias" && entry.kind === "alias")) {
      collected.set(entry.id, entry);
    }
  };

  let restError = "";
  let restSucceeded = false;
  for (const resourceType of resourceTypes) {
    const modelsUri = `https://management.azure.com/subscriptions/${segments[0]}/resourceGroups/${segments[1]}/providers/Microsoft.ApiManagement/${resourceType}/${segments[2]}/workspaces/default/models?api-version=2025-09-01-preview`;
    const items = [];
    const seen = new Set();
    let next = modelsUri;
    let typeFailed = false;
    while (next) {
      const target = new URL(next, modelsUri);
      if (target.origin !== "https://management.azure.com" || target.pathname !== new URL(modelsUri).pathname
        || target.username || target.password || seen.has(target.href) || seen.size >= 100) {
        throw new Error("Gateway model discovery returned an invalid continuation URL.");
      }
      seen.add(target.href);
      const result = await commandRunner("az", ["rest", "--method", "get", "--uri", target.href, "-o", "json"]);
      if (!result?.ok) {
        restError = result?.stderr || result?.error || "Unable to discover gateway models.";
        typeFailed = true;
        break;
      }
      let payload;
      try {
        payload = JSON.parse(result.stdout);
      } catch {
        restError = "Gateway model discovery returned an invalid inventory.";
        typeFailed = true;
        break;
      }
      if (!Array.isArray(payload?.value)) {
        restError = "Gateway model discovery returned an invalid inventory.";
        typeFailed = true;
        break;
      }
      items.push(...payload.value);
      next = payload.nextLink;
    }
    if (!typeFailed) {
      restSucceeded = true;
      for (const item of items) {
        addEntry(normalizeModelEntry({
          id: item?.name,
          displayName: item?.properties?.displayName,
          kind: "model",
        }));
      }
      const aliasesUri = `https://management.azure.com/subscriptions/${segments[0]}/resourceGroups/${segments[1]}/providers/Microsoft.ApiManagement/${resourceType}/${segments[2]}/workspaces/default/aliases?api-version=2025-09-01-preview`;
      const aliasResult = await commandRunner("az", ["rest", "--method", "get", "--uri", aliasesUri, "-o", "json"]);
      if (aliasResult?.ok && aliasResult.stdout) {
        try {
          const aliasPayload = JSON.parse(aliasResult.stdout);
          const aliasItems = Array.isArray(aliasPayload?.value) ? aliasPayload.value : (Array.isArray(aliasPayload) ? aliasPayload : []);
          for (const item of aliasItems) {
            addEntry(normalizeModelEntry({
              id: item?.properties?.aliasName || item?.aliasName || item?.name,
              name: item?.name,
              kind: "alias",
              targets: extractAliasTargetModelNames(item),
            }));
          }
        } catch {
          // Ignore optional alias parse failures
        }
      }
      break;
    }
  }

  if (!restSucceeded) {
    const [cliModelsResult, cliAliasesResult] = await Promise.all([
      commandRunner("az", [
        "aigateway",
        "model",
        "list",
        "--subscription",
        active.subscriptionId,
        "-g",
        active.resourceGroup,
        "--gateway-name",
        active.name,
        "-o",
        "json",
      ]),
      commandRunner("az", [
        "aigateway",
        "model-alias",
        "list",
        "--subscription",
        active.subscriptionId,
        "-g",
        active.resourceGroup,
        "--gateway-name",
        active.name,
        "-o",
        "json",
      ]),
    ]);
    let cliSucceeded = false;
    if (cliModelsResult?.ok && cliModelsResult.stdout) {
      try {
        const cliItems = JSON.parse(cliModelsResult.stdout);
        if (Array.isArray(cliItems)) {
          cliSucceeded = true;
          for (const item of cliItems) {
            addEntry(normalizeModelEntry({
              id: item?.name,
              displayName: item?.properties?.displayName,
              kind: "model",
            }));
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
    if (cliAliasesResult?.ok && cliAliasesResult.stdout) {
      try {
        const cliAliases = JSON.parse(cliAliasesResult.stdout);
        if (Array.isArray(cliAliases)) {
          cliSucceeded = true;
          for (const item of cliAliases) {
            addEntry(normalizeModelEntry({
              id: item?.properties?.aliasName || item?.aliasName || item?.name,
              name: item?.name,
              kind: "alias",
              targets: extractAliasTargetModelNames(item),
            }));
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
    if (!cliSucceeded) {
      throw new Error(restError || "Unable to discover gateway models.");
    }
  }

  return [...collected.values()].sort((a, b) => a.id.localeCompare(b.id));
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
  const sandboxGroupName = envValue(agentConfiguration, "ACA_SANDBOX_GROUP")
    || text(activeGateway?.sandboxGroup?.name);
  const sandboxResourceGroup = envValue(agentConfiguration, "ACA_RESOURCE_GROUP")
    || text(activeGateway?.sandboxGroup?.resourceGroup);
  const sandboxRegion = envValue(agentConfiguration, "ACA_REGION")
    || text(activeGateway?.sandboxGroup?.location);
  const sandboxSubscriptionId = envValue(agentConfiguration, "ACA_SUBSCRIPTION")
    || text(activeGateway?.sandboxGroup?.subscriptionId)
    || configuredSubscriptionId;
  const sandboxGroup = sandboxGroupName
    ? {
        name: sandboxGroupName,
        resourceGroup: sandboxResourceGroup,
        location: sandboxRegion,
        subscriptionId: sandboxSubscriptionId,
      }
    : null;
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
    sandboxGroup,
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
        : "Choose an existing AI Gateway or bootstrap a new one to connect a model.",
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
  const gateways = JSON.parse(result.stdout)
    .map(normalizeGatewayCandidate)
    .filter((item) => !subscription.id || !item.subscriptionId || item.subscriptionId.toLowerCase() === subscription.id.toLowerCase());
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
