import { PLATFORM_TIERS } from "./tier-definitions.mjs";
export { renderInteractiveAppMapHtml as renderExpandedAppMapHtml } from "./interactive-app-map.mjs";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderAppMapMarkup(appMap, { expanded = false } = {}) {
  const nodesById = new Map(appMap.nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  for (const edge of appMap.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge);
  }
  const unresolved = new Map();
  for (const item of appMap.unresolved || []) {
    if (!unresolved.has(item.from)) unresolved.set(item.from, []);
    unresolved.get(item.from).push(item);
  }
  const lanes = PLATFORM_TIERS.map((tier) => {
    const nodes = appMap.nodes.filter((node) => node.tierId === tier.id);
    if (nodes.length === 0) return "";
    return '<section class="map-lane" data-map-tier="' + escapeHtml(tier.id) + '">' +
      '<div class="map-lane-head"><strong>' + escapeHtml(tier.mapLabel || tier.name) + '</strong><small>' +
      nodes.length + (nodes.length === 1 ? " node" : " nodes") + '</small></div>' +
      nodes.map((node) => {
        const links = (outgoing.get(node.id) || []).map((edge) => {
          const target = nodesById.get(edge.to);
          return '<div class="map-link"><span class="arrow">→</span><span>' +
            escapeHtml(edge.kind.replaceAll("-", " ")) + ' <b>' +
            escapeHtml(target?.name || edge.to) + '</b></span></div>';
        });
        const missing = (unresolved.get(node.id) || []).map((item) =>
          '<div class="map-link unresolved"><span class="arrow">?</span><span>Unresolved <b>' +
          escapeHtml(item.reference) + '</b></span></div>');
        const evidence = node.evidence?.[0];
        const details = (node.details || []).map((detail) =>
          '<div class="map-detail"><span>' + escapeHtml(detail.label) + '</span><b>' +
          escapeHtml(detail.value) + '</b></div>').join("");
        const badges = (node.badges || []).map((badge) => {
          const item = typeof badge === "string" ? { label: badge, kind: "default" } : badge;
          return '<span class="map-badge ' + escapeHtml(item.kind || "default") + '">' +
            escapeHtml(item.label) + '</span>';
        }).join("");
        return '<article class="map-node ' + escapeHtml(node.kind || "project") + '">' +
          '<strong>' + escapeHtml(node.name) + '</strong>' +
          (node.projectPath && node.projectPath !== "."
            ? '<code>' + escapeHtml(node.projectPath) + '</code>'
            : '') +
          (badges ? '<div class="map-badges">' + badges + '</div>' : '') +
          (details ? '<div class="map-details">' + details + '</div>' : '') +
          (links.length || missing.length
            ? '<div class="map-links">' + links.join("") + missing.join("") + '</div>'
            : '') +
          (evidence
            ? '<div class="map-evidence">' + escapeHtml(evidence.path + ":" + evidence.line) + '</div>'
            : '') +
          '</article>';
      }).join("") + '</section>';
  }).filter(Boolean);
  const empty = lanes.length === 0
    ? '<div class="map-empty">No source-derived Unity components were found.</div>'
    : '<div class="map-lanes">' + lanes.join("") + '</div>';
  return '<div class="app-map-visual' + (expanded ? " expanded" : "") +
    '" role="region" aria-label="Unity application graph">' + empty + '</div>' +
    '<div class="map-footer"><span class="map-legend">Solid cards are projects · dashed cards are operations · arrows are source-derived calls</span>' +
    '<span class="badge">' + appMap.edges.length + ' edges · ' + (appMap.unresolved || []).length +
    ' unresolved</span></div>';
}

