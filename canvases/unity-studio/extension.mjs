import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import {
  realpath,
  stat,
  access,
  readdir,
  readFile,
  mkdir,
  writeFile,
  open,
  rename,
  unlink,
  rmdir,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
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
  requestConnectionWork,
  resolveConnectionRequest,
  runDoctor,
  traceUnityApp,
  WORKSPACE_TIER_IDS,
} from "./studio-commands.mjs";
import { renderAppMapMarkup, renderStudioHtml } from "./studio-ui.mjs";
import { deriveRuntimeState, readProcessRegistry } from "./runtime-state.mjs";
import { createCommandActivity, redactActivityText } from "./command-activity.mjs";
import { summarizeAgentResult } from "./agent-result.mjs";
import { assessDocumentResult } from "./document-assessment.mjs";
import { recordAppOpened } from "./app-recency.mjs";
import {
  applyPortSettings, forgetStoppedLaunchers, inspectPortProcesses, makePortStopReview, managedLaunchers,
  pickAvailablePorts, readPortSettings, reservedPortsForApps, stopReviewedPortProcesses,
} from "./local-ports.mjs";
import { documentDeploymentBlocker, readBuildRuntime, readBuildWorkspace, resolveBuildArtifactPath, saveBuildArtifact } from "./build-workspace.mjs";
import {
  resolveAgentInvocation,
  invocationBody,
  probeHttpHealth,
  buildRunCommandReference,
} from "./run-contract.mjs";
import {
  evaluateGatewayReadiness,
  discoverGatewayModels,
  loadGatewayModelOptions,
  gatewayCommandEnvironment,
  validateGatewayCandidate,
  discoverGatewayOptions,
} from "./gateway-state.mjs";

const servers = new Map();
const appStates = new Map();
const appOutput = new Map();
const activeGateways = new Map();
const gatewayWriteQueues = new Map();
let session;
const transientAppStates = new Set(["starting", "stopping", "configuring", "provisioning", "deploying"]);
const pendingAppMutations = new Set();
const commandActivities = new Map();
const portStopReviews = new Map();

function commandLogDirectory(root) {
  const rootHash = createHash("sha256").update(root).digest("hex").slice(0, 20);
  return `${tmpdir()}/unity-studio-command-logs/${rootHash}`;
}

function commandActivity(root) {
  if (!commandActivities.has(root)) {
    commandActivities.set(root, createCommandActivity(`${commandLogDirectory(root)}/activity.json`));
  }
  return commandActivities.get(root);
}

function trackedAzureRunner(root) {
  return async (command, args) => {
    const activity = commandActivity(root);
    const id = await activity.start({ kind: "az", label: "Azure discovery", command: [command, ...args].join(" ") });
    try {
      const result = await runCommand(command, args);
      await activity.finish(id, { ok: result.ok, note: result.ok ? "" : result.stderr || result.error });
      return result;
    } catch (error) {
      await activity.finish(id, { ok: false, note: error.message });
      throw error;
    }
  };
}

