import { createHash } from "node:crypto";

import { PLATFORM_TIERS } from "./tier-definitions.mjs";

const RENDERER_SCHEMA_VERSION = 3;
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
    const first = appMap.unresolved[0];
    opportunities.push({
      id: "resolve-connections",
      priority: "attention",
      stage: "connect",
      title: `Review ${unresolvedCount} uncertain ${unresolvedCount === 1 ? "connection" : "connections"}`,
      detail: "Unity found source references whose destination is missing or ambiguous. Inspect the evidence before relying on these paths.",
      action: { kind: "inspect-node", nodeId: first.from, label: "Review evidence" },
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
  const visibleNodes = appMap.nodes.filter((node) => node.kind !== "operation");
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
    for (const edge of appMap.edges.filter((candidate) => candidate.from === current)) {
      if (reachable.has(edge.to)) continue;
      reachable.add(edge.to);
      queue.push(edge.to);
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
    .filter((edge) => pathNodeIds.has(edge.from) && pathNodeIds.has(edge.to))
    .map((edge) => ({ id: edge.id, ...flowEdgePresentation(edge, nodeTiers) }));
  return {
    groups,
    operations,
    telemetryNodeIds,
    nodeIds: [...pathNodeIds],
    unconnectedNodeIds: visibleNodes
      .filter((node) => !pathNodeIds.has(node.id))
      .map((node) => node.id),
    entrypointIds,
    edges,
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

export function renderInteractiveAppMapHtml(appMap, { apiToken = "", appName: providedAppName } = {}) {
  const model = buildInteractiveAppMapModel(appMap);
  const appName = providedAppName ||
    model.root.split(/[\\/]/).filter(Boolean).at(-1) ||
    "Unity app";
  const tierOptions = model.tiers
    .map((tier) => `<option value="${escapeHtml(tier.id)}">${escapeHtml(tier.name)}</option>`)
    .join("");

  return `<!doctype html>
<html lang="en">
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
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body {
      display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr) auto;
      background: var(--bg); color: var(--text);
    }
    header, main, footer { min-width: 0; }
    header {
      display: flex; align-items: center; gap: 16px; padding: 12px 16px;
      border-bottom: 1px solid var(--border); background: var(--surface);
    }
    .heading { min-width: 220px; flex: 1; }
    .heading small { display: block; margin-bottom: 1px; color: var(--accent); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
    h1 { margin: 0; font-size: 20px; }
    .heading p { margin: 2px 0 0; color: var(--muted); font-size: 12px; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .header-actions { position: relative; display: flex; align-items: center; gap: 8px; margin-left: auto; }
    .header-actions > button.primary { border-color: var(--accent); background: var(--accent); color: #fff; }
    .map-view-bar { padding: 0 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
    .map-tools { position: relative; }
    .map-tools > summary {
      min-height: 32px; display: flex; align-items: center; padding: 4px 10px;
      border: 1px solid var(--border); border-radius: 4px; background: var(--surface); cursor: pointer; list-style: none;
    }
    .map-tools > summary::-webkit-details-marker { display: none; }
    .map-tools > summary::after { margin-left: 6px; content: "▾"; color: var(--muted); font-size: 10px; }
    .map-tools[open] > summary { border-color: var(--accent); }
    .toolbar {
      position: absolute; z-index: 5; top: calc(100% + 8px); right: 0;
      width: min(720px, calc(100vw - 32px)); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 12px; border: 1px solid var(--border); border-radius: 8px;
      background: var(--surface); box-shadow: 0 10px 28px rgb(0 0 0 / .18);
    }
    .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    input, select, button {
      min-height: 32px; border: 1px solid var(--border); border-radius: 4px;
      background: var(--surface); color: var(--text); font: inherit;
    }
    input { min-width: 210px; padding: 4px 9px; }
    select { padding: 4px 28px 4px 9px; }
    button { padding: 4px 10px; cursor: pointer; }
    button:hover { border-color: var(--accent); }
    .back-link { border: 0; padding-inline: 2px 8px; color: var(--accent); background: transparent; }
    button:focus-visible, input:focus-visible, select:focus-visible {
      outline: 2px solid var(--focus); outline-offset: 2px;
    }
    .icon-group { display: inline-flex; }
    .icon-group button { border-radius: 0; min-width: 34px; }
    .icon-group button:first-child { border-radius: 4px 0 0 4px; }
    .icon-group button:last-child { border-radius: 0 4px 4px 0; }
    .map-view-switch { display: flex; gap: 18px; width: max-content; max-width: 100%; }
    .map-view-switch button {
      flex: 0 0 auto; min-height: 40px; padding: 8px 2px 7px;
      border: 0; border-bottom: 3px solid transparent; border-radius: 0;
      background: transparent; color: var(--muted); font-weight: 600; white-space: nowrap;
    }
    .map-view-switch button:hover { border-bottom-color: var(--border); color: var(--text); }
    .map-view-switch button[aria-selected="true"] { border-bottom-color: var(--accent); color: var(--accent); }
    #entry-filter[hidden] { display: none; }
    main { position: relative; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 380px; }
    #graph-shell { position: relative; min-width: 0; overflow: hidden; background: var(--surface-muted); }
    #graph { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
    #graph.panning { cursor: grabbing; }
    .lane > rect { fill: var(--surface); stroke: var(--border); }
    .lane-title { fill: var(--text); font-size: 14px; font-weight: 650; }
    .lane-role { fill: var(--muted); font-size: 10px; }
    .lane-count { fill: var(--muted); font-size: 11px; }
    .lane-add { cursor: pointer; }
    .lane-add rect { fill: var(--surface-muted); stroke: var(--border); }
    .lane-add text { fill: var(--accent); font-size: 10px; font-weight: 650; pointer-events: none; }
    .lane-add:focus-visible rect { stroke: var(--focus); stroke-width: 2; }
    .flow-region > rect { fill: var(--surface); stroke: var(--border); }
    .flow-region.operations > rect { fill: var(--accent-soft); stroke: var(--accent); stroke-dasharray: 7 5; }
    .flow-region-title { fill: var(--text); font-size: 14px; font-weight: 650; }
    .flow-region-role { fill: var(--muted); font-size: 10px; }
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
    body.implementation-view .node { cursor: ns-resize; }
    .node rect { fill: var(--surface); stroke: var(--border); stroke-width: 1.5; filter: drop-shadow(0 2px 3px rgb(0 0 0 / .12)); }
    .node.project rect { stroke: var(--accent); }
    .node:focus-visible rect { stroke: var(--focus); stroke-width: 3; }
    .node.selected rect { stroke: var(--focus); stroke-width: 3; }
    .node-title { fill: var(--text); font-size: 13px; font-weight: 650; }
    .node-meta { fill: var(--muted); font-size: 10px; }
    .node-badge { fill: var(--accent); font-size: 9px; font-weight: 600; }
    .node-tier { fill: var(--accent); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .muted { opacity: .18; }
    .hidden { display: none; }
    #empty-state {
      position: absolute; inset: 0; display: none; place-items: center; pointer-events: none;
      color: var(--muted); font-weight: 600;
    }
    aside { min-width: 0; overflow: auto; border-left: 1px solid var(--border); background: var(--surface); padding: 16px; }
    aside h2 { margin: 0 0 4px; font-size: 18px; }
    aside h3 { margin: 18px 0 6px; font-size: 13px; }
    aside p { margin: 4px 0 10px; color: var(--muted); font-size: 13px; line-height: 1.45; }
    aside code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
    aside ul { margin: 4px 0; padding-left: 18px; }
    aside li { margin: 5px 0; font-size: 12px; overflow-wrap: anywhere; }
    .command-output { max-height: 220px; overflow: auto; padding: 10px; border-radius: 6px; background: #111; color: #f3f2f1; font: 11px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; }
    .panel-back { min-height: auto; margin: 0 0 12px; padding: 0; border: 0; color: var(--accent); background: transparent; font-size: 12px; }
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
    .journey-stage.next, .journey-stage.ready, .journey-stage.running { border-radius: 7px; background: var(--accent-soft); }
    .journey-stage strong { display: block; font-size: 12px; line-height: 1.3; }
    .journey-detail { display: block; margin-top: 6px; color: var(--muted); font-size: 10px; line-height: 1.35; }
    .journey-state { display: block; margin-bottom: 4px; color: var(--muted); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .journey-stage.complete::before { border-color: #107c10; background: #107c10; }
    .journey-stage.complete .journey-state { color: #107c10; }
    .journey-stage.next::before, .journey-stage.ready::before { border-color: var(--accent); background: var(--accent); }
    .journey-stage.next .journey-state, .journey-stage.ready .journey-state { color: var(--accent); }
    .journey-stage.running::before { border-color: #107c10; background: #107c10; box-shadow: 0 0 0 3px rgb(16 124 16 / .18); }
    .journey-stage.running .journey-state { color: #107c10; }
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
    .action-card button { min-height: 28px; font-size: 11px; }
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
    .actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 16px; }
    .actions button.primary { border-color: var(--accent); background: var(--accent); color: #fff; }
    button.danger { border-color: var(--danger); color: var(--danger); }
    .error { color: var(--danger); }
    footer {
      display: flex; justify-content: space-between; gap: 12px; padding: 5px 12px;
      border-top: 1px solid var(--border); background: var(--surface); color: var(--muted); font-size: 11px;
    }
    footer > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (max-width: 900px) {
      main { grid-template-columns: minmax(0, 1fr); }
      aside { position: absolute; z-index: 4; right: 0; inset-block: 0; width: min(360px, 90vw); box-shadow: -8px 0 24px rgb(0 0 0 / .18); }
      aside[data-empty="true"] { display: none; }
      .heading p { display: none; }
    }
    @media (max-width: 620px) {
      header {
        display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 10px; padding: 8px 12px;
      }
      .heading { min-width: 0; }
      h1 { overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
      .header-actions {
        grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
        width: 100%; margin-left: 0;
      }
      .header-actions > button, .map-tools, .map-tools > summary { width: 100%; min-width: 0; }
      .map-tools > summary { justify-content: center; }
      .toolbar { width: calc(100vw - 24px); }
      .map-view-bar { padding-inline: 12px; }
      .map-view-switch { width: 100%; min-width: 0; }
      .map-view-switch button { flex: 1; }
      main { grid-template-rows: minmax(180px, 2fr) minmax(260px, 3fr); }
      aside {
        position: static; width: 100%; height: auto; border-top: 1px solid var(--border);
        border-left: 0; box-shadow: none;
      }
      footer > :last-child { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      * { scroll-behavior: auto !important; transition: none !important; }
    }
  </style>
</head>
<body>
  <header>
    <button id="back-apps" class="back-link" type="button">← Apps</button>
    <div class="heading">
      <small>App Map</small>
      <h1>${escapeHtml(appName)}</h1>
      <p>See how a request moves through your app.</p>
    </div>
    <div class="header-actions">
      <button id="action-center" class="primary" type="button">Guide</button>
      <button id="manage-app" type="button">Manage</button>
      <details class="map-tools">
        <summary>Search &amp; layout</summary>
        <div class="toolbar" role="toolbar" aria-label="Advanced App Map controls">
          <label><span class="visually-hidden">Request entry point</span><select id="entry-filter" aria-label="Request entry point"><option value="">All request paths</option></select></label>
          <label><span class="visually-hidden">Search nodes</span><input id="search" type="search" placeholder="Find a component…" aria-label="Search nodes"></label>
          <label><span class="visually-hidden">Filter by tier</span><select id="tier-filter" aria-label="Filter by tier"><option value="">All component types</option>${tierOptions}</select></label>
          <div class="icon-group" aria-label="Zoom controls">
            <button id="zoom-out" type="button" aria-label="Zoom out" title="Zoom out">−</button>
            <button id="zoom-in" type="button" aria-label="Zoom in" title="Zoom in">+</button>
          </div>
          <button id="fit" type="button">Fit map</button>
          <button id="reset-layout" type="button">Reset map</button>
        </div>
      </details>
    </div>
  </header>
  <nav class="map-view-bar" aria-label="App Map views">
    <div class="map-view-switch" role="tablist" aria-label="App Map view">
      <button id="request-flow-view" type="button" role="tab" aria-selected="true" aria-controls="graph-shell">Request flow</button>
      <button id="implementation-view" type="button" role="tab" aria-selected="false" aria-controls="graph-shell" tabindex="-1">Implementation map</button>
    </div>
  </nav>
  <main>
    <div id="graph-shell">
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
    <aside id="details" aria-live="polite" data-empty="false"></aside>
  </main>
  <footer>
    <span id="status" role="status">${escapeHtml(model.summary.projectNodes)} projects · ${escapeHtml(model.summary.operationNodes)} operations · ${escapeHtml(model.summary.edges)} edges</span>
    <span id="map-context">Evidence-backed request flow · dashed paths need confirmation</span>
  </footer>
  <noscript><main class="noscript">${renderNoScriptFallback(model)}</main></noscript>
  <script>
    "use strict";
    const MODEL = ${safeJson(model)};
    const API_TOKEN = ${safeJson(apiToken)};
    let launchNotice = new URLSearchParams(location.search).get("notice") || "";
    const NS = "http://www.w3.org/2000/svg";
    const LANE_WIDTH = 248;
    const LANE_GAP = 24;
    const WORLD_PADDING = 24;
    const LANE_HEADER = 62;
    const NODE_WIDTH = 206;
    const NODE_HEIGHT = 96;
    const NODE_STEP = 122;
    const MIN_WORLD_HEIGHT = 680;
    const FLOW_REGION_GAP = 34;
    const FLOW_CARD_GAP = 18;
    const svg = document.querySelector("#graph");
    const viewport = document.querySelector("#viewport");
    const lanesLayer = document.querySelector("#lanes");
    const edgesLayer = document.querySelector("#edges");
    const nodesLayer = document.querySelector("#nodes");
    const details = document.querySelector("#details");
    const status = document.querySelector("#status");
    const mapContext = document.querySelector("#map-context");
    const search = document.querySelector("#search");
    const tierFilter = document.querySelector("#tier-filter");
    const entryFilter = document.querySelector("#entry-filter");
    const requestFlowButton = document.querySelector("#request-flow-view");
    const implementationButton = document.querySelector("#implementation-view");
    const resetLayoutButton = document.querySelector("#reset-layout");
    const nodeById = new Map(MODEL.nodes.map((node) => [node.id, node]));
    const tierById = new Map(MODEL.tiers.map((tier) => [tier.id, tier]));
    const flowEdgeById = new Map(MODEL.requestFlow.edges.map((edge) => [edge.id, edge]));
    const nodeElements = new Map();
    const edgeElements = new Map();
    const positions = new Map();
    const defaultPositions = new Map();
    let runtimeEntrypoints = [];
    let operationalState = { app: null, readiness: null };
    let gatewayState = null;
    let operationalFingerprint = "";
    let lifecycleOperation = null;
    let layoutMode = "request-flow";
    let panelMode = "action-center";
    let selectedId = null;
    let selectedEdgeId = null;
    let panState = null;
    let dragState = null;
    let suppressNodeClick = null;
    const ACTIVE_LIFECYCLE_STATES = ["starting", "stopping", "configuring", "provisioning", "deploying"];
    let transform = { x: 0, y: 0, scale: 1 };

    const maxTierNodes = Math.max(1, ...MODEL.tiers.map((tier) => tier.nodeIds.length));
    let worldWidth = WORLD_PADDING * 2 + MODEL.tiers.length * LANE_WIDTH + (MODEL.tiers.length - 1) * LANE_GAP;
    let worldHeight = Math.max(MIN_WORLD_HEIGHT, LANE_HEADER + 40 + maxTierNodes * NODE_STEP);

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

    function normalized(value) {
      return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    }

    function applyTransform() {
      viewport.setAttribute("transform", "translate(" + transform.x + " " + transform.y + ") scale(" + transform.scale + ")");
    }

    function worldPoint(event) {
      const bounds = svg.getBoundingClientRect();
      return {
        x: (event.clientX - bounds.left - transform.x) / transform.scale,
        y: (event.clientY - bounds.top - transform.y) / transform.scale,
      };
    }

    function setStatus(message, isError = false) {
      status.textContent = message;
      status.classList.toggle("error", isError);
    }

    function implementationLayout() {
      worldWidth = WORLD_PADDING * 2 + MODEL.tiers.length * LANE_WIDTH + (MODEL.tiers.length - 1) * LANE_GAP;
      worldHeight = Math.max(MIN_WORLD_HEIGHT, LANE_HEADER + 40 + maxTierNodes * NODE_STEP);
      MODEL.tiers.forEach((tier, tierIndex) => {
        tier.nodeIds.forEach((nodeId, nodeIndex) => {
          defaultPositions.set(nodeId, {
            x: WORLD_PADDING + tierIndex * (LANE_WIDTH + LANE_GAP) + (LANE_WIDTH - NODE_WIDTH) / 2,
            y: LANE_HEADER + 34 + nodeIndex * NODE_STEP,
          });
        });
      });
      let saved = {};
      const storageKey = MODEL.layoutKey + ":implementation";
      try {
        saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      } catch {
        localStorage.removeItem(storageKey);
      }
      for (const node of MODEL.nodes) {
        const candidate = saved[node.id];
        const fallback = defaultPositions.get(node.id);
        positions.set(node.id, constrainPosition(
          node.id,
          Number.isFinite(candidate?.y) ? candidate : fallback,
        ));
      }
    }

    function requestFlowLayout() {
      const maxGroupRows = Math.max(1, ...MODEL.requestFlow.groups.map((group) =>
        Math.ceil(group.nodeIds.length / flowGroupColumns(group))));
      const flowBodyHeight = Math.max(500, LANE_HEADER + 48 + maxGroupRows * NODE_STEP);
      const operationRows = Math.max(1, Math.ceil(MODEL.requestFlow.operations.length / 4));
      const operationsHeight = 72 + operationRows * NODE_STEP;
      worldWidth = WORLD_PADDING * 2 +
        MODEL.requestFlow.groups.reduce((total, group) => total + flowGroupWidth(group), 0) +
        (MODEL.requestFlow.groups.length - 1) * FLOW_REGION_GAP;
      worldHeight = flowBodyHeight + operationsHeight + FLOW_REGION_GAP + WORLD_PADDING;
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
          y: flowBodyHeight + FLOW_REGION_GAP + 52 + row * NODE_STEP,
        });
      });
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

    function constrainPosition(nodeId, point) {
      const lanePosition = defaultPositions.get(nodeId);
      return {
        x: lanePosition.x,
        y: Math.max(LANE_HEADER + 34, Math.min(worldHeight - WORLD_PADDING - NODE_HEIGHT, point.y)),
      };
    }

    function savePositions() {
      const serialized = Object.fromEntries([...positions].map(([id, point]) => [id, {
        x: Math.round(point.x * 10) / 10,
        y: Math.round(point.y * 10) / 10,
      }]));
      localStorage.setItem(MODEL.layoutKey + ":implementation", JSON.stringify(serialized));
    }

    function renderLanes() {
      MODEL.tiers.forEach((tier, index) => {
        const x = WORLD_PADDING + index * (LANE_WIDTH + LANE_GAP);
        const group = svgElement("g", { class: "lane", "data-tier-id": tier.id });
        group.append(svgElement("rect", { x, y: WORLD_PADDING, width: LANE_WIDTH, height: worldHeight - WORLD_PADDING * 2, rx: 8 }));
        const title = svgElement("text", { x: x + 14, y: WORLD_PADDING + 24, class: "lane-title" });
        title.textContent = tier.name;
        group.append(title);
        const count = svgElement("text", { x: x + LANE_WIDTH - 14, y: WORLD_PADDING + 24, class: "lane-count", "text-anchor": "end" });
        count.textContent = tier.nodeIds.length + (tier.nodeIds.length === 1 ? " node" : " nodes");
        group.append(count);
        const role = svgElement("text", { x: x + 14, y: WORLD_PADDING + 43, class: "lane-role" });
        role.textContent = shorten(tier.role, 38);
        group.append(role);
        const add = svgElement("g", {
          class: "lane-add",
          tabindex: "0",
          role: "button",
          "aria-label": "Add capability to " + tier.name,
        });
        add.append(svgElement("rect", { x: x + LANE_WIDTH - 58, y: WORLD_PADDING + 31, width: 44, height: 20, rx: 4 }));
        const addText = svgElement("text", { x: x + LANE_WIDTH - 36, y: WORLD_PADDING + 45, "text-anchor": "middle" });
        addText.textContent = "+ Add";
        add.append(addText);
        add.addEventListener("pointerdown", (event) => event.stopPropagation());
        add.addEventListener("click", () => renderTierAddPanel(tier));
        add.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          renderTierAddPanel(tier);
        });
        group.append(add);
        lanesLayer.append(group);
      });
    }

    function renderFlowRegions() {
      const operationsY = worldHeight -
        (72 + Math.max(1, Math.ceil(MODEL.requestFlow.operations.length / 4)) * NODE_STEP) -
        WORLD_PADDING;
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
        lanesLayer.append(region);
      });
      const operations = svgElement("g", { class: "flow-region operations" });
      operations.append(svgElement("rect", {
        x: WORLD_PADDING,
        y: operationsY,
        width: worldWidth - WORLD_PADDING * 2,
        height: worldHeight - operationsY - WORLD_PADDING,
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
      lanesLayer.append(operations);
    }

    function renderNodes() {
      for (const node of MODEL.nodes) {
        const group = svgElement("g", {
          class: "node " + node.kind,
          tabindex: "0",
          role: "button",
          "aria-label": node.name + ", " + humanize(node.kind) + ", " + node.confidence + " confidence",
          "data-node-id": node.id,
        });
        group.append(svgElement("rect", { width: NODE_WIDTH, height: NODE_HEIGHT, rx: 7 }));
        const title = svgElement("title");
        title.textContent = node.name + " — " + node.projectPath;
        group.append(title);
        const name = svgElement("text", { x: 12, y: 23, class: "node-title" });
        name.textContent = shorten(node.name, 27);
        group.append(name);
        const kind = svgElement("text", { x: 12, y: 42, class: "node-meta", "data-role": "kind" });
        kind.textContent = humanize(node.kind) + " · " + node.confidence + " confidence";
        group.append(kind);
        const project = svgElement("text", { x: 12, y: 61, class: "node-meta" });
        project.textContent = shorten(node.projectPath, 34);
        group.append(project);
        if (node.badges.length) {
          const badges = svgElement("text", { x: 12, y: 82, class: "node-badge" });
          badges.textContent = shorten(node.badges.map((badge) => badge.label).join(" · "), 37);
          group.append(badges);
        }
        group.addEventListener("click", () => {
          if (suppressNodeClick === node.id) return;
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
          if (layoutMode !== "implementation") return;
          const point = worldPoint(event);
          const position = positions.get(node.id);
          dragState = {
            pointerId: event.pointerId,
            nodeId: node.id,
            offsetX: point.x - position.x,
            offsetY: point.y - position.y,
            moved: false,
          };
          group.setPointerCapture(event.pointerId);
        });
        nodesLayer.append(group);
        nodeElements.set(node.id, group);
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
      document.body.classList.toggle("implementation-view", layoutMode === "implementation");
      requestFlowButton.setAttribute("aria-selected", String(layoutMode === "request-flow"));
      implementationButton.setAttribute("aria-selected", String(layoutMode === "implementation"));
      requestFlowButton.tabIndex = layoutMode === "request-flow" ? 0 : -1;
      implementationButton.tabIndex = layoutMode === "implementation" ? 0 : -1;
      entryFilter.hidden = layoutMode !== "request-flow" || MODEL.requestFlow.entrypointIds.length < 2;
      resetLayoutButton.textContent = layoutMode === "request-flow" ? "Reset view" : "Reset layout";
      mapContext.textContent = layoutMode === "request-flow"
        ? "Evidence-backed request flow · dashed paths need confirmation"
        : "Source-derived implementation inventory · not runtime health";
      for (const node of MODEL.nodes) {
        const element = nodeElements.get(node.id);
        const kind = element.querySelector('[data-role="kind"]');
        const tier = tierById.get(node.tierId);
        kind.textContent = layoutMode === "request-flow"
          ? (tier?.name || node.tierId) + " · " + node.confidence + " confidence"
          : humanize(node.kind) + " · " + node.confidence + " confidence";
      }
      for (const edge of MODEL.edges) {
        const group = edgeElements.get(edge.id);
        const label = edgeElements.get(edge.id).querySelector("text");
        const flow = flowEdgeById.get(edge.id);
        const confidence = layoutMode === "request-flow" && flow
          ? flow.confidence
          : edge.confidence;
        group.classList.remove("high", "medium", "low");
        group.classList.add(confidence);
        group.setAttribute(
          "aria-label",
          (layoutMode === "request-flow" && flow ? flow.label : humanize(edge.kind)) +
            ", " + confidence + " confidence",
        );
        group.querySelector("path").setAttribute("marker-end", "url(#arrow-" + confidence + ")");
        label.textContent = layoutMode === "request-flow" && flow
          ? (flow.step ? flow.step + ". " : "") + flow.label
          : humanize(edge.kind) + " · " + edge.confidence;
      }
    }

    function applyLayout(nextMode, shouldFit = true) {
      layoutMode = nextMode;
      defaultPositions.clear();
      positions.clear();
      clearElement(lanesLayer);
      if (layoutMode === "request-flow") {
        requestFlowLayout();
        renderFlowRegions();
      } else {
        implementationLayout();
        renderLanes();
      }
      selectedId = null;
      selectedEdgeId = null;
      updatePresentation();
      updateGeometry();
      applyFilters();
      if (shouldFit) requestAnimationFrame(() => fitGraph(layoutMode === "request-flow" ? .48 : .58));
    }

    function edgeGeometry(edge) {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return null;
      const fromCenter = { x: from.x + NODE_WIDTH / 2, y: from.y + NODE_HEIGHT / 2 };
      const toCenter = { x: to.x + NODE_WIDTH / 2, y: to.y + NODE_HEIGHT / 2 };
      const dx = toCenter.x - fromCenter.x;
      let start;
      let end;
      let path;
      if (Math.abs(dx) > NODE_WIDTH * .7) {
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
        if (edge.from === nodeId) ids.add(edge.to);
        if (edge.to === nodeId) ids.add(edge.from);
      }
      return ids;
    }

    function applySelection() {
      const connected = selectedId ? connectedIds(selectedId) : null;
      for (const [nodeId, element] of nodeElements) {
        element.classList.toggle("selected", nodeId === selectedId);
        const edge = selectedEdgeId
          ? MODEL.edges.find((candidate) => candidate.id === selectedEdgeId)
          : null;
        element.classList.toggle(
          "muted",
          Boolean(connected) && !connected.has(nodeId) ||
            Boolean(edge) && edge.from !== nodeId && edge.to !== nodeId,
        );
      }
      for (const edge of MODEL.edges) {
        const element = edgeElements.get(edge.id);
        element.classList.toggle("selected", edge.id === selectedEdgeId);
        element.classList.toggle(
          "muted",
          Boolean(selectedId) && edge.from !== selectedId && edge.to !== selectedId ||
            Boolean(selectedEdgeId) && edge.id !== selectedEdgeId,
        );
      }
    }

    function clearElement(element) {
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
      if (primary) button.className = "primary";
      button.addEventListener("click", handler);
      return button;
    }

    function keyedActionButton(key, label, handler, primary = false) {
      const button = actionButton(label, handler, primary);
      button.dataset.actionKey = key;
      return button;
    }

    function appendPanelBack() {
      const button = actionButton("← Guide", renderActionCenter);
      button.className = "panel-back";
      details.append(button);
    }

    function managementSection(title, open = false) {
      const section = document.createElement("details");
      section.className = "management-section";
      section.open = open;
      const summary = document.createElement("summary");
      summary.textContent = title;
      const body = document.createElement("div");
      body.className = "section-body";
      section.append(summary, body);
      details.append(section);
      return body;
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
      const stages = MODEL.actionCenter.stages.map((stage) => {
        if (stage.id !== "run") return stage;
        const appState = operationalState.app?.state;
        if (appState === "running") {
          return { ...stage, state: "running", detail: "App is running locally" };
        }
        if (ACTIVE_LIFECYCLE_STATES.includes(appState)) {
          return { ...stage, state: "next", detail: humanize(appState) + " in progress" };
        }
        if (operationalState.readiness?.ready) {
          return { ...stage, state: "ready", detail: "Ready to run locally" };
        }
        if (operationalState.readiness) {
          return { ...stage, state: "next", detail: "Finish guided setup" };
        }
        return stage;
      });
      let nextAssigned = false;
      return stages.map((stage, index) => {
        if (stage.state === "complete" || stage.state === "running") return stage;
        if (!nextAssigned) {
          nextAssigned = true;
          return stage;
        }
        return { ...stage, state: "blocked", detail: "Available after " + stages[index - 1].label };
      });
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
      if (panelMode === "action-center") renderActionCenter();
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
        card.append(keyedActionButton("finish-setup", "Finish setup", () => {
          const gateway = MODEL.tiers.find((tier) => tier.id === "gateway");
          renderTierAddPanel(gateway);
        }, true));
      } else {
        appendText(card, "strong", "Checking app status");
        appendText(card, "p", "Unity is checking what is ready and what still needs setup.");
      }
      parent.append(card);
    }

    function runOpportunityAction(opportunity) {
      if (opportunity.action.kind === "add-tier") {
        const tier = MODEL.tiers.find((candidate) => candidate.id === opportunity.action.tierId);
        if (tier) renderTierAddPanel(tier);
        return;
      }
      if (opportunity.action.kind === "inspect-node" && nodeById.has(opportunity.action.nodeId)) {
        if (layoutMode === "request-flow" && !MODEL.requestFlow.nodeIds.includes(opportunity.action.nodeId)) {
          applyLayout("implementation");
        }
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

    function renderActionCenter() {
      const restoreFocus = details.contains(document.activeElement);
      const focusedAction = restoreFocus ? document.activeElement?.dataset?.actionKey : null;
      const previousScrollTop = details.scrollTop;
      panelMode = "action-center";
      selectedId = null;
      selectedEdgeId = null;
      applySelection();
      clearElement(details);
      details.dataset.empty = "false";
      const heading = appendText(details, "h2", "Guide");
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
      const guideActions = document.createElement("div");
      guideActions.className = "actions";
      guideActions.append(actionButton("＋ Add to app", renderAddToAppPanel, true));
      details.append(guideActions);

      const stages = effectiveJourneyStages();
      const currentStage = stages.find((stage) =>
        stage.state === "next" || stage.state === "ready" ||
        stage.state === "running" || stage.state === "runtime");
      const currentOpportunity = currentStage
        ? MODEL.actionCenter.opportunities.find((opportunity) => opportunity.stage === currentStage.id)
        : null;
      const journey = document.createElement("div");
      journey.className = "journey";
      journey.setAttribute("role", "list");
      journey.setAttribute("aria-label", "App progress");
      for (const stage of stages) {
        const item = document.createElement("div");
        item.className = "journey-stage " + stage.state;
        item.setAttribute("role", "listitem");
        if (stage.state === "next" || stage.state === "ready" || stage.state === "running") {
          item.setAttribute("aria-current", "step");
        }
        appendText(item, "span", stage.state === "complete"
          ? "Complete"
          : stage.state === "running" ? "Running" : stage.state === "ready"
            ? "Ready" : stage.state === "blocked" ? "Later" : stage.state === "runtime" ? "Checking" : "Next", "journey-state");
        appendText(item, "strong", stage.label);
        appendText(
          item,
          "span",
          stage === currentStage && currentOpportunity ? currentOpportunity.title + " below" : stage.detail,
          "journey-detail",
        );
        journey.append(item);
      }
      details.append(journey);

      appendText(details, "h3", "Next action");
      if (currentStage?.id === "run" || !currentOpportunity) {
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
        summary.textContent = "Later improvements (" + remaining.length + ")";
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
          : null;
        (replacement || heading).focus({ preventScroll: true });
      }
    }

    async function loadGatewayControls(container) {
      try {
        gatewayState = await apiRequest("/api/gateway-options?root=" + encodeURIComponent(MODEL.root));
        if (!container.isConnected || panelMode !== "manage") return;
        clearElement(container);
        const activeName = gatewayState.active?.name || "";
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
          select.append(empty);
          for (const gateway of gatewayState.gateways) {
            const option = document.createElement("option");
            option.value = gateway.name;
            option.textContent = gateway.name +
              (gateway.resourceGroup ? " · " + gateway.resourceGroup : "");
            option.selected = gateway.name === activeName;
            select.append(option);
          }
          container.append(select);
          const apply = actionButton(
            activeName ? "Apply or reconfigure" : "Connect gateway",
            async () => {
              if (!select.value || lifecycleOperation) return;
              apply.disabled = true;
              try {
                const result = await apiRequest("/api/active-gateway", {
                  method: "POST",
                  body: JSON.stringify({ root: MODEL.root, name: select.value }),
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
                renderActionCenter();
              } catch (error) {
                apply.disabled = false;
                setStatus(error.message, true);
              }
            },
            true,
          );
          container.append(apply);
        }
        const gatewayTier = tierById.get("gateway");
        container.append(actionButton("Create or manage gateways", () => renderTierAddPanel(gatewayTier)));
      } catch (error) {
        if (!container.isConnected || panelMode !== "manage") return;
        clearElement(container);
        appendText(container, "p", error.message, "error");
        const gatewayTier = tierById.get("gateway");
        container.append(actionButton("Open guided gateway setup", () => renderTierAddPanel(gatewayTier), true));
      }
    }

    function renderDeleteConfirmation() {
      panelMode = "manage";
      clearElement(details);
      details.dataset.empty = "false";
      appendPanelBack();
      appendText(details, "h2", "Delete this local app?");
      appendText(
        details,
        "p",
        "This permanently removes the app Git worktree, local files, and its Unity-created branch. Azure resources and source repositories are not deleted.",
      );
      const actions = document.createElement("div");
      actions.className = "actions";
      const confirm = actionButton("Delete local worktree", async () => {
        for (const button of actions.querySelectorAll("button")) button.disabled = true;
        try {
          await apiRequest("/api/delete-app", {
            method: "POST",
            body: JSON.stringify({ root: MODEL.root, confirmed: true }),
          });
          location.assign("/");
        } catch (error) {
          for (const button of actions.querySelectorAll("button")) button.disabled = false;
          setStatus(error.message, true);
        }
      });
      confirm.className = "danger";
      actions.append(confirm);
      actions.append(actionButton("Cancel", renderManagePanel));
      details.append(actions);
    }

    function renderManagePanel() {
      panelMode = "manage";
      selectedId = null;
      selectedEdgeId = null;
      applySelection();
      clearElement(details);
      details.dataset.empty = "false";
      appendPanelBack();
      appendText(details, "h2", "Manage");
      appendText(details, "p", "Open a section only when you need to change settings, deploy, troubleshoot, or delete this app.");

      const appState = operationalState.app?.state;
      const gatewaySection = managementSection("AI model connection", !operationalState.readiness?.ready);
      const gatewayControls = document.createElement("div");
      gatewayControls.className = "action-list";
      appendText(
        gatewayControls,
        "p",
        ACTIVE_LIFECYCLE_STATES.includes(appState)
          ? humanize(appState) + " is in progress. Model access can be changed when it finishes."
          : appState === "running"
            ? "Stop the local app before changing its AI Gateway."
          : "Loading available AI Gateways…",
      );
      gatewaySection.append(gatewayControls);
      if (!ACTIVE_LIFECYCLE_STATES.includes(appState) && appState !== "running") {
        void loadGatewayControls(gatewayControls);
      }

      const deploymentSection = managementSection("Azure deployment");
      appendText(deploymentSection, "p", "These actions use the app's checked-in Azure configuration and may change cloud resources.");
      const cloudActions = document.createElement("div");
      cloudActions.className = "actions";
      if (ACTIVE_LIFECYCLE_STATES.includes(appState)) {
        appendText(cloudActions, "p", humanize(appState) + " is in progress. Wait for it to finish before starting another operation.");
      } else {
        cloudActions.append(actionButton("Set up Azure resources", async () => {
          await runAppOperation("provision-cloud");
          renderActionCenter();
        }));
        cloudActions.append(actionButton("Deploy latest app", async () => {
          await runAppOperation("deploy-cloud");
          renderActionCenter();
        }));
      }
      deploymentSection.append(cloudActions);

      const developerSection = managementSection("Developer tools");
      const sourceActions = document.createElement("div");
      sourceActions.className = "actions";
      sourceActions.append(actionButton("Open source code", async () => {
        try {
          await apiRequest("/api/open-source", {
            method: "POST",
            body: JSON.stringify({ root: MODEL.root, projectPath: "." }),
          });
          setStatus("Opened the app source in VS Code.");
        } catch (error) {
          setStatus(error.message, true);
        }
      }));
      developerSection.append(sourceActions);
      const activity = document.createElement("div");
      const output = document.createElement("pre");
      output.className = "command-output";
      output.textContent = "Open startup and deployment output when troubleshooting.";
      activity.append(actionButton("View technical output", async () => {
        try {
          const result = await apiRequest("/api/app-output?root=" + encodeURIComponent(MODEL.root));
          output.textContent = result.lines.join("\\n") || "No command output yet.";
          output.scrollTop = output.scrollHeight;
        } catch (error) {
          setStatus(error.message, true);
        }
      }));
      activity.append(output);
      developerSection.append(activity);

      const dangerSection = managementSection("Delete app");
      const dangerActions = document.createElement("div");
      dangerActions.className = "actions";
      if (appState === "running") {
        appendText(dangerActions, "p", "Stop the local app before deleting its worktree.");
      } else if (ACTIVE_LIFECYCLE_STATES.includes(appState)) {
        appendText(dangerActions, "p", "Wait for the current operation to finish before deleting this app.");
      } else {
        const deleteButton = actionButton("Delete app…", renderDeleteConfirmation);
        deleteButton.className = "danger";
        dangerActions.append(deleteButton);
      }
      dangerSection.append(dangerActions);
    }

    async function refreshOperationalState() {
      try {
        const [app, readiness] = await Promise.all([
          apiRequest("/api/app-status?root=" + encodeURIComponent(MODEL.root)),
          apiRequest("/api/local-readiness?root=" + encodeURIComponent(MODEL.root)),
        ]);
        const nextFingerprint = JSON.stringify({
          state: app.state,
          ready: readiness.ready,
          guidance: readiness.guidance,
          entrypoints: (app.entrypoints || []).map((entrypoint) => [
            entrypoint.name,
            entrypoint.port,
            entrypoint.ready,
          ]),
          foreignEntrypoints: (app.foreignEntrypoints || []).map((entrypoint) => entrypoint.port),
        });
        const changed = nextFingerprint !== operationalFingerprint;
        operationalFingerprint = nextFingerprint;
        operationalState = { app, readiness };
        runtimeEntrypoints = app.entrypoints || [];
        if (changed && panelMode === "action-center") renderActionCenter();
        if (changed && panelMode === "manage") renderManagePanel();
      } catch {
        const changed = operationalFingerprint !== "unavailable";
        operationalFingerprint = "unavailable";
        operationalState = { app: null, readiness: null };
        runtimeEntrypoints = [];
        if (changed && panelMode === "action-center") renderActionCenter();
      }
    }

    async function openTierStudio(tier) {
      try {
        const result = await apiRequest("/api/tier-action", {
          method: "POST",
          body: JSON.stringify({ root: MODEL.root, tierId: tier.id, includeAzure: true }),
        });
        if (result.outcome === "canvas-opened") {
          setStatus("Opened the " + tier.name + " specialist studio.");
          return;
        }
        renderTierAddPanel(tier, false, result);
        setStatus(result.outcome === "scaffold-available"
          ? "Scaffold guidance is ready."
          : "Existing tier evidence is ready.");
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    function renderAddToAppPanel() {
      panelMode = "add";
      selectedId = null;
      selectedEdgeId = null;
      applySelection();
      clearElement(details);
      details.dataset.empty = "false";
      appendPanelBack();
      appendText(details, "h2", "Add to app");
      appendText(
        details,
        "p",
        "Choose the capability you want. Unity will find an existing implementation, open its guided setup, or prepare a source change for confirmation.",
      );
      const list = document.createElement("div");
      list.className = "action-list";
      const tiers = [...MODEL.tiers].sort((left, right) =>
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
        card.append(actionButton(existing ? "Add another" : "Add capability", () => renderTierAddPanel(tier)));
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
      actions.append(actionButton(
        tier.hasSpecialistStudio ? "Open guided setup" : "Check existing implementations",
        () => openTierStudio(tier),
        true,
      ));
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
      clearElement(details);
      details.dataset.empty = "false";
      appendPanelBack();
      appendText(details, "h2", node.name);
      const tier = MODEL.tiers.find((candidate) => candidate.id === node.tierId);
      appendText(details, "p", (tier?.name || node.tierId) + " · " + humanize(node.kind) + " · " + node.confidence + " confidence");
      const project = document.createElement("code");
      project.textContent = node.projectPath;
      details.append(project);

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

      const actions = document.createElement("div");
      actions.className = "actions";
      if (node.kind === "project") {
        actions.append(actionButton("Open source", async () => {
          try {
            await apiRequest("/api/open-source", {
              method: "POST",
              body: JSON.stringify({ root: MODEL.root, projectPath: node.projectPath }),
            });
            setStatus("Opened " + node.name + " in VS Code.");
          } catch (error) {
            setStatus(error.message, true);
          }
        }, true));
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
      details.append(actions);
    }

    function renderEdgeDetails(edge) {
      panelMode = "edge";
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
    }

    function selectNode(nodeId) {
      if (selectedId === nodeId) {
        renderActionCenter();
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
        renderActionCenter();
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
      if (layoutMode !== "request-flow" || !entryFilter.value) {
        return new Set(MODEL.requestFlow.nodeIds);
      }
      const reachable = new Set([entryFilter.value, ...MODEL.requestFlow.operations]);
      const queue = [entryFilter.value];
      while (queue.length) {
        const current = queue.shift();
        for (const edge of MODEL.edges.filter((candidate) => candidate.from === current)) {
          if (reachable.has(edge.to)) continue;
          reachable.add(edge.to);
          queue.push(edge.to);
        }
      }
      return reachable;
    }

    function applyFilters() {
      const query = normalized(search.value);
      const tierId = tierFilter.value;
      const requestPath = selectedRequestPath();
      let visibleCount = 0;
      for (const node of MODEL.nodes) {
        const searchable = normalized([node.name, node.projectPath, node.kind, ...node.badges.map((badge) => badge.label)].join(" "));
        const visibleInMode = layoutMode === "implementation" || requestPath.has(node.id);
        const visible = visibleInMode &&
          (!tierId || node.tierId === tierId) &&
          (!query || searchable.includes(query));
        nodeElements.get(node.id).classList.toggle("hidden", !visible);
        if (visible) visibleCount += 1;
      }
      const visibleIds = visibleNodeIds();
      for (const edge of MODEL.edges) {
        const visibleInMode = layoutMode === "implementation" || flowEdgeById.has(edge.id);
        edgeElements.get(edge.id).classList.toggle(
          "hidden",
          !visibleInMode || !visibleIds.has(edge.from) || !visibleIds.has(edge.to),
        );
      }
      document.querySelector("#empty-state").style.display = visibleCount ? "none" : "grid";
      if (layoutMode === "request-flow") {
        const unconnected = MODEL.requestFlow.unconnectedNodeIds.length;
        setStatus(
          visibleCount + " components on proven request paths" +
            (unconnected ? " · " + unconnected + " more in Implementation" : "") + ".",
        );
      } else {
        setStatus(visibleCount + " components in the implementation map.");
      }
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

    function fitGraph(minimumScale = .18) {
      const bounds = svg.getBoundingClientRect();
      const content = contentBounds();
      const padding = 28;
      const fittedScale = Math.min(1.25, Math.max(.18, Math.min(
        (bounds.width - padding * 2) / content.width,
        (bounds.height - padding * 2) / content.height,
      )));
      const scale = Math.max(minimumScale, fittedScale);
      transform = {
        scale,
        x: scale > fittedScale ? padding - content.x * scale : (bounds.width - content.width * scale) / 2 - content.x * scale,
        y: (bounds.height - content.height * scale) / 2 - content.y * scale,
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
      if (dragState?.pointerId === event.pointerId) {
        const point = worldPoint(event);
        const position = positions.get(dragState.nodeId);
        const next = constrainPosition(dragState.nodeId, {
          x: point.x - dragState.offsetX,
          y: point.y - dragState.offsetY,
        });
        if (Math.abs(next.x - position.x) > 1 || Math.abs(next.y - position.y) > 1) dragState.moved = true;
        positions.set(dragState.nodeId, next);
        updateGeometry();
      } else if (panState?.pointerId === event.pointerId) {
        if (Math.abs(event.clientX - panState.x) > 3 || Math.abs(event.clientY - panState.y) > 3) {
          panState.moved = true;
        }
        transform.x = panState.startX + event.clientX - panState.x;
        transform.y = panState.startY + event.clientY - panState.y;
        applyTransform();
      }
    });
    svg.addEventListener("pointerup", (event) => {
      if (dragState?.pointerId === event.pointerId) {
        if (dragState.moved) {
          savePositions();
          suppressNodeClick = dragState.nodeId;
          setTimeout(() => { suppressNodeClick = null; }, 0);
        }
        dragState = null;
      }
      if (panState?.pointerId === event.pointerId) {
        const clearFocus = !panState.moved && (selectedId || selectedEdgeId);
        panState = null;
        svg.classList.remove("panning");
        if (clearFocus) {
          renderActionCenter();
          setStatus("Card focus cleared.");
        }
      }
    });
    svg.addEventListener("pointercancel", (event) => {
      if (dragState?.pointerId === event.pointerId) dragState = null;
      if (panState?.pointerId === event.pointerId) panState = null;
      svg.classList.remove("panning");
    });
    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.12 : .89, event.clientX, event.clientY);
    }, { passive: false });
    document.querySelector("#zoom-in").addEventListener("click", () => zoomBy(1.2));
    document.querySelector("#zoom-out").addEventListener("click", () => zoomBy(.82));
    document.querySelector("#fit").addEventListener("click", () => fitGraph());
    document.querySelector("#action-center").addEventListener("click", renderActionCenter);
    document.querySelector("#manage-app").addEventListener("click", renderManagePanel);
    document.querySelector("#back-apps").addEventListener("click", () => location.assign("/"));
    requestFlowButton.addEventListener("click", () => {
      if (layoutMode === "request-flow") return;
      applyLayout("request-flow");
      setStatus("Showing the evidence-backed request flow.");
    });
    implementationButton.addEventListener("click", () => {
      if (layoutMode === "implementation") return;
      applyLayout("implementation");
      setStatus("Showing the complete source-derived implementation map.");
    });
    const viewTabs = [requestFlowButton, implementationButton];
    viewTabs.forEach((button, index) => {
      button.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + viewTabs.length) % viewTabs.length;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % viewTabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = viewTabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        viewTabs[nextIndex].focus();
        viewTabs[nextIndex].click();
      });
    });
    resetLayoutButton.addEventListener("click", () => {
      if (layoutMode === "implementation") {
        localStorage.removeItem(MODEL.layoutKey + ":implementation");
        applyLayout("implementation");
        setStatus("Implementation layout reset.");
        return;
      }
      fitGraph(.48);
      setStatus("Request flow view reset.");
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
      renderActionCenter();
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
    applyLayout("request-flow", false);
    renderActionCenter();
    requestAnimationFrame(() => fitGraph(.48));
    void refreshOperationalState();
    setInterval(() => { void refreshOperationalState(); }, 5000);
  </script>
</body>
</html>`;
}
