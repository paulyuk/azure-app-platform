import { createHash } from "node:crypto";

import { PLATFORM_TIERS } from "./tier-definitions.mjs";
import { createDiscoveryTracker } from "./discovery-tracker.mjs";
import { RUN_PANEL_CONTENT_CSS } from "./run-panel-styles.mjs";
import { createRunWorkspace } from "./run-workspace.mjs";
import { BUILD_PANEL_CONTENT_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";
import { DEFAULT_EDITOR_SETTINGS } from "./editor-settings.mjs";
import { renderStudioBrand } from "./studio-brand.mjs";
import { renderThemeStyles, renderThemeToggle, renderThemeClientScript } from "./studio-theme.mjs";
import { COMPONENT_LOGS_CSS } from "./component-logs-panel.mjs";
import { buildOperationGroups } from "./operation-groups.mjs";
import { APP_LOGS_CSS, createAppLogsPanel } from "./app-logs-panel.mjs";
import { ACTION_BUTTON_STYLE } from "./control-styles.mjs";
import { STUDIO_TABS_CSS } from "./studio-tabs.mjs";

const RENDERER_SCHEMA_VERSION = 4;
const REQUEST_FLOW_GROUPS = [
  {
    id: "entry",
    label: "Experience",
    role: "Where a request enters the app",
    tierIds: ["web"],
  },
  {
    id: "reasoning",
    label: "Reasoning",
    role: "How the app understands and decides",
    tierIds: ["agent"],
  },
  {
    id: "capabilities",
    label: "Models & capabilities",
    role: "Model access and actions the agent can invoke",
    tierIds: ["gateway", "skills", "workflows", "sandbox"],
  },
  {
    id: "systems",
    label: "Connected systems",
    role: "Business systems and data used by the app",
    tierIds: ["connectors", "data"],
  },
];
const RUNTIME_TIERS = new Set([
  "web",
  "agent",
  "skills",
  "workflows",
  "sandbox",
  "connectors",
]);

function hash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function appMapFingerprint(appMap) {
  const topology = [
    ...appMap.nodes.map((node) => `node:${node.id}`).sort(),
    ...appMap.edges.map((edge) => `edge:${edge.from}:${edge.to}:${edge.kind}`).sort(),
  ].join("\n");
  return hash(topology);
}

export function buildActionCenterModel(appMap) {
  const tierIds = new Set(appMap.nodes.map((node) => node.tierId));
  const nodeTiers = new Map(appMap.nodes.map((node) => [node.id, node.tierId]));
  const hasTierEdge = (fromTier, toTier) => appMap.edges.some((edge) =>
    nodeTiers.get(edge.from) === fromTier && nodeTiers.get(edge.to) === toTier);
  const hasAgent = tierIds.has("agent");
  const hasGateway = tierIds.has("gateway");
  const hasSkills = tierIds.has("skills");
  const hasWeb = tierIds.has("web");
  const runtimeNodes = appMap.nodes.filter((node) =>
    node.kind === "project" && RUNTIME_TIERS.has(node.tierId));
  const instrumentedNodes = runtimeNodes.filter((node) =>
    node.badges?.some((badge) => badge.kind === "telemetry"));
  const hasSreImplementation = tierIds.has("sre");
  const observabilityComplete = hasSreImplementation ||
    (runtimeNodes.length > 0 && instrumentedNodes.length === runtimeNodes.length);
  const hasObservability = hasSreImplementation || instrumentedNodes.length > 0;
  const gatewayConnected = hasGateway && hasTierEdge("agent", "gateway");
  const skillsConnected = !hasSkills || hasTierEdge("agent", "skills");
  const unresolvedCount = appMap.unresolved?.length ?? 0;
  const opportunities = [];

  if (!hasAgent) {
    opportunities.push({
      id: "add-agent",
      priority: "required",
      stage: "build",
      title: "Add your app's reasoning layer",
      detail: "Unity did not find an agent yet. Describe what the app should accomplish and Unity will guide the implementation.",
      action: { kind: "add-tier", tierId: "agent", label: "Add an agent" },
    });
  }
  if (hasAgent && !hasSkills) {
    opportunities.push({
      id: "add-skill",
      priority: "recommended",
      stage: "build",
      title: "Give the agent a real capability",
      detail: "No callable Hosted Skill was found. Add one bounded business action so the agent can do more than generate text.",
      action: { kind: "add-tier", tierId: "skills", label: "Add a capability" },
    });
  }
  if (!hasWeb) {
    opportunities.push({
      id: "add-surface",
      priority: "optional",
      stage: "build",
      title: "Add a user experience",
      detail: "No application surface was found. Add one when people need a dedicated way to use this app.",
      action: { kind: "add-tier", tierId: "web", label: "Add an app surface" },
    });
  }
  if (hasAgent && !hasGateway) {
    opportunities.push({
      id: "add-gateway",
      priority: "required",
      stage: "connect",
      title: "Connect governed model access",
      detail: "The agent has no discovered AI Gateway binding. Unity can guide model connection, policy, identity, and quota setup.",
      action: { kind: "add-tier", tierId: "gateway", label: "Connect AI models" },
    });
  } else if (hasAgent && !gatewayConnected) {
    opportunities.push({
      id: "connect-gateway",
      priority: "required",
      stage: "connect",
      title: "Wire the agent to its model gateway",
      detail: "A gateway was found, but Unity could not verify an agent-to-gateway relationship in source.",
      action: { kind: "add-tier", tierId: "gateway", label: "Complete model connection" },
    });
  }
  if (hasAgent && hasSkills && !skillsConnected) {
    opportunities.push({
      id: "connect-skills",
      priority: "attention",
      stage: "connect",
      title: "Connect capabilities to the agent",
      detail: "Hosted Skills were found, but Unity could not verify that the agent can call them.",
      action: { kind: "add-tier", tierId: "skills", label: "Complete capability connection" },
    });
  }
  if (unresolvedCount > 0) {
    opportunities.push({
      id: "resolve-connections",
      priority: "attention",
      stage: "connect",
      title: `Review ${unresolvedCount} uncertain ${unresolvedCount === 1 ? "connection" : "connections"}`,
      detail: "Unity found source references whose destination is missing or ambiguous. Inspect the evidence before relying on these paths.",
      action: { kind: "review-connections", label: "Review connections" },
    });
  }
  if (!hasObservability) {
    opportunities.push({
      id: "add-observability",
      priority: "recommended",
      stage: "observe",
      title: "Make this app observable",
      detail: "No telemetry or SRE implementation was found. Add health signals now so the app can explain failures after it is running.",
      action: { kind: "add-tier", tierId: "sre", label: "Set up observability" },
    });
  } else if (!observabilityComplete) {
    opportunities.push({
      id: "extend-observability",
      priority: "recommended",
      stage: "observe",
      title: "Complete observability coverage",
      detail: `${instrumentedNodes.length} of ${runtimeNodes.length} runtime components have telemetry evidence. Extend the same operational view across the remaining request path.`,
      action: { kind: "add-tier", tierId: "sre", label: "Extend observability" },
    });
  }

  const priorityOrder = new Map([
    ["required", 0],
    ["attention", 1],
    ["recommended", 2],
    ["optional", 3],
  ]);
  opportunities.sort((left, right) =>
    priorityOrder.get(left.priority) - priorityOrder.get(right.priority));

  return {
    stages: [
      {
        id: "build",
        label: "Build",
        state: hasAgent ? "complete" : "next",
        detail: hasAgent ? "Agent foundation discovered" : "Add an agent foundation",
      },
      {
        id: "connect",
        label: "Connect",
        state: hasAgent && gatewayConnected && skillsConnected && unresolvedCount === 0 ? "complete" : hasAgent ? "next" : "blocked",
        detail: gatewayConnected && skillsConnected
          ? unresolvedCount === 0 ? "Core connections discovered" : "Review uncertain connections"
          : "Connect models and capabilities",
      },
      {
        id: "run",
        label: "Run",
        state: "runtime",
        detail: "Checking local readiness",
      },
      {
        id: "observe",
        label: "Observe & manage",
        state: observabilityComplete ? "complete" : "next",
        detail: observabilityComplete
          ? "Operational signals cover the app"
          : hasObservability ? "Extend signals across the request path" : "Add telemetry and health",
      },
    ],
    opportunities,
  };
}

export function buildJourneyStages(stages, operationalState, activeLifecycleStates) {
  const appState = operationalState.app?.state;
  const running = appState === "running";
  const transitioning = activeLifecycleStates.includes(appState);
  const runtimeKnown = running || transitioning || appState === "failed" || operationalState.readiness?.ready;
  let prerequisite = null;
  return stages.map((stage) => {
    if (stage.id === "observe") {
      return { ...stage, state: running ? "active" : "blocked", detail: running
        ? operationalState.readiness?.mode === "preview"
          ? "Inspect preview logs and health; full app setup remains"
          : "Inspect service logs, health, and request paths"
        : "Available when the app is running" };
    }
    if (stage.id === "run") {
      if (running) return { ...stage, state: "complete", detail: operationalState.readiness?.mode === "preview"
        ? "Local preview is running, not the full app"
        : "App is running locally" };
      if (transitioning) return { ...stage, state: "next", detail: appState.replaceAll("-", " ") + " in progress" };
      if (appState === "failed") return { ...stage, state: "next", detail: "Inspect runtime output and resolve the failure" };
      if (operationalState.readiness?.ready) return { ...stage, state: "ready", detail: operationalState.readiness.mode === "preview"
        ? "Ready to start a local preview"
        : "Ready to run locally" };
      if (!prerequisite) return { ...stage, state: operationalState.readiness ? "next" : "runtime",
        detail: operationalState.readiness ? "Finish guided setup" : "Checking local readiness" };
    }
    if (stage.state === "complete") return stage;
    if (runtimeKnown) return { ...stage, state: "attention" };
    if (prerequisite) return { ...stage, state: "blocked", detail: "Available after " + prerequisite.label };
    prerequisite = stage;
    return stage;
  });
}

function flowEdgePresentation(edge, nodeTiers) {
  const documentationOnly = (edge.evidence ?? []).length > 0 &&
    edge.evidence.every((item) => /(?:^|\/)(?:README|docs?\/)|\.md$/i.test(item.path));
  const pair = `${nodeTiers.get(edge.from)}:${nodeTiers.get(edge.to)}`;
  const known = {
    "web:agent": { label: "Request", step: 1 },
    "agent:gateway": { label: "Model request", step: 2 },
    "agent:skills": { label: "Tool call", step: 2 },
    "agent:workflows": { label: "Workflow", step: 2 },
    "agent:sandbox": { label: "Sandbox task", step: 2 },
    "skills:connectors": { label: "System call", step: 3 },
    "skills:data": { label: "Data access", step: 3 },
    "workflows:connectors": { label: "System call", step: 3 },
    "workflows:data": { label: "Data access", step: 3 },
  }[pair];
  const presentation = known ?? {
    label: edge.kind.replaceAll("-", " "),
    step: null,
  };
  return {
    ...presentation,
    label: documentationOnly ? `Documented ${presentation.label.toLowerCase()}` : presentation.label,
    confidence: documentationOnly ? "low" : edge.confidence,
    evidenceKind: documentationOnly ? "documentation" : "source",
  };
}

export function buildRequestFlowModel(appMap) {
  const operationGroups = buildOperationGroups(appMap.nodes, appMap.edges);
  const parentById = new Map(operationGroups.flatMap((group) =>
    group.nodeIds.map((id) => [id, group.parentId])));
  const projectId = (id) => parentById.get(id) || id;
  const visibleNodes = appMap.nodes.filter((node) => node.kind !== "operation" && !parentById.has(node.id));
  const nodeTiers = new Map(appMap.nodes.map((node) => [node.id, node.tierId]));
  const entrypointIds = visibleNodes
    .filter((node) => node.tierId === "web")
    .map((node) => node.id);
  if (entrypointIds.length === 0) {
    entrypointIds.push(...visibleNodes
      .filter((node) => node.tierId === "agent")
      .map((node) => node.id));
  }
  const reachable = new Set(entrypointIds);
  const queue = [...entrypointIds];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of appMap.edges.filter((candidate) => projectId(candidate.from) === current)) {
      const target = projectId(edge.to);
      if (reachable.has(target)) continue;
      reachable.add(target);
      queue.push(target);
    }
  }
  const pathNodes = visibleNodes.filter((node) =>
    reachable.has(node.id) || node.tierId === "sre");
  const pathNodeIds = new Set(pathNodes.map((node) => node.id));
  const groups = REQUEST_FLOW_GROUPS.map((group) => ({
    ...group,
    nodeIds: pathNodes
      .filter((node) => group.tierIds.includes(node.tierId))
      .map((node) => node.id),
  }));
  const operations = pathNodes
    .filter((node) => node.tierId === "sre")
    .map((node) => node.id);
  const telemetryNodeIds = pathNodes
    .filter((node) => node.badges?.some((badge) => badge.kind === "telemetry"))
    .map((node) => node.id);
  const edges = appMap.edges
    .filter((edge) => projectId(edge.from) !== projectId(edge.to) &&
      pathNodeIds.has(projectId(edge.from)) && pathNodeIds.has(projectId(edge.to)))
    .map((edge) => ({ id: edge.id, ...flowEdgePresentation({
      ...edge, from: projectId(edge.from), to: projectId(edge.to),
    }, nodeTiers) }));
  const pathEdgeIds = new Set(edges.map((edge) => edge.id));
  return {
    operationGroups,
    groups,
    operations,
    telemetryNodeIds,
    nodeIds: [...pathNodeIds],
    unconnectedNodeIds: visibleNodes
      .filter((node) => !pathNodeIds.has(node.id))
      .map((node) => node.id),
    otherNodeIds: appMap.nodes.filter((node) => !pathNodeIds.has(node.id)).map((node) => node.id),
    otherResourceCount: visibleNodes.filter((node) => !pathNodeIds.has(node.id)).length +
      appMap.nodes.filter((node) => node.kind === "operation" && !parentById.has(node.id)).length,
    entrypointIds,
    edges,
    otherEdges: appMap.edges
      .filter((edge) => !pathEdgeIds.has(edge.id))
      .map((edge) => ({ id: edge.id, ...flowEdgePresentation(edge, nodeTiers) })),
  };
}

export function buildInteractiveAppMapModel(appMap) {
  const nodeIds = new Set(appMap.nodes.map((node) => node.id));
  const nodes = appMap.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    tierId: node.tierId,
    name: node.name,
    projectPath: node.projectPath,
    confidence: node.confidence ?? "medium",
    badges: (node.badges ?? []).map((badge) => ({
      label: badge.label,
      kind: badge.kind,
      evidence: badge.evidence,
    })),
    details: (node.details ?? []).map((detail) => ({
      kind: detail.kind,
      label: detail.label,
      value: detail.value,
      evidence: detail.evidence,
    })),
    evidence: node.evidence ?? [],
  }));
  const edges = appMap.edges
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      confidence: edge.confidence ?? "medium",
      evidence: edge.evidence ?? [],
    }));
  const tiers = PLATFORM_TIERS.map((tier) => ({
    id: tier.id,
    name: tier.mapLabel ?? tier.name,
    role: tier.role,
    jobToBeDone: tier.jobToBeDone,
    scaffold: tier.scaffold,
    hasSpecialistStudio: tier.preferredCanvases.length > 0,
    nodeIds: nodes.filter((node) => node.tierId === tier.id).map((node) => node.id),
  }));
  const fingerprint = appMapFingerprint({ nodes, edges });
  return {
    rendererSchemaVersion: RENDERER_SCHEMA_VERSION,
    root: appMap.root,
    generatedAt: appMap.generatedAt,
    summary: appMap.summary,
    tiers,
    nodes,
    edges,
    requestFlow: buildRequestFlowModel(appMap),
    unresolved: appMap.unresolved ?? [],
    diagnostics: appMap.diagnostics ?? [],
    actionCenter: buildActionCenterModel(appMap),
    fingerprint,
    layoutKey: `unity-studio:app-map-layout:v${RENDERER_SCHEMA_VERSION}:${hash(appMap.root)}:${fingerprint}`,
  };
}

function renderNoScriptFallback(model) {
  return model.tiers.map((tier) => {
    const nodes = tier.nodeIds
      .map((id) => model.nodes.find((node) => node.id === id))
      .filter(Boolean);
    return `<section><h2>${escapeHtml(tier.name)}</h2>${
      nodes.length
        ? `<ul>${nodes.map((node) =>
          `<li><strong>${escapeHtml(node.name)}</strong> <code>${escapeHtml(node.projectPath)}</code></li>`,
        ).join("")}</ul>`
        : "<p>No source-derived nodes.</p>"
    }</section>`;
  }).join("");
}

