import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { realpath, stat, access, readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { isAbsolute, relative } from "node:path";
import { createCanvas, CanvasError, joinSession } from "@github/copilot-sdk/extension";

import { resolveDiscoveryRoot } from "./discovery.mjs";
import { runCommand } from "./discovery.mjs";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";
import { listSourceCatalog } from "./source-catalog.mjs";
import {
  PLATFORM_TIERS,
  activateTier,
  buildImplementationInventory,
  discoverUnityPlatform,
  deleteAppWorkspace,
  getPlatformOverview,
  openWorkspaceInVsCode,
  requestAppWorkspace,
  requestCapabilityWork,
  runDoctor,
  traceUnityApp,
  WORKSPACE_TIER_IDS,
} from "./studio-commands.mjs";
import { renderAppMapMarkup, renderStudioHtml } from "./studio-ui.mjs";
import { deriveRuntimeState, readProcessRegistry } from "./runtime-state.mjs";

const servers = new Map();
const appStates = new Map();
const appOutput = new Map();
const activeGateways = new Map();
let session;
const transientAppStates = new Set(["starting", "stopping", "configuring", "provisioning", "deploying"]);
const pendingAppMutations = new Set();

async function readRuntimeOutput(root) {
  const run = appOutput.get(root);
  const lines = [];
  try {
    async function readLogs(directory, prefix = "") {
      for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) {
          await readLogs(path, `${prefix}${entry.name}/`);
        } else if (entry.name.endsWith(".log") && (!run || (await stat(path)).mtimeMs >= run.startedAt)) {
          const contents = await readFile(path, "utf8");
          lines.push(...contents.split(/\r?\n/).filter(Boolean).map((line) => `[${prefix}${entry.name}] ${line}`));
        }
      }
    }
    if (run?.state !== "stopping") {
      await readLogs(`${root}/.dev-run`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  lines.push(...(run?.lines ?? []));
  return lines.slice(-400);
}

async function probeHttpEntrypoints(root) {
  const candidates = [
    { name: "Web", port: 3000 },
    { name: "Agent", port: 8088 },
  ];
  for (const entry of await readProcessRegistry(root)) {
    candidates.push({ name: entry.name, port: entry.port });
  }
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.port, candidate])).values()];
  return Promise.all(uniqueCandidates.map(async (candidate) => {
    const ready = await new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port: candidate.port });
      const finish = (value) => {
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(500, () => finish(false));
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
    });
    return { ...candidate, url: `http://localhost:${candidate.port}`, ready };
  }));
}

