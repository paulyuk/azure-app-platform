import { createHash } from "node:crypto";

import { PLATFORM_TIERS } from "./tier-definitions.mjs";

const RENDERER_SCHEMA_VERSION = 2;

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
    unresolved: appMap.unresolved ?? [],
    diagnostics: appMap.diagnostics ?? [],
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

export function renderInteractiveAppMapHtml(appMap, { apiToken = "" } = {}) {
  const model = buildInteractiveAppMapModel(appMap);
  const tierOptions = model.tiers
    .map((tier) => `<option value="${escapeHtml(tier.id)}">${escapeHtml(tier.name)}</option>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
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
    body { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; background: var(--bg); color: var(--text); }
    header {
      display: flex; align-items: center; gap: 16px; padding: 12px 16px;
      border-bottom: 1px solid var(--border); background: var(--surface);
    }
    .heading { min-width: 220px; }
    h1 { margin: 0; font-size: 20px; }
    .heading p { margin: 2px 0 0; color: var(--muted); font-size: 12px; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .toolbar { display: flex; align-items: center; gap: 8px; flex: 1; flex-wrap: wrap; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    input, select, button {
      min-height: 32px; border: 1px solid var(--border); border-radius: 4px;
      background: var(--surface); color: var(--text); font: inherit;
    }
    input { min-width: 210px; padding: 4px 9px; }
    select { padding: 4px 28px 4px 9px; }
    button { padding: 4px 10px; cursor: pointer; }
    button:hover { border-color: var(--accent); }
    button:focus-visible, input:focus-visible, select:focus-visible {
      outline: 2px solid var(--focus); outline-offset: 2px;
    }
    .icon-group { display: inline-flex; }
    .icon-group button { border-radius: 0; min-width: 34px; }
    .icon-group button:first-child { border-radius: 4px 0 0 4px; }
    .icon-group button:last-child { border-radius: 0 4px 4px 0; }
    main { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 340px; }
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
    .edge { color: var(--edge-medium); }
    .edge.high { color: var(--edge-high); }
    .edge.low { color: var(--edge-low); }
    .edge path { fill: none; stroke: currentColor; stroke-width: 2; }
    .edge.medium path { stroke-dasharray: 9 5; }
    .edge.low path { stroke-dasharray: 3 6; }
    .edge text {
      fill: currentColor; font-size: 10px; font-weight: 600;
      paint-order: stroke; stroke: var(--surface-muted); stroke-width: 4px; stroke-linejoin: round;
    }
    .node { cursor: ns-resize; }
    .node rect { fill: var(--surface); stroke: var(--border); stroke-width: 1.5; filter: drop-shadow(0 2px 3px rgb(0 0 0 / .12)); }
    .node.project rect { stroke: var(--accent); }
    .node:focus-visible rect { stroke: var(--focus); stroke-width: 3; }
    .node.selected rect { stroke: var(--focus); stroke-width: 3; }
    .node-title { fill: var(--text); font-size: 13px; font-weight: 650; }
    .node-meta { fill: var(--muted); font-size: 10px; }
    .node-badge { fill: var(--accent); font-size: 9px; font-weight: 600; }
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
    .detail-badges { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0; }
    .detail-badge { border-radius: 999px; background: var(--accent-soft); color: var(--accent); padding: 3px 7px; font-size: 11px; font-weight: 600; }
    .actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 16px; }
    .actions button.primary { border-color: var(--accent); background: var(--accent); color: #fff; }
    .error { color: var(--danger); }
    footer {
      display: flex; justify-content: space-between; gap: 12px; padding: 5px 12px;
      border-top: 1px solid var(--border); background: var(--surface); color: var(--muted); font-size: 11px;
    }
    @media (max-width: 900px) {
      main { grid-template-columns: minmax(0, 1fr); }
      aside { position: absolute; right: 0; top: 73px; bottom: 27px; width: min(360px, 90vw); box-shadow: -8px 0 24px rgb(0 0 0 / .18); }
      aside[data-empty="true"] { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      * { scroll-behavior: auto !important; transition: none !important; }
    }
  </style>
</head>
<body>
  <header>
    <div class="heading">
      <h1>Unity App Map</h1>
      <p title="${escapeHtml(model.root)}">${escapeHtml(model.root)}</p>
    </div>
    <div class="toolbar" role="toolbar" aria-label="App Map controls">
      <label><span class="visually-hidden">Search nodes</span><input id="search" type="search" placeholder="Search components…" aria-label="Search nodes"></label>
      <label><span class="visually-hidden">Filter by tier</span><select id="tier-filter" aria-label="Filter by tier"><option value="">All tiers</option>${tierOptions}</select></label>
      <div class="icon-group" aria-label="Zoom controls">
        <button id="zoom-out" type="button" aria-label="Zoom out" title="Zoom out">−</button>
        <button id="zoom-in" type="button" aria-label="Zoom in" title="Zoom in">+</button>
      </div>
      <button id="fit" type="button">Fit</button>
      <button id="reset-layout" type="button">Reset layout</button>
    </div>
  </header>
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
    <aside id="details" aria-live="polite" data-empty="true">
      <h2>Inspect the graph</h2>
      <p>Select a node to highlight its immediate relationships. Double-click it, or press Enter while it has keyboard focus, to inspect evidence and safe actions.</p>
      <h3>Legend</h3>
      <p>Solid edges are high confidence, dashed edges are medium confidence, and dotted edges are low confidence. Arrowheads show relationship direction.</p>
    </aside>
  </main>
  <footer>
    <span id="status" role="status">${escapeHtml(model.summary.projectNodes)} projects · ${escapeHtml(model.summary.operationNodes)} operations · ${escapeHtml(model.summary.edges)} edges</span>
    <span>Source-derived map · not runtime health</span>
  </footer>
  <noscript><main class="noscript">${renderNoScriptFallback(model)}</main></noscript>
  <script>
    "use strict";
    const MODEL = ${safeJson(model)};
    const API_TOKEN = ${safeJson(apiToken)};
    const NS = "http://www.w3.org/2000/svg";
    const LANE_WIDTH = 248;
    const LANE_GAP = 24;
    const WORLD_PADDING = 24;
    const LANE_HEADER = 62;
    const NODE_WIDTH = 206;
    const NODE_HEIGHT = 96;
    const NODE_STEP = 122;
    const MIN_WORLD_HEIGHT = 680;
    const svg = document.querySelector("#graph");
    const viewport = document.querySelector("#viewport");
    const lanesLayer = document.querySelector("#lanes");
    const edgesLayer = document.querySelector("#edges");
    const nodesLayer = document.querySelector("#nodes");
    const details = document.querySelector("#details");
    const status = document.querySelector("#status");
    const search = document.querySelector("#search");
    const tierFilter = document.querySelector("#tier-filter");
    const nodeById = new Map(MODEL.nodes.map((node) => [node.id, node]));
    const nodeElements = new Map();
    const edgeElements = new Map();
    const positions = new Map();
    const defaultPositions = new Map();
    let runtimeEntrypoints = [];
    let selectedId = null;
    let panState = null;
    let dragState = null;
    let transform = { x: 0, y: 0, scale: 1 };

    const maxTierNodes = Math.max(1, ...MODEL.tiers.map((tier) => tier.nodeIds.length));
    const worldWidth = WORLD_PADDING * 2 + MODEL.tiers.length * LANE_WIDTH + (MODEL.tiers.length - 1) * LANE_GAP;
    const worldHeight = Math.max(MIN_WORLD_HEIGHT, LANE_HEADER + 40 + maxTierNodes * NODE_STEP);

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

    function initialPositions() {
      MODEL.tiers.forEach((tier, tierIndex) => {
        tier.nodeIds.forEach((nodeId, nodeIndex) => {
          defaultPositions.set(nodeId, {
            x: WORLD_PADDING + tierIndex * (LANE_WIDTH + LANE_GAP) + (LANE_WIDTH - NODE_WIDTH) / 2,
            y: LANE_HEADER + 34 + nodeIndex * NODE_STEP,
          });
        });
      });
      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem(MODEL.layoutKey) || "{}");
      } catch {
        localStorage.removeItem(MODEL.layoutKey);
      }
      for (const node of MODEL.nodes) {
        const candidate = saved[node.id];
        const fallback = defaultPositions.get(node.id);
        positions.set(
          node.id,
          constrainPosition(node.id, Number.isFinite(candidate?.y) ? candidate : fallback),
        );
      }
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
      localStorage.setItem(MODEL.layoutKey, JSON.stringify(serialized));
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
        const kind = svgElement("text", { x: 12, y: 42, class: "node-meta" });
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
        group.addEventListener("click", () => selectNode(node.id, false));
        group.addEventListener("dblclick", () => selectNode(node.id, true));
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            selectNode(node.id, true);
          } else if (event.key === " ") {
            event.preventDefault();
            selectNode(node.id, false);
          }
        });
        group.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
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
          "data-edge-id": edge.id,
          "aria-label": humanize(edge.kind) + ", " + edge.confidence + " confidence",
        });
        group.append(svgElement("path", { "marker-end": "url(#arrow-" + edge.confidence + ")" }));
        const label = svgElement("text", { "text-anchor": "middle" });
        label.textContent = humanize(edge.kind) + " · " + edge.confidence;
        group.append(label);
        edgesLayer.append(group);
        edgeElements.set(edge.id, group);
      }
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
        element.classList.toggle("muted", Boolean(connected) && !connected.has(nodeId));
      }
      for (const edge of MODEL.edges) {
        const element = edgeElements.get(edge.id);
        element.classList.toggle("muted", Boolean(selectedId) && edge.from !== selectedId && edge.to !== selectedId);
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

    function renderTierAddPanel(tier, confirming = false, tierResult = null) {
      selectedId = null;
      applySelection();
      clearElement(details);
      details.dataset.empty = "false";
      appendText(details, "h2", "Add to " + tier.name);
      appendText(
        details,
        "p",
        "Add a source-backed Unity capability in this lane, or open its specialist studio for existing and provisioned resources. App Map creates a card only after new source evidence is discovered.",
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
          "This sends an implementation request to the current Copilot session and may modify app source. It does not provision or deploy Azure resources.",
        );
      }

      const actions = document.createElement("div");
      actions.className = "actions";
      actions.append(actionButton("Open tier studio", () => openTierStudio(tier), true));
      if (confirming) {
        const confirmButton = actionButton("Confirm capability request", async () => {
          if (confirmButton.disabled) return;
          for (const button of actions.querySelectorAll("button")) button.disabled = true;
          setStatus("Requesting a new " + tier.name + " source capability…");
          try {
            await apiRequest("/api/capability-request", {
              method: "POST",
              body: JSON.stringify({ root: MODEL.root, tierId: tier.id, intent: "add" }),
            });
            clearElement(details);
            appendText(details, "h2", "Capability request sent");
            appendText(details, "p", "The current Copilot session will implement the source capability. Refresh App Map after the work completes to discover its evidence-backed node and relationships.");
            setStatus("Requested a new " + tier.name + " source capability.");
          } catch (error) {
            for (const button of actions.querySelectorAll("button")) button.disabled = false;
            setStatus(error.message, true);
          }
        });
        actions.append(confirmButton);
        actions.append(actionButton("Cancel", () => renderTierAddPanel(tier)));
      } else {
        actions.append(actionButton("Request source capability", () => renderTierAddPanel(tier, true)));
      }
      details.append(actions);
    }

    function renderDetails(node) {
      clearElement(details);
      details.dataset.empty = "false";
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

    function renderSelectionHint(node) {
      clearElement(details);
      details.dataset.empty = "false";
      appendText(details, "h2", node.name);
      appendText(details, "p", "Immediate graph relationships are highlighted. Double-click this node, or press Enter while it has keyboard focus, to inspect evidence and safe actions.");
    }

    function selectNode(nodeId, openPanel) {
      selectedId = nodeId;
      applySelection();
      const node = nodeById.get(nodeId);
      if (openPanel) renderDetails(node);
      else renderSelectionHint(node);
      setStatus("Selected " + node.name + ".");
    }

    function visibleNodeIds() {
      return new Set([...nodeElements].filter(([, element]) => !element.classList.contains("hidden")).map(([id]) => id));
    }

    function applyFilters() {
      const query = normalized(search.value);
      const tierId = tierFilter.value;
      let visibleCount = 0;
      for (const node of MODEL.nodes) {
        const searchable = normalized([node.name, node.projectPath, node.kind, ...node.badges.map((badge) => badge.label)].join(" "));
        const visible = (!tierId || node.tierId === tierId) && (!query || searchable.includes(query));
        nodeElements.get(node.id).classList.toggle("hidden", !visible);
        if (visible) visibleCount += 1;
      }
      const visibleIds = visibleNodeIds();
      for (const edge of MODEL.edges) {
        edgeElements.get(edge.id).classList.toggle("hidden", !visibleIds.has(edge.from) || !visibleIds.has(edge.to));
      }
      document.querySelector("#empty-state").style.display = visibleCount ? "none" : "grid";
      setStatus(visibleCount + " of " + MODEL.nodes.length + " nodes visible.");
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
      panState = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: transform.x, startY: transform.y };
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
        transform.x = panState.startX + event.clientX - panState.x;
        transform.y = panState.startY + event.clientY - panState.y;
        applyTransform();
      }
    });
    svg.addEventListener("pointerup", (event) => {
      if (dragState?.pointerId === event.pointerId) {
        if (dragState.moved) savePositions();
        dragState = null;
      }
      if (panState?.pointerId === event.pointerId) {
        panState = null;
        svg.classList.remove("panning");
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
    document.querySelector("#reset-layout").addEventListener("click", () => {
      localStorage.removeItem(MODEL.layoutKey);
      for (const [id, point] of defaultPositions) positions.set(id, { ...point });
      updateGeometry();
      fitGraph(.58);
      setStatus("Layout reset to the source-derived tier view.");
    });
    search.addEventListener("input", applyFilters);
    tierFilter.addEventListener("change", applyFilters);
    search.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = [...nodeElements.values()].find((element) => !element.classList.contains("hidden"));
      if (first) first.focus();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      selectedId = null;
      applySelection();
      details.dataset.empty = "true";
      clearElement(details);
      appendText(details, "h2", "Inspect the graph");
      appendText(details, "p", "Select a node to highlight its immediate relationships. Double-click it, or press Enter while it has keyboard focus, to inspect evidence and safe actions.");
    });

    initialPositions();
    renderLanes();
    renderEdges();
    renderNodes();
    updateGeometry();
    requestAnimationFrame(() => fitGraph(.58));
    apiRequest("/api/app-status?root=" + encodeURIComponent(MODEL.root))
      .then((result) => { runtimeEntrypoints = result.entrypoints || []; })
      .catch(() => { runtimeEntrypoints = []; });
  </script>
</body>
</html>`;
}