export function renderInteractiveAppMapHtml(appMap, { apiToken = "", appName: providedAppName, theme = "light", editorSettings = DEFAULT_EDITOR_SETTINGS } = {}) {
  const model = buildInteractiveAppMapModel(appMap);
  const appName = providedAppName ||
    model.root.split(/[\\/]/).filter(Boolean).at(-1) ||
    "Unity app";
  const tierOptions = model.tiers
    .map((tier) => `<option value="${escapeHtml(tier.id)}">${escapeHtml(tier.name)}</option>`)
    .join("");
  const guideIcon = '<svg class="guide-panel-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="2.75" y="3.75" width="14.5" height="12.5" rx="1.5"/><path d="M12.5 4v12"/><path class="guide-chevron" d="m6.5 7 3 3-3 3"/></svg>';
  const guideStageIcons = {
    build: '<path d="m8 5-5 5 5 5m4-10 5 5-5 5"/>',
    connect: '<path d="m8 12 4-4M7 13l-1 1a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0m2 0 1-1a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0"/>',
    run: '<path d="m6 3 11 7-11 7z"/>',
    observe: '<path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6"/><circle cx="10" cy="10" r="2.5"/>',
  };
  const guideShortcutsHtml = model.actionCenter.stages.map((stage) =>
    `<button type="button" class="guide-shortcut" data-guide-stage="${stage.id}" aria-controls="guide-content" aria-expanded="false" aria-label="${escapeHtml(stage.label)}: checking status"><svg viewBox="0 0 20 20" aria-hidden="true">${guideStageIcons[stage.id]}</svg><span class="guide-state-icon" aria-hidden="true">…</span></button>`,
  ).join("");

  return `<!doctype html>
<html lang="en" data-studio-theme="${escapeHtml(theme)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="icon" href="data:,">
  <meta name="color-scheme" content="light dark">
  <title>Unity App Map</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f3f2f1;
      --surface: #ffffff;
      --surface-muted: #faf9f8;
      --border: #d2d0ce;
      --text: #201f1e;
      --muted: #605e5c;
      --accent: #5c2d91;
      --accent-soft: #f3e8ff;
      --focus: #0078d4;
      --edge-high: #5c2d91;
      --edge-medium: #0078d4;
      --edge-low: #8a8886;
      --danger: #a4262c;
      font-family: "Segoe UI", system-ui, sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1b1a19;
        --surface: #252423;
        --surface-muted: #201f1e;
        --border: #484644;
        --text: #f3f2f1;
        --muted: #c8c6c4;
        --accent: #c19bf5;
        --accent-soft: #3b2754;
        --focus: #60cdff;
        --edge-high: #c19bf5;
        --edge-medium: #60cdff;
        --edge-low: #a19f9d;
      }
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body {
      display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto;
      background: var(--bg); color: var(--text);
    }
    header, main, footer { min-width: 0; }
    body > header { grid-row: 1; }
    body > main { grid-row: 2; }
    body > footer { grid-row: 3; }
    header {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto;
      grid-template-areas: "brand identity workspaces utilities";
      align-items: center; gap: 10px 16px; padding: 10px 16px;
      border-bottom: 1px solid var(--border); background: var(--surface);
    }
    header > .studio-site-nav { grid-area: brand; gap: 8px; }
    header > .studio-theme-control { grid-area: utilities; justify-self: end; }
    .heading { grid-area: identity; min-width: 0; padding-left: 14px; border-left: 1px solid var(--border); }
    .app-title-row { min-width: 0; display: flex; align-items: center; gap: 8px; }
    .app-title-row h1 { flex: 1 1 100px; }
    h1 { min-width: 0; margin: 0; overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
    .runtime-badge {
      flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; min-height: 24px;
      border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px;
      color: var(--muted); background: var(--surface-muted); font-size: 10px; font-weight: 700;
    }
    .runtime-badge::before { width: 7px; height: 7px; border-radius: 50%; background: currentColor; content: ""; }
    .runtime-badge[data-tone="success"] { border-color: #107c10; color: #107c10; background: rgb(16 124 16 / .1); }
    .runtime-badge[data-tone="warning"] { border-color: #ca5010; color: #ca5010; background: rgb(202 80 16 / .1); }
    .runtime-badge[data-tone="busy"] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .runtime-badge[data-tone="error"] { border-color: var(--danger); color: var(--danger); background: rgb(164 38 44 / .1); }
    .runtime-action {
      flex: 0 0 auto; min-height: 24px; padding: 2px 8px;
      border-color: var(--accent); color: var(--accent); font-size: 10px; font-weight: 700;
    }
    .runtime-action[data-operation="stop-local"] { border-color: var(--danger); color: var(--danger); }
    .header-actions { grid-area: workspaces; justify-self: end; position: relative; display: flex; align-items: center; gap: 4px; padding: 4px; border: 1px solid var(--studio-line); border-radius: 8px; background: var(--studio-panel); }
    .header-actions > button { ${ACTION_BUTTON_STYLE} border: 1px solid transparent; background: transparent; color: var(--studio-muted); cursor: pointer; }
    .header-actions > button:hover { background: var(--studio-raised); color: var(--studio-ink); }
    .header-actions > button[aria-pressed="true"] { background: var(--studio-raised); color: var(--studio-ink); border-color: var(--studio-accent); }
    .header-actions > button:focus-visible { outline: 2px solid var(--studio-focus); outline-offset: -2px; }
    .map-palette {
      position: absolute; z-index: 3; top: 12px; right: 12px;
      display: flex; align-items: center; gap: 4px; max-width: calc(100% - 24px); padding: 4px;
      border: 1px solid var(--border); border-radius: 8px; background: var(--surface);
      box-shadow: 0 4px 16px rgb(0 0 0 / .12); font-size: 12px;
    }
    .map-palette > button, .map-palette .icon-group button { min-width: 36px; min-height: 36px; padding: 4px; }
    .map-palette svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
    .map-tools { position: static; }
    .map-tools > summary {
      min-height: 36px; display: flex; align-items: center; gap: 6px; padding: 4px 8px;
      border: 1px solid var(--border); border-radius: 4px; background: var(--surface); cursor: pointer; list-style: none;
    }
    .map-tools > summary::-webkit-details-marker { display: none; }
    .map-tools > summary::after { margin-left: 6px; content: "▾"; color: var(--muted); font-size: 10px; }
    .map-tools[open] > summary { border-color: var(--accent); }
    .toolbar {
      position: absolute; z-index: 5; top: calc(100% + 8px); right: 0;
      width: min(300px, calc(100cqw - 24px)); max-height: calc(100cqh - 80px); overflow: auto;
      display: grid; gap: 12px;
      padding: 12px; border: 1px solid var(--border); border-radius: 8px;
      background: var(--surface); box-shadow: 0 10px 28px rgb(0 0 0 / .18);
    }
    .toolbar > label:not(.map-inventory-toggle) { display: grid; gap: 4px; }
    .toolbar input:not([type="checkbox"]), .toolbar select { min-width: 0; width: 100%; }
    .toolbar > label:has(#entry-filter[hidden]) { display: none; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    input, select, button {
      min-height: 32px; border: 1px solid var(--border); border-radius: 4px;
      background: var(--surface); color: var(--text); font: inherit;
    }
    input { min-width: 210px; padding: 4px 9px; }
    select { padding: 4px 28px 4px 9px; }
    button { padding: 4px 10px; cursor: pointer; }
    #header-runtime-action, #app-status-badge {
      display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      height: 32px; min-height: 32px; padding: 0 10px;
      font: 600 12px/1 var(--font-sans, system-ui); white-space: nowrap;
    }
    #header-runtime-action { border-radius: 6px; }
    #observe-views {
      --studio-tab-count:2;
      flex:0 0 auto; align-self:stretch; margin:4px 0 0;
    }
    #structure-guidance {
      display: flex; flex: 0 0 auto; align-items: center; gap: 12px; margin: 0 12px 8px; padding: 8px 10px;
      border: 1px solid var(--border); border-radius: 6px; background: var(--surface); font-size: 12px; line-height: 1.5;
    }
    #structure-guidance p { flex: 1; min-width: 0; margin: 0; }
    #structure-guidance:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
    #close-structure-guidance { flex: none; width: 32px; height: 32px; padding: 7px; border: 0; background: transparent; }
    button:hover { border-color: var(--accent); }
    button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible {
      outline: 2px solid var(--focus); outline-offset: 2px;
    }
    .icon-group { display: inline-flex; }
    .icon-group button { border-radius: 0; min-width: 34px; }
    .icon-group button:first-child { border-radius: 4px 0 0 4px; }
    .icon-group button:last-child { border-radius: 0 4px 4px 0; }
    .map-inventory-toggle { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; cursor: pointer; }
    .map-inventory-toggle input { min-width: 16px; min-height: 16px; margin: 0; accent-color: var(--accent); }
    .flow-region.inventory > rect, .node.outside-flow > rect { stroke-dasharray: 5 4; }
    .node-operations { cursor: pointer; }
    .node-operations rect { fill: var(--surface-muted); stroke: var(--border); }
    .node-operations text { fill: var(--text); font-size: 10px; pointer-events: none; }
    .node-operations.hidden { display: none; }
    .node-operations.muted { opacity: .18; }
    .node-operations:hover rect, .node-operations:focus-visible rect { stroke: var(--focus); stroke-width: 2; }
    .edge.internal-edge text { display: none; }
    .edge.internal-edge:hover text, .edge.internal-edge:focus-visible text, .edge.internal-edge.selected text { display: block; }
    #entry-filter[hidden] { display: none; }
    main { position: relative; min-height: 0; display: flex; }
    #workspace-shell { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
    #workspace { position: relative; flex: 1; min-width: 0; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
    body[data-workspace="map"][data-inspecting="true"] #workspace { grid-template-rows: minmax(0, 1fr) 6px var(--details-height, 300px); }
    #guide-rail { flex: 0 0 280px; width: 280px; padding: 0; border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
    #guide-rail[data-collapsed="true"] { flex-basis: 46px; width: 46px; }
    #guide-rail[data-collapsed="true"] .guide-heading { padding: 6px 5px; border-bottom: 0; }
    #guide-rail[data-collapsed="true"] .guide-heading h2 { display: none; }
    .guide-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 5px 6px 14px; border-bottom: 1px solid var(--border); }
    #guide-rail .guide-heading h2 { margin: 0; font-size: 15px; }
    .guide-panel-icon { width: 20px; height: 20px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .guide-chevron { transform-origin: 8px 10px; }
    #action-center { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; margin-left: auto; padding: 6px; border: 0; background: transparent; flex: none; }
    #action-center:hover { background: var(--surface-muted); }
    #action-center[aria-expanded="false"] .guide-chevron { transform: scaleX(-1); }
    #guide-content { flex: 1; min-height: 0; overflow: auto; padding: 0 14px 16px; }
    #guide-content h3 { margin-top: 14px; }
    #guide-content .journey { margin: 10px 0; }
    #guide-content .journey-stage { padding-block: 8px; }
    #guide-shortcuts { display: grid; gap: 8px; padding: 4px 4px 12px; overflow: auto; }
    .guide-shortcut { position: relative; display: grid; place-items: center; width: 36px; min-height: 40px; padding: 7px; border: 0; background: transparent; color: var(--muted); }
    .guide-shortcut > svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
    .guide-shortcut:hover { background: var(--surface-muted); color: var(--text); }
    .guide-shortcut[data-current="true"] { background: var(--true-color-blue-muted); color: var(--true-color-blue); }
    .guide-shortcut:focus-visible { outline-offset: -2px; }
    .guide-state-icon { position: absolute; right: 0; bottom: 0; display: grid; place-items: center; min-width: 14px; height: 14px; border: 1px solid var(--border); border-radius: 50%; background: var(--surface); color: var(--muted); font: 700 10px/1 system-ui; }
    .guide-shortcut[data-state="complete"] .guide-state-icon { color: var(--true-color-green); }
    .guide-shortcut[data-state="attention"] .guide-state-icon { color: var(--true-color-orange); }
    .guide-shortcut[data-current="true"] .guide-state-icon { color: var(--true-color-blue); }
    #workspace > #details { min-height: 0; }
    body:not([data-workspace="map"]) #graph-shell,
    body:not([data-workspace="map"]) #details-resizer,
    body[data-workspace="map"][data-inspecting="false"] #details,
    body[data-workspace="map"][data-inspecting="false"] #details-resizer { display: none; }
    #graph-shell { position: relative; min-width: 0; min-height: 0; overflow: hidden; container-type: size; background: var(--surface-muted); }
    #graph { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
    #graph.panning { cursor: grabbing; }
    .flow-region > rect { fill: var(--surface); stroke: var(--border); }
    .flow-region.operations > rect { fill: var(--accent-soft); stroke: var(--accent); stroke-dasharray: 7 5; }
    .flow-region-title { fill: var(--text); font-size: 14px; font-weight: 650; }
    .flow-region-role { fill: var(--muted); font-size: 10px; }
    .flow-add { cursor: pointer; }
    .flow-add rect { fill: var(--surface-muted); stroke: var(--border); }
    .flow-add text { fill: var(--accent); font-size: 10px; font-weight: 650; pointer-events: none; }
    .flow-add:focus-visible rect { stroke: var(--focus); stroke-width: 2; }
    .flow-connect { cursor: pointer; }
    .flow-connect rect { fill: var(--accent-soft); stroke: var(--accent); }
    .flow-connect text { fill: var(--accent); font-size: 11px; font-weight: 650; pointer-events: none; }
    .flow-connect:hover rect, .flow-connect:focus-visible rect { fill: var(--accent); }
    .flow-connect:hover text, .flow-connect:focus-visible text { fill: #fff; }
    .flow-connect:focus-visible { outline: none; }
    .structure-editing :is(.flow-add, .flow-connect) rect { fill: var(--true-color-blue-muted); stroke: var(--true-color-blue); stroke-width: 2; }
    .structure-editing :is(.flow-add, .flow-connect) text { fill: var(--true-color-blue); }
    .edge { color: var(--edge-medium); }
    .edge.high { color: var(--edge-high); }
    .edge.low { color: var(--edge-low); }
    .edge path { fill: none; stroke: currentColor; stroke-width: 2; pointer-events: stroke; cursor: pointer; }
    .edge.medium path { stroke-dasharray: 9 5; }
    .edge.low path { stroke-dasharray: 3 6; }
    .edge text {
      fill: currentColor; font-size: 10px; font-weight: 600;
      paint-order: stroke; stroke: var(--surface-muted); stroke-width: 4px; stroke-linejoin: round; cursor: pointer;
    }
    .edge:focus-visible path, .edge.selected path { stroke: var(--focus); stroke-width: 4; }
    .node { cursor: pointer; }
    .node > rect { fill: var(--surface); stroke: var(--border); stroke-width: 1.5; filter: drop-shadow(0 2px 3px rgb(0 0 0 / .12)); }
    .node.project > rect { stroke: var(--accent); }
    .node:focus-visible > rect { stroke: var(--focus); stroke-width: 3; }
    .node.selected > rect { stroke: var(--focus); stroke-width: 3; }
    .node-title { fill: var(--text); font-size: 13px; font-weight: 650; }
    .node-meta { fill: var(--muted); font-size: 10px; }
    .node-badge { fill: var(--accent); font-size: 9px; font-weight: 600; }
    .node-tier { fill: var(--accent); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .node-visual { color: #5c2d91; overflow: visible; pointer-events: none; }
    .node-visual[data-tier-id="web"], .node-visual[data-tier-id="workflows"] { color: #0078d4; }
    .node-visual[data-tier-id="agent"], .node-visual[data-tier-id="sre"] { color: #8764b8; }
    .node-visual[data-tier-id="gateway"], .node-visual[data-tier-id="connectors"] { color: #4f6bed; }
    .node-visual[data-tier-id="skills"], .node-visual[data-tier-id="data"] { color: #038387; }
    .node-visual[data-tier-id="sandbox"] { color: #605e5c; }
    .node-visual-bg { fill: currentColor; opacity: .12; stroke: none; }
    .node-visual-shape {
      fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
    }
    .node-visual-fill { fill: currentColor; stroke: none; }
    .muted { opacity: .18; }
    .hidden { display: none; }
    #empty-state {
      position: absolute; inset: 0; display: none; place-items: center; pointer-events: none;
      color: var(--muted); font-weight: 600;
    }
    #details-resizer {
      position: relative; z-index: 3; cursor: row-resize; background: var(--border);
      touch-action: none;
    }
    #details-resizer::after {
      position: absolute; inset-inline: 0; top: -3px; height: 12px; content: "";
    }
    #details-resizer:hover, #details-resizer:focus-visible { background: var(--accent); outline: none; }
    body.resizing-details { cursor: row-resize; user-select: none; }
    #details, #guide-rail { min-width: 0; background: var(--surface); }
    #details { overflow: auto; padding: 16px; }
    :is(#details, #guide-rail) h2 { margin: 0 0 4px; font-size: 18px; }
    :is(#details, #guide-rail) h3 { margin: 18px 0 6px; font-size: 13px; }
    :is(#details, #guide-rail) p { margin: 4px 0 10px; color: var(--muted); font-size: 13px; line-height: 1.45; }
    :is(#details, #guide-rail) code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
    :is(#details, #guide-rail) ul { margin: 4px 0; padding-left: 18px; }
    :is(#details, #guide-rail) li { margin: 5px 0; font-size: 12px; overflow-wrap: anywhere; }
    .command-output { min-height: 96px; max-width: 100%; max-height: 440px; resize: vertical; overflow: auto; overflow-wrap: anywhere; padding: 10px; border-radius: 6px; background: #111; color: #f3f2f1; font: 11px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
    .command-output[hidden] { display: none; }
    .map-tools[open] > summary {
      background: var(--true-color-blue-muted, #ddf4ff);
      color: var(--true-color-blue, #0969da);
      border-color: var(--true-color-blue, #0969da);
    }
    .endpoint-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px 12px; padding: 10px 12px; margin: 6px 0; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
    .endpoint-row strong { font-size: 12px; font-weight: 600; }
    .endpoint-row code, .endpoint-row small { grid-column: 1 / -1; overflow-wrap: anywhere; font-size: 11px; color: var(--muted); }
    .endpoint-row button { grid-column: 2; grid-row: 1; }
    .endpoint-heading { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .endpoint-status { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: var(--muted); }
    .endpoint-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .endpoint-row[data-ready="true"] .endpoint-status { color: var(--true-color-green, #1a7f37); }
    .connection-summary { display: block; font-size: 12px; font-weight: normal; margin-top: 4px; overflow-wrap: anywhere; }
    .live-output { min-height: 200px; }
    .command-feed { max-height: 320px; overflow: auto; }
    .command-record { border-left: 3px solid var(--border); padding: 8px; margin: 6px 0; overflow-wrap: anywhere; }
    .command-record[data-status="running"] { border-color: var(--accent); }
    .command-record[data-status="failed"] { border-color: var(--danger); }
    .command-record[data-status="succeeded"] { border-color: var(--true-color-green, #1a7f37); }
    .developer-tool-card {
      display: grid; gap: 9px; margin-top: 12px; padding: 12px;
      border: 1px solid var(--border); border-radius: 8px; background: var(--surface);
    }
    .developer-tool-card > strong { font-size: 14px; }
    .developer-tool-card > p { margin: 0; }
    .tool-status { width: fit-content; border-radius: 999px; padding: 3px 7px; background: var(--accent-soft); color: var(--accent); font-size: 10px; font-weight: 700; }
    .tool-status.ready { background: rgb(16 124 16 / .1); color: #107c10; }
    .setup-steps { margin: 0; padding-left: 22px; color: var(--text); }
    .setup-steps li { margin: 3px 0; font-size: 12px; }
    .agent-tester { display: grid; gap: 9px; }
    .agent-tester textarea {
      width: 100%; min-width: 0; box-sizing: border-box; min-height: 76px; resize: vertical; border: 1px solid var(--border);
      border-radius: 7px; padding: 9px; color: var(--text); background: var(--surface); font: 12px/1.5 var(--font-sans, system-ui);
    }
    .agent-response { max-height: 240px; overflow: auto; white-space: pre-wrap; font: 11px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .panel-back { min-height: auto; margin: 0 0 12px; padding: 0; border: 0; color: var(--accent); background: transparent; font-size: 12px; }
    body[data-workspace="map"] #details .panel-back { position: sticky; top: 0; float: right; z-index: 1; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; margin: 0 0 8px 16px; padding: 7px; background: var(--surface); border: 1px solid var(--border); }
    .journey { display: grid; grid-template-columns: minmax(0, 1fr); margin: 14px 0 18px; }
    .journey-stage { position: relative; min-width: 0; padding: 10px 10px 12px 34px; }
    .journey-stage::before {
      position: absolute; z-index: 1; top: 14px; left: 7px; width: 12px; height: 12px;
      border: 2px solid var(--border); border-radius: 50%; background: var(--surface); content: "";
    }
    .journey-stage:not(:last-child)::after {
      position: absolute; top: 24px; bottom: -20px; left: 12px; width: 2px;
      background: var(--border); content: "";
    }
    .journey-stage.complete:not(:last-child)::after { background: #107c10; }
    .journey-stage.next, .journey-stage.ready, .journey-stage.active { border-radius: 7px; background: var(--accent-soft); }
    .journey-stage strong { display: block; font-size: 12px; line-height: 1.3; }
    .journey-stage-action { display: block; width: 100%; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; white-space: normal; }
    .journey-stage-action strong { text-decoration: underline; text-underline-offset: 3px; }
    .journey-stage-action:hover { background: var(--surface-muted); }
    .journey-detail { display: block; margin-top: 6px; color: var(--muted); font-size: 10px; line-height: 1.35; }
    .journey-state { display: block; margin-bottom: 4px; color: var(--muted); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .journey-stage.complete::before { border-color: #107c10; background: #107c10; }
    .journey-stage.complete .journey-state { color: #107c10; }
    .journey-stage.next::before, .journey-stage.ready::before { border-color: var(--accent); background: var(--accent); }
    .journey-stage.next .journey-state, .journey-stage.ready .journey-state { color: var(--accent); }
    .journey-stage.active::before { border-color: #107c10; background: #107c10; }
    .journey-stage.active .journey-state { color: #107c10; }
    .journey-stage.attention::before { border-color: #ca5010; }
    .action-list { display: grid; gap: 9px; }
    .action-card { padding: 11px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-muted); }
    .action-card.required { border-left: 4px solid var(--danger); }
    .action-card.attention { border-left: 4px solid #ca5010; }
    .action-card.recommended { border-left: 4px solid var(--accent); }
    .action-card.optional { border-left: 4px solid var(--border); }
    .action-card strong { display: block; font-size: 13px; }
    .action-card p { margin: 5px 0 9px; font-size: 11px; }
    .action-card progress { width: 100%; height: 8px; accent-color: var(--accent); }
    .action-priority { display: block; margin-bottom: 5px; color: var(--muted); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
    .run-card { margin-bottom: 14px; }
    .more-guidance { margin-top: 10px; }
    .more-guidance > summary, .management-section > summary { cursor: pointer; color: var(--muted); font-size: 12px; font-weight: 600; }
    .more-guidance .action-list { margin-top: 9px; }
    .management-section { margin-top: 14px; padding: 11px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-muted); }
    .management-section[open] > summary { color: var(--text); }
    .management-section > .section-body { min-width: 0; margin-top: 10px; }
    .management-section .action-list { min-width: 0; grid-template-columns: minmax(0, 1fr); }
    .management-section select,
    .management-section .action-list > button { width: 100%; min-width: 0; max-width: 100%; }
    .management-section .actions { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr); }
    .management-section .actions > button { width: 100%; min-width: 0; white-space: normal; }
    .detail-badges { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0; }
    .detail-badge { border-radius: 999px; background: var(--accent-soft); color: var(--accent); padding: 3px 7px; font-size: 11px; font-weight: 600; }
    .studio-action { ${ACTION_BUTTON_STYLE} }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .actions button.primary { border-color: var(--accent); background: var(--accent); color: #fff; }
    .actions button.setup-action { width: 100%; font-weight: 650; }
    button.danger { border-color: var(--danger); color: var(--danger); }
    .error { color: var(--danger); }
    footer {
      display: flex; justify-content: space-between; gap: 12px; padding: 5px 12px;
      border-top: 1px solid var(--border); background: var(--surface); color: var(--muted); font-size: 11px;
    }
    footer > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (max-width: 960px) {
      header {
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas: "brand identity utilities" "workspaces workspaces workspaces";
      }
      .header-actions { justify-self: start; }
    }
    @media (max-width: 900px) {
      #workspace-shell { margin-right: 46px; }
      #guide-rail { position: absolute; z-index: 5; right: 0; inset-block: 0; width: min(280px, 90vw); box-shadow: -8px 0 24px rgb(0 0 0 / .18); }
    }
    @media (max-width: 680px) {
      header {
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-areas: "brand utilities" "identity identity" "workspaces workspaces";
        gap: 8px 10px; padding: 8px 12px;
      }
      .heading { padding-left: 0; border-left: 0; }
      .header-actions { width: 100%; }
      .header-actions > button { flex: 1; min-width: max-content; }
    }
    @media (max-width: 620px) {
      aside {
        position: static; width: 100%; height: auto; border-top: 1px solid var(--border);
        border-left: 0; box-shadow: none;
      }
      footer > :last-child { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      * { scroll-behavior: auto !important; transition: none !important; }
    }
    ${STUDIO_TABS_CSS}
    ${RUN_PANEL_CONTENT_CSS}
    ${BUILD_PANEL_CONTENT_CSS}
    ${COMPONENT_LOGS_CSS}
    ${APP_LOGS_CSS}
    ${renderThemeStyles()}
  </style>
</head>
<body>
  <header>
    <div class="studio-site-nav" role="navigation" aria-label="Unity Studio navigation">
      ${renderStudioBrand()}
    </div>
    <div class="heading">
      <div class="app-title-row">
        <h1 title="${escapeHtml(appName)}">${escapeHtml(appName)}</h1>
        <button id="app-status-badge" class="runtime-badge" data-tone="busy" type="button" aria-live="polite">Checking status</button>
        <button id="header-runtime-action" class="runtime-action" type="button" disabled>Checking…</button>
      </div>
    </div>
    <div class="header-actions" role="group" aria-label="App workspaces">
      <button id="build-app" type="button" aria-pressed="true" aria-controls="workspace-shell">Build</button>
      <button id="manage-app" type="button" aria-pressed="false" aria-controls="workspace-shell">Run &amp; Debug</button>
      <button id="map-app" type="button" aria-pressed="false" aria-controls="workspace-shell">Observe</button>
    </div>
    ${renderThemeToggle(theme)}
  </header>
  <main>
    <section id="workspace-shell" role="region" aria-labelledby="build-app">
    <div id="observe-views" class="workspace-tabs studio-tabs" role="tablist" aria-label="Observe views" hidden>
      <button id="map-view" class="studio-tab" role="tab" type="button" aria-label="App Map" aria-selected="true" aria-controls="workspace"><span class="studio-tab-main"><span class="studio-tab-icon studio-tab-icon--map" aria-hidden="true"></span><span class="studio-tab-label">App Map</span></span></button>
      <button id="logs-app" class="studio-tab" role="tab" type="button" aria-label="Logs" aria-selected="false" aria-controls="workspace" tabindex="-1"><span class="studio-tab-main"><span class="studio-tab-icon studio-tab-icon--logs" aria-hidden="true"></span><span class="studio-tab-label">Logs</span></span></button>
    </div>
    <section id="structure-guidance" aria-label="App structure guidance" tabindex="-1" hidden>
      <p><strong>Edit app structure.</strong> Use <strong>+ Add component</strong> within a stage, or <strong>Connect</strong> between stages. Changes are reviewed before they are applied.</p>
      <button id="close-structure-guidance" type="button" aria-label="Dismiss app structure guidance" title="Dismiss app structure guidance"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
    </section>
    <section id="workspace" aria-label="App workspace">
    <div id="graph-shell">
      <nav class="map-palette" aria-label="App Map controls">
      <details class="map-tools">
        <summary><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="m12 12 5 5"/></svg>Search &amp; layout</summary>
        <div class="toolbar" role="group" aria-label="Search and layout options">
          <label><span>Search nodes</span><input id="search" type="search" placeholder="Find a component…" aria-label="Search nodes"></label>
          <label><span>Component type</span><select id="tier-filter" aria-label="Filter by tier"><option value="">All component types</option>${tierOptions}</select></label>
          <label><span>Request entry point</span><select id="entry-filter" aria-label="Request entry point"><option value="">All request paths</option></select></label>
          <label class="map-inventory-toggle" title="Include resources outside discovered request paths. Expand workflow cards for their internal items. This is source evidence, not live usage.">
            <input id="show-other-resources" type="checkbox" aria-controls="graph-shell">
            <span>Show other resources (<span id="other-resource-count">${model.requestFlow.otherResourceCount}</span>)</span>
          </label>
          <button id="reset-layout" type="button">Reset map</button>
        </div>
      </details>
      <div class="icon-group" aria-label="Zoom controls">
        <button id="zoom-out" type="button" aria-label="Zoom out" title="Zoom out">−</button>
        <button id="zoom-in" type="button" aria-label="Zoom in" title="Zoom in">+</button>
      </div>
      <button id="fit" type="button" aria-label="Fit map" title="Fit map"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4"/></svg></button>
      </nav>
      <svg id="graph" role="application" aria-label="Interactive source-derived Unity application graph">
        <defs>
          <marker id="arrow-high" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"><path d="M0,0 L9,3.5 L0,7 z" fill="var(--edge-high)"></path></marker>
          <marker id="arrow-medium" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"><path d="M0,0 L9,3.5 L0,7 z" fill="var(--edge-medium)"></path></marker>
          <marker id="arrow-low" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"><path d="M0,0 L9,3.5 L0,7 z" fill="var(--edge-low)"></path></marker>
        </defs>
        <g id="viewport">
          <g id="lanes"></g>
          <g id="edges"></g>
          <g id="nodes"></g>
        </g>
      </svg>
      <div id="empty-state">No nodes match the current filters.</div>
    </div>
    <div id="details-resizer" role="separator" aria-label="Resize details panel" aria-orientation="horizontal" aria-controls="details" tabindex="0"></div>
    <section id="details" aria-label="Workspace content" aria-live="polite" data-empty="false"></section>
    </section>
    </section>
    <aside id="guide-rail" aria-label="Guide">
      <div class="guide-heading">
        <h2>Guide</h2>
        <button id="action-center" type="button" aria-expanded="true" aria-controls="guide-content" aria-label="Collapse Guide" title="Collapse Guide">${guideIcon}</button>
      </div>
      <div id="guide-shortcuts" role="group" aria-label="Guide progress" hidden>${guideShortcutsHtml}</div>
      <div id="guide-content"></div>
    </aside>
  </main>
  <footer>
    <span id="status" role="status">${escapeHtml(model.summary.projectNodes)} projects · ${escapeHtml(model.summary.operationNodes)} operations · ${escapeHtml(model.summary.edges)} edges</span>
    <span id="map-context">Evidence-backed request flow · dashed paths need confirmation</span>
  </footer>
  <noscript><main class="noscript">${renderNoScriptFallback(model)}</main></noscript>
  <script>
    "use strict";
    const MODEL = ${safeJson(model)};
    const INITIAL_EDITOR_SETTINGS = ${safeJson(editorSettings)};
    const API_TOKEN = ${safeJson(apiToken)};
    const SERVICE_LOG_TIERS = new Set(${safeJson([...RUNTIME_TIERS])});
    const mountAppLogs = (${createAppLogsPanel.toString()});
    let appLogs = null;
    let launchNotice = new URLSearchParams(location.search).get("notice") || "";
    const NS = "http://www.w3.org/2000/svg";
    const WORLD_PADDING = 24;
    const LANE_HEADER = 62;
    const NODE_WIDTH = 206;
    const NODE_HEIGHT = 96;
    const NODE_STEP = 122;
    const MIN_WORLD_HEIGHT = 680;
    const FLOW_REGION_GAP = 100;
    const FLOW_CARD_GAP = 18;
    const FLOW_ACTION_FOOTER = 48;
    const WHEEL_ZOOM_SENSITIVITY = .0015;
    const graphShell = document.querySelector("#graph-shell");
    const svg = document.querySelector("#graph");
    const viewport = document.querySelector("#viewport");
    const lanesLayer = document.querySelector("#lanes");
    const edgesLayer = document.querySelector("#edges");
    const nodesLayer = document.querySelector("#nodes");
    const detailsResizer = document.querySelector("#details-resizer");
    const details = document.querySelector("#details");
    const workspace = document.querySelector("#workspace");
    const guideRail = document.querySelector("#guide-rail");
    const guideContent = document.querySelector("#guide-content");
    const guidePreferenceKey = "unity-workspace:" + MODEL.root + ":guide-collapsed";
    const savedGuidePreference = localStorage.getItem(guidePreferenceKey);
    let guideExplicitChoice = savedGuidePreference !== null;
    let guideCollapsed = savedGuidePreference === "true" || (savedGuidePreference === null && window.innerWidth <= 900);
    const status = document.querySelector("#status");
    const appStatusBadge = document.querySelector("#app-status-badge");
    const headerRuntimeAction = document.querySelector("#header-runtime-action");
    const mapContext = document.querySelector("#map-context");
    const structureGuidance = document.querySelector("#structure-guidance");
    const search = document.querySelector("#search");
    const tierFilter = document.querySelector("#tier-filter");
    const entryFilter = document.querySelector("#entry-filter");
    const otherResourcesToggle = document.querySelector("#show-other-resources");
    const otherResourcesKey = "unity-workspace:" + MODEL.root + ":show-other-resources";
    otherResourcesToggle.checked = localStorage.getItem(otherResourcesKey) === "true";
    const resetLayoutButton = document.querySelector("#reset-layout");
    const nodeById = new Map(MODEL.nodes.map((node) => [node.id, node]));
    const tierById = new Map(MODEL.tiers.map((tier) => [tier.id, tier]));
    const flowEdgeById = new Map([...MODEL.requestFlow.edges, ...MODEL.requestFlow.otherEdges].map((edge) => [edge.id, edge]));
    const otherNodeIds = new Set(MODEL.requestFlow.otherNodeIds);
    const operationGroups = new Map(MODEL.requestFlow.operationGroups.map((group) => [group.parentId, group]));
    const operationParents = new Map(MODEL.requestFlow.operationGroups.flatMap((group) =>
      group.nodeIds.map((id) => [id, group.parentId])));
    const otherResourceIds = MODEL.requestFlow.otherNodeIds.filter((id) => !operationParents.has(id));
    const expandedOperations = new Set();
    const operationCameras = new Map();
    const operationRegions = new Map();
    const operationToggleElements = new Map();
    const edgeBundles = new Map();
    const nodeElements = new Map();
    const nodeLogElements = new Map();
    const edgeElements = new Map();
    const positions = new Map();
    const defaultPositions = new Map();
    let runtimeEntrypoints = [];
    let operationalState = { app: null, readiness: null };
    let portReview = null;
    let portBusy = false;
    let portMessage = "";
    let portError = false;
    let gatewayState = null;
    let operationalFingerprint = "";
    let lifecycleOperation = null;
    let agentPromptDraft = "";
    let agentResponseText = "The agent response will appear here.";
    let invokingAgent = false;
    let agentDocument = null;
    let documentInputExpanded = false;
    let documentError = "";
    let documentLoading = false;
    let documentReadVersion = 0;
    let documentTesting = false;
    let documentResultText = "";
    let documentAssessment = null;
    let documentAssessmentEpoch = 0;
    let latestOutput = "Waiting for command output.";
    let latestCommands = [];
    let agentToolActivity = [];
    let agentRawResponse = "";
    let outputRefreshing = false;
    let operationalRefreshing = false;
    let selectedSubscriptionId = "";
    const gatewayDiscovery = (${createDiscoveryTracker.toString()})();
    let selectedGateway = null;
    let selectedModel = "";
    let gatewayApplying = false;
    let panelMode = "build";
    let observeView = "map";
    ${BUILD_SYNTAX_SCRIPT}
    let deleteConfirming = false;
    let deletingApp = false;
    let deleteError = "";
    const buildPanel = (${createBuildPanel.toString()})({
      container: details, root: MODEL.root, request: apiRequest, syntax: buildSyntax, editorSettings: INITIAL_EDITOR_SETTINGS,
      isActive: () => panelMode === "build",
      onRun: () => {
        renderManagePanel();
        details.querySelector(".agent-tester")?.scrollIntoView({ block: "start" });
        details.querySelector('[aria-label="Agent message"]')?.focus();
      },
      onModel: () => openAppSettings("connection"),
    });
    window.addEventListener("unity-editor-settings-change", (event) => buildPanel.setEditorSettings(event.detail));
    const runWorkspace = (${createRunWorkspace.toString()})({
      container: details,
      renderTry: renderTryApp,
      renderServices: renderRuntimeServices,
      renderDeployment,
      renderOutput: (container) => {
        const actions = appendText(container, "div", "", "run-section-actions");
        appendText(actions, "h3", "Command output");
        actions.append(actionButton("Open all logs", () => renderLogsPanel()));
        const output = appendText(container, "pre", latestOutput, "command-output live-output");
        output.dataset.runtimeOutput = "true";
        output.dataset.runScrollKey = "output";
        output.tabIndex = 0;
        output.setAttribute("aria-label", "Runtime output");
      },
      renderOperations: (container) => {
        const actions = appendText(container, "div", "", "run-section-actions");
        appendText(actions, "p", "Recorded Azure, shell, and HTTP operations. Message bodies and credentials are omitted.");
        actions.append(actionButton("Open all logs", () => renderLogsPanel()));
        appendText(container, "h3", "Operations");
        const feed = appendText(container, "div", "", "command-feed");
        feed.dataset.commandFeed = "true";
        feed.dataset.runScrollKey = "operations";
        renderCommandFeed(feed);
      },
      onConnection: () => openAppSettings("connection"),
    });
    let selectedId = null;
    let selectedEdgeId = null;
    let panState = null;
    let detailsResizeState = null;
    let detailsPanelHeight = 300;
    const ACTIVE_LIFECYCLE_STATES = ["starting", "stopping", "configuring", "provisioning", "deploying"];
    let transform = { x: 0, y: 0, scale: 1 };
    let mapHasFitted = false;

    let worldWidth = 0;
    let worldHeight = MIN_WORLD_HEIGHT;
    let operationsY = 0;
    let operationsBottom = 0;
    let inventoryY = 0;
    let inventoryBottom = 0;

    function svgElement(name, attributes = {}) {
      const element = document.createElementNS(NS, name);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
      return element;
    }

    function shorten(value, length) {
      const text = String(value ?? "");
      return text.length > length ? text.slice(0, Math.max(1, length - 1)) + "…" : text;
    }

    function humanize(value) {
      return String(value ?? "").replaceAll("-", " ");
    }

    function appendNodeVisual(parent, tierId) {
      const visual = svgElement("svg", {
        x: NODE_WIDTH - 46,
        y: 10,
        width: 36,
        height: 36,
        viewBox: "0 0 36 36",
        class: "node-visual",
        "data-tier-id": tierId,
        "aria-hidden": "true",
      });
      visual.append(svgElement("rect", {
        x: 0,
        y: 0,
        width: 36,
        height: 36,
        rx: 9,
        class: "node-visual-bg",
      }));
      const shape = (name, attributes) => visual.append(svgElement(name, {
        ...attributes,
        class: "node-visual-shape",
      }));
      const fill = (name, attributes) => visual.append(svgElement(name, {
        ...attributes,
        class: "node-visual-fill",
      }));
      switch (tierId) {
        case "web":
          shape("rect", { x: 8, y: 9, width: 20, height: 15, rx: 2 });
          shape("path", { d: "M13 28h10M18 24v4" });
          break;
        case "agent":
          shape("circle", { cx: 17, cy: 18, r: 8 });
          shape("path", { d: "M17 10v16M10 18h14M12 13c3 2 7 2 10 0M12 23c3-2 7-2 10 0" });
          fill("path", { d: "M27 7l1.1 2.9L31 11l-2.9 1.1L27 15l-1.1-2.9L23 11l2.9-1.1z" });
          break;
        case "gateway":
          shape("path", { d: "M18 7l9 4v6c0 6-3.8 10-9 12-5.2-2-9-6-9-12v-6z" });
          shape("path", { d: "M13 18h10M20 14l4 4-4 4" });
          break;
        case "skills":
          shape("path", { d: "M9 11h7v5h5v-5h6v7h-5v6h5v4H9v-7h5v-5H9z" });
          break;
        case "sandbox":
          shape("rect", { x: 7, y: 8, width: 22, height: 20, rx: 3 });
          shape("path", { d: "M7 13h22M11 18l3 3-3 3M17 24h6" });
          break;
        case "connectors":
          shape("path", { d: "M14 11l-3-3M22 25l3 3M12 22l-2 2a5 5 0 007 7l3-3M24 14l2-2a5 5 0 00-7-7l-3 3M13 23l10-10" });
          break;
        case "workflows":
          shape("circle", { cx: 10, cy: 10, r: 3 });
          shape("circle", { cx: 26, cy: 18, r: 3 });
          shape("circle", { cx: 10, cy: 27, r: 3 });
          shape("path", { d: "M13 10h4a5 5 0 015 5v0M22 21v1a5 5 0 01-5 5h-4" });
          break;
        case "sre":
          shape("path", { d: "M7 19h5l3-7 5 13 3-6h6" });
          shape("circle", { cx: 18, cy: 18, r: 12 });
          break;
        case "data":
          shape("ellipse", { cx: 18, cy: 10, rx: 10, ry: 4 });
          shape("path", { d: "M8 10v8c0 2 4.5 4 10 4s10-2 10-4v-8M8 18v8c0 2 4.5 4 10 4s10-2 10-4v-8" });
          break;
        default:
          shape("rect", { x: 9, y: 9, width: 18, height: 18, rx: 4 });
          shape("path", { d: "M14 18h8M18 14v8" });
      }
      parent.append(visual);
    }

    function updateAppStatusBadge() {
      const appState = operationalState.app?.state;
      let label = "Not running";
      let tone = "neutral";
      if (!operationalState.app) {
        label = "Checking status";
        tone = "busy";
      } else if (appState === "running") {
        const previewMode = operationalState.readiness?.mode === "preview";
        label = previewMode ? "Local preview" : "Running locally";
        tone = previewMode ? "warning" : "success";
      } else if (appState === "starting") {
        label = operationalState.app.recovered ? "Partial startup" : "Starting locally";
        tone = operationalState.app.recovered ? "warning" : "busy";
      } else if (appState === "stopping") {
        label = "Stopping";
        tone = "busy";
      } else if (appState === "configuring") {
        label = "Configuring";
        tone = "busy";
      } else if (appState === "provisioning") {
        label = "Provisioning Azure";
        tone = "busy";
      } else if (appState === "deploying") {
        label = "Deploying to Azure";
        tone = "busy";
      } else if (appState === "failed") {
        label = "Needs attention";
        tone = "error";
      }
      appStatusBadge.textContent = label;
      appStatusBadge.dataset.tone = tone;
      appStatusBadge.title = "Open local runtime controls";
      appStatusBadge.setAttribute("aria-label", "App status: " + label + ". Open Run/Debug.");

      let actionLabel = "Set up";
      let operation = "";
      let disabled = false;
      if (!operationalState.app) {
        actionLabel = "Checking…";
        disabled = true;
      } else if (appState === "running") {
        actionLabel = "Stop app";
        operation = "stop-local";
      } else if (appState === "starting") {
        actionLabel = operationalState.app.recovered ? "Stop partial startup" : "Cancel startup";
        operation = "stop-local";
      } else if (ACTIVE_LIFECYCLE_STATES.includes(appState)) {
        actionLabel = appState === "starting"
          ? "Starting…"
          : appState === "stopping"
            ? "Stopping…"
            : humanize(appState) + "…";
        disabled = true;
      } else if (operationalState.readiness?.ready) {
        actionLabel = operationalState.readiness.mode === "preview"
          ? "Start preview"
          : "Start app";
        operation = "run-local";
      }
      headerRuntimeAction.textContent = actionLabel;
      headerRuntimeAction.disabled = disabled;
      headerRuntimeAction.dataset.operation = operation;
      headerRuntimeAction.setAttribute("aria-label", actionLabel);
    }

    function detailsHeightMaximum() {
      return Math.max(80, Math.floor(workspace.clientHeight * .6));
    }

    function setDetailsPanelHeight(value, persist = false) {
      const maximum = detailsHeightMaximum();
      const minimum = Math.min(180, maximum);
      detailsPanelHeight = Math.round(Math.max(minimum, Math.min(maximum, value)));
      document.documentElement.style.setProperty("--details-height", detailsPanelHeight + "px");
      detailsResizer.setAttribute("aria-valuemin", String(minimum));
      detailsResizer.setAttribute("aria-valuemax", String(maximum));
      detailsResizer.setAttribute("aria-valuenow", String(detailsPanelHeight));
      if (persist) {
        try { localStorage.setItem(MODEL.layoutKey + ":details-height", String(detailsPanelHeight)); }
        catch (error) { setStatus("Could not remember inspector height: " + error.message, true); }
      }
    }

    function normalized(value) {
      return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    }

    function applyTransform() {
      viewport.setAttribute("transform", "translate(" + transform.x + " " + transform.y + ") scale(" + transform.scale + ")");
    }

    function setStatus(message, isError = false) {
      status.textContent = message;
      status.classList.toggle("error", isError);
    }

    function requestFlowLayout() {
      const maxGroupRows = Math.max(1, ...MODEL.requestFlow.groups.map((group) =>
        Math.ceil(group.nodeIds.length / flowGroupColumns(group))));
      const flowBodyHeight = Math.max(
        500 + FLOW_ACTION_FOOTER,
        LANE_HEADER + 48 + maxGroupRows * NODE_STEP + FLOW_ACTION_FOOTER,
      );
      const operationRows = Math.max(1, Math.ceil(MODEL.requestFlow.operations.length / 4));
      const operationsHeight = 72 + operationRows * NODE_STEP + FLOW_ACTION_FOOTER;
      worldWidth = WORLD_PADDING * 2 +
        MODEL.requestFlow.groups.reduce((total, group) => total + flowGroupWidth(group), 0) +
        (MODEL.requestFlow.groups.length - 1) * FLOW_REGION_GAP;
      operationsY = flowBodyHeight + FLOW_REGION_GAP;
      operationsBottom = operationsY + operationsHeight;
      inventoryY = operationsBottom + FLOW_REGION_GAP;
      worldHeight = operationsBottom + WORLD_PADDING;
      MODEL.requestFlow.groups.forEach((group, groupIndex) => {
        group.nodeIds.forEach((nodeId, nodeIndex) => {
          const columns = flowGroupColumns(group);
          const column = nodeIndex % columns;
          const row = Math.floor(nodeIndex / columns);
          defaultPositions.set(nodeId, {
            x: flowGroupX(groupIndex) + 32 + column * (NODE_WIDTH + FLOW_CARD_GAP),
            y: LANE_HEADER + 44 + row * NODE_STEP,
          });
        });
      });
      MODEL.requestFlow.operations.forEach((nodeId, nodeIndex) => {
        const column = nodeIndex % 4;
        const row = Math.floor(nodeIndex / 4);
        const slotWidth = (worldWidth - WORLD_PADDING * 2) / 4;
        defaultPositions.set(nodeId, {
          x: WORLD_PADDING + column * slotWidth + (slotWidth - NODE_WIDTH) / 2,
          y: operationsY + 52 + row * NODE_STEP,
        });
      });
      if (otherResourcesToggle.checked && otherResourceIds.length) {
        const columns = Math.max(1, Math.floor((worldWidth - WORLD_PADDING * 2 - 64 + FLOW_CARD_GAP) / (NODE_WIDTH + FLOW_CARD_GAP)));
        otherResourceIds.forEach((nodeId, index) => {
          defaultPositions.set(nodeId, {
            x: WORLD_PADDING + 32 + (index % columns) * (NODE_WIDTH + FLOW_CARD_GAP),
            y: inventoryY + 72 + Math.floor(index / columns) * NODE_STEP,
          });
        });
        worldHeight = inventoryY + 72 + Math.ceil(otherResourceIds.length / columns) * NODE_STEP + WORLD_PADDING;
      }
      inventoryBottom = worldHeight;
      operationRegions.clear();
      const requestPath = selectedRequestPath();
      for (const group of operationGroups.values()) {
        if (!expandedOperations.has(group.parentId) ||
          !(otherResourcesToggle.checked && otherNodeIds.has(group.parentId) || requestPath.has(group.parentId))) continue;
        const columns = Math.min(2, group.nodeIds.length);
        const contentWidth = columns * NODE_WIDTH + (columns - 1) * 80;
        const bounds = {
          x: (worldWidth - contentWidth - 128) / 2, y: worldHeight + 32, width: contentWidth + 128,
          height: 80 + Math.ceil(group.nodeIds.length / columns) * (NODE_HEIGHT + 72),
        };
        operationRegions.set(group.parentId, bounds);
        group.nodeIds.forEach((id, index) => defaultPositions.set(id, {
          x: (worldWidth - contentWidth) / 2 + (index % columns) * (NODE_WIDTH + 80),
          y: bounds.y + 80 + Math.floor(index / columns) * (NODE_HEIGHT + 72),
        }));
        worldHeight = bounds.y + bounds.height + WORLD_PADDING;
      }
      for (const node of MODEL.nodes) {
        positions.set(node.id, defaultPositions.get(node.id) || {
          x: WORLD_PADDING,
          y: worldHeight - WORLD_PADDING - NODE_HEIGHT,
        });
      }
    }

    function flowGroupColumns(group) {
      return group.nodeIds.length > 4 ? 2 : 1;
    }

    function flowGroupWidth(group) {
      const columns = flowGroupColumns(group);
      return columns * NODE_WIDTH + (columns - 1) * FLOW_CARD_GAP + 64;
    }

    function flowGroupX(groupIndex) {
      return WORLD_PADDING + MODEL.requestFlow.groups
        .slice(0, groupIndex)
        .reduce((x, group) => x + flowGroupWidth(group) + FLOW_REGION_GAP, 0);
    }

    function appendFlowAdd(parent, x, y, label, tierIds) {
      const add = svgElement("g", {
        class: "flow-add",
        tabindex: "0",
        role: "button",
        "aria-label": "Add component to " + label,
      });
      add.append(svgElement("rect", { x, y, width: 88, height: 24, rx: 4 }));
      const addText = svgElement("text", { x: x + 44, y: y + 16, "text-anchor": "middle" });
      addText.textContent = "+ Add component";
      add.append(addText);
      const open = () => {
        const tiers = tierIds.map((tierId) => tierById.get(tierId)).filter(Boolean);
        if (tiers.length === 1) {
          renderTierAddPanel(tiers[0]);
          return;
        }
        renderAddToAppPanel(tierIds, label);
      };
      add.addEventListener("pointerdown", (event) => event.stopPropagation());
      add.addEventListener("click", open);
      add.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open();
      });
      parent.append(add);
    }

    function appendFlowConnection(sourceGroup, targetGroup, sourceIndex) {
      const width = 76;
      const height = 28;
      const x = flowGroupX(sourceIndex) + flowGroupWidth(sourceGroup) +
        (FLOW_REGION_GAP - width) / 2;
      const y = WORLD_PADDING + 58;
      const connection = svgElement("g", {
        class: "flow-connect",
        tabindex: "0",
        role: "button",
        "aria-label": "Connect " + sourceGroup.label + " to " + targetGroup.label,
      });
      connection.append(svgElement("rect", { x, y, width, height, rx: 14 }));
      const text = svgElement("text", {
        x: x + width / 2,
        y: y + 18,
        "text-anchor": "middle",
      });
      text.textContent = "Connect →";
      connection.append(text);
      const open = () => renderConnectionPanel(sourceGroup, targetGroup);
      connection.addEventListener("pointerdown", (event) => event.stopPropagation());
      connection.addEventListener("click", open);
      connection.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open();
      });
      lanesLayer.append(connection);
    }

    function renderFlowRegions() {
      MODEL.requestFlow.groups.forEach((group, index) => {
        const x = flowGroupX(index);
        const region = svgElement("g", { class: "flow-region", "data-flow-group": group.id });
        region.append(svgElement("rect", {
          x,
          y: WORLD_PADDING,
          width: flowGroupWidth(group),
          height: operationsY - FLOW_REGION_GAP - WORLD_PADDING,
          rx: 10,
        }));
        const title = svgElement("text", { x: x + 16, y: WORLD_PADDING + 25, class: "flow-region-title" });
        title.textContent = (index + 1) + ". " + group.label;
        region.append(title);
        const role = svgElement("text", { x: x + 16, y: WORLD_PADDING + 44, class: "flow-region-role" });
        role.textContent = shorten(group.role, 40);
        region.append(role);
        appendFlowAdd(
          region,
          x + (flowGroupWidth(group) - 88) / 2,
          operationsY - FLOW_REGION_GAP - 38,
          group.label,
          group.tierIds,
        );
        lanesLayer.append(region);
      });
      for (let index = 0; index < MODEL.requestFlow.groups.length - 1; index += 1) {
        appendFlowConnection(
          MODEL.requestFlow.groups[index],
          MODEL.requestFlow.groups[index + 1],
          index,
        );
      }
      const operations = svgElement("g", { class: "flow-region operations" });
      operations.append(svgElement("rect", {
        x: WORLD_PADDING,
        y: operationsY,
        width: worldWidth - WORLD_PADDING * 2,
        height: operationsBottom - operationsY,
        rx: 10,
      }));
      const title = svgElement("text", {
        x: WORLD_PADDING + 16,
        y: operationsY + 25,
        class: "flow-region-title",
      });
      title.textContent = "Operations across the request path";
      operations.append(title);
      const role = svgElement("text", {
        x: WORLD_PADDING + 270,
        y: operationsY + 25,
        class: "flow-region-role",
      });
      role.textContent = MODEL.requestFlow.operations.length
        ? "Telemetry, health, and management"
        : MODEL.requestFlow.telemetryNodeIds.length
          ? "Telemetry evidence on " + MODEL.requestFlow.telemetryNodeIds.length + " components"
          : "No operational implementation discovered yet";
      operations.append(role);
      appendFlowAdd(
        operations,
        (worldWidth - 88) / 2,
        operationsBottom - 38,
        "Operations",
        ["sre"],
      );
      lanesLayer.append(operations);
      if (otherResourcesToggle.checked && otherResourceIds.length) {
        const inventory = svgElement("g", { class: "flow-region inventory", "data-flow-group": "other-resources" });
        inventory.append(svgElement("rect", {
          x: WORLD_PADDING, y: inventoryY,
          width: worldWidth - WORLD_PADDING * 2,
          height: inventoryBottom - inventoryY - WORLD_PADDING, rx: 10,
        }));
        const heading = svgElement("text", { x: WORLD_PADDING + 16, y: inventoryY + 25, class: "flow-region-title" });
        heading.textContent = "Outside the request flow";
        inventory.append(heading);
        const caption = svgElement("text", { x: WORLD_PADDING + 16, y: inventoryY + 46, class: "flow-region-role" });
        caption.textContent = "Disconnected resources · expand workflow cards for internal items · not a live usage assessment";
        inventory.append(caption);
        lanesLayer.append(inventory);
      }
      for (const [parentId, bounds] of operationRegions) {
        const region = svgElement("g", {
          class: "flow-region", "data-operation-region": parentId,
          role: "group", "aria-label": "Internal items for " + nodeById.get(parentId).name,
        });
        region.append(svgElement("rect", { ...bounds, rx: 10 }));
        const title = svgElement("text", { x: bounds.x + 16, y: bounds.y + 28, class: "flow-region-title" });
        title.textContent = shorten(nodeById.get(parentId).name, 42);
        region.append(title);
        const hint = svgElement("text", { x: bounds.x + 16, y: bounds.y + 48, class: "flow-region-role" });
        hint.textContent = operationGroups.get(parentId).nodeIds.length + " internal items";
        region.append(hint);
        appendOperationToggle(region, parentId, bounds.x + bounds.width - 158, bounds.y + 36);
        lanesLayer.append(region);
      }
    }

    function toggleOperations(parentId) {
      const collapse = expandedOperations.has(parentId);
      if (collapse) expandedOperations.delete(parentId);
      else {
        operationCameras.set(parentId, { ...transform });
        expandedOperations.add(parentId);
      }
      applyLayout(false);
      if (collapse && operationCameras.has(parentId)) {
        transform = operationCameras.get(parentId);
        operationCameras.delete(parentId);
        applyTransform();
      } else if (operationRegions.has(parentId)) {
        fitGraph(.18, operationRegions.get(parentId));
      }
      const focusTarget = collapse ? operationToggleElements.get(parentId)
        : [...document.querySelectorAll("[data-operation-region]")]
          .find((region) => region.dataset.operationRegion === parentId)?.querySelector(".node-operations");
      focusTarget?.focus({ preventScroll: true });
    }

    function appendOperationToggle(container, parentId, x = 12, y = 70) {
      const toggle = svgElement("g", {
        class: "node-operations", tabindex: "0", role: "button", "data-operation-toggle": parentId,
      });
      toggle.append(svgElement("rect", { x, y, width: 136, height: 22, rx: 4 }));
      toggle.append(svgElement("text", { x: x + 68, y: y + 15, "text-anchor": "middle" }));
      toggle.addEventListener("pointerdown", (event) => event.stopPropagation());
      toggle.addEventListener("click", (event) => { event.stopPropagation(); toggleOperations(parentId); });
      toggle.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        toggleOperations(parentId);
      });
      container.append(toggle);
      updateOperationToggle(toggle, parentId);
      return toggle;
    }

    function updateOperationToggle(toggle, parentId) {
      const expanded = expandedOperations.has(parentId);
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-label", (expanded ? "Collapse" : "Expand") + " internal items for " + nodeById.get(parentId).name);
      toggle.querySelector("text").textContent = (expanded ? "Hide " : "Show ") +
        operationGroups.get(parentId).nodeIds.length + " internal items";
    }

    function renderNodes() {
      for (const node of MODEL.nodes) {
        const hasLogs = node.kind === "project" && SERVICE_LOG_TIERS.has(node.tierId);
        const group = svgElement("g", {
          class: "node " + node.kind + (otherNodeIds.has(node.id) ? " outside-flow" : ""),
          tabindex: "0",
          role: "button",
          "aria-label": node.name + ", " + humanize(node.kind) + ", " + node.confidence + " confidence",
          "data-node-id": node.id,
        });
        group.append(svgElement("rect", { width: NODE_WIDTH, height: NODE_HEIGHT, rx: 7 }));
        const title = svgElement("title");
        title.textContent = node.name + " — " + node.projectPath;
        group.append(title);
        if (!operationParents.has(node.id)) appendNodeVisual(group, node.tierId);
        const name = svgElement("text", { x: 12, y: 23, class: "node-title" });
        name.textContent = shorten(node.name, operationParents.has(node.id) ? 28 : 21);
        group.append(name);
        const kind = svgElement("text", { x: 12, y: 42, class: "node-meta", "data-role": "kind" });
        kind.textContent = humanize(node.kind) + " · " + node.confidence + " confidence";
        group.append(kind);
        const project = svgElement("text", { x: 12, y: 61, class: "node-meta" });
        project.textContent = shorten(operationParents.has(node.id) && node.evidence[0]
          ? node.evidence[0].path.split("/").pop() + ":" + node.evidence[0].line
          : node.projectPath, 34);
        group.append(project);
        if (node.badges.length && !operationGroups.has(node.id)) {
          const badges = svgElement("text", { x: 12, y: 82, class: "node-badge" });
          badges.textContent = shorten(node.badges.map((badge) => badge.label).join(" · "), hasLogs ? 25 : 37);
          group.append(badges);
        }
        group.addEventListener("click", () => {
          selectNode(node.id);
        });
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectNode(node.id);
          }
        });
        group.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
        });
        nodesLayer.append(group);
        nodeElements.set(node.id, group);
        if (operationGroups.has(node.id)) {
          operationToggleElements.set(node.id, appendOperationToggle(nodesLayer, node.id));
        }
        if (hasLogs) {
          const logs = svgElement("g", {
            class: "node-logs", role: "button", tabindex: "0",
            "aria-label": "Service logs for " + node.name,
          });
          logs.append(svgElement("rect", { x: NODE_WIDTH - 54, y: 70, width: 44, height: 22, rx: 4 }));
          const text = svgElement("text", { x: NODE_WIDTH - 32, y: 85, "text-anchor": "middle" });
          text.textContent = "Logs";
          logs.append(text);
          const openLogs = (event) => {
            event.stopPropagation();
            renderLogsPanel(node.id);
          };
          logs.addEventListener("click", openLogs);
          logs.addEventListener("pointerdown", (event) => event.stopPropagation());
          logs.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openLogs(event);
          });
          nodesLayer.append(logs);
          nodeLogElements.set(node.id, logs);
        }
      }
    }

    function renderEdges() {
      for (const edge of MODEL.edges) {
        const group = svgElement("g", {
          class: "edge " + edge.confidence,
          tabindex: "0",
          role: "button",
          "data-edge-id": edge.id,
          "aria-label": humanize(edge.kind) + ", " + edge.confidence + " confidence",
        });
        group.append(svgElement("path", { "marker-end": "url(#arrow-" + edge.confidence + ")" }));
        const label = svgElement("text", { "text-anchor": "middle" });
        label.textContent = humanize(edge.kind) + " · " + edge.confidence;
        group.append(label);
        group.addEventListener("click", (event) => {
          event.stopPropagation();
          selectEdge(edge.id);
        });
        group.addEventListener("pointerdown", (event) => event.stopPropagation());
        group.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          selectEdge(edge.id);
        });
        edgesLayer.append(group);
        edgeElements.set(edge.id, group);
      }
    }

    function updatePresentation() {
      entryFilter.hidden = MODEL.requestFlow.entrypointIds.length < 2;
      mapContext.textContent = "Source-derived request flow · not live usage";
      for (const node of MODEL.nodes) {
        const element = nodeElements.get(node.id);
        const kind = element.querySelector('[data-role="kind"]');
        const tier = tierById.get(node.tierId);
        kind.textContent = operationParents.has(node.id)
          ? humanize(node.kind)
          : shorten((tier?.name || node.tierId) + " · " +
          (otherNodeIds.has(node.id)
            ? node.kind === "operation" ? "internal operation" : "outside flow"
            : node.confidence + " confidence"), 28);
      }
      for (const edge of MODEL.edges) {
        const group = edgeElements.get(edge.id);
        const label = edgeElements.get(edge.id).querySelector("text");
        const flow = flowEdgeById.get(edge.id);
        const confidence = flow?.confidence || edge.confidence;
        group.classList.remove("high", "medium", "low");
        group.classList.add(confidence);
        group.setAttribute(
          "aria-label",
          (flow?.label || humanize(edge.kind)) +
            ", " + confidence + " confidence",
        );
        group.querySelector("path").setAttribute("marker-end", "url(#arrow-" + confidence + ")");
        label.textContent = flow
          ? (flow.step ? flow.step + ". " : "") + flow.label
          : humanize(edge.kind) + " · " + edge.confidence;
      }
      for (const toggle of document.querySelectorAll("[data-operation-toggle]")) {
        updateOperationToggle(toggle, toggle.dataset.operationToggle);
      }
    }

    function applyLayout(shouldFit = true) {
      defaultPositions.clear();
      positions.clear();
      clearElement(lanesLayer);
      requestFlowLayout();
      renderFlowRegions();
      updatePresentation();
      updateGeometry();
      applyFilters();
      if (shouldFit) requestAnimationFrame(() => fitGraph(.48));
    }

    function displayedNodeId(id) {
      const parentId = operationParents.get(id);
      return parentId && !expandedOperations.has(parentId) ? parentId : id;
    }

    function edgeGeometry(edge) {
      const from = positions.get(displayedNodeId(edge.from));
      const to = positions.get(displayedNodeId(edge.to));
      if (!from || !to) return null;
      const fromCenter = { x: from.x + NODE_WIDTH / 2, y: from.y + NODE_HEIGHT / 2 };
      const toCenter = { x: to.x + NODE_WIDTH / 2, y: to.y + NODE_HEIGHT / 2 };
      const dx = toCenter.x - fromCenter.x;
      let start;
      let end;
      let path;
      if (operationParents.get(edge.from) && operationParents.get(edge.from) === operationParents.get(edge.to) &&
          Math.abs(dx) < 1 && Math.abs(to.y - from.y) > NODE_HEIGHT + 72) {
        const gutter = from.x - 36;
        start = { x: from.x, y: fromCenter.y };
        end = { x: to.x, y: toCenter.y };
        path = "M " + start.x + " " + start.y + " H " + gutter + " V " + end.y + " H " + end.x;
        return { path, labelX: gutter, labelY: (start.y + end.y) / 2 };
      } else if (Math.abs(dx) > NODE_WIDTH * .7) {
        const forward = dx > 0;
        start = { x: forward ? from.x + NODE_WIDTH : from.x, y: fromCenter.y };
        end = { x: forward ? to.x : to.x + NODE_WIDTH, y: toCenter.y };
        const curve = Math.max(44, Math.abs(end.x - start.x) * .46);
        path = "M " + start.x + " " + start.y + " C " +
          (start.x + (forward ? curve : -curve)) + " " + start.y + ", " +
          (end.x + (forward ? -curve : curve)) + " " + end.y + ", " +
          end.x + " " + end.y;
      } else {
        const downward = toCenter.y >= fromCenter.y;
        start = { x: fromCenter.x, y: downward ? from.y + NODE_HEIGHT : from.y };
        end = { x: toCenter.x, y: downward ? to.y : to.y + NODE_HEIGHT };
        const curve = Math.max(42, Math.abs(end.y - start.y) * .45);
        path = "M " + start.x + " " + start.y + " C " +
          start.x + " " + (start.y + (downward ? curve : -curve)) + ", " +
          end.x + " " + (end.y + (downward ? -curve : curve)) + ", " +
          end.x + " " + end.y;
      }
      return { path, labelX: (start.x + end.x) / 2, labelY: (start.y + end.y) / 2 - 7 };
    }

    function updateGeometry() {
      for (const [nodeId, element] of nodeElements) {
        const position = positions.get(nodeId);
        element.setAttribute("transform", "translate(" + position.x + " " + position.y + ")");
        nodeLogElements.get(nodeId)?.setAttribute("transform", element.getAttribute("transform"));
        operationToggleElements.get(nodeId)?.setAttribute("transform", element.getAttribute("transform"));
      }
      for (const edge of MODEL.edges) {
        const geometry = edgeGeometry(edge);
        if (!geometry) continue;
        const group = edgeElements.get(edge.id);
        group.querySelector("path").setAttribute("d", geometry.path);
        const label = group.querySelector("text");
        label.setAttribute("x", geometry.labelX);
        label.setAttribute("y", geometry.labelY);
      }
    }

    function connectedIds(nodeId) {
      const ids = new Set([nodeId]);
      for (const edge of MODEL.edges) {
        if (displayedNodeId(edge.from) === nodeId) ids.add(displayedNodeId(edge.to));
        if (displayedNodeId(edge.to) === nodeId) ids.add(displayedNodeId(edge.from));
      }
      return ids;
    }

    function applySelection() {
      updateModeHighlight();
      const connected = selectedId ? connectedIds(selectedId) : null;
      for (const [nodeId, element] of nodeElements) {
        element.classList.toggle("selected", nodeId === selectedId);
        const edge = selectedEdgeId
          ? MODEL.edges.find((candidate) => candidate.id === selectedEdgeId)
          : null;
        element.classList.toggle(
          "muted",
          Boolean(connected) && !connected.has(nodeId) ||
            Boolean(edge) && displayedNodeId(edge.from) !== nodeId && displayedNodeId(edge.to) !== nodeId,
        );
        nodeLogElements.get(nodeId)?.classList.toggle("muted", element.classList.contains("muted"));
        operationToggleElements.get(nodeId)?.classList.toggle("muted", element.classList.contains("muted"));
      }
      for (const edge of MODEL.edges) {
        const element = edgeElements.get(edge.id);
        element.classList.toggle("selected", edge.id === selectedEdgeId);
        element.classList.toggle(
          "muted",
          Boolean(selectedId) && displayedNodeId(edge.from) !== selectedId && displayedNodeId(edge.to) !== selectedId ||
            Boolean(selectedEdgeId) && edge.id !== selectedEdgeId,
        );
      }
    }

    function clearElement(element) {
      if (element === details) {
        appLogs?.dispose();
        appLogs = null;
        delete details.dataset.mode;
        details.scrollTop = 0;
      }
      while (element.firstChild) element.firstChild.remove();
    }

    function appendText(parent, tag, text, className) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      element.textContent = text;
      parent.append(element);
      return element;
    }

    function appendList(parent, items, emptyText) {
      if (!items.length) {
        appendText(parent, "p", emptyText);
        return;
      }
      const list = document.createElement("ul");
      for (const text of items) appendText(list, "li", text);
      parent.append(list);
    }

    function actionButton(label, handler, primary = false) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.className = primary ? "studio-action primary" : "studio-action";
      button.addEventListener("click", handler);
      return button;
    }

    function keyedActionButton(key, label, handler, primary = false) {
      const button = actionButton(label, handler, primary);
      button.dataset.actionKey = key;
      return button;
    }

    function appendPanelBack() {
      const button = panelMode === "manage"
        ? actionButton("← Run/Debug", renderManagePanel)
        : actionButton("", closeMapDetails);
      if (panelMode !== "manage") {
        button.setAttribute("aria-label", "Close details");
        button.title = "Close details";
        button.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
      }
      button.className = "panel-back";
      details.append(button);
    }

    function closeMapDetails() {
      const target = panelMode === "connections" && !guideCollapsed
        ? guideContent.querySelector('[data-action-key="review-connections"]')
        : nodeElements.get(selectedId) || edgeElements.get(selectedEdgeId) || document.querySelector("#map-app");
      renderMapPanel();
      target.focus({ preventScroll: true });
    }

    function appendField(container, title, control) {
      const label = document.createElement("label");
      label.className = "studio-field";
      appendText(label, "span", title);
      label.append(control);
      container.append(label);
    }

    function updateModeHighlight() {
      if (panelMode !== "build") buildPanel.hide();
      const mode = ["build", "manage", "logs"].includes(panelMode) ? panelMode : "map";
      if (panelMode !== "map") setStructureGuidance(false);
      const observing = mode === "map" || mode === "logs";
      if (observing) observeView = mode;
      document.body.dataset.workspace = mode;
      document.body.dataset.inspecting = String(!["build", "manage", "logs", "map"].includes(panelMode));
      if (mode !== "map") document.querySelector(".map-tools").open = false;
      const activeControl = observing ? "map-app" : mode === "build" ? "build-app" : "manage-app";
      document.querySelector("#workspace-shell").setAttribute("aria-labelledby", activeControl);
      for (const button of document.querySelectorAll(".header-actions > button")) {
        button.setAttribute("aria-pressed", String(button.id === activeControl));
      }
      document.querySelector("#observe-views").hidden = !observing;
      for (const tab of document.querySelectorAll("#observe-views > [role='tab']")) {
        const selected = (tab.id === "logs-app") === (observeView === "logs");
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
      }
      workspace.setAttribute("role", observing ? "tabpanel" : "region");
      if (observing) workspace.setAttribute("aria-labelledby", mode === "logs" ? "logs-app" : "map-view");
      else workspace.removeAttribute("aria-labelledby");
      details.setAttribute("aria-label", mode === "map" ? "Observe/Map inspector" :
        mode === "build" ? "Build workspace" : mode === "logs" ? "Logs workspace" : "Run/Debug workspace");
      mapContext.hidden = mode !== "map";
      if (mode === "map" && !mapHasFitted) requestAnimationFrame(() => fitGraph(.48));
      updateObserveAction();
    }

    function setGuideCollapsed(collapsed, persist = false) {
      guideCollapsed = collapsed;
      const restoreFocus = collapsed && guideContent.contains(document.activeElement);
      guideRail.dataset.collapsed = String(collapsed);
      guideContent.hidden = collapsed;
      document.querySelector("#guide-shortcuts").hidden = !collapsed;
      const toggle = document.querySelector("#action-center");
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.title = collapsed ? "Expand Guide" : "Collapse Guide";
      toggle.setAttribute("aria-label", toggle.title);
      for (const shortcut of document.querySelectorAll("[data-guide-stage]")) shortcut.setAttribute("aria-expanded", String(!collapsed));
      if (restoreFocus) toggle.focus({ preventScroll: true });
      setDetailsPanelHeight(detailsPanelHeight);
      if (persist) {
        guideExplicitChoice = true;
        try { localStorage.setItem(guidePreferenceKey, String(collapsed)); }
        catch (error) { setStatus("Could not remember Guide visibility: " + error.message, true); }
      }
    }

    function renderMapPanel() {
      setStructureGuidance(false);
      panelMode = "map";
      selectedId = null;
      selectedEdgeId = null;
      clearElement(details);
      details.dataset.empty = "true";
      applySelection();
    }

    function setStructureGuidance(visible) {
      structureGuidance.hidden = !visible;
      graphShell.classList.toggle("structure-editing", visible);
    }

    function renderStructureMap() {
      renderMapPanel();
      setStructureGuidance(true);
      structureGuidance.focus({ preventScroll: true });
    }

    function renderBuildPanel() {
      clearDocumentAssessment();
      panelMode = "build";
      selectedId = null;
      selectedEdgeId = null;
      applySelection();
      clearElement(details);
      details.dataset.empty = "false";
      details.dataset.mode = "build";
      updateModeHighlight();
      void buildPanel.show();
    }

    function renderLogsPanel(nodeId = null) {
      panelMode = "logs";
      selectedId = null;
      selectedEdgeId = null;
      applySelection();
      clearElement(details);
      details.dataset.empty = "false";
      details.dataset.mode = "logs";
      appLogs = mountAppLogs({
        parent: details, nodeId, isActive: () => panelMode === "logs",
        load: ({ serviceId, serviceIds, signal }) => apiRequest("/api/app-logs?root=" + encodeURIComponent(MODEL.root) +
          (serviceIds ?? (serviceId ? [serviceId] : [])).map((id) => "&serviceId=" + encodeURIComponent(id)).join(""), { signal }),
      });
    }

    async function apiRequest(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: {
          "X-Unity-Studio-Token": API_TOKEN,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {}),
        },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unity Studio request failed.");
      return result;
    }

    function entrypointForNode(node) {
      const names = [node.name, node.projectPath.split("/").pop()].map(normalized).filter(Boolean);
      return runtimeEntrypoints.find((entrypoint) => {
        const candidate = normalized(entrypoint.name);
        if (node.tierId === "web" && candidate === "web") return true;
        if (node.tierId === "agent" && candidate === "agent") return true;
        return names.some((name) => candidate.includes(name) || name.includes(candidate));
      });
    }

    function effectiveJourneyStages() {
      return (${buildJourneyStages.toString()})(MODEL.actionCenter.stages, operationalState, ACTIVE_LIFECYCLE_STATES);
    }

    async function runAppOperation(operation) {
      if (lifecycleOperation) return;
      lifecycleOperation = operation;
      const labels = {
        "run-local": "Starting app…",
        "stop-local": "Stopping app…",
        "configure-gateway": "Configuring model access…",
        "provision-cloud": "Provisioning Azure resources…",
        "deploy-cloud": "Deploying app to Azure…",
      };
      const states = {
        "run-local": "starting",
        "stop-local": "stopping",
        "configure-gateway": "configuring",
        "provision-cloud": "provisioning",
        "deploy-cloud": "deploying",
      };
      setStatus(labels[operation] || "Updating app…");
      operationalState = {
        ...operationalState,
        app: {
          ...(operationalState.app || {}),
          state: states[operation] || "configuring",
        },
      };
      operationalFingerprint = "optimistic:" + operation;
      updateAppStatusBadge();
      renderManagePanel();
      try {
        await apiRequest("/api/app-command", {
          method: "POST",
          body: JSON.stringify({ root: MODEL.root, operation }),
        });
        await refreshOperationalState();
      } catch (error) {
        setStatus(error.message, true);
        await refreshOperationalState();
      } finally {
        lifecycleOperation = null;
      }
    }

    function renderRuntimeAction(parent) {
      const card = document.createElement("div");
      const appState = operationalState.app?.state;
      const foreignEntrypoints = operationalState.app?.foreignEntrypoints || [];
      card.className = "action-card run-card " +
        (appState === "running" ? "recommended" : foreignEntrypoints.length ? "attention" : "optional");
      appendText(card, "span", "Run", "action-priority");
      if (appState === "running") {
        appendText(card, "strong", "Your app is running");
        appendText(card, "p", "Open a ready endpoint to try it, or stop the local app when you are finished.");
        const web = runtimeEntrypoints.find((entrypoint) =>
          entrypoint.ready && normalized(entrypoint.name) === "web");
        if (web) {
          card.append(keyedActionButton("open-app", "Open app", async () => {
            try {
              await apiRequest("/api/open-entrypoint", {
                method: "POST",
                body: JSON.stringify({ root: MODEL.root, port: web.port }),
              });
              setStatus("Opened the local app.");
            } catch (error) {
              setStatus(error.message, true);
            }
          }, true));
        }
        card.append(keyedActionButton("stop-app", "Stop", () => runAppOperation("stop-local")));
      } else if (foreignEntrypoints.length) {
        appendText(card, "strong", "Another app is using the local ports");
        appendText(
          card,
          "p",
          "Stop the other local app before starting this one. Ports in use: " +
            foreignEntrypoints.map((entrypoint) => String(entrypoint.port)).join(", ") + ".",
        );
        card.append(actionButton("Back to apps", () => location.assign("/"), true));
      } else if (ACTIVE_LIFECYCLE_STATES.includes(appState)) {
        if (operationalState.app?.recovered) {
          appendText(card, "strong", "Startup needs attention");
          appendText(card, "p", "Some app services are still running, but the original startup command is no longer active. Stop them before trying again.");
          card.append(keyedActionButton("stop-partial-app", "Stop partial startup", () => runAppOperation("stop-local")));
        } else if (appState === "starting") {
          const expectedEntrypoints = runtimeEntrypoints.filter((entrypoint) => entrypoint.expected !== false);
          const readyCount = expectedEntrypoints.filter((entrypoint) => entrypoint.ready).length;
          const totalCount = expectedEntrypoints.length;
          appendText(card, "strong", "Starting your app");
          appendText(card, "p", totalCount
            ? String(readyCount) + " of " + String(totalCount) + " services are ready. First startup can take about a minute."
            : "Unity is starting the local services. First startup can take about a minute.");
          if (totalCount) {
            const progress = document.createElement("progress");
            progress.max = totalCount;
            progress.value = readyCount;
            progress.setAttribute("aria-label", String(readyCount) + " of " + String(totalCount) + " services ready");
            card.append(progress);
          }
          card.append(keyedActionButton("cancel-startup", "Cancel startup", () => runAppOperation("stop-local")));
        } else {
          const activeLabels = {
            stopping: "Stopping your app",
            configuring: "Configuring model access",
            provisioning: "Provisioning Azure resources",
            deploying: "Deploying your app",
          };
          appendText(card, "strong", activeLabels[appState] || "Updating your app");
          appendText(card, "p", "Unity is completing this operation. Readiness updates automatically.");
        }
      } else if (appState === "failed") {
        appendText(card, "strong", "Last operation failed");
        appendText(card, "p", operationalState.app.error || "Review command output before retrying.", "error");
        if (runtimeEntrypoints.some((entry) => entry.ready)) {
          card.append(keyedActionButton("stop-failed-app", "Stop partial startup", () => runAppOperation("stop-local")));
        } else if (operationalState.app.operation === "configuring") {
          card.append(actionButton("Review model connection", () => renderManagePanel({ openGateway: true }), true));
        } else {
          card.append(keyedActionButton("retry-app", "Retry startup", () => runAppOperation("run-local"), true));
        }
      } else if (operationalState.readiness?.ready) {
        const previewMode = operationalState.readiness.mode === "preview";
        appendText(card, "strong", previewMode ? "Ready to preview" : "Ready to try");
        appendText(
          card,
          "p",
          previewMode
            ? "Unity can start the app surface now. Connect an AI Gateway later to enable the complete agent workflow."
            : "Required local configuration was found. Unity can start the complete app for you.",
        );
        card.append(keyedActionButton(
          "run-app",
          previewMode ? "Run preview" : "Run app",
          () => runAppOperation("run-local"),
          true,
        ));
      } else if (operationalState.readiness) {
        appendText(card, "strong", "Finish setup before running");
        appendText(card, "p", operationalState.readiness.guidance || "Unity will guide the remaining connection setup.");
        card.append(keyedActionButton("finish-setup", "Finish setup", () => openAppSettings("connection"), true));
      } else {
        appendText(card, "strong", "Checking app status");
        appendText(card, "p", "Unity is checking what is ready and what still needs setup.");
      }
      parent.append(card);
    }

    function runOpportunityAction(opportunity) {
      if (opportunity.action.kind === "review-connections") {
        renderConnectionsPanel();
        return;
      }
      if (opportunity.action.kind === "add-tier") {
        const tier = MODEL.tiers.find((candidate) => candidate.id === opportunity.action.tierId);
        if (tier) renderTierAddPanel(tier);
        return;
      }
      if (opportunity.action.kind === "inspect-node" && nodeById.has(opportunity.action.nodeId)) {
        const parentId = operationParents.get(opportunity.action.nodeId);
        if (parentId) expandedOperations.add(parentId);
        if (otherNodeIds.has(parentId || opportunity.action.nodeId)) {
          otherResourcesToggle.checked = true;
        }
        search.value = "";
        tierFilter.value = "";
        entryFilter.value = "";
        applyLayout(false);
        selectNode(opportunity.action.nodeId);
      }
    }

    function opportunityCard(opportunity) {
      const card = document.createElement("div");
      card.className = "action-card " + opportunity.priority;
      appendText(card, "strong", opportunity.title);
      appendText(card, "p", opportunity.detail);
      card.append(keyedActionButton(
        "opportunity-" + opportunity.id,
        opportunity.action.label,
        () => runOpportunityAction(opportunity),
        opportunity.priority === "required" || opportunity.id === "add-observability",
      ));
      return card;
    }

    function renderConnectionsPanel() {
      panelMode = "connections";
      if (window.innerWidth <= 900) setGuideCollapsed(true);
      selectedId = null;
      selectedEdgeId = null;
      applySelection();
      clearElement(details);
      details.dataset.empty = "false";
      details.dataset.mode = "connections";
      appendPanelBack();
      const heading = appendText(details, "h2", "Connection review");
      heading.tabIndex = -1;
      appendText(details, "p", "These checks come from source discovery, not live requests. An uncertain connection does not mean a running service has failed.");
      const actions = appendText(details, "div", "", "actions");
      actions.append(actionButton("Edit connections on App Map", renderStructureMap));
      const checks = MODEL.actionCenter.opportunities.filter((item) =>
        item.stage === "connect" && item.id !== "resolve-connections");
      if (checks.length) {
        appendText(details, "h3", "Connection checks");
        const list = appendText(details, "div", "", "action-list");
        for (const check of checks) list.append(opportunityCard(check));
      }
      if (MODEL.unresolved.length) {
        appendText(details, "h3", "Uncertain connections (" + MODEL.unresolved.length + ")");
        const list = appendText(details, "div", "", "action-list");
        for (const reference of MODEL.unresolved) {
          const source = nodeById.get(reference.from);
          const card = appendText(list, "div", "", "action-card");
          appendText(card, "strong", (source?.name || reference.from) + " → " + reference.reference);
          appendText(card, "p", "Studio could not identify a single destination from the source evidence.");
          if (reference.evidence) {
            appendText(card, "code", reference.evidence.path + ":" + reference.evidence.line);
          }
          if (reference.candidates?.length) {
            appendText(card, "p", "Possible destinations: " + reference.candidates
              .map((id) => nodeById.get(id)?.name || id).join(", "));
          }
          if (source) card.append(actionButton("Inspect " + source.name, () => runOpportunityAction({
            action: { kind: "inspect-node", nodeId: source.id },
          })));
        }
      }
      if (!checks.length && !MODEL.unresolved.length) {
        appendText(details, "p", "No source connection issues found.");
      }
      heading.focus({ preventScroll: true });
    }

    function updateObserveAction() {
      const card = guideContent.querySelector("[data-observe-action]");
      if (!card) return;
      const action = card.querySelector('[data-action-key="observe-map"]');
      if (!["build", "manage", "logs"].includes(panelMode)) {
        action?.remove();
      } else if (!action) {
        card.append(keyedActionButton("observe-map", "Open App Map", () => {
          renderMapPanel();
          document.querySelector("#map-app").focus({ preventScroll: true });
        }, true));
      }
    }

    function renderActionCenter() {
      const details = guideContent;
      const restoreFocus = details.contains(document.activeElement);
      const focusedAction = restoreFocus ? document.activeElement?.dataset?.actionKey : null;
      const focusedStage = restoreFocus ? document.activeElement?.dataset?.stage : null;
      const previousScrollTop = details.scrollTop;
      clearElement(details);
      details.dataset.empty = "false";
      const heading = appendText(details, "h3", "Workflow progress");
      heading.tabIndex = -1;
      appendText(details, "p", "Unity checks the app and keeps the next useful action here. Progress updates automatically.");
      if (launchNotice) {
        const notice = document.createElement("div");
        notice.className = "action-card attention";
        appendText(notice, "strong", "App created");
        appendText(notice, "p", launchNotice);
        notice.append(actionButton("Dismiss", () => {
          launchNotice = "";
          renderActionCenter();
        }));
        details.append(notice);
      }
      const stages = effectiveJourneyStages();
      const currentStage = stages.find((stage) =>
        stage.state === "next" || stage.state === "ready" ||
        stage.state === "active" || stage.state === "runtime");
      updateGuideShortcuts(stages, currentStage);
      const currentOpportunity = currentStage && currentStage.id !== "observe"
        ? MODEL.actionCenter.opportunities.find((opportunity) => opportunity.stage === currentStage.id)
        : null;
      const journey = document.createElement("div");
      journey.className = "journey";
      journey.setAttribute("role", "list");
      journey.setAttribute("aria-label", "App progress");
      for (const stage of stages) {
        const item = document.createElement("div");
        item.className = "journey-stage " + stage.state;
        item.dataset.stage = stage.id;
        item.tabIndex = -1;
        item.setAttribute("role", "listitem");
        if (stage === currentStage) {
          item.setAttribute("aria-current", "step");
        }
        let content = item;
        if (stage.id === "build" || stage.id === "connect") {
          content = stage.id === "build"
            ? keyedActionButton("edit-app-structure", "", renderStructureMap)
            : keyedActionButton("review-connections", "", renderConnectionsPanel);
          content.className = "journey-stage-action";
          content.setAttribute("aria-label", stage.id === "build" ? "Build: edit app structure" : "Connect: review connections");
          item.append(content);
        }
        appendText(content, "span", journeyStateLabel(stage.state), "journey-state");
        appendText(content, "strong", stage.label);
        appendText(
          content,
          "span",
          stage === currentStage && currentOpportunity ? currentOpportunity.title + " below" : stage.detail,
          "journey-detail",
        );
        journey.append(item);
      }
      details.append(journey);

      appendText(details, "h3", "Next action");
      if (currentStage?.id === "observe") {
        const card = appendText(details, "div", "", "action-card recommended");
        card.dataset.observeAction = "true";
        appendText(card, "strong", "Observe the running app");
        appendText(card, "p", "Select a component to inspect its source, or open Logs for service output. Runtime controls remain in Run/Debug.");
        updateObserveAction();
      } else if (currentStage?.id === "run" || !currentOpportunity) {
        renderRuntimeAction(details);
      } else {
        const list = document.createElement("div");
        list.className = "action-list";
        list.append(opportunityCard(currentOpportunity));
        details.append(list);
      }
      if (operationalState.app?.state === "running" && currentStage?.id !== "run") {
        appendText(details, "h3", "App status");
        renderRuntimeAction(details);
      }
      const remaining = MODEL.actionCenter.opportunities.filter((opportunity) =>
        opportunity !== currentOpportunity);
      if (remaining.length > 0) {
        const more = document.createElement("details");
        more.className = "more-guidance";
        const summary = document.createElement("summary");
        summary.textContent = "Other checks & improvements (" + remaining.length + ")";
        const moreList = document.createElement("div");
        moreList.className = "action-list";
        for (const opportunity of remaining) moreList.append(opportunityCard(opportunity));
        more.append(summary, moreList);
        details.append(more);
      }
      details.scrollTop = previousScrollTop;
      if (restoreFocus) {
        const replacement = focusedAction
          ? [...details.querySelectorAll("[data-action-key]")]
            .find((element) => element.dataset.actionKey === focusedAction)
          : focusedStage ? details.querySelector('[data-stage="' + focusedStage + '"]') : null;
        (replacement || heading).focus({ preventScroll: true });
      }
    }

    function journeyStateLabel(state) {
      return { complete: "Complete", active: "Current", attention: "Review", ready: "Ready",
        blocked: "Later", runtime: "Checking", next: "Next" }[state] || "Checking";
    }

    function updateGuideShortcuts(stages, currentStage) {
      const symbols = { complete: "✓", attention: "!", active: "●", ready: "✓", next: "→", blocked: "–", runtime: "…" };
      for (const stage of stages) {
        const button = document.querySelector('[data-guide-stage="' + stage.id + '"]');
        button.dataset.state = stage.state;
        button.dataset.current = String(stage === currentStage);
        button.title = stage.label + ": " + journeyStateLabel(stage.state) + ". " + stage.detail;
        button.setAttribute("aria-label", button.title);
        button.querySelector(".guide-state-icon").textContent = symbols[stage.state] || "…";
      }
    }

    async function loadGatewayControls(container, refresh = false) {
      if (gatewayApplying) {
        appendText(container, "p", "Applying model connection...");
        return;
      }
      const requestedSubscription = selectedSubscriptionId;
      const params = new URLSearchParams({ root: MODEL.root });
      if (requestedSubscription) params.set("subscriptionId", requestedSubscription);
      if (selectedGateway) {
        params.set("gatewayName", selectedGateway.name);
        params.set("resourceGroup", selectedGateway.resourceGroup);
      }
      const discovery = gatewayDiscovery.begin(params.toString(),
        () => apiRequest("/api/gateway-options?" + params), refresh);
      try {
        const options = await discovery.promise;
        if (!container.isConnected || !window.unityStudioSettings?.isOpen("connection") || requestedSubscription !== selectedSubscriptionId ||
          !discovery.isCurrent()) return;
        gatewayState = options;
        selectedSubscriptionId = options.subscription?.id || "";
        selectedGateway = options.suggested;
        clearElement(container);
        for (const warning of options.warnings || []) appendText(container, "p", warning, "error");
        const activeName = gatewayState.active?.name || "";
        const subscriptionSelect = document.createElement("select");
        subscriptionSelect.setAttribute("aria-label", "Azure subscription");
        for (const subscription of gatewayState.subscriptions || []) {
          const option = document.createElement("option");
          option.value = subscription.id;
          option.textContent = subscription.name + (subscription.isDefault ? " (default)" : "");
          option.selected = subscription.id === gatewayState.subscription?.id;
          subscriptionSelect.append(option);
        }
        appendField(container, "Azure subscription", subscriptionSelect);
        container.append(actionButton("Refresh subscriptions & gateways", () => {
          void loadGatewayControls(container, true);
        }));
        subscriptionSelect.addEventListener("change", () => {
          selectedSubscriptionId = subscriptionSelect.value;
          selectedGateway = null;
          selectedModel = "";
          void loadGatewayControls(container);
        });
        appendText(
          container,
          "p",
          activeName
            ? "Active gateway: " + activeName
            : "No AI Gateway is connected to this app yet.",
        );
        if (gatewayState.gateways.length) {
          const select = document.createElement("select");
          select.setAttribute("aria-label", "AI Gateway");
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = "Choose an AI Gateway";
          empty.disabled = true;
          select.append(empty);
          for (const [index, gateway] of gatewayState.gateways.entries()) {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = gateway.name +
              (gateway.resourceGroup ? " · " + gateway.resourceGroup : "");
            option.selected = gateway.name === gatewayState.suggested?.name &&
              gateway.resourceGroup === gatewayState.suggested?.resourceGroup;
            select.append(option);
          }
          appendField(container, "AI Gateway", select);
          select.addEventListener("change", () => {
            selectedGateway = options.gateways[Number(select.value)];
            selectedModel = "";
            void loadGatewayControls(container);
          });
          const modelSelect = document.createElement("select");
          modelSelect.setAttribute("aria-label", "AI model");
          const models = options.models || [];
          selectedModel = models.find((model) => model.id === selectedModel)?.id
            || models.find((model) => model.id === options.active?.model)?.id || models[0]?.id || "";
          for (const model of models) {
            const option = document.createElement("option");
            option.value = model.id;
            option.textContent = model.label;
            option.selected = model.id === selectedModel;
            modelSelect.append(option);
          }
          modelSelect.disabled = !models.length;
          modelSelect.addEventListener("change", () => {
            selectedModel = modelSelect.value;
            gatewayDiscovery.invalidate();
          });
          appendField(container, "Model", modelSelect);
          if (!models.length) appendText(container, "p", options.warnings?.length
            ? "Model inventory could not be verified. Review discovery errors or choose another gateway."
            : "This gateway has no models. Select another gateway or add a model in AI Gateway Studio.", "error");
          const apply = actionButton(
            activeName ? "Apply or reconfigure" : "Connect gateway",
            async () => {
              if (!select.value || !modelSelect.value || lifecycleOperation || gatewayApplying) return;
              gatewayApplying = true;
              gatewayDiscovery.invalidate();
              apply.disabled = true;
              subscriptionSelect.disabled = select.disabled = modelSelect.disabled = true;
              try {
                const gateway = options.gateways[Number(select.value)];
                const result = await apiRequest("/api/active-gateway", {
                  method: "POST",
                  body: JSON.stringify({
                    root: MODEL.root, name: gateway.name, resourceGroup: gateway.resourceGroup,
                    subscriptionId: gateway.subscriptionId,
                    model: modelSelect.value,
                  }),
                });
                gatewayState.active = result.active;
                if (result.configuration) {
                  operationalState = {
                    ...operationalState,
                    app: { ...(operationalState.app || {}), state: "configuring" },
                  };
                  await refreshOperationalState();
                } else {
                  await runAppOperation("configure-gateway");
                }
              } catch (error) {
                operationalState.app = { state: "failed", operation: "configuring", error: error.message };
                setStatus(error.message, true);
              } finally {
                gatewayApplying = false;
                window.unityStudioSettings.refreshApp();
                if (panelMode === "manage") renderManagePanel();
              }
            },
            true,
          );
          apply.disabled = !models.length || ACTIVE_LIFECYCLE_STATES.includes(operationalState.app?.state);
          container.append(apply);
        } else {
          appendText(container, "p", "No AI Gateway found in this subscription. Create one to connect a model.");
        }
        const gatewayTier = tierById.get("gateway");
        container.append(actionButton("Create or manage gateways", () => {
          window.unityStudioSettings.close();
          openTierStudio(gatewayTier);
        }));
      } catch (error) {
        if (!container.isConnected || !window.unityStudioSettings?.isOpen("connection") || requestedSubscription !== selectedSubscriptionId ||
          !discovery.isCurrent()) return;
        clearElement(container);
        appendText(container, "p", error.message, "error");
        const gatewayTier = tierById.get("gateway");
        container.append(actionButton("Open guided gateway setup", () => {
          window.unityStudioSettings.close();
          openTierStudio(gatewayTier);
        }, true));
      }
    }

    function renderDeleteSettings(container) {
      appendText(container, "h3", deleteConfirming ? "Delete " + document.querySelector("header h1").textContent + "?" : "Delete local app");
      appendText(
        container,
        "p",
        "This permanently removes the app Git worktree, local files, and its Unity-created branch. Azure resources and source repositories are not deleted.",
      );
      const actions = document.createElement("div");
      actions.className = "actions";
      if (operationalState.app?.state === "running" || ACTIVE_LIFECYCLE_STATES.includes(operationalState.app?.state)) {
        appendText(container, "p", operationalState.app?.state === "running"
          ? "Stop the local app before deleting its worktree."
          : "Wait for the current operation to finish before deleting this app.");
        return;
      }
      if (!operationalState.app) {
        appendText(container, "p", "App status is unavailable. Wait for a successful status check before deleting.");
        return;
      }
      if (deleteError) appendText(container, "p", deleteError, "error").setAttribute("role", "alert");
      if (!deleteConfirming) {
        const review = actionButton("Delete local app...", () => {
          deleteConfirming = true;
          window.unityStudioSettings.refreshApp();
        });
        review.className = "danger";
        container.append(review);
        return;
      }
      const confirm = actionButton("Delete local worktree", async () => {
        if (deletingApp) return;
        deletingApp = true;
        deleteError = "";
        for (const button of actions.querySelectorAll("button")) button.disabled = true;
        try {
          await apiRequest("/api/delete-app", {
            method: "POST",
            body: JSON.stringify({ root: MODEL.root, confirmed: true }),
          });
          location.assign("/");
        } catch (error) {
          deleteError = error.message;
          setStatus(error.message, true);
        } finally {
          deletingApp = false;
          window.unityStudioSettings.refreshApp();
        }
      });
      confirm.className = "danger";
      const cancel = actionButton("Cancel deletion", () => {
        deleteConfirming = false;
        deleteError = "";
        window.unityStudioSettings.refreshApp();
      });
      confirm.disabled = cancel.disabled = deletingApp;
      actions.append(cancel, confirm);
      container.append(actions);
    }

    function syncAgentInputControls() {
      const tester = details.querySelector(".agent-tester");
      if (!tester) return;
      const busy = invokingAgent || documentTesting || documentLoading;
      const ready = runtimeEntrypoints.some((entry) => entry.ready && normalized(entry.name) === "agent");
      const supportsDocuments = Boolean(operationalState.readiness?.documentInput);
      for (const input of tester.querySelectorAll("textarea, input")) input.disabled = busy;
      const send = tester.querySelector("[data-invoke-agent]");
      if (send) send.disabled = !ready || busy || (supportsDocuments && Boolean(documentError));
      const test = tester.querySelector("[data-test-document]");
      if (test) test.disabled = !ready || busy || Boolean(documentError) || !agentDocument;
      const remove = tester.querySelector("[data-remove-document]");
      if (remove) remove.disabled = invokingAgent || documentTesting;
    }

    function clearDocumentAssessment() {
      documentAssessmentEpoch += 1;
      documentAssessment = null;
      documentResultText = "";
      details.querySelector("[data-document-assessment]")?.remove();
      details.querySelector("[data-document-result]")?.remove();
    }

    function renderDocumentAssessment(container) {
      if (!documentAssessment && !documentTesting && !(invokingAgent && agentDocument)) return;
      const section = document.createElement("section");
      section.className = "document-assessment";
      section.dataset.documentAssessment = "true";
      const state = documentTesting || invokingAgent ? "pending" : documentAssessment.state;
      section.dataset.state = state;
      appendText(section, "strong", "Processed document");
      const badge = appendText(section, "span", state === "approved" ? "Policy checks passed"
        : state === "rejected" ? "Document rejected" : state === "pending" ? "Checking document..."
        : "Approval not established", "command-badge");
      badge.dataset.state = state === "approved" ? "succeeded" : state === "rejected" ? "failed" : "unknown";
      if (state === "approved") {
        appendText(section, "p", "Approved for agent processing - sanitized text only. This is the last completed check, not a signed trust credential.");
        appendText(section, "p", "The original document remains untrusted. Identity, income, creditworthiness, and loan approval are not verified.");
        const labels = { email: "Email", phone: "Phone", ssn: "SSN", paymentCard: "Payment card" };
        appendText(section, "small", "Supported patterns redacted: " + Object.entries(documentAssessment.redactions)
          .map(([key, count]) => (labels[key] || key) + " " + count).join(" · "));
        if (documentAssessment.truncated) appendText(section, "p", "The processed text was truncated to the output limit; it is not the complete application.");
        const text = appendText(section, "pre", documentAssessment.sanitizedText, "command-output sanitized-document");
        text.dataset.approvedDocument = "true";
      } else if (state === "rejected") {
        appendText(section, "p", "Not approved for agent processing. " + documentAssessment.reason);
      } else if (state !== "pending") {
        appendText(section, "p", "No verified structured approval result is available. Model-written claims do not establish document trust.");
      }
      container.append(section);
    }

    function renderDocumentInput(container) {
      const capability = operationalState.readiness?.documentInput;
      if (!capability) return;
      const disclosure = document.createElement("details");
      disclosure.className = "run-document";
      disclosure.open = documentInputExpanded || Boolean(documentError);
      const summary = appendText(disclosure, "summary", agentDocument ? "Document · " + agentDocument.name : "Document (optional)");
      summary.setAttribute("aria-label", "Document attachment");
      disclosure.addEventListener("toggle", () => {
        if (disclosure.isConnected) documentInputExpanded = disclosure.open;
      });
      const input = document.createElement("div");
      input.className = "document-input";
      const sourceBadge = appendText(input, "span", "Untrusted source", "command-badge");
      sourceBadge.dataset.state = "unknown";
      appendText(input, "p", "Choose text/Markdown or paste below. Up to 64 KiB. Document checks run before the model; use synthetic documents in local mode.");
      const file = document.createElement("input");
      file.type = "file";
      file.accept = capability.extensions.join(",");
      file.setAttribute("aria-label", "Document file");
      const name = appendText(input, "small", agentDocument?.name || "No document attached");
      const text = document.createElement("textarea");
      text.maxLength = capability.maxBytes;
      text.value = agentDocument?.content || "";
      text.placeholder = "Or paste document text";
      text.setAttribute("aria-label", "Document text");
      const error = appendText(input, "p", documentError, "error");
      error.setAttribute("role", "alert");
      text.addEventListener("input", () => {
        documentReadVersion += 1;
        agentDocument = text.value ? { name: agentDocument?.name || "document.txt", content: text.value } : null;
        documentError = new TextEncoder().encode(text.value).length > capability.maxBytes
          ? "Use a document no larger than 64 KiB." : "";
        error.textContent = documentError;
        name.textContent = agentDocument?.name || "No document attached";
        clearDocumentAssessment();
        syncAgentInputControls();
      });
      file.addEventListener("change", async () => {
        const selected = file.files?.[0];
        if (!selected) return;
        const version = ++documentReadVersion;
        agentDocument = null;
        clearDocumentAssessment();
        documentError = "";
        documentLoading = true;
        syncAgentInputControls();
        try {
          if (!capability.extensions.some((extension) => selected.name.toLowerCase().endsWith(extension))) {
            throw new Error("Choose a .txt or .md document. PDF and Word files are not supported.");
          }
          if (selected.size > capability.maxBytes) throw new Error("Use a document no larger than 64 KiB.");
          const content = await selected.text();
          if (new TextEncoder().encode(content).length > capability.maxBytes) {
            throw new Error("Use UTF-8 document text no larger than 64 KiB.");
          }
          if (version === documentReadVersion) agentDocument = { name: selected.name, content };
        } catch (cause) {
          if (version === documentReadVersion) documentError = "Could not read document: " + cause.message;
        } finally {
          if (version === documentReadVersion) {
            documentLoading = false;
            if (panelMode === "manage") renderManagePanel();
          }
        }
      });
      const remove = actionButton("Remove document", () => {
        documentReadVersion += 1;
        agentDocument = null;
        documentError = "";
        clearDocumentAssessment();
        documentLoading = false;
        renderManagePanel();
      });
      remove.dataset.removeDocument = "true";
      input.append(file, text, remove);
      if (documentLoading) appendText(input, "p", "Reading document...");
      disclosure.append(input);
      container.append(disclosure);
    }

    function renderDocumentTest(container, actions) {
      if (!operationalState.readiness?.documentInput) return;
      const test = actionButton("Test enforcement", async () => {
        const document = agentDocument;
        clearDocumentAssessment();
        const epoch = documentAssessmentEpoch;
        documentTesting = true;
        documentResultText = "Running document checks without a model call...";
        renderManagePanel();
        try {
          const result = await apiRequest("/api/document-test", {
            method: "POST", body: JSON.stringify({ root: MODEL.root, document }),
          });
          documentResultText = JSON.stringify(result, null, 2);
          if (epoch === documentAssessmentEpoch) documentAssessment = result.documentAssessment ?? { state: "unverified" };
          setStatus(result.verdict === "rejected" ? "Document rejected by enforcement." : "Document enforcement completed.",
            result.verdict === "rejected");
        } catch (error) {
          documentResultText = error.message;
          if (epoch === documentAssessmentEpoch) documentAssessment = { state: "unverified" };
          setStatus(error.message, true);
        } finally {
          documentTesting = false;
          if (panelMode === "manage") renderManagePanel();
        }
      });
      test.dataset.testDocument = "true";
      actions.append(test);
      renderDocumentAssessment(container);
      if (documentResultText) {
        const output = appendText(container, "pre", documentResultText, "command-output");
        output.dataset.documentResult = "true";
      }
    }

    function renderAgentTester(container) {
      const tester = document.createElement("div");
      tester.className = "developer-tool-card agent-tester";
      const agentEntrypoint = runtimeEntrypoints.find((entrypoint) =>
        entrypoint.ready && normalized(entrypoint.name) === "agent");
      if (!agentEntrypoint) {
        const gatewayConfigured = Boolean(operationalState.readiness?.gatewayConfigured);
        const needsGateway = !gatewayConfigured && (operationalState.readiness?.mode === "preview"
          || !operationalState.readiness?.ready);
        const appRunning = operationalState.app?.state === "running";
        appendText(tester, "span", "Agent unavailable", "tool-status");
        appendText(
          tester,
          "p",
          needsGateway
            ? "The local agent cannot start until this app has an AI Gateway connection."
            : appRunning
              ? "The agent service did not start with the rest of the app."
              : "Run the app to bring its agent endpoint online.",
        );
        const prompt = document.createElement("textarea");
        appendText(tester, "strong", "Message");
        prompt.maxLength = 2000;
        prompt.value = agentPromptDraft;
        prompt.placeholder = "Write a message while the agent starts";
        prompt.setAttribute("aria-label", "Agent message");
        prompt.addEventListener("input", () => {
          agentPromptDraft = prompt.value;
        });
        const actions = document.createElement("div");
        actions.className = "actions";
        const send = actionButton("Invoke agent", () => {});
        send.dataset.invokeAgent = "true";
        send.disabled = true;
        actions.append(send);
        if (needsGateway && appRunning) {
          actions.append(actionButton("Stop preview", () => runAppOperation("stop-local"), true));
        } else if (needsGateway) {
          actions.append(actionButton(
            "Connect AI Gateway",
            () => renderManagePanel({ openGateway: true }),
            true,
          ));
        } else if (appRunning) {
          actions.append(actionButton("Stop app", () => runAppOperation("stop-local"), true));
        }
        tester.append(prompt);
        renderDocumentInput(tester);
        tester.append(actions);
        renderDocumentTest(tester, actions);
        if (agentRawResponse) {
          appendText(tester, "h3", "Last response");
          appendText(tester, "div", agentResponseText, "agent-response");
          renderTools(tester);
        }
        container.append(tester);
        syncAgentInputControls();
        return;
      }

      appendText(tester, "span", "Agent ready", "tool-status ready");
      const prompt = document.createElement("textarea");
      appendText(tester, "strong", "Message");
      prompt.maxLength = 2000;
      prompt.value = agentPromptDraft;
      prompt.placeholder = "Send a message to the running agent";
      prompt.setAttribute("aria-label", "Agent message");
      prompt.addEventListener("input", () => {
        agentPromptDraft = prompt.value;
      });
      const response = document.createElement("div");
      response.className = "agent-response";
      response.setAttribute("role", "region");
      response.setAttribute("aria-label", "Agent response");
      response.textContent = agentResponseText;
      const actions = document.createElement("div");
      actions.className = "actions";
      const send = actionButton("Invoke agent", async () => {
        const message = prompt.value.trim();
        if (!message) {
          setStatus("Enter a message for the local agent.", true);
          prompt.focus();
          return;
        }
        send.disabled = true;
        invokingAgent = true;
        clearDocumentAssessment();
        const assessmentEpoch = documentAssessmentEpoch;
        syncAgentInputControls();
        response.textContent = agentResponseText = "Waiting for the local agent…";
        try {
          const result = await apiRequest("/api/agent-invoke", {
            method: "POST",
            body: JSON.stringify({
              root: MODEL.root,
              port: agentEntrypoint.port,
              message,
              ...(operationalState.readiness?.documentInput && agentDocument ? { document: agentDocument } : {}),
            }),
          });
          agentRawResponse = typeof result.response === "string"
            ? result.response : JSON.stringify(result.response, null, 2);
          if (agentDocument && assessmentEpoch === documentAssessmentEpoch) {
            documentAssessment = result.documentAssessment ?? { state: "unverified" };
          }
          agentToolActivity = result.summary?.tools || [];
          response.textContent = agentResponseText = result.summary
            ? result.summary.text || "No assistant text was reported. Inspect the raw response below."
            : agentRawResponse;
          response.scrollTop = 0;
          setStatus("Agent response received.");
        } catch (error) {
          if (agentDocument && assessmentEpoch === documentAssessmentEpoch) documentAssessment = { state: "unverified" };
          response.textContent = agentResponseText = error.message;
          setStatus(error.message, true);
        } finally {
          invokingAgent = false;
          send.disabled = false;
          const currentResponse = details.querySelector(".agent-response");
          if (currentResponse) currentResponse.textContent = agentResponseText;
          const currentSend = details.querySelector("[data-invoke-agent]");
          if (currentSend) currentSend.disabled = false;
          if (panelMode === "manage") renderManagePanel();
        }
      }, true);
      send.dataset.invokeAgent = "true";
      send.disabled = invokingAgent;
      actions.append(send);
      const agentTier = tierById.get("agent");
      if (agentTier) {
        actions.append(actionButton("Open agent setup", () => openTierStudio(agentTier)));
      }
      tester.append(prompt);
      renderDocumentInput(tester);
      tester.append(actions);
      appendText(tester, "h3", "Response");
      tester.append(response);
      renderDocumentTest(tester, actions);
      renderTools(tester);
      if (agentRawResponse) {
        const raw = document.createElement("details");
        raw.dataset.runDisclosure = "raw-response";
        appendText(raw, "summary", "Raw agent response");
        appendText(raw, "pre", agentRawResponse, "command-output");
        tester.append(raw);
      }
      container.append(tester);
      syncAgentInputControls();
    }

    async function portOperation(operation) {
      portBusy = true;
      portMessage = "";
      portError = false;
      window.unityStudioSettings?.refreshApp();
      try {
        const result = await apiRequest("/api/ports/" + operation, {
          method: "POST",
          body: JSON.stringify({ root: MODEL.root, reviewId: portReview?.reviewId, confirmed: operation === "stop" }),
        });
        portReview = operation === "review-stop" ? result : null;
        portMessage = operation === "pick" ? "Available ports saved. Run the app to start on these ports."
          : operation === "stop" ? "Selected ports are free. Apps remain stopped."
          : result.targets.length ? "" : "These ports are already free.";
        await Promise.all([refreshOperationalState(), refreshRunOutput()]);
      } catch (error) {
        portReview = null;
        portMessage = error.message;
        portError = true;
      } finally {
        portBusy = false;
        window.unityStudioSettings?.refreshApp();
        if (panelMode === "manage") renderManagePanel();
      }
    }

    function renderPortControls(parent) {
      appendText(parent, "h3", "Local ports");
      appendText(parent, "p", runtimeEntrypoints.map((item) => humanize(item.name) + ": " + item.port).join(" · "));
      const actions = document.createElement("div");
      actions.className = "actions";
      const pick = actionButton("Pick available ports", () => portOperation("pick"));
      pick.disabled = portBusy || ["running", "starting", "stopping", "configuring"].includes(operationalState.app?.state);
      pick.title = "Stop this app first. Save unused ports for both Run and the startup scripts.";
      const review = actionButton("Stop apps using these ports", () => portOperation("review-stop"));
      review.disabled = portBusy || !runtimeEntrypoints.length;
      actions.append(pick, review);
      parent.append(actions);
      if (portBusy) appendText(parent, "p", "Checking ports and process ownership...");
      if (portMessage) appendText(parent, "p", portMessage, portError ? "error" : "");
      if (portReview?.targets.length) {
        const confirmation = document.createElement("div");
        confirmation.className = "run-card";
        confirmation.dataset.portReview = "true";
        appendText(confirmation, "strong", "Review apps to stop");
        appendText(confirmation, "p", "Stops these processes and their children, including apps from other workspaces. Unsaved in-memory work may be lost.");
        for (const target of portReview.targets) {
          appendText(confirmation, "p", "PID " + target.pid + " · " + target.command + " · ports " + target.ports.join(", "));
        }
        const confirm = actionButton("Confirm stop", () => portOperation("stop"));
        confirm.disabled = portBusy;
        const cancel = actionButton("Cancel", () => { portReview = null; window.unityStudioSettings.refreshApp(); });
        cancel.disabled = portBusy;
        confirmation.append(confirm, cancel);
        parent.append(confirmation);
      }
    }

    function renderRuntimeServices(runtimeSection) {
      const tools = appendText(runtimeSection, "div", "", "run-section-actions");
      appendText(tools, "p", "Local endpoints and source-discovered components. Readiness is not proof of a successful tool call.");
      tools.append(actionButton("Port settings", () => openAppSettings("ports")));
      for (const entrypoint of runtimeEntrypoints) {
        const row = document.createElement("div");
        row.className = "endpoint-row";
        row.dataset.ready = String(entrypoint.ready);
        const label = entrypoint.expected === false && !entrypoint.listening ? "Not started in preview"
          : entrypoint.healthStatus || (entrypoint.ready ? "Listening" : "Offline");
        const heading = document.createElement("div");
        heading.className = "endpoint-heading";
        appendText(heading, "strong", humanize(entrypoint.name));
        appendText(heading, "span", label, "endpoint-status");
        row.append(heading);
        appendText(row, "code", entrypoint.url);
        if (entrypoint.healthDetail) appendText(row, "small", entrypoint.healthDetail);
        const open = actionButton(entrypoint.ready ? "Open " + entrypoint.name : "Waiting", async () => {
          try {
            await apiRequest("/api/open-entrypoint", {
              method: "POST", body: JSON.stringify({ root: MODEL.root, port: entrypoint.port }),
            });
          } catch (error) { setStatus(error.message, true); }
        });
        open.disabled = !entrypoint.ready;
        row.append(open);
        const projects = MODEL.nodes.filter((node) => node.kind === "project" && entrypointForNode(node)?.port === entrypoint.port);
        for (const project of projects) {
          const source = actionButton("Open " + project.name + " source", () => openRuntimeSource(project));
          source.classList.add("runtime-source-action");
          row.append(source);
        }
        runtimeSection.append(row);
      }
      for (const node of MODEL.nodes.filter((node) => node.kind === "project"
        && ["web", "agent", "skills", "sandbox", "workflows", "connectors"].includes(node.tierId)
        && !entrypointForNode(node))) {
        const row = document.createElement("div");
        row.className = "endpoint-row";
        row.dataset.sourceOnly = "true";
        const heading = document.createElement("div");
        heading.className = "endpoint-heading";
        appendText(heading, "strong", node.name);
        appendText(heading, "span", "Source only", "endpoint-status");
        row.append(heading);
        appendText(row, "code", node.projectPath);
        appendText(row, "small", "Source discovered; no standalone endpoint is declared in this app's run configuration.");
        row.append(actionButton("Review source", () => openRuntimeSource(node)));
        runtimeSection.append(row);
      }
      if (!runtimeEntrypoints.length && !MODEL.nodes.some((node) => node.kind === "project")) {
        appendText(runtimeSection, "p", "No local components were discovered for this app.");
      }
    }

    async function openRuntimeSource(node) {
      try {
        const opened = await apiRequest("/api/open-source-canvas", {
          method: "POST", body: JSON.stringify({ root: MODEL.root, projectPath: node.projectPath }),
        });
        setStatus("Opened " + opened.path + " in Files.");
      } catch (error) { setStatus(error.message, true); }
    }

    function renderDeployment(deploymentSection) {
      const appState = operationalState.app?.state;
      appendText(deploymentSection, "p", "These actions use the app's checked-in Azure configuration and may change cloud resources.");
      const cloudActions = document.createElement("div");
      cloudActions.className = "actions";
      if (operationalState.readiness?.deploymentBlocker) {
        appendText(cloudActions, "p", operationalState.readiness.deploymentBlocker);
        cloudActions.append(actionButton("Review runtime & access", renderBuildPanel));
      } else if (ACTIVE_LIFECYCLE_STATES.includes(appState)) {
        appendText(cloudActions, "p", humanize(appState) + " is in progress. Wait for it to finish before starting another operation.");
      } else {
        cloudActions.append(actionButton("Set up Azure resources", async () => {
          await runAppOperation("provision-cloud");
        }));
        cloudActions.append(actionButton("Deploy latest app", async () => {
          await runAppOperation("deploy-cloud");
        }));
      }
      deploymentSection.append(cloudActions);
    }

    function renderTryApp(container) {
      const state = operationalState.app?.state;
      if (state !== "running") renderRuntimeAction(container);
      else {
        const web = runtimeEntrypoints.find((entry) => entry.ready && normalized(entry.name) === "web");
        if (web) {
          const actions = appendText(container, "div", "", "run-open-app");
          appendText(actions, "p", "Try the web experience, or send a message to the agent below.");
          actions.append(actionButton("Open app", async () => {
            try {
              await apiRequest("/api/open-entrypoint", {
                method: "POST", body: JSON.stringify({ root: MODEL.root, port: web.port }),
              });
            } catch (error) { setStatus(error.message, true); }
          }, true));
        }
      }
      if (operationalState.app?.foreignEntrypoints?.length) {
        container.append(actionButton("Resolve port conflict", () => openAppSettings("ports")));
      }
      if (operationalState.readiness?.agentRuntime) {
        appendText(container, "p", operationalState.readiness.agentRuntime === "copilot-sdk-sandbox"
          ? "Copilot SDK in an ACA agent sandbox, with a separate document sandbox. Cloud isolation must be verified against the configured session pools."
          : "Local simulation: the document tool has no OS or network isolation. Use synthetic documents only.", "run-runtime-notice");
        container.append(actionButton("Review key files", renderBuildPanel));
      }
      renderAgentTester(container);
    }

    function openAppSettings(section) {
      window.unityStudioSettings.open(section);
    }

    function renderAppSettingsSection(section, container) {
      if (section === "ports") { renderPortControls(container); return; }
      if (section === "danger") { renderDeleteSettings(container); return; }
      const appState = operationalState.app?.state;
      const readiness = operationalState.readiness;
      appendText(container, "p", readiness?.gatewayConfigured
        ? "Connected: " + readiness.model + " · " + readiness.activeGateway.name
        : "Connect an AI Gateway and model to enable the agent workflow.");
      if (appState === "running" || ACTIVE_LIFECYCLE_STATES.includes(appState)) {
        appendText(container, "p", appState === "running" ? "Stop the local app before changing its AI Gateway."
          : humanize(appState) + " is in progress. Model access can be changed when it finishes.");
        return;
      }
      if (!operationalState.app) {
        appendText(container, "p", "Checking app status before changing model access.");
        return;
      }
      const controls = appendText(container, "div", "", "gateway-fields");
      appendText(controls, "p", "Loading available AI Gateways...");
      void loadGatewayControls(controls);
    }

    window.addEventListener("unity-studio-settings-ready", () => {
      window.unityStudioSettings.configureApp({
        name: document.querySelector("header h1").textContent,
        renderSection: renderAppSettingsSection,
      });
      document.querySelector(".studio-settings").addEventListener("close", () => {
        deleteConfirming = false;
        deleteError = "";
        portReview = null;
        gatewayDiscovery.invalidate();
      });
    });

    function renderManagePanel({ openGateway = false } = {}) {
      const entering = panelMode !== "manage";
      panelMode = "manage";
      updateModeHighlight();
      selectedId = null;
      selectedEdgeId = null;
      applySelection();
      details.dataset.empty = "false";
      details.dataset.mode = "manage";
      runWorkspace.render({ state: operationalState.app?.state, readiness: operationalState.readiness, services: runtimeEntrypoints });
      if (entering) details.scrollTop = 0;
      void refreshRunOutput();
      if (openGateway) openAppSettings("connection");
    }

    async function refreshRunOutput() {
      if (panelMode !== "manage" || outputRefreshing) return;
      outputRefreshing = true;
      try {
        const result = await apiRequest("/api/app-output?root=" + encodeURIComponent(MODEL.root));
        latestOutput = result.lines.join("\\n") || "No command output yet. Run the app to see startup progress.";
        latestCommands = result.commands || [];
        runWorkspace.diagnostics({
          failures: latestCommands.filter((record) => record.status === "failed").length,
          operations: latestCommands.length,
        });
        renderCommandFeed();
        const output = details.querySelector("[data-runtime-output]");
        if (output && output.textContent !== latestOutput) {
          const following = output.scrollHeight - output.scrollTop - output.clientHeight < 40;
          output.textContent = latestOutput;
          if (following) output.scrollTop = output.scrollHeight;
        }
      } catch (error) {
        const output = details.querySelector("[data-runtime-output]");
        runWorkspace.diagnostics({
          failures: latestCommands.filter((record) => record.status === "failed").length,
          operations: latestCommands.length,
          error: error.message,
        });
        if (output) output.textContent = "Unable to load output: " + error.message;
      } finally { outputRefreshing = false; }
    }

    function renderCommandFeed(target) {
      const container = target || details.querySelector("[data-command-feed]");
      if (!container) return;
      const fingerprint = JSON.stringify(latestCommands);
      if (container.dataset.fingerprint === fingerprint) return;
      const scrollTop = container.scrollTop;
      const following = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
      const open = new Map([...container.querySelectorAll("[data-run-disclosure]")]
        .map((node) => [node.dataset.runDisclosure, node.open]));
      const focusedRecord = container.contains(document.activeElement)
        ? document.activeElement.closest("[data-run-disclosure]")?.dataset.runDisclosure : null;
      let focusedSummary = null;
      container.dataset.fingerprint = fingerprint;
      clearElement(container);
      if (!latestCommands.length) appendText(container, "p", "No operations recorded yet. Run the app or invoke its agent.");
      for (const record of latestCommands) {
        const row = document.createElement("details");
        row.className = "command-record";
        row.dataset.status = record.status;
        row.dataset.runDisclosure = record.id;
        row.open = open.get(row.dataset.runDisclosure) || false;
        const summary = document.createElement("summary");
        summary.dataset.actionKey = "operation-" + record.id;
        if (record.id === focusedRecord) focusedSummary = summary;
        const heading = document.createElement("div");
        heading.className = "command-head";
        appendText(heading, "span", record.kind, "command-badge command-kind");
        const title = { starting: "Start app", stopping: "Stop app", configuring: "Configure model access",
          provisioning: "Provision resources", deploying: "Deploy app" }[record.label] || record.label;
        appendText(heading, "strong", title, "command-title");
        const badge = appendText(heading, "span", humanize(record.status), "command-badge");
        badge.dataset.state = record.status;
        summary.append(heading);
        const metadata = document.createElement("div");
        metadata.className = "command-meta";
        appendText(metadata, "span", new Date(record.startedAt).toLocaleTimeString());
        if (record.durationMs != null) appendText(metadata, "span",
          record.durationMs < 1000 ? record.durationMs + " ms" : (record.durationMs / 1000).toFixed(1) + " s");
        if (record.note) appendText(metadata, "span", record.note);
        summary.append(metadata);
        row.append(summary);
        const body = appendText(row, "div", "", "command-record-body");
        appendText(body, "pre", record.command, "command-code");
        container.append(row);
      }
      if (focusedRecord) (focusedSummary || details.querySelector("#run-tab-operations"))?.focus({ preventScroll: true });
      container.scrollTop = following ? container.scrollHeight : scrollTop;
    }

    function renderTools(container) {
      const section = document.createElement("details");
      section.className = "run-tool-activity";
      section.dataset.runDisclosure = "tool-activity";
      appendText(section, "summary", "Tool activity · " + agentToolActivity.length + " reported");
      for (const tool of agentToolActivity) appendText(section, "p", tool.name + " · " + tool.status);
      if (!agentToolActivity.length) appendText(section, "p", "No tool activity was reported in the last response. This does not prove that no tools ran.");
      container.append(section);
    }

    async function refreshOperationalState() {
      if (operationalRefreshing) return;
      operationalRefreshing = true;
      try {
        const [app, readiness] = await Promise.all([
          apiRequest("/api/app-status?root=" + encodeURIComponent(MODEL.root)),
          apiRequest("/api/local-readiness?root=" + encodeURIComponent(MODEL.root)),
        ]);
        const nextFingerprint = JSON.stringify({
          state: app.state,
          recovered: app.recovered,
          error: app.error,
          ready: readiness.ready,
          guidance: readiness.guidance,
          gatewayConfigured: readiness.gatewayConfigured,
          model: readiness.model,
          gateway: readiness.activeGateway?.name,
          documentInput: readiness.documentInput,
          entrypoints: (app.entrypoints || []).map((entrypoint) => [
            entrypoint.name,
            entrypoint.port,
            entrypoint.ready,
            entrypoint.healthStatus,
            entrypoint.expected,
          ]),
          foreignEntrypoints: (app.foreignEntrypoints || []).map((entrypoint) => entrypoint.port),
        });
        const changed = nextFingerprint !== operationalFingerprint;
        operationalFingerprint = nextFingerprint;
        operationalState = { app, readiness };
        runtimeEntrypoints = app.entrypoints || [];
        updateAppStatusBadge();
        if (changed) renderActionCenter();
        if (changed) window.unityStudioSettings?.refreshApp();
        if (changed && panelMode === "manage") renderManagePanel();
      } catch (error) {
        const changed = operationalFingerprint !== "unavailable";
        operationalFingerprint = "unavailable";
        operationalState = { app: null, readiness: null };
        runtimeEntrypoints = [];
        updateAppStatusBadge();
        if (changed) renderActionCenter();
        if (changed) window.unityStudioSettings?.refreshApp();
        if (changed && panelMode === "manage") renderManagePanel();
        setStatus("Unable to refresh app readiness: " + error.message, true);
      } finally { operationalRefreshing = false; }
    }

    async function openTierStudio(tier) {
      try {
        const result = await apiRequest("/api/tier-action", {
          method: "POST",
          body: JSON.stringify({ root: MODEL.root, tierId: tier.id, includeAzure: true }),
        });
        if (result.outcome === "canvas-opened") {
          setStatus("Opened the " + tier.name + " specialist studio.");
          return result;
        }
        renderTierAddPanel(tier, false, result);
        setStatus(result.outcome === "scaffold-available"
          ? "Scaffold guidance is ready."
          : "Existing tier evidence is ready.");
        return result;
      } catch (error) {
        setStatus(error.message, true);
        return null;
      }
    }

    function connectionNodes(group) {
      return group.nodeIds.map((nodeId) => nodeById.get(nodeId)).filter(Boolean);
    }

    function connectionSelect(labelText, nodes, selectedId) {
      const label = document.createElement("label");
      appendText(label, "strong", labelText);
      const select = document.createElement("select");
      select.setAttribute("aria-label", labelText);
      for (const node of nodes) {
        const option = document.createElement("option");
        option.value = node.id;
        option.textContent = node.name + (node.projectPath ? " · " + node.projectPath : "");
        option.selected = node.id === selectedId;
        select.append(option);
      }
      label.append(select);
      return { label, select };
    }

    function renderConnectionPanel(sourceGroup, targetGroup, selection = null, confirming = false) {
      panelMode = "connect";
      selectedId = null;
      selectedEdgeId = null;
      applySelection();
      clearElement(details);
      details.dataset.empty = "false";
      appendPanelBack();
      appendText(details, "h2", "Connect " + sourceGroup.label + " to " + targetGroup.label);
      appendText(
        details,
        "p",
        "Choose the two components that should exchange requests or data. Unity will review the source-backed change before editing the app.",
      );

      const sources = connectionNodes(sourceGroup);
      const targets = connectionNodes(targetGroup);
      const sourceIds = new Set(sources.map((node) => node.id));
      const targetIds = new Set(targets.map((node) => node.id));
      const existing = MODEL.edges.filter((edge) =>
        sourceIds.has(edge.from) && targetIds.has(edge.to));

      appendText(details, "h3", "Existing connections");
      if (existing.length) {
        const list = document.createElement("ul");
        for (const edge of existing) {
          const source = nodeById.get(edge.from);
          const target = nodeById.get(edge.to);
          const item = document.createElement("li");
          item.textContent = source.name + " → " + target.name + " · " + humanize(edge.kind);
          list.append(item);
        }
        details.append(list);
      } else {
        appendText(details, "p", "No source-backed connection is currently discovered between these stages.");
      }

      if (!sources.length || !targets.length) {
        appendText(
          details,
          "p",
          "Add at least one component to each stage before creating a connection.",
          "error",
        );
        const missingActions = document.createElement("div");
        missingActions.className = "actions";
        if (!sources.length) {
          missingActions.append(actionButton(
            "Add to " + sourceGroup.label,
            () => renderAddToAppPanel(sourceGroup.tierIds, sourceGroup.label),
            true,
          ));
        }
        if (!targets.length) {
          missingActions.append(actionButton(
            "Add to " + targetGroup.label,
            () => renderAddToAppPanel(targetGroup.tierIds, targetGroup.label),
            true,
          ));
        }
        details.append(missingActions);
        return;
      }

      const sourceField = connectionSelect(
        "From component",
        sources,
        selection?.sourceId || sources[0].id,
      );
      const targetField = connectionSelect(
        "To component",
        targets,
        selection?.targetId || targets[0].id,
      );
      const form = document.createElement("div");
      form.className = "action-list";
      form.append(sourceField.label, targetField.label);
      details.append(form);

      const source = nodeById.get(sourceField.select.value);
      const target = nodeById.get(targetField.select.value);
      const discoveredEdge = existing.find((edge) =>
        edge.from === source.id && edge.to === target.id);
      if (confirming) {
        sourceField.select.disabled = true;
        targetField.select.disabled = true;
        appendText(details, "h3", discoveredEdge ? "Confirm connection improvement" : "Confirm source change");
        appendText(
          details,
          "p",
          discoveredEdge
            ? "This connection already has evidence. Unity will inspect and improve its implementation or configuration, then update the App Map evidence."
            : "Unity will implement real code or configuration wiring and update unity.app.yaml. It will not deploy or mutate Azure resources.",
        );
      }

      const actions = document.createElement("div");
      actions.className = "actions";
      if (!confirming) {
        actions.append(actionButton("Review connection", () => renderConnectionPanel(
          sourceGroup,
          targetGroup,
          { sourceId: sourceField.select.value, targetId: targetField.select.value },
          true,
        ), true));
      } else {
        const confirmButton = actionButton(
          discoveredEdge ? "Improve connection" : "Create connection",
          async () => {
            if (confirmButton.disabled) return;
            for (const button of actions.querySelectorAll("button")) button.disabled = true;
            setStatus((discoveredEdge ? "Improving" : "Creating") + " connection…");
            try {
              const result = await apiRequest("/api/connection-request", {
                method: "POST",
                body: JSON.stringify({
                  root: MODEL.root,
                  intent: discoveredEdge ? "improve" : "add",
                  source,
                  target,
                }),
              });
              clearElement(details);
              appendPanelBack();
              appendText(details, "h2", "Connection work started");
              appendText(
                details,
                "p",
                result.targetSessionId
                  ? "Unity routed the reviewed change to the app's implementation session."
                  : "Unity started the reviewed change in the current app session.",
              );
              const nextActions = document.createElement("div");
              nextActions.className = "actions";
              nextActions.append(actionButton("Check for changes", () => location.reload(), true));
              details.append(nextActions);
              setStatus("Connection implementation requested.");
            } catch (error) {
              for (const button of actions.querySelectorAll("button")) button.disabled = false;
              setStatus(error.message, true);
            }
          },
          true,
        );
        actions.append(confirmButton);
        actions.append(actionButton("Back", () => renderConnectionPanel(
          sourceGroup,
          targetGroup,
          { sourceId: source.id, targetId: target.id },
        )));
      }
      details.append(actions);
    }

    function renderAddToAppPanel(allowedTierIds = null, contextLabel = "") {
      panelMode = "add";
      selectedId = null;
      selectedEdgeId = null;
      applySelection();
      clearElement(details);
      details.dataset.empty = "false";
      appendPanelBack();
      appendText(details, "h2", contextLabel ? "Add component to " + contextLabel : "Add component");
      appendText(
        details,
        "p",
        contextLabel
          ? "Choose a component that belongs in this part of the request flow."
          : "Choose a component. Unity will find an existing implementation, open its guided setup, or prepare a source change for confirmation.",
      );
      const list = document.createElement("div");
      list.className = "action-list";
      const tiers = MODEL.tiers
        .filter((tier) => !allowedTierIds || allowedTierIds.includes(tier.id))
        .sort((left, right) =>
        Number(left.nodeIds.length > 0) - Number(right.nodeIds.length > 0));
      for (const tier of tiers) {
        const card = document.createElement("div");
        card.className = "action-card optional";
        appendText(card, "strong", tier.name);
        appendText(card, "p", tier.jobToBeDone || tier.role);
        const existing = tier.nodeIds.length;
        appendText(
          card,
          "span",
          existing ? String(existing) + " implementation" + (existing === 1 ? "" : "s") + " already in this app" : "Not added yet",
          "action-priority",
        );
        card.append(actionButton(existing ? "Add another" : "Add component", () => renderTierAddPanel(tier)));
        list.append(card);
      }
      details.append(list);
    }

    function renderTierAddPanel(tier, confirming = false, tierResult = null) {
      panelMode = "tier";
      selectedId = null;
      selectedEdgeId = null;
      applySelection();
      clearElement(details);
      details.dataset.empty = "false";
      appendPanelBack();
      appendText(details, "h2", "Add to " + tier.name);
      appendText(
        details,
        "p",
        "Tell Unity what outcome you need. It will guide the source and cloud setup behind this lane, or open the focused studio for an existing resource.",
      );
      appendText(details, "h3", "Tier purpose");
      appendText(details, "p", tier.jobToBeDone || tier.role);

      if (tierResult?.scaffold) {
        appendText(details, "h3", "Suggested scaffold");
        appendText(details, "p", tierResult.scaffold.summary);
        appendList(details, tierResult.scaffold.nextActions || [], "No next actions provided.");
      } else if (tierResult?.outcome === "candidates-discovered") {
        appendText(details, "h3", "Existing evidence");
        appendText(details, "p", String(tierResult.tier.candidateCount) + " implementation candidate(s) are already present in this tier.");
        const candidates = [
          ...(tierResult.tier.candidates?.repository || []),
          ...(tierResult.tier.candidates?.azure || []),
        ];
        appendList(
          details,
          candidates.map((candidate) =>
            candidate.name + " · " +
              (candidate.source === "azure"
                ? "Azure resource"
                : candidate.projectPath || "Source project")),
          "No candidate details are available.",
        );
      }

      if (confirming) {
        appendText(details, "h3", "Confirm source change");
        appendText(
          details,
          "p",
          "Unity will update this app's implementation and configuration. This step does not provision or deploy Azure resources.",
        );
      }

      const actions = document.createElement("div");
      actions.className = "actions";
      if (!tierResult) {
        const setupLabel = tier.hasSpecialistStudio
          ? "Open " + tier.name + " setup →"
          : "Find existing " + tier.name + " implementations →";
        const setupButton = actionButton(setupLabel, async () => {
          if (setupButton.disabled) return;
          setupButton.disabled = true;
          setupButton.textContent = "Opening setup…";
          const result = await openTierStudio(tier);
          if (!setupButton.isConnected) return;
          setupButton.disabled = false;
          setupButton.textContent = result?.outcome === "canvas-opened"
            ? "Reopen " + tier.name + " setup →"
            : setupLabel;
        }, true);
        setupButton.classList.add("setup-action");
        actions.append(setupButton);
      } else if (tierResult.outcome === "candidates-discovered" && tier.id === "gateway") {
        const chooseGateway = actionButton(
          "Choose an AI Gateway →",
          () => renderManagePanel({ openGateway: true }),
          true,
        );
        chooseGateway.classList.add("setup-action");
        actions.append(chooseGateway);
      }
      if (confirming) {
        const confirmButton = actionButton("Confirm capability request", async () => {
          if (confirmButton.disabled) return;
          for (const button of actions.querySelectorAll("button")) button.disabled = true;
          setStatus("Requesting a new " + tier.name + " source capability…");
          try {
            const result = await apiRequest("/api/capability-request", {
              method: "POST",
              body: JSON.stringify({ root: MODEL.root, tierId: tier.id, intent: "add" }),
            });
            clearElement(details);
            appendPanelBack();
            appendText(details, "h2", "Capability implementation started");
            appendText(
              details,
              "p",
              result.targetSessionId
                ? "Unity routed this work to the app's implementation session. When it completes, refresh progress to discover the new evidence and receive the next tailored recommendation."
                : "Unity started this work in the current app session. When it completes, refresh progress to discover the new evidence and receive the next tailored recommendation.",
            );
            const nextActions = document.createElement("div");
            nextActions.className = "actions";
            nextActions.append(actionButton("Check for changes", () => location.reload(), true));
            details.append(nextActions);
            setStatus("Requested a new " + tier.name + " source capability.");
          } catch (error) {
            for (const button of actions.querySelectorAll("button")) button.disabled = false;
            setStatus(error.message, true);
          }
        });
        actions.append(confirmButton);
        actions.append(actionButton("Cancel", () => renderTierAddPanel(tier)));
      } else {
        actions.append(actionButton(
          tier.id === "sre" ? "Set up observability" : "Build this capability",
          () => renderTierAddPanel(tier, true),
        ));
      }
      details.append(actions);
    }

    function renderDetails(node) {
      panelMode = "node";
      updateModeHighlight();
      clearElement(details);
      details.dataset.empty = "false";
      appendPanelBack();
      appendText(details, "h2", node.name);
      const tier = MODEL.tiers.find((candidate) => candidate.id === node.tierId);
      appendText(details, "p", (tier?.name || node.tierId) + " · " + humanize(node.kind) + " · " + node.confidence + " confidence");
      const project = document.createElement("code");
      project.textContent = node.projectPath;
      details.append(project);

      const actions = appendText(details, "div", "", "actions");
      if (operationGroups.has(node.id)) {
        appendText(details, "h3", "Workflow internals");
        appendText(details, "p", operationGroups.get(node.id).nodeIds.length + " internal items are grouped under this workflow.");
        const internalActions = appendText(details, "div", "", "actions");
        for (const id of operationGroups.get(node.id).nodeIds) {
          const child = nodeById.get(id);
          internalActions.append(actionButton("Inspect " + child.name, () => runOpportunityAction({
            action: { kind: "inspect-node", nodeId: id },
          })));
        }
      }

      if (node.badges.length) {
        const badges = document.createElement("div");
        badges.className = "detail-badges";
        for (const badge of node.badges) appendText(badges, "span", badge.label, "detail-badge");
        details.append(badges);
      }

      if (node.details.length) {
        appendText(details, "h3", "Bindings and metadata");
        appendList(details, node.details.map((item) => item.label + ": " + item.value), "No binding details.");
      }

      const incoming = MODEL.edges.filter((edge) => edge.to === node.id);
      const outgoing = MODEL.edges.filter((edge) => edge.from === node.id);
      appendText(details, "h3", "Incoming relationships");
      appendList(details, incoming.map((edge) => humanize(edge.kind) + " from " + (nodeById.get(edge.from)?.name || edge.from)), "No incoming relationships.");
      appendText(details, "h3", "Outgoing relationships");
      appendList(details, outgoing.map((edge) => humanize(edge.kind) + " to " + (nodeById.get(edge.to)?.name || edge.to)), "No outgoing relationships.");

      appendText(details, "h3", "Source evidence");
      appendList(details, node.evidence.map((item) =>
        item.path + ":" + item.line + " · " + humanize(item.rule) + " · " + (item.confidence || node.confidence) + " confidence",
      ), "No direct source evidence recorded.");

      const unresolved = MODEL.unresolved.filter((item) => item.from === node.id);
      if (unresolved.length) {
        appendText(details, "h3", "Unresolved references");
        appendList(details, unresolved.map((item) => item.reference + " · " + item.evidence.path + ":" + item.evidence.line), "");
      }

      if (node.kind === "project") {
        actions.append(actionButton("Open source", async () => {
          try {
            const opened = await apiRequest("/api/open-source", {
              method: "POST",
              body: JSON.stringify({ root: MODEL.root, projectPath: node.projectPath }),
            });
            setStatus("Opened " + node.name + " in " + opened.editorLabel + ".");
          } catch (error) {
            setStatus(error.message, true);
          }
        }, true));
      }
      if (node.kind === "project" && SERVICE_LOG_TIERS.has(node.tierId)) {
        actions.append(actionButton("View service logs", () => renderLogsPanel(node.id)));
      }
      actions.append(actionButton("Open tier studio", () => openTierStudio(tier)));
      const entrypoint = entrypointForNode(node);
      if (entrypoint?.ready) {
        actions.append(actionButton("Open local endpoint", async () => {
          try {
            await apiRequest("/api/open-entrypoint", {
              method: "POST",
              body: JSON.stringify({ root: MODEL.root, port: entrypoint.port }),
            });
            setStatus("Opened " + entrypoint.name + " on port " + entrypoint.port + ".");
          } catch (error) {
            setStatus(error.message, true);
          }
        }));
      }
    }

    function renderEdgeDetails(edge) {
      panelMode = "edge";
      updateModeHighlight();
      clearElement(details);
      details.dataset.empty = "false";
      appendPanelBack();
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      const flow = flowEdgeById.get(edge.id);
      appendText(details, "h2", (from?.name || edge.from) + " → " + (to?.name || edge.to));
      appendText(
        details,
        "p",
        (flow?.label || humanize(edge.kind)) + " · " + (flow?.confidence || edge.confidence) +
          " confidence · " + (flow?.evidenceKind === "documentation"
            ? "documented architecture relationship"
            : "inferred from runtime source"),
      );
      appendText(details, "h3", "How the request moves");
      appendText(
        details,
        "p",
        "Unity found evidence that " + (from?.name || edge.from) + " can call or transfer work to " +
          (to?.name || edge.to) + ". " + (flow?.evidenceKind === "documentation"
            ? "This path is documented but was not confirmed in executable source."
            : "This source relationship is not proof of a successful live request."),
      );
      appendText(details, "h3", "Connection evidence");
      appendList(details, edge.evidence.map((item) =>
        item.path + ":" + item.line + " · " + humanize(item.rule) + " · " +
          (item.confidence || edge.confidence) + " confidence",
      ), "No direct source evidence recorded.");
      const bundle = edgeBundles.get(edge.id) || [];
      if (bundle.length > 1) {
        appendText(details, "h3", "Grouped connections (" + bundle.length + ")");
        appendList(details, bundle.map((item) =>
          (nodeById.get(item.from)?.name || item.from) + " → " + (nodeById.get(item.to)?.name || item.to) +
          " · " + item.evidence.map((source) => source.path + ":" + source.line).join(", ")), "");
      }
    }

    function selectNode(nodeId) {
      if (selectedId === nodeId) {
        renderMapPanel();
        setStatus("Card focus cleared.");
        return;
      }
      selectedId = nodeId;
      selectedEdgeId = null;
      applySelection();
      const node = nodeById.get(nodeId);
      renderDetails(node);
      setStatus("Selected " + node.name + ".");
    }

    function selectEdge(edgeId) {
      const edge = MODEL.edges.find((candidate) => candidate.id === edgeId);
      if (!edge) return;
      if (selectedEdgeId === edgeId) {
        renderMapPanel();
        setStatus("Connection focus cleared.");
        return;
      }
      selectedId = null;
      selectedEdgeId = edgeId;
      applySelection();
      renderEdgeDetails(edge);
      setStatus("Selected the connection from " +
        (nodeById.get(edge.from)?.name || edge.from) + " to " +
        (nodeById.get(edge.to)?.name || edge.to) + ".");
    }

    function visibleNodeIds() {
      return new Set([...nodeElements].filter(([, element]) => !element.classList.contains("hidden")).map(([id]) => id));
    }

    function selectedRequestPath() {
      if (!entryFilter.value) {
        return new Set(MODEL.requestFlow.nodeIds);
      }
      const reachable = new Set([entryFilter.value, ...MODEL.requestFlow.operations]);
      const queue = [entryFilter.value];
      const owner = (id) => operationParents.get(id) || id;
      while (queue.length) {
        const current = queue.shift();
        for (const edge of MODEL.edges.filter((candidate) => owner(candidate.from) === current)) {
          const target = owner(edge.to);
          if (reachable.has(target)) continue;
          reachable.add(target);
          queue.push(target);
        }
      }
      return reachable;
    }

    function applyFilters() {
      const query = normalized(search.value);
      const tierId = tierFilter.value;
      const requestPath = selectedRequestPath();
      let visibleCount = 0;
      const matchesQuery = (node) => normalized([
        node.name, node.projectPath, node.kind, ...node.badges.map((badge) => badge.label),
      ].join(" ")).includes(query);
      for (const node of MODEL.nodes) {
        const parentId = operationParents.get(node.id);
        const ownerId = parentId || node.id;
        const visibleInMode = (!parentId || expandedOperations.has(parentId)) &&
          ((otherResourcesToggle.checked && otherNodeIds.has(ownerId)) ||
          (requestPath.has(ownerId) && !otherNodeIds.has(ownerId)));
        const visible = visibleInMode &&
          (!tierId || node.tierId === tierId) &&
          (!query || matchesQuery(node) || operationGroups.get(node.id)?.nodeIds
            .some((id) => matchesQuery(nodeById.get(id))));
        nodeElements.get(node.id).classList.toggle("hidden", !visible);
        nodeLogElements.get(node.id)?.classList.toggle("hidden", !visible);
        operationToggleElements.get(node.id)?.classList.toggle("hidden", !visible);
        if (visible && parentId) {
          const title = nodeElements.get(node.id).querySelector(".node-title");
          let limit = 28;
          do { title.textContent = shorten(node.name, limit--); }
          while (limit > 4 && title.getComputedTextLength() > NODE_WIDTH - 24);
        }
        if (visible) visibleCount += 1;
      }
      const visibleIds = visibleNodeIds();
      for (const region of document.querySelectorAll("[data-operation-region]")) {
        const group = operationGroups.get(region.dataset.operationRegion);
        region.classList.toggle("hidden", !visibleIds.has(group.parentId) &&
          !group.nodeIds.some((id) => visibleIds.has(id)));
      }
      edgeBundles.clear();
      const representatives = new Map();
      for (const edge of MODEL.edges) {
        const from = displayedNodeId(edge.from);
        const to = displayedNodeId(edge.to);
        const containsInternal = edge.kind === "contains" && operationParents.get(edge.to) === edge.from;
        const visible = from !== to && !containsInternal && visibleIds.has(from) && visibleIds.has(to);
        const flow = flowEdgeById.get(edge.id);
        const key = JSON.stringify([from, to, edge.kind, flow?.confidence || edge.confidence, flow?.evidenceKind]);
        const representative = representatives.get(key);
        if (visible) {
          if (representative) edgeBundles.get(representative).push(edge);
          else { representatives.set(key, edge.id); edgeBundles.set(edge.id, [edge]); }
        }
        edgeElements.get(edge.id).classList.toggle(
          "hidden",
          !visible || Boolean(representative),
        );
        edgeElements.get(edge.id).classList.toggle("internal-edge", Boolean(operationParents.get(edge.from)) &&
          operationParents.get(edge.from) === operationParents.get(edge.to));
      }
      updatePresentation();
      for (const [id, bundle] of edgeBundles) {
        if (bundle.length > 1) edgeElements.get(id).querySelector("text").textContent += " (" + bundle.length + ")";
      }
      const emptyState = document.querySelector("#empty-state");
      emptyState.style.display = visibleCount ? "none" : "grid";
      emptyState.textContent = !MODEL.requestFlow.nodeIds.length && otherNodeIds.size && !otherResourcesToggle.checked
        ? "No request path discovered. Show other resources to inspect the app inventory."
        : "No nodes match the current filters.";
      const selectedEdge = MODEL.edges.find((edge) => edge.id === selectedEdgeId);
      if ((selectedId && !visibleIds.has(selectedId)) ||
          (selectedEdge && edgeElements.get(selectedEdge.id).classList.contains("hidden"))) {
        renderMapPanel();
      }
      setStatus(visibleCount + " components shown" +
        (!otherResourcesToggle.checked && otherResourceIds.length
          ? " · " + otherResourceIds.length + " other resources hidden" : "") +
        (operationParents.size ? " · workflow internals expand on demand" : "") + ".");
      applySelection();
    }

    function contentBounds() {
      const visible = visibleNodeIds();
      const points = [...positions].filter(([id]) => visible.has(id)).map(([, point]) => point);
      if (!points.length) return { x: 0, y: 0, width: worldWidth, height: worldHeight };
      const minX = Math.min(WORLD_PADDING, ...points.map((point) => point.x));
      const minY = Math.min(WORLD_PADDING, ...points.map((point) => point.y));
      const maxX = Math.max(worldWidth - WORLD_PADDING, ...points.map((point) => point.x + NODE_WIDTH));
      const maxY = Math.max(worldHeight - WORLD_PADDING, ...points.map((point) => point.y + NODE_HEIGHT));
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    function fitGraph(minimumScale = .18, content = contentBounds()) {
      const bounds = svg.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      mapHasFitted = true;
      const padding = 28;
      const usableHeight = Math.max(1, bounds.height - 64);
      const fittedScale = Math.min(1.25, Math.max(.18, Math.min(
        (bounds.width - padding * 2) / content.width,
        (usableHeight - padding * 2) / content.height,
      )));
      const scale = Math.max(minimumScale, fittedScale);
      transform = {
        scale,
        x: scale > fittedScale ? padding - content.x * scale : (bounds.width - content.width * scale) / 2 - content.x * scale,
        y: (usableHeight - content.height * scale) / 2 - content.y * scale,
      };
      applyTransform();
    }

    function zoomBy(factor, clientX, clientY) {
      const bounds = svg.getBoundingClientRect();
      const anchorX = clientX ?? bounds.left + bounds.width / 2;
      const anchorY = clientY ?? bounds.top + bounds.height / 2;
      const localX = anchorX - bounds.left;
      const localY = anchorY - bounds.top;
      const worldX = (localX - transform.x) / transform.scale;
      const worldY = (localY - transform.y) / transform.scale;
      const scale = Math.max(.18, Math.min(2.5, transform.scale * factor));
      transform = {
        scale,
        x: localX - worldX * scale,
        y: localY - worldY * scale,
      };
      applyTransform();
    }

    function handleMapWheel(event) {
      if (!event.deltaY) return;
      event.preventDefault();
      const deltaPixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? event.deltaY * 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? event.deltaY * Math.max(1, graphShell.clientHeight)
          : event.deltaY;
      const boundedDelta = Math.max(-240, Math.min(240, deltaPixels));
      zoomBy(Math.exp(-boundedDelta * WHEEL_ZOOM_SENSITIVITY), event.clientX, event.clientY);
    }

    const savedDetailsHeight = Number(localStorage.getItem(MODEL.layoutKey + ":details-height"));
    if (Number.isFinite(savedDetailsHeight) && savedDetailsHeight > 0) {
      setDetailsPanelHeight(savedDetailsHeight);
    } else {
      setDetailsPanelHeight(detailsPanelHeight);
    }
    detailsResizer.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      detailsResizeState = { pointerId: event.pointerId };
      detailsResizer.setPointerCapture(event.pointerId);
      document.body.classList.add("resizing-details");
    });
    detailsResizer.addEventListener("pointermove", (event) => {
      if (detailsResizeState?.pointerId !== event.pointerId) return;
      setDetailsPanelHeight(workspace.getBoundingClientRect().bottom - event.clientY);
    });
    const finishDetailsResize = (event) => {
      if (detailsResizeState?.pointerId !== event.pointerId) return;
      detailsResizeState = null;
      document.body.classList.remove("resizing-details");
      setDetailsPanelHeight(detailsPanelHeight, true);
    };
    detailsResizer.addEventListener("pointerup", finishDetailsResize);
    detailsResizer.addEventListener("pointercancel", finishDetailsResize);
    detailsResizer.addEventListener("keydown", (event) => {
      let nextHeight = null;
      if (event.key === "ArrowUp") nextHeight = detailsPanelHeight + 24;
      if (event.key === "ArrowDown") nextHeight = detailsPanelHeight - 24;
      if (event.key === "Home") nextHeight = 180;
      if (event.key === "End") nextHeight = detailsHeightMaximum();
      if (nextHeight === null) return;
      event.preventDefault();
      setDetailsPanelHeight(nextHeight, true);
    });
    window.addEventListener("resize", () => {
      if (!guideExplicitChoice) setGuideCollapsed(window.innerWidth <= 900);
    });
    new ResizeObserver(() => {
      setDetailsPanelHeight(detailsPanelHeight);
    }).observe(workspace);

    svg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      panState = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: transform.x,
        startY: transform.y,
        moved: false,
      };
      svg.setPointerCapture(event.pointerId);
      svg.classList.add("panning");
    });
    svg.addEventListener("pointermove", (event) => {
      if (panState?.pointerId === event.pointerId) {
        if (Math.abs(event.clientX - panState.x) > 3 || Math.abs(event.clientY - panState.y) > 3) {
          panState.moved = true;
        }
        transform.x = panState.startX + event.clientX - panState.x;
        transform.y = panState.startY + event.clientY - panState.y;
        applyTransform();
      }
    });
    svg.addEventListener("pointerup", (event) => {
      if (panState?.pointerId === event.pointerId) {
        const clearFocus = !panState.moved && (selectedId || selectedEdgeId);
        panState = null;
        svg.classList.remove("panning");
        if (clearFocus) {
          renderMapPanel();
          setStatus("Card focus cleared.");
        }
      }
    });
    svg.addEventListener("pointercancel", (event) => {
      if (panState?.pointerId === event.pointerId) panState = null;
      svg.classList.remove("panning");
    });
    svg.addEventListener("wheel", handleMapWheel, { passive: false });
    document.querySelector("#zoom-in").addEventListener("click", () => zoomBy(1.2));
    document.querySelector("#zoom-out").addEventListener("click", () => zoomBy(.82));
    document.querySelector("#fit").addEventListener("click", () => fitGraph());
    document.querySelector("#action-center").addEventListener("click", () => setGuideCollapsed(!guideCollapsed, true));
    document.querySelector("#map-app").addEventListener("click", () => {
      if (["map", "logs"].includes(document.body.dataset.workspace)) return;
      if (observeView === "logs") renderLogsPanel();
      else renderMapPanel();
    });
    document.querySelector("#map-view").addEventListener("click", renderMapPanel);
    const dismissStructureGuidance = () => {
      setStructureGuidance(false);
      document.querySelector("#map-view").focus({ preventScroll: true });
    };
    document.querySelector("#close-structure-guidance").addEventListener("click", dismissStructureGuidance);
    structureGuidance.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismissStructureGuidance();
    });
    document.querySelector("#logs-app").addEventListener("click", () => renderLogsPanel());
    document.querySelector("#build-app").addEventListener("click", renderBuildPanel);
    document.querySelector("#manage-app").addEventListener("click", () => {
      document.querySelector(".map-tools").open = false;
      renderManagePanel();
    });
    for (const tabs of document.querySelectorAll(".workspace-tabs")) {
      tabs.addEventListener("keydown", (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const items = [...tabs.querySelectorAll("[role='tab']")];
        const index = items.indexOf(event.target);
        if (index < 0) return;
        const direction = getComputedStyle(tabs).direction === "rtl" ? -1 : 1;
        const next = event.key === "ArrowRight" ? (index + direction + items.length) % items.length
          : event.key === "ArrowLeft" ? (index - direction + items.length) % items.length
            : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        for (const [position, tab] of items.entries()) tab.tabIndex = position === next ? 0 : -1;
        items[next].focus({ preventScroll: true });
      });
    }
    for (const shortcut of document.querySelectorAll("[data-guide-stage]")) {
      shortcut.addEventListener("click", () => {
        setGuideCollapsed(false, true);
        const stage = guideContent.querySelector('[data-stage="' + shortcut.dataset.guideStage + '"]');
        guideContent.scrollTop += stage.getBoundingClientRect().top - guideContent.getBoundingClientRect().top - 12;
        stage.focus({ preventScroll: true });
      });
    }
    document.querySelector(".map-tools").addEventListener("toggle", updateModeHighlight);
    document.addEventListener("pointerdown", (event) => {
      const tools = document.querySelector(".map-tools");
      if (tools.open && !tools.contains(event.target)) tools.open = false;
    });
    appStatusBadge.addEventListener("click", renderManagePanel);
    headerRuntimeAction.addEventListener("click", () => {
      if (headerRuntimeAction.disabled) return;
      const operation = headerRuntimeAction.dataset.operation;
      if (operation) {
        void runAppOperation(operation);
        return;
      }
      renderManagePanel({ openGateway: true });
    });
    otherResourcesToggle.addEventListener("change", () => {
      applyLayout();
      try { localStorage.setItem(otherResourcesKey, String(otherResourcesToggle.checked)); }
      catch (error) { setStatus("Could not remember resource visibility: " + error.message, true); }
    });
    resetLayoutButton.addEventListener("click", () => {
      fitGraph(.48);
      setStatus("App Map view reset.");
    });
    search.addEventListener("input", applyFilters);
    tierFilter.addEventListener("change", applyFilters);
    entryFilter.addEventListener("change", () => {
      applyFilters();
      fitGraph(.48);
    });
    search.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = [...nodeElements.values()].find((element) => !element.classList.contains("hidden"));
      if (first) first.focus();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (document.querySelector(".map-tools").open) {
        document.querySelector(".map-tools").open = false;
        document.querySelector(".map-tools > summary").focus();
      } else if (guideRail.contains(document.activeElement)) {
        setGuideCollapsed(true, true);
      } else if (document.body.dataset.workspace === "map" && panelMode !== "map") {
        closeMapDetails();
      }
    });

    renderEdges();
    renderNodes();
    for (const nodeId of MODEL.requestFlow.entrypointIds) {
      const node = nodeById.get(nodeId);
      if (!node) continue;
      const option = document.createElement("option");
      option.value = nodeId;
      option.textContent = "Starting at " + node.name;
      entryFilter.append(option);
    }
    applyLayout(false);
    setGuideCollapsed(guideCollapsed);
    renderActionCenter();
    renderBuildPanel();
    void refreshOperationalState();
    setInterval(() => { void refreshOperationalState(); }, 2000);
    setInterval(() => { void refreshRunOutput(); }, 1000);
    ${renderThemeClientScript(apiToken, editorSettings)}
  </script>
</body>
</html>`;
}
