import { execFile } from "node:child_process";

export const PLATFORM_TIERS = Object.freeze([
  {
    id: "web",
    name: "Surface / web",
    unityAnswer: "Embr web experiences for buyer, dealer, and lender personas",
    status: "planned",
    canvas: null,
  },
  {
    id: "agent",
    name: "Agent",
    unityAnswer: "Foundry Hosted Agents with dedicated Entra agent identity",
    status: "scaffold-ready",
    canvas: "ai-gateway-studio",
  },
  {
    id: "gateway",
    name: "Gateway",
    unityAnswer: "AI Gateway for governed model routing and MCP tool federation",
    status: "scaffold-ready",
    canvas: "ai-gateway-studio",
  },
  {
    id: "skills",
    name: "Skills",
    unityAnswer: "Hosted Skills on Azure Functions, exposed as deterministic tools",
    status: "scaffold-ready",
    canvas: "intelligent-function-app-studio",
  },
  {
    id: "sandbox",
    name: "Sandbox",
    unityAnswer: "Ephemeral ACA Sandboxes for sensitive financing computation",
    status: "planned",
    canvas: null,
  },
  {
    id: "connectors",
    name: "Connectors",
    unityAnswer: "Connector Namespace integrations for Teams, Outlook, and systems of record",
    status: "planned",
    canvas: null,
  },
  {
    id: "workflows",
    name: "Durable workflows",
    unityAnswer: "Durable Task Scheduler and Durable Functions for human approval",
    status: "planned",
    canvas: null,
  },
  {
    id: "sre",
    name: "Self-awareness / SRE",
    unityAnswer: "SRE Agent spanning every tier with signals, memory, and safe remediation",
    status: "scaffold-ready",
    canvas: "sre-agent-studio",
  },
  {
    id: "data",
    name: "Data",
    unityAnswer: "Inventory and deals stores with synthetic-only PII for the POC",
    status: "planned",
    canvas: null,
  },
]);

export const DEMO_STEPS = Object.freeze([
  { id: "search", name: "Search car", status: "simulated-ready", detail: "Inventory results are mocked." },
  { id: "quote", name: "Price quote", status: "simulated-ready", detail: "Quote calculation is mocked." },
  { id: "email-captured", name: "Customer email captured", status: "simulated-ready", detail: "A synthetic address is used." },
  { id: "financing", name: "Financing sandbox", status: "planned", detail: "Sandbox lifecycle and lender response are simulated." },
  { id: "approval", name: "Teams approval", status: "planned", detail: "Human approval handoff is not connected yet." },
  { id: "email-sent", name: "Email back", status: "planned", detail: "Outbound confirmation is not connected yet." },
]);

const TIER_CANVAS_GUIDANCE = Object.freeze({
  agent: {
    canvasId: "ai-gateway-studio",
    reason: "Select a governed gateway and start a Foundry hosted agent from it.",
  },
  gateway: {
    canvasId: "ai-gateway-studio",
    reason: "Discover models, inspect token governance, and test gateway policies.",
  },
  skills: {
    canvasId: "intelligent-function-app-studio",
    reason: "Scaffold and operate the Hosted Skills Functions tier.",
  },
  sre: {
    canvasId: "sre-agent-studio",
    reason: "Operate the SRE Agent, investigations, incidents, memory, and workflows.",
  },
});

export function getPlatformOverview() {
  return {
    platform: "Unity",
    builderExperience: "Cloud Foundation canvases",
    generatedAt: new Date().toISOString(),
    tiers: PLATFORM_TIERS.map((tier) => ({ ...tier })),
  };
}

export function getDemoStatus() {
  return {
    demo: "Demo #1: car buying",
    mode: "simulated",
    generatedAt: new Date().toISOString(),
    steps: DEMO_STEPS.map((step) => ({ ...step })),
  };
}

export function getTierCanvasGuidance(tierId) {
  const tier = PLATFORM_TIERS.find((candidate) => candidate.id === tierId);
  if (!tier) {
    return {
      tierId,
      available: false,
      error: `Unknown tier "${tierId}".`,
      validTierIds: PLATFORM_TIERS.map((candidate) => candidate.id),
    };
  }

  const guidance = TIER_CANVAS_GUIDANCE[tierId];
  if (!guidance) {
    return {
      tier: { id: tier.id, name: tier.name },
      available: false,
      guidance: "Stay in Unity Studio for this tier; no dedicated Cloud Foundation canvas is registered yet.",
    };
  }

  return {
    tier: { id: tier.id, name: tier.name },
    available: true,
    canvasId: guidance.canvasId,
    instanceId: guidance.canvasId,
    reason: guidance.reason,
    instruction: `Call open_canvas with canvasId "${guidance.canvasId}" and instanceId "${guidance.canvasId}".`,
  };
}

function runCommand(command, args, timeout = 4000) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: error ? error.message : null,
      });
    });
  });
}

export async function runDoctor({ includeAzureProbe = true } = {}) {
  const azdProbe = runCommand("azd", ["version"]);
  const azProbe = runCommand("az", ["version", "--output", "json"]);
  const accountProbe = includeAzureProbe
    ? runCommand("az", ["account", "show", "--output", "json"])
    : Promise.resolve({ ok: true, stdout: "", stderr: "", error: null, skipped: true });

  const [azd, az, account] = await Promise.all([azdProbe, azProbe, accountProbe]);
  let accountName = null;
  if (account.ok && account.stdout) {
    try {
      accountName = JSON.parse(account.stdout).name ?? null;
    } catch {
      accountName = null;
    }
  }

  const checks = [
    {
      id: "azd-installed",
      name: "Azure Developer CLI installed",
      status: azd.ok ? "pass" : "warn",
      detail: azd.ok ? azd.stdout.split("\n")[0] : "azd was not found or could not run.",
    },
    {
      id: "az-installed",
      name: "Azure CLI installed",
      status: az.ok ? "pass" : "warn",
      detail: az.ok ? "Azure CLI is available." : "az was not found or could not run.",
    },
    {
      id: "az-logged-in",
      name: "Azure CLI signed in",
      status: account.skipped ? "skipped" : account.ok ? "pass" : "warn",
      detail: account.skipped
        ? "Azure account probe was skipped."
        : account.ok
          ? `Signed in${accountName ? ` with subscription "${accountName}"` : ""}.`
          : "No active Azure CLI account was detected; run az login when live Azure access is needed.",
    },
  ];

  return {
    ready: checks.every((check) => check.status === "pass" || check.status === "skipped"),
    nonBlocking: true,
    checkedAt: new Date().toISOString(),
    checks,
  };
}
