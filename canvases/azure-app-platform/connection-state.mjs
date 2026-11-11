import { readFile } from "node:fs/promises";
import { evaluateGatewayReadiness, normalizeGatewayCandidate, normalizeSandboxGroupCandidate } from "./gateway-state.mjs";

async function optionalFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return "";
  }
}

function envValue(contents, name) {
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return "";
  const value = contents.match(new RegExp(`^${name}[ \\t]*=[ \\t]*(.*)$`, "m"))?.[1]?.trim() || "";
  return value.replace(/^(['"])(.*)\1$/, "$2").trim();
}

function publicEndpoint(value) {
  if (!value) return "";
  if (!URL.canParse(value)) throw new Error("The configured gateway endpoint must be a valid HTTP(S) URL.");
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("The configured gateway endpoint must be an HTTP(S) URL without credentials, query, or fragment.");
  }
  return url.href.replace(/\/+$/, "");
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function readLocalConnectionState(root, { activeGateway = null, configuring = false } = {}) {
  const [agentConfiguration, runtimeContents] = await Promise.all([
    optionalFile(`${root}/src/agent/.env`),
    optionalFile(`${root}/config/runtime.json`),
  ]);
  let runtime;
  try {
    runtime = runtimeContents ? JSON.parse(runtimeContents) : null;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new SyntaxError("The app's config/runtime.json must contain valid JSON.");
  }
  const gateway = runtime?.gateway;
  const endpoint = publicEndpoint(activeGateway?.endpoint
    || envValue(agentConfiguration, "AZURE_AI_GATEWAY_ENDPOINT")
    || envValue(agentConfiguration, gateway?.baseUrlEnv || "AI_GATEWAY_BASE_URL"));
  const model = text(activeGateway?.model
    || envValue(agentConfiguration, gateway?.modelEnv || "AI_GATEWAY_MODEL")
    || envValue(agentConfiguration, "AZURE_AI_GATEWAY_MODEL")
    || gateway?.defaultModel);
  const readiness = evaluateGatewayReadiness(agentConfiguration, activeGateway, configuring);
  const sandboxGroup = activeGateway && Object.hasOwn(activeGateway, "sandboxGroup")
    ? activeGateway.sandboxGroup ? normalizeSandboxGroupCandidate(activeGateway.sandboxGroup) : null
    : readiness.sandboxGroup;
  const active = activeGateway || endpoint ? {
    ...normalizeGatewayCandidate(activeGateway || {
      name: envValue(agentConfiguration, "AI_GATEWAY_NAME") || new URL(endpoint).hostname,
      resourceGroup: envValue(agentConfiguration, "AI_GATEWAY_RESOURCE_GROUP"),
      subscriptionId: envValue(agentConfiguration, "AZURE_SUBSCRIPTION_ID"),
    }),
    endpoint,
    model,
    sandboxGroup,
    configurationStatus: configuring ? "configuring" : text(activeGateway?.configurationStatus) || "local",
  } : null;
  return {
    activeGateway: active,
    gatewayConfigured: readiness.gatewayConfigured,
    model: model || null,
    sandboxGroup,
    agentRuntime: text(runtime?.agentRuntime) || null,
  };
}