function isWithinRoot(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

function processDescendsFrom(pid, possibleAncestors, parentByPid) {
  const visited = new Set();
  let current = pid;
  while (current && !visited.has(current)) {
    if (possibleAncestors.has(current)) return true;
    visited.add(current);
    current = parentByPid.get(current);
  }
  return false;
}

async function inspectWindowsEntrypointOwnership(entrypoints, registry) {
  const readyEntrypoints = entrypoints.filter((entrypoint) => entrypoint.ready);
  if (readyEntrypoints.length === 0) return { available: true, ownedPorts: new Set() };
  const ports = readyEntrypoints.map((entrypoint) => entrypoint.port).join(",");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$ports = @(${ports})`,
    "$connections = @(Get-NetTCPConnection -State Listen | Where-Object { $ports -contains $_.LocalPort } | Select-Object LocalPort, OwningProcess)",
    "$processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)",
    "@{ connections = $connections; processes = $processes } | ConvertTo-Json -Depth 4 -Compress",
  ].join("; ");
  const result = await runCommand("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script]);
  if (!result.ok) return { available: true, ownedPorts: new Set() };
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    return { available: true, ownedPorts: new Set() };
  }
  const asArray = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
  const listenerPidsByPort = new Map();
  for (const connection of asArray(payload.connections ?? payload.Connections)) {
    const port = Number(connection.LocalPort);
    const pid = Number(connection.OwningProcess);
    if (!Number.isInteger(port) || !Number.isInteger(pid)) continue;
    if (!listenerPidsByPort.has(port)) listenerPidsByPort.set(port, new Set());
    listenerPidsByPort.get(port).add(pid);
  }
  const parentByPid = new Map(asArray(payload.processes ?? payload.Processes)
    .map((item) => [Number(item.ProcessId), Number(item.ParentProcessId)])
    .filter(([pid, parentPid]) => Number.isInteger(pid) && Number.isInteger(parentPid)));
  const registryPidsByPort = new Map();
  for (const entry of registry) {
    if (!entry.pid) continue;
    if (!registryPidsByPort.has(entry.port)) registryPidsByPort.set(entry.port, new Set());
    registryPidsByPort.get(entry.port).add(entry.pid);
  }
  return {
    available: true,
    ownedPorts: new Set(readyEntrypoints
      .filter((entrypoint) => [...(listenerPidsByPort.get(entrypoint.port) ?? [])]
        .some((pid) => processDescendsFrom(
          pid,
          registryPidsByPort.get(entrypoint.port) ?? new Set(),
          parentByPid,
        )))
      .map((entrypoint) => entrypoint.port)),
  };
}

async function inspectEntrypointOwnership(root, entrypoints, registry = []) {
  if (process.platform === "win32") return inspectWindowsEntrypointOwnership(entrypoints, registry);
  const readyEntrypoints = entrypoints.filter((entrypoint) => entrypoint.ready);
  if (readyEntrypoints.length === 0) return { available: true, ownedPorts: new Set() };

  const listeners = await runCommand("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]);
  if (!listeners.ok) return { available: false, ownedPorts: new Set() };
  const pidsByPort = new Map();
  let currentPid = null;
  for (const line of listeners.stdout.split(/\r?\n/)) {
    if (/^p\d+$/.test(line)) {
      currentPid = line.slice(1);
      continue;
    }
    const port = Number(line.match(/:(\d+)$/)?.[1]);
    if (!currentPid || !Number.isInteger(port)) continue;
    if (!pidsByPort.has(port)) pidsByPort.set(port, new Set());
    pidsByPort.get(port).add(currentPid);
  }

  const relevantPids = [...new Set(readyEntrypoints.flatMap((entrypoint) =>
    [...(pidsByPort.get(entrypoint.port) ?? [])]))];
  if (relevantPids.length === 0) return { available: true, ownedPorts: new Set() };
  const cwdResult = await runCommand("lsof", ["-a", "-p", relevantPids.join(","), "-d", "cwd", "-Fpn"]);
  const cwdByPid = new Map();
  currentPid = null;
  for (const line of cwdResult.stdout.split(/\r?\n/)) {
    if (/^p\d+$/.test(line)) {
      currentPid = line.slice(1);
    } else if (currentPid && line.startsWith("n")) {
      cwdByPid.set(currentPid, line.slice(1));
    }
  }

  return {
    available: true,
    ownedPorts: new Set(readyEntrypoints
      .filter((entrypoint) => [...(pidsByPort.get(entrypoint.port) ?? [])]
        .some((pid) => {
          const workingDirectory = cwdByPid.get(pid);
          return Boolean(workingDirectory) && isWithinRoot(root, workingDirectory);
        }))
      .map((entrypoint) => entrypoint.port)),
  };
}

async function openEntrypoint(root, port) {
  const entrypoint = (await probeHttpEntrypoints(root)).find((candidate) => candidate.port === port);
  if (!entrypoint) throw new Error("The selected endpoint is not part of this app.");
  if (!entrypoint.ready) throw new Error(`${entrypoint.name} is not listening on port ${port}.`);
  const ownership = await inspectEntrypointOwnership(root, [entrypoint], await readProcessRegistry(root));
  if (ownership.available && !ownership.ownedPorts.has(port)) {
    const error = new Error(`${entrypoint.name} on port ${port} belongs to another app.`);
    error.statusCode = 409;
    throw error;
  }
  const available = await session.rpc.canvas.list();
  const browser = available.canvases.find((canvas) => canvas.canvasId === "browser");
  if (!browser) throw new Error("Browser canvas is unavailable.");
  const isSkill = port >= 7071 && port <= 7079;
  const url = isSkill ? `${entrypoint.url}/runtime/webhooks/mcp` : entrypoint.url;
  return session.rpc.canvas.open({
    extensionId: browser.extensionId,
    canvasId: browser.canvasId,
    instanceId: `unity-endpoint-${port}`,
    input: { url, title: entrypoint.name },
  });
}

async function openExpandedAppMap(root, trustedHost, apiToken) {
  const available = await session.rpc.canvas.list();
  const browser = available.canvases.find((canvas) => canvas.canvasId === "browser");
  if (!browser) throw new Error("Browser canvas is unavailable.");
  const instanceSuffix = Buffer.from(root).toString("hex").slice(-24);
  const url = `http://${trustedHost}/app-map?root=${encodeURIComponent(root)}&token=${encodeURIComponent(apiToken)}`;
  return session.rpc.canvas.open({
    extensionId: browser.extensionId,
    canvasId: browser.canvasId,
    instanceId: `unity-app-map-${instanceSuffix}`,
    input: { url, title: "Unity App Map" },
  });
}

async function promptLocalAgent(root, prompt) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2_000) {
    throw new Error("Enter a prompt up to 2,000 characters.");
  }
  const agent = (await probeHttpEntrypoints(root)).find((candidate) => candidate.port === 8088);
  if (!agent?.ready) throw new Error("The local agent is not running.");
  const ownership = await inspectEntrypointOwnership(root, [agent], await readProcessRegistry(root));
  if (ownership.available && !ownership.ownedPorts.has(agent.port)) {
    const error = new Error("The local agent port belongs to another app.");
    error.statusCode = 409;
    throw error;
  }
  const response = await fetch(`${agent.url}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: prompt.trim(), stream: false }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Agent returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  try {
    return { response: JSON.parse(body) };
  } catch {
    return { response: body };
  }
}

async function localReadiness(root) {
  const agentEnv = `${root}/src/agent/.env`;
  let agentConfiguration = "";
  try {
    agentConfiguration = await readFile(agentEnv, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const gatewayConfigured = /AZURE_AI_GATEWAY_ENDPOINT\s*=\s*\S+/.test(agentConfiguration)
    && /AZURE_AI_GATEWAY_API_KEY\s*=\s*\S+/.test(agentConfiguration);
  const active = activeGateways.get(root);
  return {
    ready: gatewayConfigured,
    gatewayConfigured,
    activeGateway: active ?? null,
    missing: gatewayConfigured ? [] : ["AI Gateway endpoint and model credentials"],
    guidance: gatewayConfigured
      ? "Gateway configuration is present. Run the local stack."
      : activeGateways.has(root)
        ? "A gateway is selected. Unity Studio is configuring this app's endpoint, key, and model settings."
        : "Select an existing AI Gateway with models or provision one, then configure this app worktree before running locally.",
  };
}

async function currentAppState(root) {
  const entrypoints = await probeHttpEntrypoints(root);
  const registry = await readProcessRegistry(root);
  const ownership = await inspectEntrypointOwnership(root, entrypoints, registry);
  const runtimeState = deriveRuntimeState(
    appStates.get(root),
    registry,
    entrypoints,
    { ownershipAvailable: ownership.available, ownedPorts: ownership.ownedPorts },
  );
  appStates.set(root, runtimeState);
  return { ...runtimeState, entrypoints };
}

function requireIdleApp(root, { allowActiveLifecycle = false } = {}) {
  const appState = appStates.get(root);
  const activeLifecycle = transientAppStates.has(appState?.state) && appState.recovered !== true;
  if ((!activeLifecycle || allowActiveLifecycle) && !pendingAppMutations.has(root)) return;
  const operation = activeLifecycle ? appState.state : "pending";
  const error = new Error(`Wait for the current ${operation} operation to finish before starting another app operation.`);
  error.statusCode = 409;
  throw error;
}

function reserveAppMutation(root, options) {
  requireIdleApp(root, options);
  pendingAppMutations.add(root);
  return () => pendingAppMutations.delete(root);
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      throw new Error("Request body exceeds 64 KiB.");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function validateSourceProjectPath(input, workspaceRoot) {
  const requestedPath = input?.sourceProjectPath ?? input?.candidatePath;
  if (!requestedPath) {
    return input;
  }
  const resolved = await resolveDiscoveryRoot(requestedPath, workspaceRoot);
  return {
    ...input,
    sourceProjectPath: relative(workspaceRoot, resolved) || ".",
  };
}

function implementationInventoryResult(discovery) {
  return {
    generatedAt: discovery.generatedAt,
    root: discovery.root,
    diagnostics: discovery.diagnostics,
    repository: {
      scannedFiles: discovery.repository.scannedFiles,
      projectCount: discovery.repository.candidateCount,
    },
    azure: {
      available: discovery.azure.available,
      subscription: discovery.azure.subscription,
      resourceCount: discovery.azure.candidateCount,
    },
    inventory: buildImplementationInventory(discovery),
  };
}

async function discoveryWithCatalog(workspaceRoot, includeAzure) {
  return implementationInventoryResult(
    await discoverUnityPlatform({ root: workspaceRoot, includeAzure }),
  );
}

async function resolveAuthorizedRoot(requestedRoot, workspaceRoot, authorizedRoots) {
  const resolved = await realpath(requestedRoot);
  if (authorizedRoots.has(resolved)) {
    return resolved;
  }
  return resolveDiscoveryRoot(requestedRoot, workspaceRoot);
}

async function resolveLifecycleCommand(root, operation) {
  const scriptNames = operation === "run-local"
    ? ["dev-start.sh", "dev-start.ps1"]
    : ["dev-stop.sh", "dev-stop.ps1"];
  const scriptName = process.platform === "win32" ? scriptNames.reverse() : scriptNames;
  for (const name of scriptName) {
    const scriptPath = `${root}/scripts/${name}`;
    try {
      await access(scriptPath);
      if (name.endsWith(".ps1")) {
        return { command: "powershell", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath] };
      }

      return { command: "bash", args: [scriptPath] };
    } catch {
      // Try the other platform-specific script before surfacing a useful error.
    }
  }
  throw new Error(`No ${operation === "run-local" ? "dev-start" : "dev-stop"} script was found.`);
}

async function resolveGatewayConfigCommand(root) {
  const names = process.platform === "win32"
    ? ["configure-ai-gateway.ps1", "configure-ai-gateway.sh"]
    : ["configure-ai-gateway.sh", "configure-ai-gateway.ps1"];
  for (const name of names) {
    const scriptPath = `${root}/infra-ai-gateway/scripts/${name}`;
    try {
      await access(scriptPath);
      return name.endsWith(".ps1")
        ? { command: "powershell", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], cwd: `${root}/infra-ai-gateway` }
        : { command: "bash", args: [scriptPath], cwd: `${root}/infra-ai-gateway` };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error("This app has no AI Gateway configuration script.");
}

async function syncGatewayConfigScript(root, workspaceRoot) {
  const sourceName = process.platform === "win32" ? "configure-ai-gateway.ps1" : "configure-ai-gateway.sh";
  const sourcePath = `${workspaceRoot}/infra-ai-gateway/scripts/${sourceName}`;
  const targetPath = `${root}/infra-ai-gateway/scripts/${sourceName}`;
  await access(sourcePath);
  await access(`${root}/infra-ai-gateway/scripts`);
  await writeFile(targetPath, await readFile(sourcePath, "utf8"), "utf8");
}

async function startAppCommand(root, command, args, state, options = {}) {
  if (state === "configuring" && options.completedState === undefined) {
    options = { ...options, completedState: "stopped" };
  }
  const commandEnvironment = { ...process.env };
  for (const key of ["client_session", "CLIENT_SESSION", "AZURE_CORE_CLIENT_SESSION", "SESSION_ID", "COPILOT_AGENT_SESSION_ID", "AGENCY_SESSION_ID"]) {
    delete commandEnvironment[key];
  }
  Object.assign(commandEnvironment, options.env ?? {});
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    env: commandEnvironment,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const run = { lines: [], startedAt: Date.now(), state };
  appOutput.set(root, run);
  const appendOutput = (chunk) => {
    run.lines.push(...chunk.toString().split(/\r?\n/).filter(Boolean));
    if (run.lines.length > 400) run.lines.splice(0, run.lines.length - 400);
  };
  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);
  child.once("error", (error) => {
    appendOutput(`Command failed to start: ${error.message}`);
    appStates.set(root, { state: "failed", updatedAt: new Date().toISOString() });
  });
  child.once("close", (exitCode, signal) => {
    if (options.completedState) {
      appStates.set(root, {
        state: exitCode === 0 ? options.completedState : "failed",
        exitCode,
        signal,
        updatedAt: new Date().toISOString(),
      });
    }
  });
  child.unref();
  appStates.set(root, { state, pid: child.pid, updatedAt: new Date().toISOString() });
  return { outcome: "command-started", command: [command, ...args].join(" "), root, pid: child.pid, state };
}

function hasAzureMappings(input) {
  return input?.sourceBindings?.some((binding) => binding.azureResourceIds?.length > 0) === true;
}

async function freshAzureCatalog(workspaceRoot, input) {
  if (!hasAzureMappings(input)) {
    return undefined;
  }
  const discovery = await discoverUnityPlatform({ root: workspaceRoot, includeAzure: true });
  return discovery.tiers.flatMap((tier) => tier.candidates.azure.map((candidate) => ({
    ...candidate,
    tierId: tier.id,
  })));
}

function authorizeApiRequest(request, url, apiToken, trustedHost) {
  if (!url.pathname.startsWith("/api/")) {
    return;
  }
  const origin = request.headers.origin;
  if (
    request.headers.host !== trustedHost
    || request.headers["x-unity-studio-token"] !== apiToken
    || (origin && origin !== `http://${trustedHost}`)
  ) {
    const error = new Error("Unauthorized loopback request.");
    error.statusCode = 403;
    throw error;
  }
  if (
    request.method === "POST"
    && !String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")
  ) {
    const error = new Error("POST actions require application/json.");
    error.statusCode = 415;
    throw error;
  }
}