export function renderStudioHtml(instanceId, apiToken = "") {
  const capabilities = PLATFORM_TIERS.map((tier) => ({
    id: tier.id,
    name: tier.name,
    role: tier.role,
  }));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="data:,">
    <title>Unity Studio</title>
    <style>
      :root {
        color-scheme: light dark;
        --studio-bg: var(--background-color-default, #fff);
        --studio-panel: color-mix(in srgb, var(--background-color-default, #fff) 94%, var(--true-color-blue-muted, #ddf4ff));
        --studio-raised: var(--background-color-default, #fff);
        --studio-line: var(--border-color-default, #d1d9e0);
        --studio-ink: var(--text-color-default, #1f2328);
        --studio-muted: var(--text-color-muted, #59636e);
        --studio-accent: #6b3fd6;
        --studio-accent-2: #7b52e0;
        --studio-ok: #0f9d6e;
        --studio-warn: #b45309;
        --studio-danger: #cf222e;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        padding: 28px 24px 48px;
        background:
          radial-gradient(1200px 600px at 100% -12%, color-mix(in srgb, var(--studio-accent) 6%, transparent), transparent),
          var(--studio-bg);
        color: var(--studio-ink);
        font: var(--text-body-medium, 14px)/var(--leading-body-medium, 1.5) var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      }
      main { width: min(100%, 840px); margin: 0 auto; }
      h1 { margin: 0 0 8px; font-size: var(--text-title-large, 28px); line-height: var(--leading-title-large, 1.2); letter-spacing: -.01em; }
      h2 { margin: 0 0 8px; font-size: 20px; }
      h3 { font-size: 14px; }
      p { margin: 6px 0 16px; color: var(--studio-muted); }
      code { overflow-wrap: anywhere; font: var(--text-code-inline, 12px) var(--font-mono, "SFMono-Regular", Consolas, monospace); }
      button, input, textarea, select { font: inherit; }
      button {
        min-height: 40px;
        border: 1px solid var(--studio-line);
        border-radius: 10px;
        padding: 9px 14px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      button:hover { border-color: var(--studio-accent-2); }
      button.primary { background: var(--studio-accent); border-color: var(--studio-accent); color: var(--color-white, #fff); }
      button.link { min-height: auto; border-color: transparent; padding-inline: 4px; color: var(--studio-accent-2); }
      button:disabled { opacity: .6; cursor: wait; }
      button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
        outline: 2px solid var(--color-focus-outline, #0969da);
        outline-offset: 2px;
      }
      .eyebrow, .section-label {
        color: var(--studio-accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .eyebrow { margin-bottom: 6px; }
      .section-label { margin: 22px 0 7px; }
      .workspace-intro { margin-bottom: 22px; }
      .workspace-intro p { margin-bottom: 8px; }
      .workspace-meta { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
      .workspace-path { color: var(--studio-muted); }
      .journeys { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 24px; }
      .journey {
        width: 100%;
        min-height: 104px;
        padding: 18px;
        text-align: left;
        display: block;
        background: var(--studio-raised);
      }
      .journey strong { display: block; margin-bottom: 5px; font-size: 17px; }
      .journey span { color: var(--text-color-muted, #59636e); }
      .journey.primary span { color: #f0ebff; }
      .step { color: var(--studio-muted); font-size: 12px; margin-bottom: 8px; }
      .field { display: grid; gap: 5px; margin: 15px 0; font-weight: 600; }
      input[type="text"], textarea, select {
        width: 100%;
        border: 1px solid var(--studio-line);
        border-radius: 9px;
        padding: 9px 10px;
        background: var(--studio-raised);
        color: inherit;
        font: inherit;
        font-weight: 400;
      }
      textarea { min-height: 84px; resize: vertical; }
      .choice-list, .capability-list, .mapping-list, .review-list { display: grid; gap: 9px; margin: 16px 0; }
      .choice, .capability, .mapping, .review-row {
        border: 1px solid var(--studio-line);
        border-radius: 10px;
        padding: 12px;
      }
      .capability, .review-row { display: grid; gap: 4px; }
      .capability strong, .review-row strong { display: block; }
      .review-row small { display: block; color: var(--studio-muted); line-height: 1.45; }
      .app-row { display: flex; align-items: center; gap: 10px; }
      .app-row > [data-existing-app] { flex: 1; min-width: 0; text-align: left; }
      .icon-button { flex: 0 0 auto; min-height: 32px; padding: 6px; }
      .icon-button svg { display: block; width: 16px; height: 16px; fill: currentColor; }
      .icon-button.danger { color: var(--fgColor-danger, #cf222e); }
      .confirm-backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 18px; background: rgb(0 0 0 / 45%); z-index: 10; }
      .confirm-dialog { width: min(100%, 440px); padding: 20px; border: 1px solid var(--studio-line); border-radius: 12px; background: var(--studio-raised); box-shadow: 0 8px 30px rgb(0 0 0 / 25%); }
      .confirm-dialog h2 { margin-top: 0; }
      .confirm-dialog .actions { margin-top: 18px; }
      .confirm-dialog .danger { color: var(--fgColor-danger, #cf222e); border-color: currentColor; }
      .surface { margin-bottom: 16px; border: 1px solid var(--studio-line); border-radius: 14px; background: var(--studio-panel); overflow: hidden; }
      .surface-head {
        min-height: 46px;
        padding: 11px 15px;
        border-bottom: 1px solid var(--studio-line);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      details.surface > summary { cursor: pointer; list-style: none; }
      details.surface > summary::-webkit-details-marker { display: none; }
      details.surface > summary::before { content: "›"; color: var(--studio-accent); font-size: 17px; transition: transform .2s; }
      details.surface[open] > summary::before { transform: rotate(90deg); }
      .surface-head h2 { margin: 0; font-size: 13px; font-weight: 650; }
      .surface-head small { color: var(--studio-muted); }
      .surface-body { padding: 15px; }
      .surface-body > p:first-child { margin-top: 0; }
      .subsurface { padding: 13px; border: 1px solid var(--studio-line); border-radius: 10px; background: var(--studio-raised); }
      .subsurface + .subsurface { margin-top: 10px; }
      .subsurface-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
      .subsurface-head small { color: var(--studio-muted); }
      .configuration-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .configuration-actions button { min-height: 34px; padding-block: 6px; }
      .command-panel { margin-top: 14px; border: 1px solid #202a3b; border-radius: 10px; overflow: hidden; background: #0b1120; }
      .command-panel > summary {
        cursor: pointer;
        list-style: none;
        padding: 9px 11px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #a9b5ca;
        background: #111a2b;
        font: 600 11px var(--font-mono, "SFMono-Regular", Consolas, monospace);
      }
      .command-panel > summary::-webkit-details-marker { display: none; }
      .command-panel > summary::before { content: "›"; color: #9b87e8; font-size: 15px; transition: transform .2s; }
      .command-panel[open] > summary::before { transform: rotate(90deg); }
      .command-summary { margin-left: auto; color: #7f8ca3; font-weight: 400; }
      .command-panel pre { margin: 0; min-height: 96px; max-height: 280px; overflow: auto; padding: 11px; color: #dbe5f7; font: 12px/1.55 var(--font-mono, "SFMono-Regular", Consolas, monospace); white-space: pre-wrap; overflow-wrap: anywhere; }
      .lifecycle-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .lifecycle-actions button { flex: 1 1 180px; }
      .choice label, .capability label { display: flex; gap: 9px; align-items: start; }
      .choice small, .capability small, .mapping small { display: block; color: var(--studio-muted); }
      .template { display: grid; grid-template-columns: auto 1fr; align-items: start; gap: 10px; padding: 14px; }
      .template > input { margin-top: 3px; }
      .template > span { display: grid; gap: 7px; }
      .template strong { font-size: 14px; line-height: 1.25; }
      .template-meta { display: block; color: var(--studio-muted); font-size: 13px; line-height: 1.45; }
      .badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
      .badge { border: 1px solid var(--studio-line); border-radius: 999px; padding: 2px 8px; font-size: 11px; background: var(--studio-panel); }
      .badge.foundry, .badge.hosted-agent, .badge.hosted-skill { background: #ddf4ff; border-color: #54aeff; color: #0550ae; }
      .badge.http, .badge.embr { background: #cffafe; border-color: #22d3ee; color: #155e75; }
      .badge.mcp, .badge.connector { background: #f3e8ff; border-color: #c084fc; color: #6b21a8; }
      .badge.docker, .badge.sandbox, .badge.durable { background: #e0e7ff; border-color: #818cf8; color: #3730a3; }
      .badge.data, .badge.gateway { background: #f1f5f9; border-color: #94a3b8; color: #334155; }
      .actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 24px; }
      .actions-right { display: flex; gap: 8px; margin-left: auto; }
      .topbar { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
      .topbar button { min-height: 32px; padding: 3px 8px; }
      .topbar h1 { margin: 0; }
      .notice, .error {
        border-radius: 9px;
        padding: 10px 12px;
        margin: 14px 0;
        background: var(--true-color-blue-muted, #ddf4ff);
      }
      .error { background: #ffebe9; color: #82071e; }
      .mapping-heading { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
      .mapping select { margin-top: 8px; }
      .source-option { display: block; }
      .local-path { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 16px; }
      .summary { display: grid; gap: 14px; }
      .summary section { border-bottom: 1px solid var(--studio-line); padding-bottom: 12px; }
      .summary section:last-child { border: 0; }
      .component-list { display: grid; gap: 8px; margin: 10px 0 0; }
      .component-status { display: grid; grid-template-columns: minmax(130px, auto) 1fr; align-items: center; gap: 8px; }
      .component-status button { min-height: 32px; padding: 5px 9px; text-align: left; font-family: var(--font-mono, monospace); font-size: 12px; overflow-wrap: anywhere; }
      .agent-tester { display: grid; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--studio-line); }
      .agent-tester textarea { min-height: 64px; }
      .agent-response { max-height: 240px; overflow: auto; white-space: pre-wrap; font-family: var(--font-mono, monospace); }
      .map-loading { padding: 24px; text-align: center; color: var(--studio-muted); border: 1px dashed var(--studio-line); border-radius: 10px; }
      .map-toolbar { display: flex; justify-content: flex-end; margin-bottom: 8px; }
      .map-expand { min-height: 32px; width: 32px; padding: 6px; color: var(--studio-muted); background: var(--studio-raised); }
      .map-expand:hover { color: var(--studio-accent); }
      .map-expand svg { display: block; width: 18px; height: 18px; fill: currentColor; }
      .app-map-visual { overflow: hidden; padding-bottom: 5px; }
      .map-lanes { display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); align-items: start; gap: 10px; }
      .map-lane {
        min-width: 0;
        padding: 10px;
        border: 1px solid var(--studio-line);
        border-top: 3px solid var(--studio-accent);
        border-radius: 10px;
        background: var(--studio-raised);
      }
      .map-lane-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 9px; }
      .map-lane-head strong { font-size: 12px; }
      .map-lane-head small { color: var(--studio-muted); font-size: 10px; }
      .map-node { padding: 9px; border: 1px solid var(--studio-line); border-radius: 8px; background: var(--studio-panel); }
      .map-node + .map-node { margin-top: 8px; }
      .map-node.operation { border-style: dashed; }
      .map-node strong, .map-node code { display: block; }
      .map-node strong { font-size: 12px; }
      .map-node code { margin-top: 3px; color: var(--studio-muted); font-size: 10px; }
      .map-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
      .map-badge { border: 1px solid var(--studio-line); border-radius: 999px; padding: 1px 6px; background: var(--studio-raised); color: var(--studio-muted); font-size: 9px; line-height: 1.45; }
      .map-badge.hosted-agent, .map-badge.model { border-color: #54aeff; background: #ddf4ff; color: #0550ae; }
      .map-badge.framework, .map-badge.sdk { border-color: #c084fc; background: #f3e8ff; color: #6b21a8; }
      .map-badge.target { border-color: #8b5cf6; background: #ede9fe; color: #5b21b6; }
      .map-badge.bound { border-color: #4ac26b; background: #dafbe1; color: #116329; }
      .map-badge.embr { border-color: #22d3ee; background: #cffafe; color: #155e75; }
      .map-links { display: grid; gap: 5px; margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--studio-line); }
      .map-details { display: grid; gap: 4px; margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--studio-line); }
      .map-detail { display: flex; justify-content: space-between; gap: 8px; color: var(--studio-muted); font-size: 10px; }
      .map-detail b { color: var(--studio-ink); font-weight: 650; text-align: right; overflow-wrap: anywhere; }
      .map-link { display: grid; grid-template-columns: auto 1fr; gap: 5px; color: var(--studio-muted); font-size: 10px; line-height: 1.35; }
      .map-link .arrow { color: var(--studio-accent); font-weight: 700; }
      .map-link b { color: var(--studio-ink); font-weight: 650; }
      .map-link.unresolved { padding: 5px; border: 1px dashed color-mix(in srgb, var(--studio-warn) 55%, var(--studio-line)); border-radius: 6px; }
      .map-link.unresolved .arrow { color: var(--studio-warn); }
      .map-evidence { margin-top: 7px; color: var(--studio-muted); font-size: 9px; overflow-wrap: anywhere; }
      .map-empty { padding: 24px; text-align: center; color: var(--studio-muted); border: 1px dashed var(--studio-line); border-radius: 10px; }
      .map-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; }
      .map-legend { color: var(--studio-muted); font-size: 11px; }
      .tier-list { display: grid; gap: 10px; }
      .tier-card { padding: 13px; border: 1px solid var(--studio-line); border-radius: 10px; background: var(--studio-raised); }
      .tier-card p { margin-bottom: 0; }
      .danger-zone { display: flex; justify-content: flex-end; margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--studio-line); }
      .danger-zone button { color: var(--studio-danger); border-color: color-mix(in srgb, var(--studio-danger) 45%, var(--studio-line)); }
      #status { min-height: 22px; margin-top: 16px; color: var(--studio-muted); }
      @media (max-width: 720px) {
        body { padding-inline: 14px; }
        .journeys { grid-template-columns: 1fr; }
        .actions { align-items: stretch; flex-direction: column-reverse; }
        .actions-right, .actions button { width: 100%; }
        .actions-right { flex-direction: column-reverse; }
        .local-path { grid-template-columns: 1fr; }
        .component-status { grid-template-columns: 1fr; }
        .surface-head { align-items: flex-start; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <main>
      <div id="app"></div>
      <div id="status" role="status" aria-live="polite"></div>
    </main>
    <script>
      const apiToken = ${JSON.stringify(apiToken)};
      const capabilities = ${JSON.stringify(capabilities)};
      const app = document.getElementById("app");
      const status = document.getElementById("status");
      const DEALER_SAMPLE_PURPOSE = "Help car dealers search inventory, evaluate deals, and send offers to buyers.";
      let sources = null;
      let azureInventory = null;
      let outputTimer = null;
      const draft = {
        journey: null,
        step: 0,
        appName: "",
        purpose: "",
        starterKind: "template",
        templateRootId: "",
        templateInputs: {
          hostedSkillName: "starter-skill",
          egressAllowDomain: "api.lender.example.com",
          agentInstructions: ""
        },
        tierIds: [],
        sourceBindings: {},
        azureBindings: {},
        openInVsCode: true
      };

      function escape(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      async function request(path, options) {
        const requestOptions = { ...(options || {}) };
        requestOptions.headers = { ...(requestOptions.headers || {}), "X-Unity-Studio-Token": apiToken };
        if (requestOptions.method === "POST") {
          requestOptions.headers["Content-Type"] = "application/json";
        }
        const response = await fetch(path, requestOptions);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Request failed.");
        return payload;
      }

      function openAppMap(root, notice = "") {
        location.assign("/app-map?root=" + encodeURIComponent(root) +
          "&token=" + encodeURIComponent(apiToken) +
          (notice ? "&notice=" + encodeURIComponent(notice) : ""));
      }

      function setBusy(busy, message = "") {
        app.querySelectorAll("button, input, textarea, select").forEach((control) => {
          control.disabled = busy;
        });
        status.textContent = message;
      }

      function error(message) {
        status.textContent = message;
        status.className = "error";
      }

      function clearStatus(message = "") {
        status.className = "";
        status.textContent = message;
      }

      function applyTemplateDefaults(template) {
        if (template?.kind !== "sample") return;
        if (!draft.appName) {
          draft.appName = "Dealer-sample-" + crypto.randomUUID().slice(0, 8);
        }
        if (!draft.purpose) {
          draft.purpose = DEALER_SAMPLE_PURPOSE;
        }
      }

      function actions({ back, nextLabel, next, nextDisabled = false }) {
        return '<div class="actions">' +
          (back ? '<button type="button" class="link" id="back">Back</button>' : '<span></span>') +
          '<div class="actions-right"><button type="button" class="primary" id="next"' +
          (nextDisabled ? " disabled" : "") + '>' + escape(nextLabel) + '</button></div></div>';
      }

      function topBack(label = "Back") {
        return '<div class="topbar"><button type="button" class="link" id="top-back" aria-label="' +
          escape(label) + '">&#8592; ' + escape(label) + '</button></div>';
      }

      function wireTopBack(back) {
        document.getElementById("top-back")?.addEventListener("click", back);
      }

      function badgeClass(badge) {
        const normalized = badge.toLowerCase();
        if (normalized.includes("foundry")) return "foundry";
        if (normalized.includes("hostedagent")) return "hosted-agent";
        if (normalized.includes("hostedskill")) return "hosted-skill";
        if (normalized === "http") return "http";
        if (normalized === "embr") return "embr";
        if (normalized.includes("mcp")) return "mcp";
        if (normalized.includes("connector")) return "connector";
        if (normalized.includes("docker")) return "docker";
        if (normalized.includes("sandbox")) return "sandbox";
        if (normalized.includes("durable")) return "durable";
        if (normalized.includes("direct data")) return "data";
        if (normalized.includes("gateway")) return "gateway";
        return "";
      }

      function askDeleteConfirmation(appName) {
        return new Promise((resolve) => {
          const dialog = document.createElement("div");
          dialog.className = "confirm-backdrop";
          dialog.innerHTML = '<section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-title">' +
            '<h2 id="confirm-delete-title">Delete ' + escape(appName) + '?</h2>' +
            '<p><strong>Are you sure?</strong> This permanently removes the app Git worktree, its local files, and its Unity-created branch. This cannot be undone.</p>' +
            '<p>No Azure resources, repositories, or cloud deployments will be deleted.</p>' +
            '<div class="actions"><button type="button" id="cancel-delete">No, keep app</button>' +
            '<div class="actions-right"><button type="button" class="danger" id="confirm-delete">Yes, delete worktree</button></div></div></section>';
          document.body.append(dialog);
          const close = (confirmed) => {
            dialog.remove();
            resolve(confirmed);
          };
          dialog.querySelector("#cancel-delete").addEventListener("click", () => close(false));
          dialog.querySelector("#confirm-delete").addEventListener("click", () => close(true));
          dialog.querySelector("#cancel-delete").focus();
        });
      }

      async function deleteApp(root, appName) {
        if (!await askDeleteConfirmation(appName)) return;
        setBusy(true, "Deleting app worktree…");
        try {
          await request("/api/delete-app", {
            method: "POST",
            body: JSON.stringify({ root, confirmed: true })
          });
          sources = null;
          await loadSources();
          renderExistingApps();
          clearStatus("App worktree deleted. Azure resources were not changed.");
        } catch (cause) {
          error(cause.message);
          setBusy(false, status.textContent);
        }
      }

      function wireActions({ back, next }) {
        document.getElementById("back")?.addEventListener("click", back);
        document.getElementById("next")?.addEventListener("click", next);
      }

      function renderLanding() {
        draft.journey = null;
        clearStatus();
        app.innerHTML = '<div class="eyebrow">Unity Studio</div>' +
          '<h1>What would you like to do?</h1>' +
          '<p>Start a new app, assemble existing pieces, or continue working on an app you already have.</p>' +
          '<div class="journeys">' +
          '<button type="button" class="journey primary" id="new-app"><strong>Create a new app</strong>' +
          '<span>Describe what you want to build and start from a proven template.</span></button>' +
          '<button type="button" class="journey" id="open-app"><strong>Open an app</strong>' +
          '<span>Continue building, run it locally, or manage its Azure deployment.</span></button>' +
          '<button type="button" class="journey" id="assemble-app"><strong>Assemble existing pieces</strong>' +
          '<span>Combine source projects and map existing Azure resources.</span></button></div>';
        document.getElementById("new-app").addEventListener("click", async () => {
          draft.journey = "new";
          draft.starterKind = "template";
          draft.step = 1;
          renderDetails();
          try {
            await loadSources();
            if (!draft.templateRootId) {
              draft.templateRootId = sources.templates[0]?.id || "";
            }
            applyTemplateDefaults(sources.templates.find((item) => item.id === draft.templateRootId));
            renderDetails();
          } catch (cause) {
            error(cause.message);
          }
        });
        document.getElementById("assemble-app").addEventListener("click", () => {
          draft.journey = "assemble";
          draft.starterKind = "assembly";
          draft.step = 1;
          renderDetails();
        });
        document.getElementById("open-app").addEventListener("click", async () => {
          try {
            await loadSources(true);
            renderExistingApps();
          } catch (cause) {
            error(cause.message);
          }
        });
      }

      function renderExistingApps() {
        const apps = sources?.apps || [];
        app.innerHTML = topBack("Back to start") + '<div class="step">Existing apps</div><h1>Open a Unity app</h1>' +
          '<p>Apps persist as repository and worktree pairs. Select one to open its request flow and Guide.</p>' +
          (apps.length ? '<div class="choice-list">' + apps.map((item) =>
            '<div class="choice source-option app-row"><button type="button" class="link" data-existing-app="' + escape(item.path) + '">' +
            '<strong>' + escape(item.name) + '</strong><small>' + item.capabilityIds.length +
            ' discovered tier(s)</small><small class="app-last-opened">' +
            (item.lastOpenedAt
              ? 'Last opened <time datetime="' + escape(item.lastOpenedAt) + '">' +
                escape(new Date(item.lastOpenedAt).toLocaleString()) + '</time>'
              : 'Last opened: Not recorded') +
            '</small></button><button type="button" class="icon-button danger" data-delete-existing-app="' +
            escape(item.path) + '" aria-label="Delete ' + escape(item.name) + '" title="Delete app">' +
            '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 1.5h6l.6 1.5H14v1H2V3h2.4L5 1.5Zm-2 4h10l-.6 9H3.6l-.6-9Zm3 1v6h1V6.5H6Zm3 0v6h1V6.5H9Z"/></svg></button></div>').join("") +
            '</div>' : '<div class="notice">No existing runnable Unity apps were found in the current Git worktrees.</div>') +
          '';
        wireTopBack(renderLanding);
        document.querySelectorAll("[data-existing-app]").forEach((button) => button.addEventListener("click", () => {
          openAppMap(button.dataset.existingApp);
        }));
        document.querySelectorAll("[data-delete-existing-app]").forEach((button) => button.addEventListener("click", async (event) => {
          event.stopPropagation();
          const appRow = button.closest(".choice");
          const appName = appRow?.querySelector("strong")?.textContent || "this app";
          await deleteApp(button.dataset.deleteExistingApp, appName);
        }));
      }

      function captureDetails() {
        draft.appName = document.getElementById("app-name").value.trim();
        draft.purpose = document.getElementById("purpose").value.trim();
        if (draft.journey === "new") {
          draft.templateRootId = document.querySelector('input[name="template"]:checked')?.value || "";
        }
      }

      function templateHtml() {
        if (!sources) {
          return '<div class="notice">Loading available templates…</div>';
        }
        if (sources.templates.length === 0) {
          return '<div class="notice">No hydrateable samples were found in the available worktrees.</div>';
        }
        return '<div class="choice-list">' + sources.templates.map((template) =>
          '<label class="choice template"><input type="radio" name="template" value="' + escape(template.id) + '"' +
          (draft.templateRootId === template.id ? " checked" : "") + '><span><strong>' + escape(template.name) +
          '</strong><span class="template-meta">' + escape(template.description) +
          '</span></span></label>').join("") + '</div>';
      }

      async function loadSources(refresh = false) {
        if (sources && !refresh) return;
        setBusy(true, "Finding source projects in Git worktrees…");
        try {
          sources = await request("/api/sources");
          clearStatus();
        } finally {
          setBusy(false, status.textContent);
        }
      }

      function renderDetails() {
        clearStatus();
        const isNew = draft.journey === "new";
        app.innerHTML = topBack("Back to start") + '<div class="step">Step 1 of ' + (isNew ? "3" : "4") + '</div>' +
          '<h1>' + (isNew ? "Build a new app" : "Assemble existing pieces") + '</h1>' +
          (isNew ? '<h2>Choose a template</h2><p>Start with the editable Empty Unity app or the complete Dealer sample.</p><div id="templates">' + templateHtml() + '</div>' : '') +
          '<label class="field">App name<input id="app-name" type="text" maxlength="80" value="' +
          escape(draft.appName) + '" placeholder="claims-assistant"></label>' +
          '<label class="field">What should this app do?<textarea id="purpose" maxlength="500" placeholder="Describe the outcome for its users.">' +
          escape(draft.purpose) + '</textarea></label>' +
          (!isNew ? '<div class="notice">Next, you will add capabilities and explicitly choose a source project for each one.</div>' : '') +
          actions({ back: true, nextLabel: isNew ? "Continue" : "Choose pieces" });
        document.getElementById("back").addEventListener("click", renderLanding);
        wireTopBack(renderLanding);
        document.querySelectorAll('input[name="template"]').forEach((input) => {
          input.addEventListener("change", () => {
            captureDetails();
            draft.templateRootId = input.value;
            const template = sources.templates.find((item) => item.id === input.value);
            applyTemplateDefaults(template);
            draft.tierIds = [...template.capabilityIds];
            document.getElementById("app-name").value = draft.appName;
            document.getElementById("purpose").value = draft.purpose;
          });
        });
        document.getElementById("app-name").addEventListener("input", (event) => {
          draft.appName = event.target.value;
        });
        document.getElementById("purpose").addEventListener("input", (event) => {
          draft.purpose = event.target.value;
        });
        document.getElementById("next").addEventListener("click", async () => {
          captureDetails();
          if (!draft.appName || !draft.purpose) {
            error("Enter an app name and purpose.");
            return;
          }
          if (isNew) {
            try {
              await loadSources();
            } catch (cause) {
              error(cause.message);
              return;
            }
            if (!draft.templateRootId) {
              error("Choose a template or sample.");
              return;
            }
            const template = sources.templates.find((item) => item.id === draft.templateRootId);
            draft.tierIds = [...template.capabilityIds];
          }
          if (!isNew) {
            try {
              await loadSources();
            } catch (cause) {
              error(cause.message);
              return;
            }
          }
          draft.step = 2;
          if (isNew) {
            const template = sources.templates.find((item) => item.id === draft.templateRootId);
            template.kind === "sample" ? renderReview() : renderCapabilities();
          } else {
            renderPieces();
          }
        });
      }

      function renderCapabilities() {
        clearStatus();
        const isSandboxGateway = draft.templateRootId === "builtin-sandbox-gateway-minimal-v1";
        const heading = isSandboxGateway ? "Customize the Sandbox &amp; Gateway template" : "Customize the empty template";
        const intro = isSandboxGateway
          ? "The template starts with a headless agent loop, an ACA Sandbox tool boundary, and an AI Gateway seam. Define the egress allow-list without asking Unity Studio to guess your tools."
          : "The template starts with one intentionally empty Hosted Skill. Define its seam without asking Unity Studio to guess your tools.";
        const secondField = isSandboxGateway
          ? '<label class="field">Egress allow-list domain<input id="egress-domain" type="text" maxlength="253" value="' +
            escape(draft.templateInputs.egressAllowDomain) + '" placeholder="api.lender.example.com"></label>'
          : '<label class="field">Empty Hosted Skill name<input id="skill-name" type="text" maxlength="40" value="' +
            escape(draft.templateInputs.hostedSkillName) + '" placeholder="starter-skill"></label>';
        app.innerHTML = topBack("Back") + '<div class="step">Step 2 of 3</div><h1>' + heading + '</h1>' +
          '<p>' + intro + '</p>' +
          '<label class="field">Agent instructions<textarea id="agent-instructions" maxlength="2000" placeholder="Explain how the agent should help, without inventing tool results.">' +
          escape(draft.templateInputs.agentInstructions || ('Help users accomplish: ' + draft.purpose)) + '</textarea></label>' +
          secondField +
          '<h2>Included now</h2><p>Keep the first template predictable. Add other capabilities from Unity Studio after creation.</p>' +
          '<div class="capability-list">' + draft.tierIds.map((tierId) => {
            const tier = capabilities.find((item) => item.id === tierId);
            return '<div class="capability"><strong>' + escape(tier.name) +
              '</strong><small>' + escape(tier.role) + '</small></div>';
          }).join("") + '</div>' +
          actions({ back: true, nextLabel: "Review app" });
        wireActions({
          back: renderDetails,
          next: () => {
            draft.templateInputs.agentInstructions = document.getElementById("agent-instructions").value.trim();
            if (!draft.templateInputs.agentInstructions) {
              error("Enter agent instructions.");
              return;
            }
            if (isSandboxGateway) {
              draft.templateInputs.egressAllowDomain = document.getElementById("egress-domain").value.trim();
              if (!/^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(draft.templateInputs.egressAllowDomain)) {
                error("Enter a valid egress allow-list domain, e.g. api.lender.example.com.");
                return;
              }
            } else {
              draft.templateInputs.hostedSkillName = document.getElementById("skill-name").value.trim();
              if (!/^[a-z][a-z0-9-]{0,39}$/.test(draft.templateInputs.hostedSkillName)) {
                error("Enter a lowercase Hosted Skill name using letters, numbers, or hyphens.");
                return;
              }
            }
            draft.step = 3;
            renderReview();
          }
        });
        wireTopBack(renderDetails);
      }

      function availableForTier(tierId) {
        return (sources?.roots ?? []).flatMap((root) =>
          root.implementations
            .filter((implementation) => implementation.tierId === tierId)
            .map((implementation) => ({ root, implementation })));
      }

      function renderPieces() {
        clearStatus();
        const unused = capabilities.filter((tier) => !draft.tierIds.includes(tier.id));
        app.innerHTML = topBack("Back") + '<div class="step">Step 2 of 4</div><h1>Choose pieces</h1>' +
          '<p>Add a capability, then choose the source project that should implement it.</p>' +
          '<div class="mapping-list">' + draft.tierIds.map((tierId) => {
            const tier = capabilities.find((item) => item.id === tierId);
            const options = availableForTier(tierId);
            const selected = draft.sourceBindings[tierId] || "";
            return '<div class="mapping"><div class="mapping-heading"><div><h3>' + escape(tier.name) +
              '</h3><small>' + escape(tier.role) + '</small></div><button type="button" class="link" data-remove="' +
              tierId + '">Remove</button></div><select data-source-tier="' + tierId + '">' +
              '<option value="">Choose source project…</option>' + options.map(({ root, implementation }) =>
                '<option value="' + implementation.id + '"' + (selected === implementation.id ? " selected" : "") + '>' +
                escape(root.name + " · " + (root.branch || "detached") + " · " + root.path + " · " + implementation.projectPath +
                  (root.dirty ? " · Modified" : " · Clean")) + '</option>').join("") +
              '</select>' + (options.length === 0 ? '<small>No matching project found. Add a local folder below.</small>' : '') +
              '</div>';
          }).join("") + '</div>' +
          (unused.length
            ? '<label class="field">Add capability<select id="add-tier"><option value="">Choose capability…</option>' +
              unused.map((tier) => '<option value="' + tier.id + '">' + escape(tier.name) + '</option>').join("") +
              '</select></label>'
            : "") +
          '<div class="local-path"><input id="local-path" type="text" placeholder="/path/to/repository-or-folder">' +
          '<button type="button" id="add-path">Add local path</button></div>' +
          actions({ back: true, nextLabel: "Continue to Azure resources" });
        document.getElementById("add-tier")?.addEventListener("change", (event) => {
          if (event.target.value) {
            draft.tierIds.push(event.target.value);
            renderPieces();
          }
        });
        document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => {
          draft.tierIds = draft.tierIds.filter((id) => id !== button.dataset.remove);
          delete draft.sourceBindings[button.dataset.remove];
          renderPieces();
        }));
        document.querySelectorAll("[data-source-tier]").forEach((select) => select.addEventListener("change", () => {
          draft.sourceBindings[select.dataset.sourceTier] = select.value;
        }));
        document.getElementById("add-path").addEventListener("click", async () => {
          const path = document.getElementById("local-path").value.trim();
          if (!path) {
            error("Enter a local repository or folder path.");
            return;
          }
          setBusy(true, "Scanning the selected folder…");
          try {
            sources = await request("/api/sources", { method: "POST", body: JSON.stringify({ path }) });
            clearStatus("Local folder added.");
            renderPieces();
          } catch (cause) {
            error(cause.message);
          } finally {
            setBusy(false, status.textContent);
          }
        });
        wireActions({
          back: renderDetails,
          next: async () => {
            if (draft.tierIds.length === 0) {
              error("Add at least one capability.");
              return;
            }
            const missing = draft.tierIds.find((tierId) => !draft.sourceBindings[tierId]);
            if (missing) {
              error("Choose a source project for " + capabilities.find((item) => item.id === missing).name + ".");
              return;
            }
            setBusy(true, "Loading compatible Azure resources…");
            try {
              azureInventory = await request("/api/discovery?azure=true");
              draft.step = 3;
              renderAzure();
            } catch (cause) {
              azureInventory = null;
              draft.step = 3;
              renderAzure(cause.message);
            }
          }
        });
        wireTopBack(renderDetails);
      }

      function azureForTier(tierId) {
        return azureInventory?.inventory
          ?.find((tier) => tier.id === tierId)
          ?.implementations.filter((item) => item.kind === "azure-resource") ?? [];
      }

      function renderAzure(warning = "") {
        clearStatus();
        app.innerHTML = topBack("Back") + '<div class="step">Step 3 of 4</div><h1>Map Azure resources <small>(optional)</small></h1>' +
          '<p>These mappings are references only. Unity Studio will not read keys, deploy, or change resources.</p>' +
          (warning ? '<div class="notice">' + escape(warning) + ' You can continue without Azure mappings.</div>' : "") +
          '<div class="mapping-list">' + draft.tierIds.map((tierId) => {
            const tier = capabilities.find((item) => item.id === tierId);
            const resources = azureForTier(tierId);
            return '<div class="mapping"><h3>' + escape(tier.name) + '</h3><select data-azure-tier="' + tierId + '">' +
              '<option value="">No resource mapped</option>' + resources.map((resource) =>
                '<option value="' + escape(resource.resourceId) + '"' +
                (draft.azureBindings[tierId] === resource.resourceId ? " selected" : "") + '>' +
                escape(resource.title + " · " + resource.subtitle) + '</option>').join("") + '</select></div>';
          }).join("") + '</div>' +
          actions({ back: true, nextLabel: "Review app" });
        document.querySelectorAll("[data-azure-tier]").forEach((select) => select.addEventListener("change", () => {
          draft.azureBindings[select.dataset.azureTier] = select.value;
        }));
        wireActions({
          back: renderPieces,
          next: () => {
            draft.step = 4;
            renderReview();
          }
        });
        wireTopBack(renderPieces);
      }

      function capabilityReview(tierId) {
        const tier = capabilities.find((item) => item.id === tierId);
        const sourceId = draft.journey === "assemble" ? draft.sourceBindings[tierId] : null;
        const selected = sourceId
          ? sources.roots.flatMap((root) => root.implementations.map((implementation) => ({ root, implementation })))
              .find((item) => item.implementation.id === sourceId)
          : null;
        return '<div class="review-row"><strong>' + escape(tier.name) + '</strong><small>' +
          escape(selected ? selected.root.name + " · " + selected.implementation.projectPath :
            (sources.templates.find((item) => item.id === draft.templateRootId)?.kind === "sample"
              ? "Included in the complete runnable sample"
              : (tierId === "skills" ? "One empty Hosted Skill" : "Editable template implementation"))) +
          (draft.azureBindings[tierId] ? "<br>Azure resource mapped" : "") + '</small></div>';
      }

      function renderReview() {
        clearStatus();
        const selectedTemplate = sources?.templates.find((item) => item.id === draft.templateRootId);
        const total = draft.journey === "new" ? (selectedTemplate?.kind === "sample" ? 2 : 3) : 4;
        const starter = draft.journey === "assemble"
          ? "Assembled from selected source projects"
          : selectedTemplate?.name;
        app.innerHTML = topBack("Back") + '<div class="step">Step ' + total + ' of ' + total + '</div><h1>Review app</h1>' +
          '<div class="summary"><section><h3>App</h3><p><strong>' + escape(draft.appName) + '</strong><br>' +
          escape(draft.purpose) + '</p></section><section><h3>Starter</h3><p>' + escape(starter) +
          '</p></section><section><h3>Capabilities</h3><div class="review-list">' +
          draft.tierIds.map(capabilityReview).join("") + '</div></section><section><h3>Workspace</h3>' +
          '<p>New isolated Git worktree. Selected sources are copied or hydrated; source locations are never modified.</p>' +
          '<label><input id="open-vscode" type="checkbox"' + (draft.openInVsCode ? " checked" : "") +
          '> Open the new worktree in VS Code</label></section></div>' +
          '<div class="notice">No Azure resources will be created or changed.</div>' +
          actions({ back: true, nextLabel: draft.journey === "assemble" ? "Create assembled app" :
            (selectedTemplate?.kind === "sample" ? "Create runnable sample" : "Create empty app") });
        wireActions({
          back: draft.journey === "assemble" ? renderAzure :
            (selectedTemplate?.kind === "sample" ? renderDetails : renderCapabilities),
          next: submit
        });
        wireTopBack(draft.journey === "assemble" ? renderAzure :
          (selectedTemplate?.kind === "sample" ? renderDetails : renderCapabilities));
      }

      function appMapVisual(appMap) {
        if (!appMap) {
          return '<div class="map-loading">Tracing components and relationships from source…</div>';
        }
        return appMap.renderedHtml || '<div class="map-loading">Map rendering is unavailable. Refresh to retry.</div>';
      }

      function renderInventory(result, inventory, appMap) {
         if (outputTimer) {
           clearInterval(outputTimer);
           outputTimer = null;
         }
        const tiers = inventory?.inventory || [];
        const implemented = tiers.filter((tier) => tier.implementations.length > 0).length;
        const graphSummary = appMap
          ? appMap.nodes.length + " nodes · " + appMap.edges.length + " edges"
          : "Not traced yet";
        app.innerHTML = topBack("Existing apps") +
          '<header class="workspace-intro"><div class="eyebrow">App workspace</div><h1>' + escape(draft.appName) +
          '</h1><p>' + escape(draft.purpose) + '</p><div class="workspace-meta"><span class="badge">' +
          implemented + ' of ' + tiers.length + ' tiers discovered</span><code class="workspace-path">' +
          escape(result.worktreePath || "Unavailable") + '</code></div></header>' +
          '<div class="section-label">Configure</div>' +
          '<details class="surface configuration-region" open><summary class="surface-head"><h2 id="configuration-title">Azure configuration</h2><small>Optional cloud bindings</small></summary>' +
          '<div class="surface-body"><div class="subsurface gateway-card"><div class="subsurface-head"><h3>AI Gateway</h3>' +
          '<small id="gateway-summary">Discovering gateways…</small></div>' +
          '<p>Selecting a gateway configures this app automatically with its endpoint, key, and model settings.</p>' +
          '<div id="gateway-binding"></div><div class="configuration-actions">' +
          '<button type="button" id="configure-gateway">Create / Manage</button></div></div>' +
          '<div class="lifecycle-actions">' +
          '<button type="button" data-app-command="provision-cloud">Provision with azd</button>' +
          '<button type="button" data-app-command="deploy-cloud">Deploy with azd up</button></div></div></details>' +
          '<div class="section-label">Run</div>' +
          '<details class="surface runtime-region" open><summary class="surface-head"><h2 id="runtime-title">Local runtime</h2>' +
          '<div class="badges" id="local-status"><span class="badge">Checking</span></div></summary>' +
          '<div class="surface-body"><div id="local-guidance"></div>' +
          '<div class="lifecycle-actions"><button type="button" class="primary" id="local-action" data-app-command="run-local">Run locally</button></div>' +
          '<div class="component-list" id="entrypoints"></div><div id="component-actions"></div>' +
          '<details class="command-panel" id="local-command-panel"><summary><span>Command output</span>' +
          '<span class="command-summary" id="local-command-summary">Idle</span></summary>' +
          '<pre id="local-output">Waiting for local app output.</pre></details></div></details>' +
          '<div class="section-label">Map</div>' +
          '<details class="surface app-map-region" open><summary class="surface-head">' +
          '<h2 id="app-map-title">App Map</h2><small>' + escape(graphSummary) + '</small></summary>' +
          '<div class="surface-body"><div class="map-toolbar"><button type="button" class="icon-button map-expand" id="open-app-map"' +
          (appMap ? "" : " disabled") + ' aria-label="Open expanded App Map" title="Open expanded App Map">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4a1 1 0 1 0 0 2h2.59l-5.3 5.29a1 1 0 0 0 1.42 1.42L18 7.41V10a1 1 0 1 0 2 0V4h-6ZM5 6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3a1 1 0 1 0-2 0v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3a1 1 0 0 0 0-2H5Z"/></svg></button></div>' +
          appMapVisual(appMap) +
          '<div class="configuration-actions"><button type="button" id="trace-app">' +
          (appMap ? "Refresh map" : "Tracing…") + '</button></div></div></details>' +
          '<div class="section-label">Inspect</div>' +
          '<details class="surface specialist-region"><summary class="surface-head">' +
          '<h2 id="specialist-title">Specialist studios</h2></summary><div class="surface-body"><p>' +
          escape((result.specialistCanvases || []).join(", ") || "No specialist studios are registered for this workspace.") +
          '</p></div></details>' +
          '<details class="surface inventory-region"><summary class="surface-head">' +
          '<h2 id="inventory-title">Components by tier</h2><small>Evidence-derived inventory</small></summary>' +
          '<div class="surface-body"><div class="tier-list">' +
          tiers.map((tier) => '<div class="tier-card"><div class="mapping-heading"><h3>' + escape(tier.name) +
            '</h3><button type="button" class="link" data-tier-action="' + escape(tier.id) + '">Deep dive</button></div>' +
            '<small>' + escape(tier.role || "") + '</small><p><strong>' +
            escape(tier.implementationState === "referenced-not-provisioned"
              ? "Referenced by source; not provisioned"
              : tier.implementationState === "missing" ? "Not discovered" : "Observed") +
            '</strong><br>' +
            (tier.implementations.length > 0
              ? escape(tier.implementations.length + " discovered implementation(s)") +
                tier.implementations.map((item) =>
                  '<br><strong>' + escape(item.title) + '</strong> · ' + escape(item.kind) +
                  (item.badges?.length ? '<div class="badges">' + item.badges.map((badge) =>
                    '<span class="badge ' + badgeClass(badge) + '">' + escape(badge) + '</span>').join("") + '</div>' : '') +
                  '<br><code>' + escape(item.subtitle || item.projectPath || item.resourceId || "") + '</code>' +
                  (item.matchedFiles?.length
                    ? '<br><small>Source files: ' + escape(item.matchedFiles.map((evidence) =>
                      evidence.path + ":" + evidence.line).join(" · ")) + '</small>'
                    : '') +
                  (item.kind === "source-project"
                    ? '<br><button type="button" data-open-source="' + escape(item.projectPath) + '">Open source</button>'
                    : '')).join("")
              : 'No implementation discovered yet · scaffold available') +
            '</p></div>').join("") + '</div></div></details>' +
          '<div class="danger-zone"><button type="button" id="delete-app">Delete app</button></div>';
         wireTopBack(async () => {
          if (!sources) await loadSources();
          renderExistingApps();
         });
        document.querySelectorAll("[data-open-source]").forEach((button) => button.addEventListener("click", async () => {
          setBusy(true, "Opening component source in VS Code…");
          try {
            await request("/api/open-source", {
              method: "POST",
              body: JSON.stringify({ root: result.worktreePath, projectPath: button.dataset.openSource })
            });
            clearStatus("Source opened in VS Code.");
          } catch (cause) {
            error(cause.message);
          } finally {
            setBusy(false, status.textContent);
          }
        }));
        async function refreshLocalStatus() {
          try {
            const state = await request("/api/app-status?root=" + encodeURIComponent(result.worktreePath));
            const running = state.state === "running";
            const stopping = state.state === "stopping";
            document.getElementById("local-status").innerHTML =
              '<span class="badge ' + (running ? "http" : "") + '">' + escape(state.state || "stopped") + '</span>';
            const commandSummary = document.getElementById("local-command-summary");
            if (commandSummary) commandSummary.textContent = stopping ? "Stopping…" : (running ? "Running" : "Idle");
            if ((running || stopping) && document.getElementById("local-command-panel")) {
              document.getElementById("local-command-panel").open = true;
            }
             document.getElementById("entrypoints").innerHTML = (state.entrypoints || []).map((entrypoint) =>
              '<div class="component-status"><span class="badge ' + (entrypoint.ready ? "http" : "") + '">' +
              escape(entrypoint.name) + ': ' + (entrypoint.ready ? "ready" : "offline") + '</span>' +
              '<button type="button" data-entrypoint-port="' + entrypoint.port + '"' +
              (entrypoint.ready ? "" : " disabled") + '>' + escape(entrypoint.url) + '</button></div>').join("");
             document.querySelectorAll("[data-entrypoint-port]").forEach((button) => button.addEventListener("click", async () => {
               try {
                 await request("/api/open-entrypoint", {
                   method: "POST",
                   body: JSON.stringify({ root: result.worktreePath, port: Number(button.dataset.entrypointPort) })
                 });
               } catch (cause) {
                 error(cause.message);
               }
             }));
             const agentReady = (state.entrypoints || []).some((entrypoint) => entrypoint.port === 8088 && entrypoint.ready);
             const componentActions = document.getElementById("component-actions");
             if (agentReady && !componentActions.querySelector(".agent-tester")) {
               componentActions.innerHTML = '<div class="agent-tester"><strong>Invoke agent</strong>' +
                 '<textarea id="agent-prompt" maxlength="2000" placeholder="Send a message to the running agent"></textarea>' +
                 '<div><button type="button" id="send-agent-prompt">Invoke agent</button> ' +
                 '<button type="button" id="open-agent-studio">Open agent studio</button></div>' +
                 '<pre class="agent-response" id="agent-response"></pre></div>';
               document.getElementById("send-agent-prompt").addEventListener("click", async () => {
                 const prompt = document.getElementById("agent-prompt").value.trim();
                 if (!prompt) return error("Enter a message for the local agent.");
                 setBusy(true, "Waiting for the local agent…");
                 try {
                   const reply = await request("/api/agent-invoke", {
                     method: "POST",
                     body: JSON.stringify({ root: result.worktreePath, message: prompt })
                   });
                   document.getElementById("agent-response").textContent =
                     typeof reply.response === "string" ? reply.response : JSON.stringify(reply.response, null, 2);
                   clearStatus("Agent response received.");
                 } catch (cause) {
                   error(cause.message);
                 } finally {
                   setBusy(false);
                 }
               });
               document.getElementById("open-agent-studio").addEventListener("click", async () => {
                 try {
                   await request("/api/tier-action", {
                     method: "POST",
                     body: JSON.stringify({ tierId: "agent", root: result.worktreePath, includeAzure: true })
                   });
                 } catch (cause) {
                   error(cause.message);
                 }
               });
             } else if (!agentReady) {
               componentActions.innerHTML = "";
             }
             const readiness = await request("/api/local-readiness?root=" + encodeURIComponent(result.worktreePath));
             document.getElementById("local-guidance").innerHTML = readiness.ready ? "" :
              '<p><strong>Local setup needed:</strong> ' + escape(readiness.guidance) + '</p>';
             const manageGateway = document.getElementById("configure-gateway");
             if (manageGateway) manageGateway.onclick = async () => {
              setBusy(true, "Opening AI Gateway Studio…");
              try {
                await request("/api/tier-action", {
                  method: "POST",
                  body: JSON.stringify({ tierId: "gateway", root: result.worktreePath, includeAzure: true })
                });
               clearStatus("AI Gateway Studio opened for gateway and model selection.");
              } catch (cause) {
                error(cause.message);
              } finally {
                setBusy(false, status.textContent);
              }
             };
            const localAction = document.getElementById("local-action");
            localAction.dataset.appCommand = running ? "stop-local" : "run-local";
            localAction.textContent = stopping ? "Stopping local app…" : (running ? "Stop local app" : "Run locally");
            localAction.disabled = stopping;
          } catch (cause) {
            error(cause.message);
          }
         }
          async function refreshLocalOutput() {
            try {
              const output = await request("/api/app-output?root=" + encodeURIComponent(result.worktreePath));
              const terminal = document.getElementById("local-output");
              const text = output.lines.join("\\n") || "Waiting for local app output.";
              if (terminal && terminal.textContent !== text) {
                terminal.textContent = text;
                terminal.scrollTop = terminal.scrollHeight;
              }
            } catch (cause) {
              error(cause.message);
            }
          }
          async function loadGatewayOptions() {
            try {
              const gatewayOptions = await request("/api/gateway-options?root=" + encodeURIComponent(result.worktreePath));
              const gatewaySummary = document.getElementById("gateway-summary");
              if (gatewaySummary) {
                gatewaySummary.textContent = gatewayOptions.active
                  ? "Active: " + gatewayOptions.active.name
                  : "No active gateway";
              }
              async function configureActiveGateway() {
                setBusy(true, "Configuring app from active gateway…");
                try {
                  await request("/api/app-command", {
                    method: "POST",
                    body: JSON.stringify({ operation: "configure-gateway", root: result.worktreePath })
                  });
                  clearStatus("Gateway selected. Configuring app settings in the embedded terminal…");
                } catch (cause) {
                  error("Gateway configuration failed: " + cause.message);
                } finally {
                  setBusy(false);
                }
              }
              document.getElementById("gateway-binding").innerHTML =
                '<label class="field">Active AI Gateway<select id="active-gateway">' +
                '<option value="">Choose a gateway</option>' +
                gatewayOptions.gateways.map((gateway) =>
                  '<option value="' + escape(gateway.name) + '"' +
                  (gatewayOptions.active?.name === gateway.name ? " selected" : "") + '>' +
                  escape(gateway.name + (gateway.resourceGroup ? " · " + gateway.resourceGroup : "")) +
                  '</option>').join("") + '</select></label>';
             if (gatewayOptions.active) {
                  document.getElementById("gateway-binding").innerHTML +=
                    '<button type="button" data-app-command="configure-active-gateway">Configure app from active gateway</button>';
                 document.querySelector('[data-app-command="configure-active-gateway"]').addEventListener("click", async () => {
                   await configureActiveGateway();
                 });
                 const readiness = await request("/api/local-readiness?root=" + encodeURIComponent(result.worktreePath));
                 if (!readiness.ready) {
                   await configureActiveGateway();
                 }
             }
              document.getElementById("active-gateway")?.addEventListener("change", async (event) => {
                if (!event.target.value) return;
                try {
                  await request("/api/active-gateway", {
                    method: "POST",
                    body: JSON.stringify({ root: result.worktreePath, name: event.target.value })
                  });
                  await loadGatewayOptions();
                } catch (cause) {
                  error(cause.message);
                }
              });
            } catch (cause) {
              const gatewaySummary = document.getElementById("gateway-summary");
              if (gatewaySummary) gatewaySummary.textContent = "Discovery unavailable";
              document.getElementById("gateway-binding").innerHTML =
                '<p>AI Gateway discovery unavailable: ' + escape(cause.message) + '</p>';
            }
          }
        document.querySelectorAll("[data-app-command]").forEach((button) => button.addEventListener("click", async () => {
          setBusy(true, "Starting " + button.textContent + "…");
          const commandPanel = document.getElementById("local-command-panel");
          if (commandPanel) commandPanel.open = true;
          try {
            if (button.dataset.appCommand === "configure-active-gateway") {
              const commandResult = await request("/api/app-command", {
                method: "POST",
                body: JSON.stringify({ operation: "configure-gateway", root: result.worktreePath })
              });
              clearStatus(commandResult.command + " started (PID " + commandResult.pid + ").");
              return;
            }
            if (button.dataset.appCommand === "run-local") {
              const readiness = await request("/api/local-readiness?root=" + encodeURIComponent(result.worktreePath));
              if (!readiness.ready) {
                await request("/api/tier-action", {
                  method: "POST",
                  body: JSON.stringify({ tierId: "gateway", root: result.worktreePath, includeAzure: true })
                });
                clearStatus("Local startup needs a gateway and model. AI Gateway Studio opened for setup.");
                return;
              }
            }
            const commandResult = await request("/api/app-command", {
              method: "POST",
              body: JSON.stringify({ operation: button.dataset.appCommand, root: result.worktreePath })
            });
            clearStatus(commandResult.outcome === "already-running"
              ? "The local app is already running."
              : commandResult.outcome === "operation-in-progress"
                ? "The local app is already " + commandResult.state + "."
                : commandResult.command + " started (PID " + commandResult.pid + ").");
            await refreshLocalStatus();
          } catch (cause) {
            error(cause.message);
          } finally {
            setBusy(false, status.textContent);
          }
        }));
        void refreshLocalStatus();
        void refreshLocalOutput();
        void loadGatewayOptions();
        outputTimer = setInterval(() => {
          void refreshLocalStatus();
          void refreshLocalOutput();
        }, 1000);
        document.querySelectorAll("[data-tier-action]").forEach((button) => button.addEventListener("click", async () => {
          setBusy(true, "Opening the tier studio…");
          try {
            const action = await request("/api/tier-action", {
              method: "POST",
              body: JSON.stringify({ tierId: button.dataset.tierAction, root: result.worktreePath, includeAzure: true })
            });
            if (action.outcome === "candidates-discovered") {
              clearStatus("Tier evidence is ready in the response.");
            } else {
              clearStatus("No implementation found; scaffold guidance is ready.");
            }
          } catch (cause) {
            error(cause.message);
          } finally {
            setBusy(false, status.textContent);
          }
        }));
        async function traceAndRender(showProgress = true) {
          if (showProgress) setBusy(true, "Tracing source call graph…");
          const traceButton = document.getElementById("trace-app");
          if (traceButton) traceButton.disabled = true;
          try {
            const traced = await request("/api/app-map", {
              method: "POST",
              body: JSON.stringify({ root: result.worktreePath })
            });
            renderInventory(result, inventory, traced);
          } catch (cause) {
            error(cause.message);
            if (traceButton) {
              traceButton.disabled = false;
              traceButton.textContent = "Retry map";
            }
          } finally {
            if (showProgress) setBusy(false, status.textContent);
          }
        }
        document.getElementById("trace-app").addEventListener("click", () => void traceAndRender());
        document.getElementById("open-app-map")?.addEventListener("click", async () => {
          setBusy(true, "Opening expanded App Map…");
          try {
            await request("/api/open-app-map", {
              method: "POST",
              body: JSON.stringify({ root: result.worktreePath })
            });
            clearStatus("Expanded App Map opened.");
          } catch (cause) {
            error(cause.message);
          } finally {
            setBusy(false, status.textContent);
          }
        });
        if (!appMap) void traceAndRender(false);
        document.getElementById("delete-app").addEventListener("click", async () => {
          await deleteApp(result.worktreePath, draft.appName);
        });
      }

      async function submit() {
        draft.openInVsCode = document.getElementById("open-vscode").checked;
        const sourceBindings = draft.journey === "assemble"
          ? draft.tierIds.map((tierId) => ({
              tierId,
              sourceIds: [draft.sourceBindings[tierId]],
              azureResourceIds: draft.azureBindings[tierId] ? [draft.azureBindings[tierId]] : []
            }))
          : [];
        setBusy(true, "Creating workspace…");
        try {
          const result = await request("/api/workspace-request", {
            method: "POST",
            body: JSON.stringify({
              journey: draft.journey,
              starterKind: draft.journey === "assemble" ? "assembly" : draft.starterKind,
              appName: draft.appName,
              purpose: draft.purpose,
              tierIds: draft.tierIds,
              templateRootId: draft.templateRootId || undefined,
              templateInputs: draft.templateInputs,
              sourceBindings,
              openInVsCode: draft.openInVsCode
            })
          });
          if (result.worktreePath) {
            openAppMap(result.worktreePath, result.editorWarning);
          } else {
            renderLanding();
            clearStatus("Assembly started. The app will appear here when its isolated workspace is ready.");
            setBusy(false, status.textContent);
          }
        } catch (cause) {
          error(cause.message);
          setBusy(false, status.textContent);
        }
      }

      renderLanding();
    </script>
  </body>
</html>`;
}