async function readRuntimeOutput(root) {
  const run = appOutput.get(root);
  const lines = [];
  async function readLogs(directory, prefix = "") {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        await readLogs(path, `${prefix}${entry.name}/`);
      } else if (
        entry.name.endsWith(".log")
        && path !== run?.logPath
        && (!run || (await stat(path)).mtimeMs >= run.startedAt)
      ) {
        const contents = await readFile(path, "utf8");
        lines.push(...contents.split(/\r?\n/).filter(Boolean).map((line) => `[${prefix}${entry.name}] ${line}`));
      }
    }
  }
  try {
    if (run?.state !== "stopping") {
      await readLogs(`${root}/.dev-run`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await readLogs(commandLogDirectory(root), "unity-studio/");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (run?.logPath) {
    try {
      const contents = await readFile(run.logPath, "utf8");
      lines.push(...contents.split(/\r?\n/).filter(Boolean).map((line) => `[unity-studio] ${line}`));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  lines.push(...(run?.lines ?? []));
  return lines.slice(-400).map(redactActivityText);
}

async function readAppRuntimeProfile(root) {
  try {
    const identity = JSON.parse(await readFile(`${root}/.unity-studio/app.json`, "utf8"));
    return identity?.runtime && typeof identity.runtime === "object"
      ? applyPortSettings(identity.runtime, await readPortSettings(root)) : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function ensureAppSession(root, workspaceRoot) {
  if (root === workspaceRoot) return session.sessionId ?? null;
  const identityPath = `${root}/.unity-studio/app.json`;
  let identity = {};
  try {
    identity = JSON.parse(await readFile(identityPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!session?.rpc?.sessions?.open) {
    if (typeof identity.childSessionId === "string" && identity.childSessionId) {
      return identity.childSessionId;
    }
    throw new Error("This host cannot open an app implementation session.");
  }
  if (typeof identity.childSessionId === "string" && identity.childSessionId) {
    const resumed = await session.rpc.sessions.open({
      kind: "resume",
      sessionId: identity.childSessionId,
      options: { workingDirectory: root },
      resume: false,
      suppressResumeWorkspaceMetadataWriteback: true,
    });
    if (resumed.status === "resumed" && resumed.sessionId) {
      return resumed.sessionId;
    }
    if (resumed.status !== "not_found") {
      throw new Error(`The app implementation session could not be resumed: ${resumed.status ?? "unknown status"}.`);
    }
  }
  const opened = await session.rpc.sessions.open({
    kind: "create",
    options: {
      name: `${identity.name || "Unity app"} implementation`,
      model: "gpt-5.6-sol",
      reasoningEffort: "max",
      workingDirectory: root,
    },
  });
  if (opened.status !== "created" || !opened.sessionId) {
    throw new Error(`The app implementation session could not be created: ${opened.status ?? "unknown status"}.`);
  }
  await mkdir(`${root}/.unity-studio`, { recursive: true });
  await writeFile(identityPath, JSON.stringify({
    ...identity,
    childSessionId: opened.sessionId,
  }, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  return opened.sessionId;
}

async function runtimePortCandidates(root) {
  const runtime = await readAppRuntimeProfile(root);
  if (Array.isArray(runtime?.entrypoints)) {
    const gatewayConfigured = await hasGatewayConfiguration(root);
    const usesStartProfile = runtime.requiresGatewayForFullStart !== true || !gatewayConfigured;
    const expectedPorts = new Set(
      (usesStartProfile && Array.isArray(runtime.startEntrypoints)
        ? runtime.startEntrypoints
        : runtime.entrypoints)
        .map((entrypoint) => Number(entrypoint?.port)),
    );
    const entrypoints = runtime.entrypoints
      .map((entrypoint) => ({ name: String(entrypoint?.name || ""), port: Number(entrypoint?.port) }))
      .filter((entrypoint) =>
        entrypoint.name && Number.isInteger(entrypoint.port) && entrypoint.port > 0 && entrypoint.port <= 65_535);
    for (const port of runtime.reservedPorts ?? []) {
      const numericPort = Number(port);
      if (
        Number.isInteger(numericPort)
        && numericPort > 0
        && numericPort <= 65_535
        && !entrypoints.some((entrypoint) => entrypoint.port === numericPort)
      ) {
        entrypoints.push({ name: `reserved-${numericPort}`, port: numericPort });
      }
    }
    return entrypoints.map((entrypoint) => ({
      ...entrypoint,
      expected: expectedPorts.has(entrypoint.port),
    }));
  }

  const candidates = [
    { name: "web", port: 3000 },
    { name: "agent", port: 8088 },
  ];
  let lifecycleSource = "";
  for (const path of [`${root}/scripts/dev-start.sh`, `${root}/scripts/dev-start.ps1`]) {
    try {
      lifecycleSource += await readFile(path, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (/7074|10002|AZURITE/i.test(lifecycleSource)) {
    candidates.push(
      { name: "inventory-search", port: 7071 },
      { name: "trade-in-value", port: 7072 },
      { name: "rate-sheet", port: 7073 },
      { name: "deal-doc", port: 7074 },
      { name: "azurite", port: 10000 },
      { name: "azurite-queue", port: 10001 },
      { name: "azurite-table", port: 10002 },
    );
  }
  return candidates;
}

async function probeHttpEntrypoints(root) {
  const candidates = await runtimePortCandidates(root);
  for (const entry of await readProcessRegistry(root)) {
    if (!candidates.some((candidate) => candidate.port === entry.port)) {
      candidates.push({ name: entry.name, port: entry.port });
    }
  }
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.port, candidate])).values()];
  return Promise.all(uniqueCandidates.map(async (candidate) => {
    const listening = await new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port: candidate.port });
      const finish = (value) => {
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(500, () => finish(false));
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
    });
    const health = listening
      ? await probeHttpHealth(candidate)
      : { healthy: false, healthStatus: "Offline" };
    return {
      ...candidate, url: `http://localhost:${candidate.port}`, listening,
      ready: listening && health.healthy !== false, ...health,
    };
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
  let result = await runCommand("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script]);
  if (!result.ok) {
    result = await runCommand("powershell", ["-NoProfile", "-NonInteractive", "-Command", script]);
  }
  if (!result.ok) return { available: false, ownedPorts: new Set() };
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    return { available: false, ownedPorts: new Set() };
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

async function promptLocalAgent(root, prompt, requestedPort, document) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2_000) {
    throw new Error("Enter a message up to 2,000 characters.");
  }
  if (
    requestedPort !== undefined &&
    (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65_535)
  ) {
    throw new Error("Choose a valid local agent endpoint.");
  }
  const entrypoints = await probeHttpEntrypoints(root);
  const agents = entrypoints.filter((candidate) =>
    candidate.name.trim().toLowerCase() === "agent");
  const agent = requestedPort === undefined
    ? agents.find((candidate) => candidate.port === 8088) ?? agents[0]
    : agents.find((candidate) => candidate.port === requestedPort);
  if (!agent?.ready) throw new Error("The local agent is not running.");
  const ownership = await inspectEntrypointOwnership(root, [agent], await readProcessRegistry(root));
  if (ownership.available && !ownership.ownedPorts.has(agent.port)) {
    const error = new Error("The local agent port belongs to another app.");
    error.statusCode = 409;
    throw error;
  }
  const contract = await resolveAgentInvocation(root, agent.port);
  const activity = commandActivity(root);
  const id = await activity.start({ kind: "http", label: "Invoke agent", command: `POST ${contract.url}` });
  let status;
  try {
    const response = await fetch(contract.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invocationBody(contract, prompt.trim(), document)),
      signal: AbortSignal.timeout(120_000),
    });
    status = response.status;
    const body = await response.text();
    if (!response.ok) throw new Error(`Agent returned HTTP ${response.status}: ${body.slice(0, 500)}`);
    let result;
    try { result = JSON.parse(body); } catch { result = body; }
    await activity.finish(id, { ok: true, note: `HTTP ${status}` });
    return {
      response: result, summary: summarizeAgentResult(result),
      ...(document !== undefined && contract.route === "/invoke" && ownership.available
        && ownership.ownedPorts.has(agent.port)
        ? { documentAssessment: assessDocumentResult(result) } : {}),
    };
  } catch (error) {
    await activity.finish(id, { ok: false, note: status ? `HTTP ${status}` : "HTTP request failed or timed out." });
    throw error;
  }
}

async function loadActiveGateway(root, { refresh = false } = {}) {
  if (!refresh && activeGateways.has(root)) return activeGateways.get(root);
  try {
    const active = JSON.parse(await readFile(`${root}/.unity-studio/active-gateway.json`, "utf8"));
    activeGateways.set(root, active);
    return active;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    activeGateways.delete(root);
    return null;
  }
}

async function withGatewayCommitLock(root, operation) {
  const lockDirectory = `${root}/.unity-studio/gateway-config.lock`;
  const pidFile = `${lockDirectory}/pid`;
  let acquired = false;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    try {
      await mkdir(lockDirectory);
      acquired = true;
      await writeFile(pidFile, `${process.pid}\n`, "utf8");
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!acquired) {
    throw new Error(
      `Timed out waiting to persist AI Gateway settings. If no configuration is running, remove ${lockDirectory} and retry.`,
    );
  }
  try {
    return await operation();
  } finally {
    await unlink(pidFile);
    await rmdir(lockDirectory);
  }
}

async function persistActiveGateway(root, active, expectedConfigurationId) {
  const writeState = async () => {
    const directory = `${root}/.unity-studio`;
    const target = `${directory}/active-gateway.json`;
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await mkdir(directory, { recursive: true });
    return withGatewayCommitLock(root, async () => {
      if (expectedConfigurationId) {
        const persisted = await loadActiveGateway(root, { refresh: true });
        if (persisted?.configurationId !== expectedConfigurationId) return false;
      }
      try {
        await writeFile(temporary, JSON.stringify(active, null, 2) + "\n", {
          encoding: "utf8",
          mode: 0o600,
        });
        await rename(temporary, target);
        activeGateways.set(root, active);
        return true;
      } catch (error) {
        try {
          await unlink(temporary);
        } catch (cleanupError) {
          if (cleanupError.code !== "ENOENT") {
            error.message += ` Cleanup also failed: ${cleanupError.message}`;
          }
        }
        throw error;
      }
    });
  };
  const previous = gatewayWriteQueues.get(root) ?? Promise.resolve();
  const pending = previous.then(writeState, writeState);
  gatewayWriteQueues.set(root, pending);
  try {
    return await pending;
  } finally {
    if (gatewayWriteQueues.get(root) === pending) gatewayWriteQueues.delete(root);
  }
}

async function localReadiness(root) {
  let agentConfiguration = "";
  try {
    agentConfiguration = await readFile(`${root}/src/agent/.env`, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const gatewayReadiness = evaluateGatewayReadiness(
    agentConfiguration,
    await loadActiveGateway(root, { refresh: true }),
    appStates.get(root)?.state === "configuring",
  );
  const runtime = await readAppRuntimeProfile(root);
  const previewMode = runtime?.requiresGatewayForFullStart === true && !gatewayReadiness.gatewayConfigured;
  const canStartFromProfile = typeof runtime?.start === "string" && runtime.start.trim();
  const ready = gatewayReadiness.gatewayConfigured || Boolean(canStartFromProfile);
  const buildRuntime = await readBuildRuntime(root);
  return {
    ...gatewayReadiness,
    ready,
    agentRuntime: buildRuntime?.agentRuntime ?? null,
    documentInput: buildRuntime ? { extensions: [".txt", ".md"], maxBytes: 65536 } : null,
    deploymentBlocker: await documentDeploymentBlocker(root),
    mode: previewMode ? "preview" : "full",
    missing: gatewayReadiness.gatewayConfigured || canStartFromProfile ? [] : gatewayReadiness.missing,
    guidance: previewMode
      ? "The app can start in local preview mode. Connect an AI Gateway to enable the complete agent workflow."
      : gatewayReadiness.guidance,
  };
}

async function hasGatewayConfiguration(root) {
  return (await localReadiness(root)).gatewayConfigured;
}

async function currentAppState(root) {
  if (!appStates.has(root)) {
    const active = await loadActiveGateway(root, { refresh: true });
    if (active?.configurationStatus === "failed") {
      appStates.set(root, {
        state: "failed", operation: "configuring",
        error: "The last model connection failed. Review command output and choose an available gateway/model.",
      });
    }
  }
  const entrypoints = await probeHttpEntrypoints(root);
  const registry = await readProcessRegistry(root);
  const ownership = await inspectEntrypointOwnership(root, entrypoints.map((entry) => ({
    ...entry, ready: entry.listening ?? entry.ready,
  })), registry);
  const ownedEntrypoints = entrypoints.map((entry) => {
    const foreign = ownership.available && (entry.listening ?? entry.ready) && !ownership.ownedPorts.has(entry.port);
    return foreign ? { ...entry, ready: false, healthStatus: "In use by another app" } : entry;
  });
  const runtimeState = deriveRuntimeState(
    appStates.get(root),
    registry,
    ownedEntrypoints,
    { ownershipAvailable: ownership.available, ownedPorts: ownership.ownedPorts },
  );
  appStates.set(root, runtimeState);
  const foreignEntrypoints = ownership.available
    ? entrypoints.filter((entrypoint) => (entrypoint.listening ?? entrypoint.ready) && !ownership.ownedPorts.has(entrypoint.port))
    : [];
  return { ...runtimeState, entrypoints: ownedEntrypoints, foreignEntrypoints };
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

async function readJsonBody(request, maxBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error(`Request body exceeds ${maxBytes / 1024} KiB.`);
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
        const runtime = operation === "run-local" ? await readAppRuntimeProfile(root) : null;
        const readiness = operation === "run-local" ? await localReadiness(root) : null;
        const profileArgs = runtime && (
          runtime.requiresGatewayForFullStart !== true || readiness?.mode === "preview"
        ) ? runtime.startPowerShellArgs ?? [] : [];
        return {
          command: "powershell",
          args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...profileArgs],
        };
      }

      const runtime = operation === "run-local" ? await readAppRuntimeProfile(root) : null;
      const readiness = operation === "run-local" ? await localReadiness(root) : null;
      const profileArgs = runtime && (
        runtime.requiresGatewayForFullStart !== true || readiness?.mode === "preview"
      ) ? runtime.startArgs ?? [] : [];
      return { command: "bash", args: [scriptPath, ...profileArgs] };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
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
  await access(`${root}/infra-ai-gateway`);
  await mkdir(`${root}/infra-ai-gateway/scripts`, { recursive: true });
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
  if (state === "starting") {
    const settings = await readPortSettings(root);
    Object.assign(commandEnvironment, Object.fromEntries(Object.entries(settings).map(([name, port]) => [name, String(port)])));
    if (settings.AGENT_PORT) commandEnvironment.AGENT_URL = `http://127.0.0.1:${settings.AGENT_PORT}`;
  }
  const startedAt = Date.now();
  const activity = commandActivity(root);
  const logDirectory = commandLogDirectory(root);
  const logPath = `${logDirectory}/${startedAt}-${state}.log`;
  await mkdir(logDirectory, { recursive: true, mode: 0o700 });
  const logHandle = await open(logPath, "a", 0o600);
  let child;
  let activityId;
  try {
    activityId = await activity.start({ kind: "shell", label: state, command: [command, ...args].join(" ") });
    await logHandle.write(`> ${[command, ...args].join(" ")}\n`);
    child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: commandEnvironment,
      detached: true,
      stdio: ["ignore", logHandle.fd, logHandle.fd],
    });
  } catch (error) {
    await logHandle.close();
    if (activityId) await activity.finish(activityId, { ok: false, note: error.message });
    throw error;
  }
  const run = { lines: [], logPath, startedAt, state };
  appOutput.set(root, run);
  const appendOutput = (chunk) => {
    run.lines.push(...chunk.toString().split(/\r?\n/).filter(Boolean));
    if (run.lines.length > 400) run.lines.splice(0, run.lines.length - 400);
  };
  child.once("error", (error) => {
    appendOutput(`Command failed to start: ${error.message}`);
    if (appStates.get(root)?.pid === child.pid) {
      appStates.set(root, {
        state: "failed",
        operation: state,
        error: error.message,
        updatedAt: new Date().toISOString(),
      });
    }
  });
  child.once("close", (initialExitCode, signal) => {
    void (async () => {
      let exitCode = initialExitCode;
      try {
        await options.onComplete?.({ exitCode, signal });
      } catch (error) {
        appendOutput(`Command completion failed: ${error.message}`);
        run.error = error.message;
        exitCode = 1;
      }
      if (options.completedState && appStates.get(root)?.pid === child.pid) {
        appStates.set(root, {
          state: exitCode === 0 ? options.completedState : "failed",
          operation: state,
          exitCode,
          signal,
          error: run.error ?? (exitCode === 0 ? undefined : `Command exited with ${exitCode ?? signal}. Review command output.`),
          updatedAt: new Date().toISOString(),
        });
      }
      await activity.finish(activityId, {
        ok: exitCode === 0,
        note: run.error || (signal ? `Signal ${signal}` : `Exit ${exitCode}`),
      });
    })().catch((error) => {
      appendOutput(`Unable to record command completion: ${error.message}`);
    });
  });
  child.unref();
  appStates.set(root, { state, operation: state, pid: child.pid, updatedAt: new Date().toISOString() });
  await logHandle.close();
  return { outcome: "command-started", command: [command, ...args].join(" "), root, pid: child.pid, state };
}

async function startGatewayConfiguration(root, gateway, workspaceRoot, configurationId = randomUUID()) {
  await syncGatewayConfigScript(root, workspaceRoot);
  const active = {
    ...validateGatewayCandidate(gateway),
    selectedAt: new Date().toISOString(),
    configurationStatus: "configuring",
    configurationId,
  };
  await persistActiveGateway(root, active);
  const gatewayConfig = await resolveGatewayConfigCommand(root);
  return startAppCommand(root, gatewayConfig.command, gatewayConfig.args, "configuring", {
    completedState: "stopped",
    cwd: gatewayConfig.cwd,
    env: {
      ...gatewayCommandEnvironment(active),
      UV_INDEX_URL: process.env.UV_INDEX_URL || process.env.UV_DEFAULT_INDEX || "https://packagefeedproxy.microsoft.io/pypi/simple/",
      UV_DEFAULT_INDEX: process.env.UV_DEFAULT_INDEX || process.env.UV_INDEX_URL || "https://packagefeedproxy.microsoft.io/pypi/simple/",
      UNITY_GATEWAY_CONFIGURATION_ID: configurationId,
    },
    onComplete: async ({ exitCode, signal }) => {
      const completed = {
        ...active,
        configurationStatus: exitCode === 0 ? "ready" : "failed",
        configuredAt: new Date().toISOString(),
        lastExitCode: exitCode,
        lastSignal: signal,
      };
      await persistActiveGateway(root, completed, configurationId);
    },
  });
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
      const active = await loadActiveGateway(root, { refresh: true });
      const options = await discoverGatewayOptions(
        trackedAzureRunner(root), active, url.searchParams.get("subscriptionId"),
      );
      sendJson(response, 200, await loadGatewayModelOptions(trackedAzureRunner(root), options, {
        name: url.searchParams.get("gatewayName"), resourceGroup: url.searchParams.get("resourceGroup"),
      }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/active-gateway") {
      const input = await readJsonBody(request);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      releaseAppMutation = reserveAppMutation(root);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) throw new Error("Gateway root is not an authorized app workspace.");
      if (typeof input.name !== "string" || !input.name.trim()) throw new Error("Choose an AI Gateway.");
      const current = await currentAppState(root);
      if (current.state === "running") {
        const error = new Error("Stop the local app before changing its AI Gateway.");
        error.statusCode = 409;
        throw error;
      }
      const { gateways } = await discoverGatewayOptions(
        trackedAzureRunner(root), await loadActiveGateway(root, { refresh: true }), input.subscriptionId,
      );
      const gateway = gateways.find((candidate) => candidate.name === input.name
        && (!input.resourceGroup || candidate.resourceGroup === input.resourceGroup));
      if (!gateway) throw new Error("The selected AI Gateway is no longer available.");
      const models = await discoverGatewayModels(trackedAzureRunner(root), gateway);
      const model = input.model ? models.find((item) => item.id === input.model) : models[0];
      if (!model) throw new Error(models.length
        ? "The selected model is no longer available. Refresh the model connection."
        : "This gateway has no models. Select another gateway or add a model in AI Gateway Studio.");
      const configuration = await startGatewayConfiguration(root, { ...gateway, model: model.id }, workspaceRoot);
      sendJson(response, 202, {
        outcome: "gateway-selected",
        active: await loadActiveGateway(root),
        configuration,
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/app-output") {
      const root = await resolveAuthorizedRoot(url.searchParams.get("root"), workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("App output root is not an authorized app workspace.");
      }
      const [lines, commands] = await Promise.all([
        readRuntimeOutput(root), commandActivity(root).list(),
      ]);
      sendJson(response, 200, { lines, commands });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/run-commands") {
      const root = await resolveAuthorizedRoot(url.searchParams.get("root"), workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) throw new Error("Command root is not an authorized app workspace.");
      const [start, stop, candidates] = await Promise.all([
        resolveLifecycleCommand(root, "run-local"),
        resolveLifecycleCommand(root, "stop-local"),
        runtimePortCandidates(root),
      ]);
      const agent = candidates.find((entry) => entry.name.toLowerCase() === "agent");
      let invocation = null;
      let invocationError = "";
      if (agent) {
        try {
          invocation = await resolveAgentInvocation(root, agent.port);
        } catch (error) {
          invocationError = error.message;
        }
      }
      const reference = buildRunCommandReference({ root, start, stop, invocation });
      if (invocationError) reference.guidance = invocationError;
      try {
        await access(`${root}/azure.yaml`);
        reference.commands.push(
          { label: "Provision Azure resources", command: "azd provision" },
          { label: "Deploy app to Azure", command: "azd up" },
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      sendJson(response, 200, reference);
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
    if (request.method === "POST" && ["/api/agent-invoke", "/api/agent-prompt"].includes(url.pathname)) {
      const input = await readJsonBody(request, 128 * 1024);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) throw new Error("Agent root is not an authorized app workspace.");
      sendJson(response, 200, await promptLocalAgent(
        root, url.pathname === "/api/agent-invoke" ? input.message : input.prompt, input.port, input.document,
      ));
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
      const targetSessionId = await ensureAppSession(root, workspaceRoot);
      sendJson(response, 202, await requestCapabilityWork({
        session,
        input: { ...input, targetRoot: root, targetSessionId },
      }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/connection-request") {
      const input = await readJsonBody(request);
      const root = input.root
        ? await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots)
        : workspaceRoot;
      if (input.root && !authorizedRoots.has(root) && root !== workspaceRoot) {
        throw new Error("Connection root is not an authorized app workspace.");
      }
      const targetSessionId = await ensureAppSession(root, workspaceRoot);
      const connection = resolveConnectionRequest(
        { ...input, targetRoot: root, targetSessionId },
        await traceUnityApp({ root }),
      );
      sendJson(response, 202, await requestConnectionWork({
        session,
        input: connection,
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
    if (request.method === "POST" && url.pathname === "/api/open-build-file") {
      const input = await readJsonBody(request);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) throw new Error("Build root is not an authorized app workspace.");
      const file = await resolveBuildArtifactPath(root, input.id);
      sendJson(response, 200, await openWorkspaceInVsCode({ root, file }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/build-workspace") {
      const root = await resolveAuthorizedRoot(url.searchParams.get("root"), workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) throw new Error("Build root is not an authorized app workspace.");
      sendJson(response, 200, await readBuildWorkspace(root));
      return;
    }
    if (request.method === "POST" && ["/api/ports/pick", "/api/ports/review-stop", "/api/ports/stop"].includes(url.pathname)) {
      const input = await readJsonBody(request);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) throw new Error("Port control root is not an authorized app workspace.");
      releaseAppMutation = reserveAppMutation(root);
      const candidates = await probeHttpEntrypoints(root);
      const ports = [...new Set(candidates.map((item) => item.port))];
      if (url.pathname === "/api/ports/pick") {
        const current = await currentAppState(root);
        if (["running", "starting"].includes(current.state)) throw new Error("Stop this app before changing its ports.");
        if (!await readAppRuntimeProfile(root)) throw new Error("This app needs a persisted runtime profile before its ports can be reassigned.");
        const settings = await pickAvailablePorts(root, await runtimePortCandidates(root), async () => {
          const catalog = await listSourceCatalog({ workspaceRoot, additionalRoots: [...authorizedRoots] });
          return reservedPortsForApps(catalog.apps.map((app) => app.path), root);
        });
        portStopReviews.delete(root);
        appStates.delete(root);
        const activity = commandActivity(root);
        const id = await activity.start({ kind: "configuration", label: "Pick available ports", command: "Write .unity-studio/ports.env" });
        await activity.finish(id, { ok: true, note: Object.entries(settings).map(([name, port]) => `${name}=${port}`).join(", ") });
        sendJson(response, 200, { settings, entrypoints: await runtimePortCandidates(root) });
      } else if (url.pathname === "/api/ports/review-stop") {
        const catalog = await listSourceCatalog({ workspaceRoot, additionalRoots: [...authorizedRoots] });
        const launchers = await managedLaunchers(catalog.roots.map((app) => app.path));
        const review = makePortStopReview(ports, await inspectPortProcesses(ports), launchers);
        const reviewId = randomUUID();
        portStopReviews.set(root, { reviewId, review, launchers });
        sendJson(response, 200, {
          reviewId, ports: review.ports,
          targets: review.targets.map(({ pid, command, ports }) => ({ pid, command, ports })),
        });
      } else {
        const pending = portStopReviews.get(root);
        if (input.confirmed !== true || !pending || pending.reviewId !== input.reviewId) throw new Error("Review the affected apps and confirm before stopping port owners.");
        portStopReviews.delete(root);
        if (JSON.stringify([...ports].sort((a, b) => a - b)) !== JSON.stringify(pending.review.ports)) throw new Error("App ports changed. Review them again.");
        const activity = commandActivity(root);
        const id = await activity.start({
          kind: "process", label: "Stop apps using these ports",
          command: `${process.platform === "win32" ? "taskkill /T /F" : "SIGTERM"}: reviewed PIDs ${pending.review.targets.map((item) => item.pid).join(", ") || "(none)"}`,
        });
        try {
          const stopped = await stopReviewedPortProcesses(pending.review);
          await forgetStoppedLaunchers(pending.launchers, stopped.terminatedPids);
          appStates.delete(root);
          await activity.finish(id, { ok: true, note: `Ports free: ${ports.join(", ")}` });
          sendJson(response, 200, stopped);
        } catch (error) {
          await activity.finish(id, { ok: false, note: error.message });
          throw error;
        }
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/build-file") {
      const input = await readJsonBody(request, 768 * 1024);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) throw new Error("Build root is not an authorized app workspace.");
      releaseAppMutation = reserveAppMutation(root);
      const state = await currentAppState(root);
      if (state.state === "running" || state.state === "preview" || transientAppStates.has(state.state)) {
        const error = new Error("Stop the app before saving source or runtime changes, then restart to use the reviewed version.");
        error.statusCode = 409;
        throw error;
      }
      sendJson(response, 200, await saveBuildArtifact(root, input));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/document-test") {
      const input = await readJsonBody(request, 128 * 1024);
      const root = await resolveAuthorizedRoot(input.root, workspaceRoot, authorizedRoots);
      if (!authorizedRoots.has(root) && root !== workspaceRoot) throw new Error("Document test root is not an authorized app workspace.");
      await resolveBuildArtifactPath(root, "contract");
      const agent = (await probeHttpEntrypoints(root)).find((entry) => entry.name === "agent" && entry.healthy);
      if (!agent) throw new Error("Run the app first, then test document enforcement.");
      const ownership = await inspectEntrypointOwnership(root, [agent], await readProcessRegistry(root));
      if (!ownership.available || !ownership.ownedPorts.has(agent.port)) throw new Error("Cannot verify that the agent endpoint belongs to this app.");
      const endpoint = `http://127.0.0.1:${agent.port}/test-document`;
      const activity = commandActivity(root);
      const id = await activity.start({ kind: "http", label: "Test document enforcement", command: `POST ${endpoint}` });
      try {
        const result = await fetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: input.document }), signal: AbortSignal.timeout(120_000),
        });
        const body = await result.json();
        if (!result.ok && !(result.status === 422 && body.verdict === "rejected")) {
          throw new Error(`Document test returned HTTP ${result.status}: ${body.error?.message || "Tool execution failed."}`);
        }
        await activity.finish(id, { ok: true, note: `HTTP ${result.status}; enforcement ${body.verdict || "completed"} (not a model call).` });
        sendJson(response, 200, { ...body, documentAssessment: assessDocumentResult(body) });
      } catch (error) {
        await activity.finish(id, { ok: false, note: "Document enforcement failed; payload omitted from logs." });
        throw error;
      }
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
        if (current.foreignEntrypoints.length > 0) {
          const ports = current.foreignEntrypoints.map((entrypoint) => entrypoint.port).join(", ");
          const error = new Error(
            `Another local app is using required port${current.foreignEntrypoints.length === 1 ? "" : "s"} ${ports}. Stop that app before starting this one.`,
          );
          error.statusCode = 409;
          throw error;
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
        const readiness = await localReadiness(root);
        if (!readiness.ready) {
          const error = new Error(readiness.guidance);
          error.statusCode = 409;
          throw error;
        }
        const lifecycle = await resolveLifecycleCommand(root, input.operation);
        sendJson(response, 202, await startAppCommand(root, lifecycle.command, lifecycle.args, "starting", {
          completedState: "running",
          onComplete: async ({ exitCode }) => {
            if (exitCode !== 0) return;
            const endpoints = await probeHttpEntrypoints(root);
            const ownership = await inspectEntrypointOwnership(root, endpoints, await readProcessRegistry(root));
            const missing = endpoints.filter((entry) => entry.expected !== false
              && (!entry.ready || (ownership.available && !ownership.ownedPorts.has(entry.port))));
            if (missing.length) throw new Error("Startup finished but required services are not ready: " +
              missing.map((entry) => entry.name + " (" + (entry.healthStatus || "offline") + ")").join(", "));
          },
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
        if (current.state === "running") {
          const error = new Error("Stop the local app before changing its AI Gateway.");
          error.statusCode = 409;
          throw error;
        }
        const active = await loadActiveGateway(root, { refresh: true });
        if (!active) {
          const error = new Error("Select an AI Gateway before configuring the app.");
          error.statusCode = 400;
          throw error;
        }
        sendJson(response, 202, await startGatewayConfiguration(root, active, workspaceRoot));
        return;
      }
      if (input.operation === "provision-cloud" || input.operation === "deploy-cloud") {
        const blocker = await documentDeploymentBlocker(root);
        if (blocker) throw new Error(blocker);
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
      activeGateways.delete(root);
      gatewayWriteQueues.delete(root);
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
      const html = renderInteractiveAppMapHtml(await traceUnityApp({ root }), {
        apiToken,
        appName: appIdentity?.name,
      });
      await recordAppOpened(root);
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(html);
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
        egressAllowDomain: { type: "string", minLength: 1, maxLength: 253 },
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
