import { discoverPlatform, runCommand } from "./discovery.mjs";
import { traceApp } from "./app-map.mjs";
import { PLATFORM_TIERS, getTierDefinition } from "./tier-definitions.mjs";
export {
  buildImplementationInventory,
  buildCapabilityRequestPrompt,
  buildConnectionRequestPrompt,
  buildWorkspaceRequestPrompt,
  deleteAppWorkspace,
  normalizeCapabilityRequest,
  normalizeConnectionRequest,
  normalizeWorkspaceRequest,
  openWorkspaceInVsCode,
  requestAppWorkspace,
  requestCapabilityWork,
  requestConnectionWork,
  resolveConnectionRequest,
  WORKSPACE_TIER_IDS,
} from "./workspace-actions.mjs";

export { PLATFORM_TIERS };

export function getPlatformOverview() {
  return {
    platform: "Unity",
    generatedAt: new Date().toISOString(),
    tiers: PLATFORM_TIERS.map((tier) => ({ ...tier })),
  };
}

export async function discoverUnityPlatform({
  root = process.cwd(),
  includeAzure = true,
  commandRunner = runCommand,
} = {}) {
  return discoverPlatform({ root, includeAzure, commandRunner });
}

export async function runDoctor({
  root = process.cwd(),
  includeAzureProbe = true,
  commandRunner = runCommand,
} = {}) {
  const discovery = await discoverUnityPlatform({
    root,
    includeAzure: includeAzureProbe,
    commandRunner,
  });
  const repositoryWarnings = discovery.diagnostics.filter((diagnostic) => diagnostic.source !== "azure");
  const checks = [
    {
      id: "repository-discovery",
      status: repositoryWarnings.length === 0 ? "pass" : "warn",
      detail: repositoryWarnings.length === 0
        ? `Scanned ${discovery.repository.scannedFiles} repository files.`
        : `${repositoryWarnings.length} repository scan diagnostic(s) were reported.`,
    },
    {
      id: "azure-discovery",
      status: includeAzureProbe ? (discovery.azure.available ? "pass" : "warn") : "skipped",
      detail: includeAzureProbe
        ? (discovery.azure.available
            ? `Discovered ${discovery.azure.candidateCount} Azure tier candidate(s) in the active subscription.`
            : "Active-subscription Azure discovery was unavailable; inspect diagnostics.")
        : "Azure discovery was not requested.",
    },
  ];
  return {
    ready: checks.every((check) => check.status === "pass" || check.status === "skipped"),
    checkedAt: discovery.generatedAt,
    checks,
    discovery,
  };
}

export async function activateTier({
  tierId,
  root = process.cwd(),
  includeAzure = true,
  session,
  commandRunner = runCommand,
}) {
  const tier = getTierDefinition(tierId);
  if (!tier) {
    const error = new Error(`Unknown tier "${tierId}".`);
    error.code = "unknown-tier";
    error.validTierIds = PLATFORM_TIERS.map((candidate) => candidate.id);
    throw error;
  }
  if (!session?.rpc?.canvas) {
    throw new Error("Canvas session RPC is unavailable.");
  }

  const available = await session.rpc.canvas.list();
  const target = tier.preferredCanvases
    .map((canvasId) => available.canvases.find((canvas) => canvas.canvasId === canvasId))
    .find(Boolean);
  if (target) {
    const instanceId = `unity-${tier.id}-${target.canvasId}`;
    const schemaProperties = target.inputSchema?.properties;
    let input;
    if (!target.inputSchema) {
      input = { unityTier: { id: tier.id, name: tier.name } };
    } else if (schemaProperties?.unityTier) {
      input = { unityTier: { id: tier.id, name: tier.name } };
    } else if (schemaProperties?.tierId) {
      input = { tierId: tier.id };
    }
    const openRequest = {
      extensionId: target.extensionId,
      canvasId: target.canvasId,
      instanceId,
      ...(input ? { input } : {}),
    };
    const opened = await session.rpc.canvas.open(openRequest);
    return {
      outcome: "canvas-opened",
      tier: { id: tier.id, name: tier.name },
      canvas: opened,
    };
  }

  const discovery = await discoverUnityPlatform({ root, includeAzure, commandRunner });
  const discoveredTier = discovery.tiers.find((candidate) => candidate.id === tier.id);
  if (discoveredTier.candidateCount > 0) {
    return {
      outcome: "candidates-discovered",
      tier: discoveredTier,
      diagnostics: discovery.diagnostics,
    };
  }
  return {
    outcome: "scaffold-available",
    tier: {
      id: tier.id,
      name: tier.name,
      role: tier.role,
      jobToBeDone: tier.jobToBeDone,
    },
    scaffold: tier.scaffold,
    diagnostics: discovery.diagnostics,
  };
}

export async function traceUnityApp({ root = process.cwd() } = {}) {
  return traceApp({ root });
}