async function handleRequest(request, response, instanceId, workspaceRoot, apiToken, trustedHost, authorizedRoots) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  let releaseAppMutation;
  try {
    authorizeApiRequest(request, url, apiToken, trustedHost);
    if (request.method === "GET" && url.pathname === "/api/overview") {
      sendJson(response, 200, getPlatformOverview());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/discovery") {
      const includeAzure = url.searchParams.get("azure") !== "false";
      const requestedRoot = url.searchParams.get("root");
      const root = requestedRoot
        ? await resolveAuthorizedRoot(requestedRoot, workspaceRoot, authorizedRoots)
        : workspaceRoot;
      if (requestedRoot && !authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("Discovery root is not an authorized app workspace.");
      }
      sendJson(response, 200, await discoveryWithCatalog(root, includeAzure));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/sources") {
      const catalog = await listSourceCatalog({
        workspaceRoot,
        additionalRoots: [...authorizedRoots],
      });
      for (const root of catalog.roots) authorizedRoots.add(root.path);
      sendJson(response, 200, catalog);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/app-status") {
      const root = await resolveAuthorizedRoot(url.searchParams.get("root"), workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("App status root is not an authorized app workspace.");
      }
      const runtimeState = await currentAppState(root);
      sendJson(response, 200, runtimeState);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/local-readiness") {
      const root = await resolveAuthorizedRoot(url.searchParams.get("root"), workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("Local readiness root is not an authorized app workspace.");
      }
      sendJson(response, 200, await localReadiness(root));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/gateway-options") {
      const root = await resolveAuthorizedRoot(url.searchParams.get("root"), workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) throw new Error("Gateway root is not an authorized app workspace.");
      if (!activeGateways.has(root)) {
        try {
          activeGateways.set(root, JSON.parse(await readFile(`${root}/.unity-studio/active-gateway.json`, "utf8")));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      const result = await runCommand("az", ["aigateway", "list", "-o", "json"]);
      if (!result.ok) throw new Error(result.stderr || result.error || "Unable to list AI Gateways.");
      let gateways;
      try {
        gateways = JSON.parse(result.stdout);
      } catch {
        throw new Error("Azure CLI returned invalid AI Gateway data.");
      }
      const active = activeGateways.get(root);
      const activeResource = active && gateways.find((gateway) => gateway.name === active.name);
      if (activeResource) {
        activeGateways.set(root, {
          ...active,
          resourceGroup: activeResource.resourceGroup || activeResource.resourceGroupName || active.resourceGroup || "",
          location: activeResource.location || active.location || "",
          subscriptionId: activeResource.id?.split("/")[2] || active.subscriptionId || "",
          endpoint: activeResource.properties?.gatewayUrl || active.endpoint || "",
        });
      }
      sendJson(response, 200, {
        active: activeGateways.get(root) ?? null,
        gateways: gateways.map((gateway) => ({
          name: gateway.name,
          resourceGroup: gateway.resourceGroup || gateway.resourceGroupName || "",
          location: gateway.location || "",
          subscriptionId: gateway.id?.split("/")[2] || "",
          endpoint: gateway.properties?.gatewayUrl || "",
        })),
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/active-gateway") {
      const input = await readJsonBody(request);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      releaseAppMutation = reserveAppMutation(root);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) throw new Error("Gateway root is not an authorized app workspace.");
      if (typeof input.name !== "string" || !input.name.trim()) throw new Error("Choose an AI Gateway.");
      const result = await runCommand("az", ["aigateway", "list", "-o", "json"]);
      if (!result.ok) throw new Error(result.stderr || result.error || "Unable to verify AI Gateways.");
      const gateways = JSON.parse(result.stdout);
      const gateway = gateways.find((candidate) => candidate.name === input.name);
      if (!gateway) throw new Error("The selected AI Gateway is no longer available.");
      const active = {
        name: gateway.name,
        resourceGroup: gateway.resourceGroup || gateway.resourceGroupName || "",
        location: gateway.location || "",
        subscriptionId: gateway.id?.split("/")[2] || "",
        endpoint: gateway.properties?.gatewayUrl || "",
      };
      activeGateways.set(root, active);
      await mkdir(`${root}/.unity-studio`, { recursive: true });
      await writeFile(`${root}/.unity-studio/active-gateway.json`, JSON.stringify(active, null, 2) + "\n", "utf8");
      sendJson(response, 200, { active });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/app-output") {
      const root = await resolveAuthorizedRoot(url.searchParams.get("root"), workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("App output root is not an authorized app workspace.");
      }
      sendJson(response, 200, { lines: await readRuntimeOutput(root) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/open-entrypoint") {
      const input = await readJsonBody(request);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) throw new Error("Entrypoint root is not an authorized app workspace.");
      if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) throw new Error("Choose a valid app endpoint.");
      sendJson(response, 200, { outcome: "canvas-opened", canvas: await openEntrypoint(root, input.port) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/agent-prompt") {
      const input = await readJsonBody(request);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) throw new Error("Agent root is not an authorized app workspace.");
      sendJson(response, 200, await promptLocalAgent(root, input.prompt));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/sources") {
      const input = await readJsonBody(request);
      if (typeof input.path !== "string" || !input.path.trim() || input.path.length > 2048) {
        throw new Error("Enter a local folder path.");
      }
      const root = await realpath(input.path.trim());
      if (!(await stat(root)).isDirectory()) {
        throw new Error("The selected local path is not a folder.");
      }
      authorizedRoots.add(root);
      const catalog = await listSourceCatalog({
        workspaceRoot,
        additionalRoots: [...authorizedRoots],
      });
      for (const candidate of catalog.roots) authorizedRoots.add(candidate.path);
      sendJson(response, 200, catalog);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/app-map") {
      const input = await readJsonBody(request);
      const root = input.root
        ? await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots)
        : workspaceRoot;
      if (input.root && !authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("App Map root is not an authorized app workspace.");
      }
      const appMap = await traceUnityApp({ root });
      sendJson(response, 200, {
        ...appMap,
        renderedHtml: renderAppMapMarkup(appMap),
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/open-app-map") {
      const input = await readJsonBody(request);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("App Map root is not an authorized app workspace.");
      }
      sendJson(response, 200, {
        outcome: "canvas-opened",
        canvas: await openExpandedAppMap(root, trustedHost, apiToken),
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/tier-action") {
      const input = await readJsonBody(request);
      const root = input.root
        ? await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots)
        : workspaceRoot;
      if (input.root && !authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("Tier action root is not an authorized app workspace.");
      }
      sendJson(response, 200, await activateTier({
        tierId: input.tierId,
        root,
        includeAzure: input.includeAzure !== false,
        session,
      }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/workspace-request") {
      const input = await validateSourceProjectPath(await readJsonBody(request), workspaceRoot);
      const sourceCatalog = (
        input.starterKind === "template" || input.journey === "assemble"
      ) ? await listSourceCatalog({
          workspaceRoot,
          additionalRoots: [...authorizedRoots],
        }) : undefined;
      const result = await requestAppWorkspace({
        session,
        workspaceRoot,
        input,
        sourceCatalog,
        azureCatalog: await freshAzureCatalog(workspaceRoot, input),
      });
      if (result.worktreePath) {
        authorizedRoots.add(await realpath(result.worktreePath));
      }
      sendJson(response, 202, result);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/capability-request") {
      const input = await validateSourceProjectPath(await readJsonBody(request), workspaceRoot);
      const root = input.root
        ? await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots)
        : workspaceRoot;
      if (input.root && !authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("Capability root is not an authorized app workspace.");
      }
      sendJson(response, 202, await requestCapabilityWork({
        session,
        input: { ...input, targetRoot: root },
      }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/open-vscode") {
      const input = await readJsonBody(request);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("VS Code root is not an authorized app workspace.");
      }
      sendJson(response, 200, await openWorkspaceInVsCode({ root }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/open-source") {
      const input = await readJsonBody(request);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("Source root is not an authorized app workspace.");
      }
      const sourceRoot = await resolveDiscoveryRoot(input.projectPath || ".", root);
      sendJson(response, 200, await openWorkspaceInVsCode({ root: sourceRoot }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/app-command") {
      const input = await readJsonBody(request);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("App command root is not an authorized app workspace.");
      }
      releaseAppMutation = reserveAppMutation(root, {
        allowActiveLifecycle: input.operation === "run-local",
      });
      const current = await currentAppState(root);
      if (input.operation === "run-local") {
        if (current.state === "running") {
          sendJson(response, 200, {
            outcome: "already-running",
            root,
            state: "running",
            entrypoints: current.entrypoints,
          });
          return;
        }
        if (transientAppStates.has(current.state)) {
          sendJson(response, 202, {
            outcome: "operation-in-progress",
            root,
            state: current.state,
            entrypoints: current.entrypoints,
          });
          return;
        }
        const lifecycle = await resolveLifecycleCommand(root, input.operation);
        sendJson(response, 202, await startAppCommand(root, lifecycle.command, lifecycle.args, "starting", {
          completedState: "running",
        }));
        return;
      }
      if (transientAppStates.has(current.state) && input.operation !== "stop-local") {
        const error = new Error(`Wait for the current ${current.state} operation to finish before starting another app operation.`);
        error.statusCode = 409;
        throw error;
      }
      if (input.operation === "stop-local") {
        const lifecycle = await resolveLifecycleCommand(root, input.operation);
        sendJson(response, 202, await startAppCommand(root, lifecycle.command, lifecycle.args, "stopping", {
          completedState: "stopped",
        }));
        return;
      }
      if (input.operation === "configure-gateway") {
        await syncGatewayConfigScript(root, workspaceRoot);
        const gatewayConfig = await resolveGatewayConfigCommand(root);
        const active = activeGateways.get(root);
        const gatewayEnv = active ? {
          AZURE_SUBSCRIPTION_ID: active.subscriptionId,
          AI_GATEWAY_RESOURCE_GROUP: active.resourceGroup,
          AI_GATEWAY_NAME: active.name,
          AZURE_AI_GATEWAY_ENDPOINT: active.endpoint,
        } : {};
        sendJson(response, 202, await startAppCommand(root, gatewayConfig.command, gatewayConfig.args, "configuring", {
          cwd: gatewayConfig.cwd,
          env: gatewayEnv,
        }));
        return;
      }
      if (input.operation === "provision-cloud" || input.operation === "deploy-cloud") {
        const command = input.operation === "provision-cloud" ? "provision" : "up";
        sendJson(response, 202, await startAppCommand(
          root,
          "azd",
          [command],
          command === "provision" ? "provisioning" : "deploying",
          { completedState: "stopped" },
        ));
        return;
      }
      throw new Error("Unknown app command.");
    }
    if (request.method === "POST" && url.pathname === "/api/delete-app") {
      const input = await readJsonBody(request);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) || root === workspaceRoot) {
        throw new Error("Only an authorized app worktree can be deleted.");
      }
      releaseAppMutation = reserveAppMutation(root);
      const catalog = await listSourceCatalog({ workspaceRoot, additionalRoots: [...authorizedRoots] });
      if (!catalog.apps.some((app) => app.path === root)) {
        throw new Error("The selected path is not a discovered Unity app.");
      }
      const state = await currentAppState(root);
      if (state.state === "running" || transientAppStates.has(state.state)) {
        const error = new Error(
          state.state === "running"
            ? "Stop the local app before deleting its worktree."
            : `Wait for the current ${state.state} operation to finish before deleting this app.`,
        );
        error.statusCode = 409;
        throw error;
      }
      const result = await deleteAppWorkspace({
        workspaceRoot,
        root,
        confirmed: input.confirmed === true,
      });
      authorizedRoots.delete(root);
      appStates.delete(root);
      appOutput.delete(root);
      sendJson(response, 200, result);
      return;
    }
    if (request.method === "GET" && url.pathname === "/app-map") {
      if (
        request.headers.host !== trustedHost
        || url.searchParams.get("token") !== apiToken
      ) {
        const error = new Error("Unauthorized App Map view.");
        error.statusCode = 403;
        throw error;
      }
      const root = await resolveAuthorizedRoot(url.searchParams.get("root"), workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("App Map root is not an authorized app workspace.");
      }
      const catalog = await listSourceCatalog({
        workspaceRoot,
        additionalRoots: [...authorizedRoots],
      });
      const appIdentity = catalog.apps.find((app) => app.path === root);
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(renderInteractiveAppMapHtml(await traceUnityApp({ root }), {
        apiToken,
        appName: appIdentity?.name,
      }));
      return;
    }
    if (request.method !== "GET" || url.pathname !== "/") {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(renderStudioHtml(instanceId, apiToken));
  } catch (error) {
    sendJson(response, error?.statusCode ?? 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    releaseAppMutation?.();
  }
}

async function startServer(instanceId, workspaceRoot) {
  const apiToken = randomUUID();
  const authorizedRoots = new Set();
  let trustedHost;
  const server = createServer((request, response) => {
    void handleRequest(
      request,
      response,
      instanceId,
      workspaceRoot,
      apiToken,
      trustedHost,
      authorizedRoots,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  trustedHost = `127.0.0.1:${port}`;
  return { server, url: `http://${trustedHost}/`, workspaceRoot };
}

function canvasError(error) {
  if (error instanceof CanvasError) {
    return error;
  }
  return new CanvasError(
    error?.code ?? "unity-studio-error",
    error instanceof Error ? error.message : String(error),
  );
}

function actionWorkspaceRoot(ctx) {
  return ctx.session?.workingDirectory ?? process.cwd();
}

async function actionRoot(ctx) {
  return resolveDiscoveryRoot(ctx.input?.root, actionWorkspaceRoot(ctx));
}

const rootInputProperties = {
  root: {
    type: "string",
    description: "Workspace-relative application root. It must stay within the current workspace.",
  },
};

const workspaceInputSchema = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["create", "extend"], default: "create" },
    journey: { type: "string", enum: ["new", "assemble"], default: "new" },
    starterKind: { type: "string", enum: ["template", "assembly"], default: "template" },
    appName: { type: "string", minLength: 1, maxLength: 80 },
    purpose: { type: "string", minLength: 1, maxLength: 500 },
    tierIds: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", enum: WORKSPACE_TIER_IDS },
    },
    sourceProjectPath: { type: "string" },
    templateRootId: { type: "string", maxLength: 80 },
    templateInputs: {
      type: "object",
      properties: {
        hostedSkillName: { type: "string", minLength: 1, maxLength: 40 },
        agentInstructions: { type: "string", minLength: 1, maxLength: 2000 },
      },
      additionalProperties: false,
    },
    sourceBindings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tierId: { type: "string", enum: WORKSPACE_TIER_IDS },
          sourceIds: {
            type: "array",
            minItems: 1,
            maxItems: 1,
            uniqueItems: true,
            items: { type: "string", maxLength: 80 },
          },
          azureResourceIds: {
            type: "array",
            uniqueItems: true,
            items: { type: "string", maxLength: 512 },
          },
        },
        required: ["tierId", "sourceIds"],
        additionalProperties: false,
      },
    },
    openInVsCode: { type: "boolean", default: true },
  },
  required: ["appName", "purpose", "tierIds"],
  additionalProperties: false,
};

const canvas = createCanvas({
  id: "unity-studio",
  displayName: "Unity Studio",
  description: "Create or assemble a Unity-pattern app, then operate it through an evidence-backed App Map.",
  inputSchema: {
    type: "object",
    properties: {
      view: { type: "string", enum: ["overview", "app-map"] },
    },
    additionalProperties: false,
  },
  actions: [
    {
      name: "get_platform_overview",
      description: "Return the generic nine-tier Unity role and job-to-be-done map.",
      inputSchema: { type: "object", additionalProperties: false },
      handler: async () => getPlatformOverview(),
    },
    {
      name: "discover_platform",
      description: "Inventory source projects and, optionally, active-subscription Azure resources that can implement Unity tiers.",
      inputSchema: {
        type: "object",
        properties: {
          ...rootInputProperties,
          includeAzure: { type: "boolean", default: true },
        },
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          const discovery = await discoverUnityPlatform({
            root: await actionRoot(ctx),
            includeAzure: ctx.input?.includeAzure !== false,
          });
          return implementationInventoryResult(discovery);
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "list_source_roots",
      description: "List source projects in the current and sibling Git worktrees for guided app assembly.",
      inputSchema: { type: "object", additionalProperties: false },
      handler: async (ctx) => {
        try {
          return await listSourceCatalog({ workspaceRoot: actionWorkspaceRoot(ctx) });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "request_app_workspace",
      description: "Request a child project session with an isolated worktree, selected Unity capabilities, preloaded studios, and optional VS Code launch.",
      inputSchema: workspaceInputSchema,
      handler: async (ctx) => {
        try {
          const workspaceRoot = actionWorkspaceRoot(ctx);
          const input = await validateSourceProjectPath(ctx.input, workspaceRoot);
          return await requestAppWorkspace({
            session,
            workspaceRoot,
            input,
            azureCatalog: await freshAzureCatalog(workspaceRoot, input),
          });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "build_capability",
      description: "Build or improve one Unity capability in the current app worktree, update its inventory, wire adjacent tiers, and test it.",
      inputSchema: {
        type: "object",
        properties: {
          tierId: { type: "string", enum: WORKSPACE_TIER_IDS },
          intent: { type: "string", enum: ["add", "improve"], default: "add" },
          sourceProjectPath: { type: "string" },
          azureResourceId: { type: "string", maxLength: 512 },
        },
        required: ["tierId"],
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          const workspaceRoot = actionWorkspaceRoot(ctx);
          const input = await validateSourceProjectPath(ctx.input, workspaceRoot);
          return await requestCapabilityWork({ session, input });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "open_in_vscode",
      description: "Open a workspace-confined discovered repository path in a new Visual Studio Code window.",
      inputSchema: {
        type: "object",
        properties: rootInputProperties,
        required: ["root"],
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          return await openWorkspaceInVsCode({ root: await actionRoot(ctx) });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "activate_tier",
      description: "Open a registered specialist studio for a tier; use request_app_workspace to add the tier to an app.",
      inputSchema: {
        type: "object",
        properties: {
          ...rootInputProperties,
          tierId: { type: "string", enum: PLATFORM_TIERS.map((tier) => tier.id) },
          includeAzure: { type: "boolean", default: true },
        },
        required: ["tierId"],
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          return await activateTier({
            tierId: ctx.input.tierId,
            root: await actionRoot(ctx),
            includeAzure: ctx.input?.includeAzure !== false,
            session,
          });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "trace_app",
      description: "Derive an application graph across Unity tiers from matched source files.",
      inputSchema: {
        type: "object",
        properties: rootInputProperties,
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          return await traceUnityApp({ root: await actionRoot(ctx) });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "run_doctor",
      description: "Report repository and optional Azure discovery health.",
      inputSchema: {
        type: "object",
        properties: {
          ...rootInputProperties,
          includeAzureProbe: { type: "boolean", default: true },
        },
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          return await runDoctor({
            root: await actionRoot(ctx),
            includeAzureProbe: ctx.input?.includeAzureProbe !== false,
          });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
  ],
  open: async (ctx) => {
    const workspaceRoot = ctx.session?.workingDirectory ?? process.cwd();
    let entry = servers.get(ctx.instanceId);
    if (!entry || entry.workspaceRoot !== workspaceRoot) {
      if (entry) {
        await new Promise((resolve) => entry.server.close(resolve));
      }
      entry = await startServer(ctx.instanceId, workspaceRoot);
      servers.set(ctx.instanceId, entry);
    }
    return {
      title: "Unity Studio",
      status: "Unity apps",
      url: entry.url,
    };
  },
  onClose: async ({ instanceId }) => {
    const entry = servers.get(instanceId);
    if (entry) {
      servers.delete(instanceId);
      await new Promise((resolve) => entry.server.close(resolve));
    }
  },
});

session = await joinSession({ canvases: [canvas] });
