import { PLATFORM_TIERS } from "./tier-definitions.mjs";
import { mountStudioHeader } from "./studio-header.mjs";
import { renderStudioIntro, renderStudioIntroStyles, renderStudioIntroClientScript } from "./studio-intro.mjs";
import { renderThemeStyles, renderThemeToggle, renderThemeClientScript } from "./studio-theme.mjs";
import { DEFAULT_EDITOR_SETTINGS } from "./editor-settings.mjs";
import { createStudioNotices } from "./studio-notice.mjs";
import { octiconMask, renderOcticon } from "./studio-icons.mjs";
import { createStudioButtons, STUDIO_BUTTON_MOUNT_CSS } from "./studio-buttons.mjs";
import { getStudioPresentation, renderPresentationStyles } from "./studio-presentation.mjs";
import { mountStudioHome } from "./studio-home.mjs";
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
          return '<div class="map-link"><span class="arrow">' + renderOcticon("arrow-right") + '</span><span>' +
            escapeHtml(edge.kind.replaceAll("-", " ")) + ' <b>' +
            escapeHtml(target?.name || edge.to) + '</b></span></div>';
        });
        const missing = (unresolved.get(node.id) || []).map((item) =>
          '<div class="map-link unresolved"><span class="arrow">' + renderOcticon("question") + '</span><span>Unresolved <b>' +
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
    ? '<div class="map-empty">No source-derived components were found.</div>'
    : '<div class="map-lanes">' + lanes.join("") + '</div>';
  return '<div class="app-map-visual' + (expanded ? " expanded" : "") +
    '" role="region" aria-label="Application graph">' + empty + '</div>' +
    '<div class="map-footer"><span class="map-legend">Solid cards are projects · dashed cards are operations · arrows are source-derived calls</span>' +
    '<span class="badge">' + appMap.edges.length + ' edges · ' + (appMap.unresolved || []).length +
    ' unresolved</span></div>';
}

export function renderStudioHtml(instanceId, apiToken = "", { theme = "light", intro = false, editorSettings = DEFAULT_EDITOR_SETTINGS, presentationProfile = "standalone" } = {}) {
  const presentation = getStudioPresentation(presentationProfile);
  const capabilities = PLATFORM_TIERS.map((tier) => ({
    id: tier.id,
    name: tier.name,
    role: tier.role,
  }));
  return `<!doctype html>
<html lang="en" class="${presentation.className}" data-studio-theme="${escapeHtml(theme)}" data-studio-presentation="${presentation.id}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="data:,">
    <title>Azure App Platform</title>
    <link rel="stylesheet" href="/canvas-ui/styles.css">
    <link rel="stylesheet" href="/canvas-ui/base.css">
    ${presentation.stylesheet ? `<link rel="stylesheet" href="${presentation.stylesheet}">` : ""}
    <style>
      ${STUDIO_BUTTON_MOUNT_CSS}
      ${renderPresentationStyles(presentation.id)}
      @layer studio-legacy {
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        padding: 8px 24px 48px;
        background:
          radial-gradient(1200px 600px at 100% -12%, color-mix(in srgb, var(--studio-accent) 6%, transparent), transparent),
          var(--studio-bg);
        color: var(--studio-ink);
        font: var(--text-body-medium, 14px)/var(--leading-body-medium, 1.5) var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      }
      main { width: min(100%, 888px); margin: 0 auto; padding: 24px 0; }
      h1 { margin: 0 0 8px; font-size: var(--text-title-size, 20px); line-height: var(--text-title-line-height, 28px); font-weight: var(--font-weight-semibold, 600); letter-spacing: normal; }
      h2 { margin: 20px 0 6px; font-size: var(--text-subtitle-size, 15px); line-height: 22px; font-weight: var(--font-weight-semibold, 600); }
      h3 { font-size: var(--canvas-body, 13px); line-height: 18px; font-weight: var(--font-weight-semibold, 600); }
      p { margin: 6px 0 16px; color: var(--canvas-muted, var(--studio-muted)); font-size: var(--canvas-body, 13px); line-height: 20px; font-weight: 400; }
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
      .step { color: var(--canvas-muted, var(--studio-muted)); font-size: 12px; font-weight: 400; margin-bottom: 6px; }
      .field { display: grid; gap: 6px; margin: 16px 0; font-size: var(--canvas-body, 13px); line-height: 18px; font-weight: 500; color: var(--canvas-fg, var(--studio-ink)); }
      input[type="text"], textarea, select {
        width: 100%;
        border: 1px solid var(--studio-line);
        border-radius: 9px;
        padding: 8px 10px;
        background: var(--studio-raised);
        color: inherit;
        font-family: inherit;
        font-size: var(--canvas-body, 13px);
        line-height: 20px;
        font-weight: 400;
      }
      textarea { min-height: 84px; resize: vertical; }
      .choice-list, .capability-list, .mapping-list, .review-list { display: grid; gap: 9px; margin: 16px 0; }
      .choice, .capability, .mapping, .review-row {
        border: 1px solid var(--studio-line);
        border-radius: 10px;
        padding: 12px;
      }
      .capability, .review-row { display: grid; gap: 4px; background: var(--studio-raised); }
      .capability-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
      .capability-head .badge { margin-left: auto; flex: 0 0 auto; }
      .capability strong, .review-row strong { display: block; font-size: var(--canvas-body, 13px); line-height: 18px; font-weight: var(--font-weight-semibold, 600); }
      .capability small, .review-row small { display: block; color: var(--canvas-muted, var(--studio-muted)); font-size: 12px; line-height: 18px; font-weight: 400; }
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
      details.surface > summary::before { content:""; flex:none; width:16px; height:16px; background:currentColor; mask:${octiconMask("chevron-right")} center/contain no-repeat; color:var(--studio-accent); transition:transform .2s; }
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
      .command-panel > summary::before { content:""; flex:none; width:16px; height:16px; background:currentColor; mask:${octiconMask("chevron-right")} center/contain no-repeat; color:var(--studio-accent); transition:transform .2s; }
      .command-panel[open] > summary::before { transform: rotate(90deg); }
      .command-summary { margin-left: auto; color: #7f8ca3; font-weight: 400; }
      .command-panel pre { margin: 0; min-height: 96px; max-height: 280px; overflow: auto; padding: 11px; color: #dbe5f7; font: 12px/1.55 var(--font-mono, "SFMono-Regular", Consolas, monospace); white-space: pre-wrap; overflow-wrap: anywhere; }
      .lifecycle-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .lifecycle-actions button { flex: 1 1 180px; }
      .choice label, .capability label { display: flex; gap: 9px; align-items: start; }
      .choice small, .capability small, .mapping small { display: block; color: var(--studio-muted); }
      .template { display: grid; grid-template-columns: auto 1fr; align-items: start; gap: 10px; padding: 12px 14px; background: var(--studio-raised); cursor: pointer; }
      .template:hover { border-color: var(--studio-accent-2); }
      .template:has(input:checked) { border-color: var(--studio-accent); box-shadow: 0 0 0 1px var(--studio-accent); }
      .template > input { margin-top: 3px; }
      .template > span { display: grid; gap: 4px; font-weight: 400; }
      .template strong { font-size: var(--canvas-body, 13px); line-height: 18px; font-weight: var(--font-weight-semibold, 600); color: var(--canvas-fg, var(--studio-ink)); }
      .template-meta { display: block; color: var(--canvas-muted, var(--studio-muted)); font-size: 12px; line-height: 18px; font-weight: 400; }
      .template-preview-card { margin-top: 16px; padding: 14px 16px; border: 1px solid var(--studio-line); border-radius: 10px; background: var(--studio-panel); display: grid; gap: 11px; }
      :root[data-studio-theme="light"] .template-preview-card { background: #f1f5f9; border-color: #cbd5e1; }
      .template-preview-eyebrow { font-size: 11px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; color: var(--studio-muted); margin-bottom: 2px; }
      .template-preview-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 8px; }
      .template-preview-head strong { font-size: 13px; font-weight: 650; color: var(--studio-ink); display: block; }
      .template-preview-head small { color: var(--studio-muted); font-size: 12px; display: block; margin-top: 2px; }
      .template-preview-diagram { border: 1px solid var(--studio-line); border-radius: 8px; padding: 10px 12px; background: var(--studio-raised); overflow-x: auto; }
      .template-preview-diagram svg { display: block; width: 100%; height: auto; max-height: 155px; }
      .template-preview-bullets { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 12px; line-height: 1.45; color: var(--studio-muted); }
      .template-preview-bullets li strong { font-weight: 600; color: var(--studio-ink); }
      .badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
      .badge { border: 1px solid var(--studio-line); border-radius: 999px; padding: 2px 8px; font-size: 11px; background: var(--studio-panel); }
      .badge.foundry, .badge.hosted-agent, .badge.hosted-skill { background: #f0f6fc; border-color: #b6d4fe; color: #1d4ed8; }
      .badge.http, .badge.embr { background: #f0fdfa; border-color: #99f6e4; color: #0f766e; }
      .badge.mcp, .badge.connector { background: #faf5ff; border-color: #d8b4fe; color: #6b21a8; }
      .badge.docker, .badge.sandbox, .badge.durable { background: #f5f7ff; border-color: #c7d2fe; color: #3730a3; }
      .badge.data, .badge.gateway { background: #f8fafc; border-color: #cbd5e1; color: #334155; }
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
      .studio-toolkit { margin: 14px 0; }
      .mapping-heading { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
      .mapping select { margin-top: 8px; }
      .source-option { display: block; }
      .local-path { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 16px; }
      .summary { display: grid; gap: 16px; margin: 16px 0; }
      .summary section { border-bottom: 1px solid var(--studio-line); padding-bottom: 14px; }
      .summary section:last-child { border: 0; padding-bottom: 0; }
      .summary section > h3 { margin: 0 0 6px; }
      .summary section > p { margin: 4px 0 0; }
      .summary .review-list { margin: 8px 0 0; }
      .checkbox-field { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: var(--canvas-body, 13px); line-height: 18px; color: var(--canvas-fg, var(--studio-ink)); cursor: pointer; }
      .checkbox-field input[type="checkbox"] { margin: 0; width: 15px; height: 15px; flex: 0 0 auto; }
      .field-hint { margin: 6px 0 0; font-size: 12px; line-height: 18px; color: var(--canvas-muted, var(--studio-muted)); }
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
        .actions { align-items: stretch; flex-direction: column-reverse; }
        .actions-right, .actions button { width: 100%; }
        .actions-right { flex-direction: column-reverse; }
        .local-path { grid-template-columns: 1fr; }
        .component-status { grid-template-columns: 1fr; }
        .surface-head { align-items: flex-start; flex-direction: column; }
      }
      ${renderThemeStyles(presentation.id)}
      ${renderStudioIntroStyles()}
      .studio-site-nav { display: block; margin: 0 -24px; padding: 0 16px; }
      @media (max-width: 720px) { .studio-site-nav { margin-inline: -14px; } }
      }
    </style>
  </head>
  <body>
    <nav class="studio-site-nav" aria-label="Navigation">
      ${renderThemeToggle(theme, presentation.id)}
    </nav>
    <main>
      <div class="studio-intro-notice" role="status"></div>
      <div id="app"></div>
      <div id="status" role="status" aria-live="polite"></div>
    </main>
    ${intro ? renderStudioIntro() : ""}
    <script>
      (async () => {
      let buttons, headerHandle, controlsDisposed = false;
      window.addEventListener("pagehide", event => {
        if (!event.persisted) { controlsDisposed = true; buttons?.dispose(); headerHandle?.dispose(); }
      });
      const toolkit = await import("/canvas-ui/base.mjs");
      if (controlsDisposed) return;
      buttons = (${createStudioButtons.toString()})(toolkit);
      window.appPlatformButtons = buttons;
      buttons.mountAll(document);
      const utilities = document.querySelector(".studio-theme-control");
      utilities.remove();
      headerHandle = (${mountStudioHeader.toString()})(document.querySelector(".studio-site-nav"), {
        toolkit, utilities, onHome: () => { if (!appBusy) renderLanding(); },
      });
      const apiToken = ${JSON.stringify(apiToken)};
      const capabilities = ${JSON.stringify(capabilities)};
      let editorSettings = ${JSON.stringify(editorSettings).replaceAll("<", "\\u003c")};
      let editorPreferenceBusy = false, appBusy = false;
      function focusPrimaryAction(selector = "#next") {
        requestAnimationFrame(() => {
          const target = document.querySelector(selector);
          if (target && !target.disabled && !document.querySelector(".studio-intro")) {
            target.focus({ preventScroll: true });
          }
        });
      }
      window.addEventListener("app-platform-editor-settings-change", (event) => {
        editorSettings = event.detail.settings;
        editorPreferenceBusy = event.detail.busy;
        syncEditorControls();
      });
      function syncEditorControls() {
        const picker = document.getElementById("preferred-editor");
        if (picker) {
          picker.value = editorSettings.editorId;
          picker.disabled = editorPreferenceBusy || appBusy;
          buttons.setDisabled(document.getElementById("next"), editorPreferenceBusy || appBusy);
        }
        const label = document.getElementById("open-editor-label");
        if (label) label.textContent = " Open the new worktree in " +
          editorSettings.editors.find((editor) => editor.id === editorSettings.editorId).label;
      }
      const app = document.getElementById("app");
      const status = document.getElementById("status");
      let homeHandle = null;
      function disposeView() {
        homeHandle?.dispose();
        homeHandle = null;
        notices.dispose();
      }
      const notices = (${createStudioNotices.toString()})({
        loadToolkit: () => import("/canvas-ui/base.mjs"),
        onError: (message) => error(message),
      });
      window.addEventListener("pagehide", (event) => {
        if (!event.persisted) disposeView();
      });
      const DEALER_SAMPLE_PURPOSE = "Help car dealers search inventory, evaluate deals, and send offers to buyers.";
      let sources = null;
      let sourcesError = null;
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
        openInEditor: false
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
        requestOptions.headers = { ...(requestOptions.headers || {}), "X-App-Platform-Token": apiToken };
        if (requestOptions.method === "POST") {
          requestOptions.headers["Content-Type"] = "application/json";
        }
        const response = await fetch(path, requestOptions);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Request failed.");
        return payload;
      }

      function openAppMap(root, notice = "", initialWorkspace = "") {
        location.assign("/app-map?root=" + encodeURIComponent(root) +
          "&token=" + encodeURIComponent(apiToken) +
          (notice ? "&notice=" + encodeURIComponent(notice) : "") +
          (initialWorkspace === "build" ? "#build" : ""));
      }

      function setBusy(busy, message = "") {
        appBusy = busy;
        app.querySelectorAll("button, input, textarea, select").forEach((control) => {
          buttons.setDisabled(control, busy);
        });
        syncEditorControls();
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
        if (!template) return;
        const prefix = template.kind === "sample"
          ? "dealer-sample-"
          : (template.id === "builtin-sandbox-gateway-minimal-v1"
              ? "sandbox-starter-"
              : (template.id === "builtin-app-service-builder-vite-v1" ? "builder-vite-" : "app-"));
        if (!draft.appName || /^(dealer-sample|Dealer-sample|sandbox-starter|builder-vite|app)-[a-z0-9]+$/i.test(draft.appName)) {
          draft.appName = prefix + crypto.randomUUID().slice(0, 6);
        }
        if (template.kind === "sample" && !draft.purpose) {
          draft.purpose = DEALER_SAMPLE_PURPOSE;
        }
      }

      function actions({ back, nextLabel, next, nextDisabled = false }) {
        return '<div class="actions">' +
          (back ? '<button data-studio-button="subtle" type="button" class="link" id="back">Back</button>' : '<span></span>') +
          '<div class="actions-right"><button data-studio-button="primary" type="button" class="primary" id="next"' +
          (nextDisabled ? " disabled" : "") + '>' + escape(nextLabel) + '</button></div></div>';
      }

      function topBack(label = "Back") {
        return '<div class="topbar"><button data-studio-button="subtle" type="button" class="link" id="top-back" aria-label="' +
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
        if (normalized === "embr" || normalized.includes("app service builder")) return "embr";
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
          buttons.replace(dialog, '<section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-title">' +
            '<h2 id="confirm-delete-title">Delete ' + escape(appName) + '?</h2>' +
            '<p><strong>Are you sure?</strong> This permanently removes the app Git worktree, its local files, and its Canvas-created branch. This cannot be undone.</p>' +
            '<p>No Azure resources, repositories, or cloud deployments will be deleted.</p>' +
            '<div class="actions"><button data-studio-button="secondary" type="button" id="cancel-delete">No, keep app</button>' +
            '<div class="actions-right"><button type="button" class="danger" id="confirm-delete">Yes, delete worktree</button></div></div></section>');
          document.body.append(dialog);
          const close = (confirmed) => {
            buttons.clear(dialog);
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
        disposeView();
        buttons.replace(app, '<div id="studio-home"></div>');
        const mount = document.getElementById("studio-home");
        homeHandle = (${mountStudioHome.toString()})(mount, {
          toolkit, onCreate: beginNewApp, onOpen: beginOpenApp, onAssemble: beginAssembly,
          onOpenRecent: openAppMap,
          recentApps: sources ? sources.apps.filter(item => Number.isFinite(Date.parse(item.lastOpenedAt))) : null,
          recentError: sourcesError,
        });
        focusPrimaryAction("#new-app");
        window.dispatchEvent(new Event("app-platform-home-ready"));
      }

      async function beginNewApp() {
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
      }

      function beginAssembly() {
        draft.journey = "assemble";
        draft.starterKind = "assembly";
        draft.step = 1;
        renderDetails();
      }

      async function beginOpenApp() {
        try {
          await loadSources(true);
          renderExistingApps();
        } catch (cause) {
          error(cause.message);
        }
      }

      function renderExistingApps() {
        disposeView();
        const apps = sources?.apps || [];
        buttons.replace(app, topBack("Back to Home") + '<div class="step">Existing apps</div><h1>Open an app</h1>' +
          '<p>Apps persist as repository and worktree pairs. Select one to build, run, or inspect it, with an optional Guide.</p>' +
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
            ${JSON.stringify(renderOcticon("trash"))} + '</button></div>').join("") +
            '</div>' : '<div class="notice">No existing runnable apps were found in the current Git worktrees.</div>') +
          '');
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
        const appNameInput = document.getElementById("app-name");
        const purposeInput = document.getElementById("purpose");
        if (appNameInput) draft.appName = appNameInput.value.trim();
        if (purposeInput) draft.purpose = purposeInput.value.trim();
        if (draft.journey === "new") {
          const selected = document.querySelector('input[name="template"]:checked')?.value;
          if (selected) draft.templateRootId = selected;
        }
      }

      function templateCapabilityPills(template) {
        if (template.id === "builtin-sandbox-gateway-minimal-v1") {
          return '<div class="badges">' +
            '<span class="badge hosted-agent">Agent · Any Compute</span>' +
            '<span class="badge sandbox">Tools · ACA Sandboxes</span>' +
            '<span class="badge gateway">Gateway · AI Gateway</span>' +
            '</div>';
        }
        if (template.id === "builtin-app-service-builder-vite-v1") {
          return '<div class="badges">' +
            '<span class="badge embr">Web · App Service Builder</span>' +
            '<span class="badge hosted-skill">+ Optional · Hosted Skills</span>' +
            '</div>';
        }
        if (template.id === "builtin-empty-starter-v1") {
          return '<div class="badges">' +
            '<span class="badge gateway">Empty Workspace</span>' +
            '<span class="badge hosted-agent">+ Add Building Blocks</span>' +
            '</div>';
        }
        const labelById = {
          web: { label: "Web · App Service Builder", cls: "embr" },
          agent: { label: template.kind === "sample" ? "Agent · Foundry Hosted Agent" : "Agent · Any Compute", cls: "hosted-agent" },
          skills: { label: "Skills · Azure Functions", cls: "hosted-skill" },
          sandbox: { label: "Tools · ACA Sandboxes", cls: "sandbox" },
          gateway: { label: "Gateway · AI Gateway", cls: "gateway" },
          workflows: { label: "Workflows · Durable Functions", cls: "durable" },
        };
        return '<div class="badges">' + (template.capabilityIds || [])
          .filter((id) => Boolean(labelById[id]))
          .map((id) => {
            const item = labelById[id];
            return '<span class="badge ' + escape(item.cls) + '">' + escape(item.label) + '</span>';
          }).join("") + '</div>';
      }

      function renderTemplatePreviewCard(template) {
        if (!template) return "";
        if (template.id === "builtin-sandbox-gateway-minimal-v1") {
          return '<div class="template-preview-card" data-template-preview-card="' + escape(template.id) + '" role="region" aria-label="Template details">' +
            '<div class="template-preview-head"><div><div class="template-preview-eyebrow">Template details</div><strong>' + escape(template.name) + '</strong>' +
            '<small>3 capabilities · Brain &amp; Hands isolation pattern</small></div>' +
            templateCapabilityPills(template) + '</div>' +
            '<div class="template-preview-diagram">' +
            '<svg viewBox="0 0 560 132" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Architecture diagram: Agent on any compute connects to Tools in ACA Sandboxes and Models through AI Gateway">' +
              '<rect x="8" y="24" width="166" height="84" rx="10" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.25"/>' +
              '<text x="20" y="47" font-family="sans-serif" font-size="11" font-weight="700" fill="#1e3a8a">Agent (Brain)</text>' +
              '<text x="20" y="65" font-family="sans-serif" font-size="10.5" font-weight="600" fill="#334155">Any Compute</text>' +
              '<text x="20" y="82" font-family="sans-serif" font-size="9.5" fill="#475569">Local · ACA · Functions · Foundry</text>' +
              '<text x="20" y="97" font-family="sans-serif" font-size="9" fill="#64748b">Orchestrates work · No raw tools</text>' +
              '<line x1="174" y1="46" x2="218" y2="34" stroke="#94a3b8" stroke-width="1.4"/>' +
              '<polygon points="218,34 210,32 213,39" fill="#94a3b8"/>' +
              '<line x1="174" y1="86" x2="218" y2="98" stroke="#94a3b8" stroke-width="1.4"/>' +
              '<polygon points="218,98 213,93 210,100" fill="#94a3b8"/>' +
              '<rect x="220" y="6" width="332" height="54" rx="10" fill="#f5f7ff" stroke="#a5b4fc" stroke-width="1.25"/>' +
              '<text x="234" y="26" font-family="sans-serif" font-size="11" font-weight="700" fill="#312e81">Tools (Hands) · ACA Sandboxes</text>' +
              '<text x="234" y="42" font-family="sans-serif" font-size="9.5" fill="#475569">Untrusted document &amp; code execution · Default-deny egress · Zero secrets</text>' +
              '<rect x="220" y="72" width="332" height="54" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.25"/>' +
              '<text x="234" y="92" font-family="sans-serif" font-size="11" font-weight="700" fill="#1e293b">Gateway · AI Gateway</text>' +
              '<text x="234" y="108" font-family="sans-serif" font-size="9.5" fill="#475569">Governed model aliases (gpt-latest) · Token budgets · Central auth</text>' +
            '</svg></div>' +
            '<ul class="template-preview-bullets">' +
              '<li><strong>Agent on Any Compute:</strong> Run the agent locally, in Azure Container Apps, Azure Functions, or Foundry Hosted Agents without changing tool boundaries.</li>' +
              '<li><strong>Tools on ACA Sandboxes:</strong> Untrusted document parsing and code run inside ephemeral sandboxes with <code>--egress-default Deny</code> and zero host secrets.</li>' +
              '<li><strong>AI Gateway Governance:</strong> Model calls route through governed aliases (<code>gpt-latest</code>) with centralized credentials, rate limits, and token telemetry.</li>' +
            '</ul></div>';
        }
        if (template.id === "builtin-app-service-builder-vite-v1") {
          return '<div class="template-preview-card" data-template-preview-card="' + escape(template.id) + '" role="region" aria-label="Template details">' +
            '<div class="template-preview-head"><div><div class="template-preview-eyebrow">Template details</div><strong>' + escape(template.name) + '</strong>' +
            '<small>Web experience starter · Add Hosted Skills as you grow</small></div>' +
            templateCapabilityPills(template) + '</div>' +
            '<div class="template-preview-diagram">' +
            '<svg viewBox="0 0 560 116" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Architecture diagram: Web experience on App Service Builder with optional Hosted Skills">' +
              '<rect x="16" y="18" width="236" height="80" rx="10" fill="#f0fdfa" stroke="#5eead4" stroke-width="1.25"/>' +
              '<text x="32" y="43" font-family="sans-serif" font-size="11" font-weight="700" fill="#0f766e">Web Experience</text>' +
              '<text x="32" y="61" font-family="sans-serif" font-size="10.5" font-weight="600" fill="#334155">App Service Builder</text>' +
              '<text x="32" y="79" font-family="sans-serif" font-size="9.5" fill="#475569">Vite + TypeScript · Managed web hosting</text>' +
              '<line x1="252" y1="58" x2="306" y2="58" stroke="#94a3b8" stroke-width="1.4" stroke-dasharray="4 3"/>' +
              '<polygon points="306,58 298,54 298,62" fill="#94a3b8"/>' +
              '<rect x="308" y="18" width="236" height="80" rx="10" fill="#f8fafc" stroke="#93c5fd" stroke-width="1.5" stroke-dasharray="5 4"/>' +
              '<text x="324" y="43" font-family="sans-serif" font-size="11" font-weight="700" fill="#1d4ed8">+ Add Hosted Skills (Optional)</text>' +
              '<text x="324" y="61" font-family="sans-serif" font-size="10.5" font-weight="600" fill="#334155">Azure Functions · MCP &amp; HTTP</text>' +
              '<text x="324" y="79" font-family="sans-serif" font-size="9.5" fill="#64748b">Attach backend skills in Build when ready</text>' +
            '</svg></div>' +
            '<ul class="template-preview-bullets">' +
              '<li><strong>Web Experience (App Service Builder):</strong> Starts with a clean Vite + TypeScript web frontend and <code>builder.yaml</code> ready for local preview and App Service Builder deployment.</li>' +
              '<li><strong>Expand with Hosted Skills:</strong> Attach callable Azure Functions Hosted Skills (HTTP or MCP) in <strong>Build</strong> whenever your web app needs backend capabilities.</li>' +
            '</ul></div>';
        }
        if (template.id === "builtin-empty-starter-v1") {
          return '<div class="template-preview-card" data-template-preview-card="' + escape(template.id) + '" role="region" aria-label="Template details">' +
            '<div class="template-preview-head"><div><div class="template-preview-eyebrow">Template details</div><strong>' + escape(template.name) + '</strong>' +
            '<small>Blank workspace shell · Add your own building blocks in Build</small></div>' +
            templateCapabilityPills(template) + '</div>' +
            '<div class="template-preview-diagram">' +
            '<svg viewBox="0 0 560 124" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Architecture diagram: Empty app workspace with dashed placeholders to add your own building blocks">' +
              '<rect x="8" y="10" width="544" height="104" rx="12" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6 4"/>' +
              '<text x="24" y="30" font-family="sans-serif" font-size="10.5" font-weight="700" fill="#475569">Empty App Workspace · Add building blocks in Build</text>' +
              '<rect x="24" y="42" width="122" height="58" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.4" stroke-dasharray="4 3"/>' +
              '<text x="36" y="67" font-family="sans-serif" font-size="10" font-weight="600" fill="#475569">+ Web Surface</text>' +
              '<text x="36" y="83" font-family="sans-serif" font-size="9" fill="#64748b">App Service Builder</text>' +
              '<rect x="156" y="42" width="122" height="58" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.4" stroke-dasharray="4 3"/>' +
              '<text x="168" y="67" font-family="sans-serif" font-size="10" font-weight="600" fill="#475569">+ Agent</text>' +
              '<text x="168" y="83" font-family="sans-serif" font-size="9" fill="#64748b">Any Compute</text>' +
              '<rect x="288" y="42" width="122" height="58" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.4" stroke-dasharray="4 3"/>' +
              '<text x="300" y="67" font-family="sans-serif" font-size="10" font-weight="600" fill="#475569">+ Skills &amp; Tools</text>' +
              '<text x="300" y="83" font-family="sans-serif" font-size="9" fill="#64748b">Functions / Sandbox</text>' +
              '<rect x="420" y="42" width="116" height="58" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.4" stroke-dasharray="4 3"/>' +
              '<text x="432" y="67" font-family="sans-serif" font-size="10" font-weight="600" fill="#475569">+ AI Gateway</text>' +
              '<text x="432" y="83" font-family="sans-serif" font-size="9" fill="#64748b">Model governance</text>' +
            '</svg></div>' +
            '<ul class="template-preview-bullets">' +
              '<li><strong>Start Clean:</strong> Creates an unopinionated app workspace shell with no pre-baked domain logic.</li>' +
              '<li><strong>Add Building Blocks on Demand:</strong> Use the App Map and Build tab to add Web surfaces, Agents, Hosted Skills, ACA Sandboxes, or Durable Workflows as you need them.</li>' +
              '<li><strong>Custom Domain Contract:</strong> Define your own app purpose and initial instructions from day one.</li>' +
            '</ul></div>';
        }
        return '<div class="template-preview-card" data-template-preview-card="' + escape(template.id) + '" role="region" aria-label="Template details">' +
          '<div class="template-preview-head"><div><div class="template-preview-eyebrow">Template details</div><strong>' + escape(template.name) + '</strong>' +
          '<small>6 capabilities · End-to-end multi-tier reference sample</small></div>' +
          templateCapabilityPills(template) + '</div>' +
          '<div class="template-preview-diagram">' +
          '<svg viewBox="0 0 560 124" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Architecture diagram: Full-stack Dealership E2E Reference Sample">' +
            '<rect x="8" y="32" width="104" height="60" rx="8" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.25"/>' +
            '<text x="16" y="56" font-family="sans-serif" font-size="10.5" font-weight="700" fill="#1e293b">Web Experience</text>' +
            '<text x="16" y="72" font-family="sans-serif" font-size="9" fill="#475569">Buyer &amp; Dealer UI</text>' +
            '<line x1="112" y1="62" x2="136" y2="62" stroke="#94a3b8" stroke-width="1.4"/>' +
            '<rect x="138" y="32" width="118" height="60" rx="8" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.25"/>' +
            '<text x="148" y="56" font-family="sans-serif" font-size="10.5" font-weight="700" fill="#1e3a8a">Deal-Finder Agent</text>' +
            '<text x="148" y="72" font-family="sans-serif" font-size="9" fill="#475569">Foundry / Local (:8088)</text>' +
            '<line x1="256" y1="45" x2="288" y2="24" stroke="#94a3b8" stroke-width="1.4"/>' +
            '<line x1="256" y1="62" x2="288" y2="62" stroke="#94a3b8" stroke-width="1.4"/>' +
            '<line x1="256" y1="79" x2="288" y2="100" stroke="#94a3b8" stroke-width="1.4"/>' +
            '<rect x="290" y="4" width="262" height="34" rx="7" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.25"/>' +
            '<text x="300" y="25" font-family="sans-serif" font-size="9.5" font-weight="700" fill="#1e3a8a">4 MCP Hosted Skills (Inventory, Trade-In, Rates, Docs)</text>' +
            '<rect x="290" y="45" width="262" height="34" rx="7" fill="#f5f7ff" stroke="#a5b4fc" stroke-width="1.25"/>' +
            '<text x="300" y="66" font-family="sans-serif" font-size="9.5" font-weight="700" fill="#312e81">ACA Sandbox Prequal + Durable Loan Approval Workflow</text>' +
            '<rect x="290" y="86" width="262" height="34" rx="7" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.25"/>' +
            '<text x="300" y="107" font-family="sans-serif" font-size="9.5" font-weight="700" fill="#1e293b">AI Gateway Model Routing &amp; Governance</text>' +
          '</svg></div>' +
          '<ul class="template-preview-bullets">' +
            '<li><strong>Complete Multi-Service Reference:</strong> Combines Web UI, Foundry Hosted Agent, 4 Azure Functions MCP Hosted Skills, ACA Sandbox PII pre-qualification, Durable Workflows, and AI Gateway.</li>' +
            '<li><strong>End-to-End Tool Calling:</strong> Demonstrates multi-tool agent orchestration across inventory search, trade-in valuation, rate sheets, and deal packet generation.</li>' +
          '</ul></div>';
      }

      function templateHtml() {
        if (!sources) {
          return '<div class="notice">Loading available templates…</div>';
        }
        if (sources.templates.length === 0) {
          return '<div class="notice">No hydrateable samples were found in the available worktrees.</div>';
        }
        const activeTemplate = sources.templates.find((item) => item.id === draft.templateRootId) || sources.templates[0];
        return '<div class="choice-list">' + sources.templates.map((template) =>
          '<label class="choice template" data-template-option="' + escape(template.id) + '"><input type="radio" name="template" value="' + escape(template.id) + '"' +
          (draft.templateRootId === template.id ? " checked" : "") + '><span><strong>' + escape(template.name) +
          '</strong><span class="template-meta">' + escape(template.description) +
          '</span></span></label>').join("") + '</div>' +
          '<div id="template-preview-mount">' + renderTemplatePreviewCard(activeTemplate) + '</div>';
      }

      async function loadSources(refresh = false) {
        if (sources && !refresh) return;
        setBusy(true, "Finding source projects in Git worktrees…");
        try {
          sources = await request("/api/sources");
          sourcesError = null;
          clearStatus();
        } catch (cause) {
          sourcesError = cause.message;
          throw cause;
        } finally {
          setBusy(false, status.textContent);
        }
      }

      function renderDetails() {
        clearStatus();
        disposeView();
        const isNew = draft.journey === "new";
        buttons.replace(app, topBack("Back to Home") + '<div class="step">Step 1 of ' + (isNew ? "2" : "4") + '</div>' +
          '<h1>' + (isNew ? "Create a new app" : "Assemble existing projects") + '</h1>' +
          (isNew
            ? '<h2>Choose a template</h2><p>Select a starter template or reference sample for your new app.</p><div id="templates">' + templateHtml() + '</div>'
            : '<label class="field">App name<input id="app-name" type="text" maxlength="80" value="' +
              escape(draft.appName) + '" placeholder="claims-assistant"></label>' +
              '<label class="field">What should this app do?<textarea id="purpose" maxlength="500" placeholder="Describe the outcome for its users.">' +
              escape(draft.purpose) + '</textarea></label>' +
              '<div class="notice">Next, you will add capabilities and explicitly choose a source project for each one.</div>') +
          actions({ back: true, nextLabel: isNew ? "Continue" : "Choose pieces" }));
        document.getElementById("back").addEventListener("click", renderLanding);
        wireTopBack(renderLanding);
        document.querySelectorAll('input[name="template"]').forEach((input) => {
          input.addEventListener("change", () => {
            draft.templateRootId = input.value;
            const template = sources.templates.find((item) => item.id === input.value);
            applyTemplateDefaults(template);
            draft.tierIds = [...template.capabilityIds];
            const previewMount = document.getElementById("template-preview-mount");
            if (previewMount && template) previewMount.innerHTML = renderTemplatePreviewCard(template);
          });
        });
        document.querySelectorAll('[data-template-option]').forEach((label) => {
          const updatePreview = () => {
            const templateId = label.getAttribute("data-template-option");
            const template = sources?.templates?.find((item) => item.id === templateId);
            const previewMount = document.getElementById("template-preview-mount");
            if (previewMount && template) previewMount.innerHTML = renderTemplatePreviewCard(template);
          };
          label.addEventListener("mouseenter", updatePreview);
          label.addEventListener("focusin", updatePreview);
          label.addEventListener("mouseleave", () => {
            const selected = sources?.templates?.find((item) => item.id === draft.templateRootId);
            const previewMount = document.getElementById("template-preview-mount");
            if (previewMount && selected) previewMount.innerHTML = renderTemplatePreviewCard(selected);
          });
        });
        document.getElementById("app-name")?.addEventListener("input", (event) => {
          draft.appName = event.target.value;
        });
        document.getElementById("purpose")?.addEventListener("input", (event) => {
          draft.purpose = event.target.value;
        });
        document.getElementById("next").addEventListener("click", async () => {
          captureDetails();
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
            applyTemplateDefaults(template);
            draft.tierIds = [...template.capabilityIds];
            draft.step = 2;
            renderCapabilities();
            return;
          }
          if (!draft.appName) {
            error("Enter an app name.");
            return;
          }
          if (!draft.purpose) {
            draft.purpose = "Assist users with governed tools and models.";
          }
          try {
            await loadSources();
          } catch (cause) {
            error(cause.message);
            return;
          }
          draft.step = 2;
          renderPieces();
        });
        if (isNew && sources?.templates?.length) {
          focusPrimaryAction("#next");
        }
      }

      function renderCapabilities() {
        clearStatus();
        disposeView();
        const selectedTemplate = sources?.templates.find((item) => item.id === draft.templateRootId);
        const isSample = selectedTemplate?.kind === "sample";
        const isSandboxGateway = draft.templateRootId === "builtin-sandbox-gateway-minimal-v1";
        const isAppServiceBuilder = draft.templateRootId === "builtin-app-service-builder-vite-v1";
        const heading = isSample
          ? "Configure the Dealership E2E Reference Sample"
          : (isSandboxGateway
              ? "Customize the Sandboxes &amp; AI Gateway Starter"
              : (isAppServiceBuilder ? "Customize the App Service Builder Starter" : "Customize the Empty app"));
        const intro = isSample
          ? "Review the app name and included capabilities for the complete reference sample."
          : (isSandboxGateway
              ? "Name your app and describe what it should do or how the agent should behave. Outbound tool egress is blocked by default."
              : (isAppServiceBuilder
                  ? "Name your app and describe what this App Service Builder web surface does. Includes builder.yaml and /health out of the box."
                  : "Start with an empty workspace shell and define its initial instructions. Add building blocks in Build."));
        const instructionsValue = draft.templateInputs.agentInstructions || draft.purpose ||
          (isSample
            ? DEALER_SAMPLE_PURPOSE
            : (isAppServiceBuilder
                ? "Provide a clean Vite TypeScript frontend ready for App Service Builder deployment."
                : "Help users validate documents and answer questions using governed tools and models."));
        const instructionsField = isSample
          ? '<label class="field">What this sample does<textarea id="agent-instructions" maxlength="2000">' +
            escape(instructionsValue) + '</textarea></label>'
          : (isAppServiceBuilder
              ? '<label class="field">What should this web app do?<textarea id="agent-instructions" maxlength="2000" placeholder="Describe the web experience and any backend or agent capabilities you plan to connect.">' +
                escape(instructionsValue) + '</textarea></label>'
              : '<label class="field">What should this app do &amp; agent instructions<textarea id="agent-instructions" maxlength="2000" placeholder="Describe what the app does and how the agent should help, without inventing tool results.">' +
                escape(instructionsValue) + '</textarea></label>');
        const secondField = (!isSandboxGateway && !isAppServiceBuilder && !isSample)
          ? '<label class="field">Empty Hosted Skill name<input id="skill-name" type="text" maxlength="40" value="' +
            escape(draft.templateInputs.hostedSkillName) + '" placeholder="starter-skill"></label>'
          : "";
        const badgeByTier = {
          web: { label: "App Service Builder", className: "embr" },
          agent: isSandboxGateway
            ? { label: "Any Compute", className: "hosted-agent" }
            : (isSample ? { label: "Foundry Hosted Agent", className: "hosted-agent" } : { label: "Any Compute", className: "hosted-agent" }),
          gateway: { label: "AI Gateway", className: "gateway" },
          skills: { label: "Azure Functions", className: "hosted-skill" },
          sandbox: { label: "ACA Sandboxes", className: "sandbox" },
          workflows: { label: "Durable Functions", className: "durable" },
        };
        const visibleTiers = isSandboxGateway
          ? [
              { name: "Agent", badge: "Any Compute", badgeClass: "hosted-agent", role: "Orchestrates the workflow on any compute (local, ACA, Functions, or Foundry) without running untrusted tools in-process" },
              { name: "Tools", badge: "ACA Sandboxes", badgeClass: "sandbox", role: "Runs untrusted document validation and code in isolated sandboxes with default-deny egress and zero secrets" },
              { name: "Gateway", badge: "AI Gateway", badgeClass: "gateway", role: "Governed model routing (gpt-latest), rate limits, token budgets, and centralized credentials" },
            ]
          : (isAppServiceBuilder
              ? [
                  { name: "Surface / web", badge: "App Service Builder", badgeClass: "embr", role: "Vite + TypeScript static frontend with root builder.yaml (output: dist) and /health endpoint" },
                ]
              : draft.tierIds.map((tierId) => {
                  const tier = capabilities.find((item) => item.id === tierId);
                  if (!tier) return null;
                  const badge = badgeByTier[tierId];
                  return {
                    name: tier.name,
                    badge: badge?.label,
                    badgeClass: badge?.className,
                    role: tier.role,
                  };
                }).filter(Boolean));
        const createButtonLabel = isSample
          ? "Create runnable sample"
          : ((isSandboxGateway || isAppServiceBuilder) ? "Create starter app" : "Create empty app");
        buttons.replace(app, topBack("Back") + '<div class="step">Step 2 of 2</div><h1>' + heading + '</h1>' +
          '<p>' + intro + '</p>' +
          '<label class="field">App name<input id="app-name" type="text" maxlength="80" value="' +
          escape(draft.appName) + '" placeholder="sandbox-starter-app"></label>' +
          instructionsField +
          secondField +
          '<h2>Included now</h2><p>Keep the first template predictable. Add other capabilities from Azure App Platform after creation.</p>' +
          '<div class="capability-list">' + visibleTiers.map((tier) =>
            '<div class="capability"><div class="capability-head"><strong>' + escape(tier.name) + '</strong>' +
              (tier.badge ? '<span class="badge ' + escape(tier.badgeClass || "") + '">' + escape(tier.badge) + '</span>' : '') +
              '</div><small>' + escape(tier.role) + '</small></div>'
          ).join("") + '</div>' +
          '<div class="studio-toolkit" id="review-notice">Creates a new isolated Git worktree. No Azure resources will be created or changed.</div>' +
          actions({ back: true, nextLabel: createButtonLabel }));
        notices.renderNotice(document.getElementById("review-notice"), {
          children: "Creates a new isolated Git worktree. No Azure resources will be created or changed.",
          intent: "info",
        });
        document.getElementById("app-name").addEventListener("input", (event) => {
          draft.appName = event.target.value;
        });
        document.getElementById("agent-instructions").addEventListener("input", (event) => {
          draft.templateInputs.agentInstructions = event.target.value;
          draft.purpose = event.target.value.trim().slice(0, 500);
        });
        wireActions({
          back: renderDetails,
          next: async () => {
            draft.appName = document.getElementById("app-name").value.trim();
            if (!draft.appName) {
              error("Enter an app name.");
              return;
            }
            const instructions = document.getElementById("agent-instructions").value.trim();
            if (!instructions) {
              error("Enter instructions for the app.");
              return;
            }
            draft.templateInputs.agentInstructions = instructions;
            draft.purpose = instructions.slice(0, 500);
            if (!isSandboxGateway && !isAppServiceBuilder && !isSample) {
              draft.templateInputs.hostedSkillName = document.getElementById("skill-name").value.trim();
              if (!/^[a-z][a-z0-9-]{0,39}$/.test(draft.templateInputs.hostedSkillName)) {
                error("Enter a lowercase Hosted Skill name using letters, numbers, or hyphens.");
                return;
              }
            }
            await submit();
          }
        });
        wireTopBack(renderDetails);
        focusPrimaryAction("#next");
      }

      function availableForTier(tierId) {
        return (sources?.roots ?? []).flatMap((root) =>
          root.implementations
            .filter((implementation) => implementation.tierId === tierId)
            .map((implementation) => ({ root, implementation })));
      }

      function renderPieces() {
        notices.dispose();
        clearStatus();
        const unused = capabilities.filter((tier) => !draft.tierIds.includes(tier.id));
        buttons.replace(app, topBack("Back") + '<div class="step">Step 2 of 4</div><h1>Choose pieces</h1>' +
          '<p>Add a capability, then choose the source project that should implement it.</p>' +
          '<div class="mapping-list">' + draft.tierIds.map((tierId) => {
            const tier = capabilities.find((item) => item.id === tierId);
            const options = availableForTier(tierId);
            const selected = draft.sourceBindings[tierId] || "";
            return '<div class="mapping"><div class="mapping-heading"><div><h3>' + escape(tier.name) +
              '</h3><small>' + escape(tier.role) + '</small></div><button data-studio-button="subtle" type="button" class="link" data-remove="' +
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
          '<button data-studio-button="secondary" type="button" id="add-path">Add local path</button></div>' +
          actions({ back: true, nextLabel: "Continue to Azure resources" }));
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
        notices.dispose();
        buttons.replace(app, topBack("Back") + '<div class="step">Step 3 of 4</div><h1>Map Azure resources <small>(optional)</small></h1>' +
          '<p>These mappings are references only. Azure App Platform will not read keys, deploy, or change resources.</p>' +
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
          actions({ back: true, nextLabel: "Review app" }));
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
        const isSandboxGateway = draft.journey === "new" && draft.templateRootId === "builtin-sandbox-gateway-minimal-v1";
        const isAppServiceBuilder = draft.journey === "new" && draft.templateRootId === "builtin-app-service-builder-vite-v1";
        const isSample = sources.templates.find((item) => item.id === draft.templateRootId)?.kind === "sample";
        const badgeByTier = {
          web: { label: "App Service Builder", className: "embr" },
          agent: isSandboxGateway
            ? { label: "Any Compute", className: "hosted-agent" }
            : (isSample ? { label: "Foundry Hosted Agent", className: "hosted-agent" } : { label: "Any Compute", className: "hosted-agent" }),
          gateway: { label: "AI Gateway", className: "gateway" },
          skills: { label: "Azure Functions", className: "hosted-skill" },
          sandbox: { label: "ACA Sandboxes", className: "sandbox" },
          workflows: { label: "Durable Functions", className: "durable" },
        };
        const badge = badgeByTier[tierId] || null;
        const displayTierName = isSandboxGateway && tierId === "sandbox" ? "Tools" : tier.name;
        const detail = selected
          ? selected.root.name + " · " + selected.implementation.projectPath
          : (isSandboxGateway && tierId === "agent"
              ? "Orchestrates the workflow on any compute (local, ACA, Functions, or Foundry) without running untrusted tools in-process"
              : (isSandboxGateway && tierId === "sandbox"
                  ? "Runs untrusted document validation and code in isolated sandboxes with default-deny egress and zero secrets"
                  : (isSandboxGateway && tierId === "gateway"
                      ? "Governed model routing (gpt-latest), rate limits, token budgets, and centralized credentials"
                      : (isAppServiceBuilder && tierId === "web"
                          ? "Vite + TypeScript static frontend with root builder.yaml (output: dist) and /health endpoint"
                          : (isSample
                              ? tier.role
                              : (tierId === "skills" ? "One empty Hosted Skill" : tier.role))))));
        return '<div class="review-row"><div class="capability-head"><strong>' + escape(displayTierName) + '</strong>' +
          (badge ? '<span class="badge ' + escape(badge.className) + '">' + escape(badge.label) + '</span>' : '') +
          '</div><small>' + escape(detail) +
          (draft.azureBindings[tierId] ? "<br>Azure resource mapped" : "") + '</small></div>';
      }

      function renderReview() {
        clearStatus();
        notices.dispose();
        const selectedTemplate = sources?.templates.find((item) => item.id === draft.templateRootId);
        const isSandboxGateway = draft.journey === "new" && draft.templateRootId === "builtin-sandbox-gateway-minimal-v1";
        const isAppServiceBuilder = draft.journey === "new" && draft.templateRootId === "builtin-app-service-builder-vite-v1";
        const total = draft.journey === "new" ? 2 : 4;
        const starter = draft.journey === "assemble"
          ? "Assembled from selected source projects"
          : selectedTemplate?.name;
        const reviewTiers = isSandboxGateway
          ? ["agent", "sandbox", "gateway"]
          : (isAppServiceBuilder ? ["web"] : draft.tierIds);
        const createButtonLabel = draft.journey === "assemble"
          ? "Create assembled app"
          : (selectedTemplate?.kind === "sample"
              ? "Create runnable sample"
              : ((isSandboxGateway || isAppServiceBuilder) ? "Create starter app" : "Create empty app"));
        buttons.replace(app, topBack("Back") + '<div class="step">Step ' + total + ' of ' + total + '</div><h1>Review app</h1>' +
          '<div class="summary"><section><h3>App</h3><p><strong>' + escape(draft.appName) + '</strong></p>' +
          (draft.purpose ? '<p>' + escape(draft.purpose) + '</p>' : '') +
          '</section><section><h3>Starter</h3><p>' + escape(starter) +
          '</p></section><section><h3>Capabilities</h3><div class="review-list">' +
          reviewTiers.map(capabilityReview).join("") + '</div></section><section><h3>Workspace</h3>' +
          '<p>New isolated Git worktree. Selected sources are copied or hydrated; source locations are never modified.</p>' +
          '</section></div>' +
          '<div class="studio-toolkit" id="review-notice">No Azure resources will be created or changed.</div>' +
          actions({ back: true, nextLabel: createButtonLabel }));
        notices.renderNotice(document.getElementById("review-notice"), {
          children: "No Azure resources will be created or changed.",
          intent: "info",
        });
        wireActions({
          back: draft.journey === "assemble" ? renderAzure :
            (selectedTemplate?.kind === "sample" ? renderDetails : renderCapabilities),
          next: submit
        });
        wireTopBack(draft.journey === "assemble" ? renderAzure :
          (selectedTemplate?.kind === "sample" ? renderDetails : renderCapabilities));
        focusPrimaryAction("#next");
      }

      function appMapVisual(appMap) {
        if (!appMap) {
          return '<div class="map-loading">Tracing components and relationships from source…</div>';
        }
        return appMap.renderedHtml || '<div class="map-loading">Map rendering is unavailable. Refresh to retry.</div>';
      }

      function renderInventory(result, inventory, appMap) {
         notices.dispose();
         if (outputTimer) {
           clearInterval(outputTimer);
           outputTimer = null;
         }
        const tiers = inventory?.inventory || [];
        const implemented = tiers.filter((tier) => tier.implementations.length > 0).length;
        const graphSummary = appMap
          ? appMap.nodes.length + " nodes · " + appMap.edges.length + " edges"
          : "Not traced yet";
        buttons.replace(app, topBack("Existing apps") +
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
          '<button data-studio-button="secondary" type="button" id="configure-gateway">Create / Manage</button></div></div>' +
          '<div class="lifecycle-actions">' +
          '<button data-studio-button="secondary" type="button" data-app-command="provision-cloud">Provision with azd</button>' +
          '<button data-studio-button="secondary" type="button" data-app-command="deploy-cloud">Deploy with azd up</button></div></div></details>' +
          '<div class="section-label">Run</div>' +
          '<details class="surface runtime-region" open><summary class="surface-head"><h2 id="runtime-title">Local runtime</h2>' +
          '<div class="badges" id="local-status"><span class="badge">Checking</span></div></summary>' +
          '<div class="surface-body"><div id="local-guidance"></div>' +
          '<div class="lifecycle-actions"><button data-studio-button="primary" type="button" class="primary" id="local-action" data-app-command="run-local">Run locally</button></div>' +
          '<div class="component-list" id="entrypoints"></div><div id="component-actions"></div>' +
          '<details class="command-panel" id="local-command-panel"><summary><span>Command output</span>' +
          '<span class="command-summary" id="local-command-summary">Idle</span></summary>' +
          '<pre id="local-output">Waiting for local app output.</pre></details></div></details>' +
          '<div class="section-label">Observe/Map</div>' +
          '<details class="surface app-map-region" open><summary class="surface-head">' +
          '<h2 id="app-map-title">App Map</h2><small>' + escape(graphSummary) + '</small></summary>' +
          '<div class="surface-body"><div class="map-toolbar"><button data-studio-button="secondary" type="button" class="icon-button map-expand" id="open-app-map"' +
          (appMap ? "" : " disabled") + ' aria-label="Open expanded App Map" title="Open expanded App Map">' +
          ${JSON.stringify(renderOcticon("link-external"))} + '</button></div>' +
          appMapVisual(appMap) +
          '<div class="configuration-actions"><button data-studio-button="secondary" type="button" id="trace-app">' +
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
            '</h3><button data-studio-button="subtle" type="button" class="link" data-tier-action="' + escape(tier.id) + '">Deep dive</button></div>' +
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
                    ? '<br><button data-studio-button="secondary" type="button" data-open-source="' + escape(item.projectPath) + '">Open source</button>'
                    : '')).join("")
              : 'No implementation discovered yet · scaffold available') +
            '</p></div>').join("") + '</div></div></details>' +
          '<div class="danger-zone"><button type="button" id="delete-app">Delete app</button></div>');
         wireTopBack(async () => {
          if (!sources) await loadSources();
          renderExistingApps();
         });
        document.querySelectorAll("[data-open-source]").forEach((button) => button.addEventListener("click", async () => {
          setBusy(true, "Opening component source in your code editor…");
          try {
            const opened = await request("/api/open-source", {
              method: "POST",
              body: JSON.stringify({ root: result.worktreePath, projectPath: button.dataset.openSource })
            });
            clearStatus("Source opened in " + opened.editorLabel + ".");
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
             buttons.replace(document.getElementById("entrypoints"), (state.entrypoints || []).map((entrypoint) =>
              '<div class="component-status"><span class="badge ' + (entrypoint.ready ? "http" : "") + '">' +
              escape(entrypoint.name) + ': ' + (entrypoint.ready ? "ready" : "offline") + '</span>' +
              '<button data-studio-button="secondary" type="button" data-entrypoint-port="' + entrypoint.port + '"' +
              (entrypoint.ready ? "" : " disabled") + '>' + escape(entrypoint.url) + '</button></div>').join(""));
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
               buttons.replace(componentActions, '<div class="agent-tester"><strong>Invoke agent</strong>' +
                 '<textarea id="agent-prompt" maxlength="2000" placeholder="Send a message to the running agent"></textarea>' +
                 '<div><button data-studio-button="secondary" type="button" id="send-agent-prompt">Invoke agent</button> ' +
                 '<button data-studio-button="secondary" type="button" id="open-agent-studio">Open agent studio</button></div>' +
                 '<pre class="agent-response" id="agent-response"></pre></div>');
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
               buttons.replace(componentActions, "");
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
            buttons.update(localAction, {
              children: stopping ? "Stopping local app…" : (running ? "Stop local app" : "Run locally"),
              disabled: stopping,
            });
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
              buttons.replace(document.getElementById("gateway-binding"),
                '<label class="field">Active AI Gateway<select id="active-gateway">' +
                '<option value="">Choose a gateway</option>' +
                gatewayOptions.gateways.map((gateway) =>
                  '<option value="' + escape(gateway.name) + '"' +
                  (gatewayOptions.active?.name === gateway.name ? " selected" : "") + '>' +
                  escape(gateway.name + (gateway.resourceGroup ? " · " + gateway.resourceGroup : "")) +
                  '</option>').join("") + '</select></label>');
             if (gatewayOptions.active) {
                  const configure = buttons.create({ children: "Configure app from active gateway", "data-app-command": "configure-active-gateway" });
                  document.getElementById("gateway-binding").append(buttons.host(configure));
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
              buttons.replace(document.getElementById("gateway-binding"),
                '<p>AI Gateway discovery unavailable: ' + escape(cause.message) + '</p>');
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
          if (traceButton) buttons.setDisabled(traceButton, true);
          try {
            const traced = await request("/api/app-map", {
              method: "POST",
              body: JSON.stringify({ root: result.worktreePath })
            });
            renderInventory(result, inventory, traced);
          } catch (cause) {
            error(cause.message);
            if (traceButton) {
              buttons.update(traceButton, { disabled: false, children: "Retry map" });
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
        window.__appPlatformSubmitting = true;
        const openEditor = document.getElementById("open-editor");
        if (openEditor) {
          draft.openInEditor = openEditor.checked;
        }
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
              openInEditor: draft.openInEditor,
              editorId: editorSettings.editorId
            })
          });
          if (result.worktreePath) {
            openAppMap(result.worktreePath, result.editorWarning, "build");
          } else {
            window.__appPlatformSubmitting = false;
            renderLanding();
            clearStatus("Assembly started. The app will appear here when its isolated workspace is ready.");
            setBusy(false, status.textContent);
          }
        } catch (cause) {
          window.__appPlatformSubmitting = false;
          error(cause.message);
          setBusy(false, status.textContent);
        }
      }

      renderLanding();
      void loadSources().then(() => {
        if (draft.journey === null) renderLanding();
      }).catch(() => {});
      ${intro ? renderStudioIntroClientScript() : ""}
      ${renderThemeClientScript(apiToken, editorSettings)}
      window.appPlatformReady = true;
      window.dispatchEvent(new Event("app-platform-ready"));
      })().catch(cause => {
        const status = document.getElementById("status");
        status.className = "error";
        status.textContent = "Could not load Canvas controls: " + cause.message + ". Reload to retry.";
      });
    </script>
  </body>
</html>`;
}
