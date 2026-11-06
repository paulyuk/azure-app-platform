import { ACTION_BUTTON_STYLE } from "./control-styles.mjs";
import { STUDIO_TABS_CSS } from "./studio-tabs.mjs";
import { octiconMask } from "./studio-icons.mjs";

export const BUILD_PANEL_CONTENT_CSS = `
:is(#details, #customize-content)[data-mode="build"] { --build-code-bg:light-dark(var(--studio-raised),color-mix(in srgb,var(--studio-panel) 94%,var(--studio-ink))); display:flex; flex-direction:column; overflow:hidden; container-type:inline-size; container-name:build-panel; padding:0; font:13px/20px var(--font-sans,system-ui); }
:is(#details, #customize-content)[data-mode="build"] .build-workspace { box-sizing:border-box; display:flex; flex-direction:column; flex:1; min-height:0; width:100%; margin-inline:auto; padding:20px 24px 0; }
:is(#details, #customize-content)[data-mode="build"] h2 { margin:0; font-size:15px; line-height:22px; font-weight:600; color:var(--studio-ink); }
:is(#details, #customize-content)[data-mode="build"] p { margin:4px 0 12px; color:var(--studio-muted); font-size:13px; line-height:20px; }
:is(#details, #customize-content)[data-mode="build"] button:not([role="tab"]) { ${ACTION_BUTTON_STYLE} }
:is(#details, #customize-content)[data-mode="build"] :is(button,select,summary,.build-source-preview):focus-visible { outline:2px solid var(--studio-focus); outline-offset:2px; }
:is(#details, #customize-content)[data-mode="build"] .build-area { margin:0; min-width:0; }
:is(#details, #customize-content)[data-mode="build"] .build-area-header { display:grid; gap:4px; margin-bottom:0; }
:is(#details, #customize-content)[data-mode="build"] .build-area-title { margin:0; font-size:14px; line-height:20px; font-weight:600; color:var(--studio-ink); }
:is(#details, #customize-content)[data-mode="build"] .build-file { box-sizing:border-box; display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; padding:0; border:0; border-radius:0; background:transparent; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files { display:flex; flex-direction:column; gap:var(--canvas-spacing-normal,16px); min-width:0; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files .build-file { flex:none; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files .build-file-source { flex:none; min-height:0; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files[data-view="stack"] .build-file-source { border-bottom:1px solid var(--studio-line); box-shadow:0 6px 6px -6px var(--studio-line); }
:is(#details, #customize-content)[data-mode="build"] .build-block-files .build-source-preview { display:block; flex:none; max-height:240px; overflow:clip; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files .build-source-preview[data-expanded] { max-height:none; }
:is(#details, #customize-content)[data-mode="build"] .build-source-preview[data-clipped]::after { content:""; position:absolute; inset-inline:0; bottom:0; height:24px; background:linear-gradient(to bottom,transparent,var(--build-code-bg)); pointer-events:none; user-select:none; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files .build-line-numbers { display:none; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files .build-highlight { min-height:0; padding:12px 0; white-space:normal; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files .build-highlight::after { content:none; }
:is(#details, #customize-content)[data-mode="build"] .build-code-line { position:relative; display:block; min-height:1.6em; padding-inline:48px 12px; white-space:pre-wrap; overflow-wrap:anywhere; }
:is(#details, #customize-content)[data-mode="build"] .build-code-line::before { content:attr(data-line) / ""; position:absolute; inset-inline-start:8px; width:4ch; color:var(--studio-muted); text-align:right; user-select:none; }
:is(#details, #customize-content)[data-mode="build"] .build-preview-expand { padding:8px var(--build-content-gutter); background:var(--build-code-bg); }
:is(#details, #customize-content)[data-mode="build"] .build-file-header { position:sticky; top:var(--build-header-height,0px); z-index:1; box-sizing:border-box; width:100%; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:8px var(--build-content-gutter); border-bottom:1px solid var(--studio-line); background:var(--studio-panel); --canvas-button-small-padding-inline:5px; --canvas-button-small-padding-block:3px; --canvas-button-small-min-height:28px; }
:is(#details, #customize-content)[data-mode="build"] .build-file-identity { flex:1 1 180px; min-width:0; }
:is(#details, #customize-content)[data-mode="build"] .build-file-heading { display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 12px; }
:is(#details, #customize-content)[data-mode="build"] .build-file-heading :is(h4,h5) { margin:0; font-size:13px; line-height:18px; font-weight:600; overflow-wrap:anywhere; }
:is(#details, #customize-content)[data-mode="build"] .build-source-path { display:block; margin:4px 0 0; font:11px/1.5 var(--font-mono,monospace); color:var(--studio-muted); overflow-wrap:anywhere; }
:is(#details, #customize-content)[data-mode="build"] .build-actions { margin:var(--canvas-spacing-condensed,8px) 0; }
:is(#details, #customize-content)[data-mode="build"] .build-actions button { min-height:28px; padding:4px 10px; font-size:12px; line-height:18px; font-weight:500; }
:is(#details, #customize-content)[data-mode="build"] .build-actions .vscode-icon { width:14px; height:14px; flex:none; }
:is(#details, #customize-content)[data-mode="build"] .build-file-header .vscode-icon { width:14px; height:14px; overflow:visible; }
:is(#details, #customize-content)[data-mode="build"] .build-file-action-icon { display:inline-block; flex:none; width:16px; height:16px; background:currentColor; mask-position:center; mask-size:contain; mask-repeat:no-repeat; }
:is(#details, #customize-content)[data-mode="build"] .build-icon-files { mask-image:${octiconMask("project")}; }
:is(#details, #customize-content)[data-mode="build"] .build-icon-editor { mask-image:${octiconMask("code")}; }
:is(#details, #customize-content)[data-mode="build"] .build-icon-refresh { mask-image:${octiconMask("sync")}; }
:is(#details, #customize-content)[data-mode="build"] .build-icon-ai { mask-image:${octiconMask("agent")}; }
:is(#details, #customize-content)[data-mode="build"] .build-icon-more { mask-image:${octiconMask("chevron-down")}; }
:is(#details, #customize-content)[data-mode="build"] .build-icon-add { mask-image:${octiconMask("plus")}; }
:is(#details, #customize-content)[data-mode="build"] .build-icon-check { mask-image:${octiconMask("check")}; }
:is(#details, #customize-content)[data-mode="build"] .build-icon-preview { mask-image:${octiconMask("eye")}; }
:is(#details, #customize-content)[data-mode="build"] .build-icon-test { mask-image:${octiconMask("play")}; }
:is(#details, #customize-content)[data-mode="build"] .build-icon-settings { mask-image:${octiconMask("gear")}; }
:is(#details, #customize-content)[data-mode="build"] :is(button,select):disabled { opacity:.65; cursor:not-allowed; }
:is(#details, #customize-content)[data-mode="build"] .build-handoff-feedback { margin:4px 0 8px; font-size:12px; }
:is(#details, #customize-content)[data-mode="build"] .build-file-source { display:flex; flex-direction:column; flex:1; min-width:0; min-height:180px; margin:8px var(--build-content-gutter); border:1px solid var(--studio-line); border-radius:8px; overflow:hidden; background:var(--build-code-bg); cursor:default; }
:is(#details, #customize-content)[data-mode="build"] .build-file > :not(.build-file-source) { flex-shrink:0; }
:is(#details, #customize-content)[data-mode="build"] .build-file-source > :not(.build-source-preview) { flex:none; }
:is(#details, #customize-content)[data-mode="build"] .build-preview-badge { display:inline-flex; align-items:center; gap:4px; color:var(--studio-muted); font-size:11px; }
:is(#details, #customize-content)[data-mode="build"] .build-source-preview { position:relative; z-index:0; box-sizing:border-box; display:grid; grid-template-columns:max-content minmax(max-content,1fr); align-items:start; flex:1; min-width:0; min-height:0; max-width:100%; overflow-x:scroll; overflow-y:auto; border:0; border-radius:0; background:var(--build-code-bg); direction:ltr; }
:is(#details, #customize-content)[data-mode="build"] .build-source-preview pre { box-sizing:border-box; min-height:100%; margin:0; padding:12px; white-space:pre; overflow-wrap:normal; tab-size:4; font:12px/1.6 var(--font-mono,monospace); font-variant-ligatures:none; letter-spacing:normal; text-align:left; }
:is(#details, #customize-content)[data-mode="build"] .build-source-preview .build-line-numbers { position:sticky; left:0; z-index:1; min-width:5ch; padding-inline:8px; border-inline-end:1px solid var(--studio-line); color:var(--studio-muted); background:var(--build-code-bg); text-align:right; user-select:none; }
:is(#details, #customize-content)[data-mode="build"] .build-highlight { color:var(--studio-ink); }
:is(#details, #customize-content)[data-mode="build"] .build-highlight::after { content:" "; }
:is(#details, #customize-content)[data-mode="build"] .build-highlight .token { font:inherit; letter-spacing:inherit; }
:is(#details, #customize-content)[data-mode="build"] .build-highlight :is(.comment,.prolog,.doctype,.cdata) { color:var(--studio-muted); }
:is(#details, #customize-content)[data-mode="build"] .build-highlight :is(.keyword,.property,.tag,.selector,.atrule,.important) { color:var(--studio-accent); }
:is(#details, #customize-content)[data-mode="build"] .build-highlight :is(.string,.char,.attr-value,.regex,.inserted) { color:var(--studio-ok); }
:is(#details, #customize-content)[data-mode="build"] .build-highlight :is(.number,.boolean,.constant,.symbol,.builtin) { color:var(--studio-warn); }
:is(#details, #customize-content)[data-mode="build"] .build-highlight :is(.function,.class-name,.attr-name,.title) { color:var(--studio-edge-medium); }
:is(#details, #customize-content)[data-mode="build"] .build-highlight .deleted { color:var(--studio-danger); }
:is(#details, #customize-content)[data-mode="build"] .build-empty { margin:24px 0; }
:is(#details, #customize-content)[data-mode="build"] .build-empty h3 { font-size:14px; }
:is(#details, #customize-content)[data-mode="build"] > :is(.build-warning,.build-error,.build-loading,.build-refresh) { margin:16px 24px; }
:is(#details, #customize-content)[data-mode="build"] .build-warning { color:var(--studio-warn); font-size:12px; }
:is(#details, #customize-content)[data-mode="build"] .build-error { color:var(--studio-danger); }
:is(#details, #customize-content)[data-mode="build"] .build-error:empty, :is(#details, #customize-content)[data-mode="build"] [hidden] { display:none; }
:is(#details, #customize-content)[data-mode="build"] .build-browser { display:grid; grid-template-columns:minmax(0,var(--build-rail-width,28%)) var(--canvas-spacing-condensed,8px) minmax(0,1fr); flex:1; min-width:0; min-height:0; margin-top:16px; }
:is(#details, #customize-content)[data-mode="build"] .build-divider { position:relative; min-width:0; cursor:col-resize; touch-action:none; }
:is(#details, #customize-content)[data-mode="build"] .build-divider::before { content:""; position:absolute; inset-block:0; inset-inline-start:50%; width:1px; background:var(--studio-line); }
:is(#details, #customize-content)[data-mode="build"] .build-divider:is(:hover,:focus-visible,[data-dragging])::before { width:2px; background:var(--studio-accent); }
:is(#details, #customize-content)[data-mode="build"] .build-divider:focus-visible { outline:2px solid var(--studio-focus); outline-offset:-2px; }
:is(#details, #customize-content)[data-mode="build"] .build-explorer { display:flex; flex-direction:column; min-width:0; min-height:0; border:0; border-radius:0; background:transparent; overflow:hidden; }
:is(#details, #customize-content)[data-mode="build"] .build-explorer-header { flex:none; min-width:0; padding-bottom:10px; border-bottom:1px solid var(--studio-line); background:var(--studio-bg); }
:is(#details, #customize-content)[data-mode="build"] .build-explorer-heading { display:flex; align-items:center; justify-content:space-between; gap:4px; padding:10px; }
:is(#details, #customize-content)[data-mode="build"] .build-explorer-heading strong { font-size:12px; }
:is(#details, #customize-content)[data-mode="build"] .build-explorer-heading button { padding:4px 8px; min-height:28px; font-size:12px; }
:is(#details, #customize-content)[data-mode="build"] .build-file-search { padding-inline:10px; }
:is(#details, #customize-content)[data-mode="build"] .build-explorer-body { flex:1; min-height:0; overflow-x:hidden; overflow-y:auto; }
:is(#details, #customize-content)[data-mode="build"] .build-filter-status { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
:is(#details, #customize-content)[data-mode="build"] .build-search-empty { padding:10px; overflow-wrap:anywhere; }
:is(#details, #customize-content)[data-mode="build"] .build-category { padding:8px 0; }
:is(#details, #customize-content)[data-mode="build"] .build-category + .build-category { border-top:1px solid var(--studio-line); }
:is(#details, #customize-content)[data-mode="build"] .build-category summary { padding:2px 10px 6px; color:var(--studio-muted); font-size:12px; font-weight:600; cursor:pointer; }
:is(#details, #customize-content)[data-mode="build"] .build-content { --build-content-gutter:var(--canvas-spacing-normal,16px); box-sizing:border-box; display:flex; flex-direction:column; min-width:0; min-height:0; padding:0; overflow:auto; container-type:inline-size; container-name:build-source; }
:is(#details, #customize-content)[data-mode="build"] .build-content > .build-area-header { position:sticky; top:0; z-index:2; padding-inline:var(--build-content-gutter); background:var(--studio-bg); }
:is(#details, #customize-content)[data-mode="build"] .build-file > :is(.build-warning,.build-error,.build-handoff-feedback) { padding-inline:var(--build-content-gutter); }
:is(#details, #customize-content)[data-mode="build"] .build-content .build-add-form { box-sizing:border-box; padding-inline:var(--build-content-gutter); }
:is(#details, #customize-content)[data-mode="build"] .build-source-preview:focus-visible { outline-offset:-2px; }
:is(#details, #customize-content)[data-mode="build"] .build-content > :not(.build-file) { flex:none; }
:is(#details, #customize-content)[data-mode="build"] .build-add-form { display:grid; gap:var(--canvas-spacing-normal,16px); padding:0 0 var(--canvas-spacing-normal,16px); border:0; border-radius:0; background:transparent; }
:is(#details, #customize-content)[data-mode="build"] .build-add-form textarea { white-space:pre-wrap; overflow-wrap:anywhere; overflow-x:hidden; }
:is(#details, #customize-content)[data-mode="build"] .build-ai-form { flex:none; padding-top:var(--canvas-spacing-normal,16px); }
:is(#details, #customize-content)[data-mode="build"] .build-add-form .build-actions { margin:0; }
:is(#details, #customize-content)[data-mode="build"] .studio-field-mount { min-width:0; }
:is(#details, #customize-content)[data-mode="build"] .studio-field-mount > .ct-provider { display:contents; }
:is(#details, #customize-content)[data-mode="build"] .build-add-form p { margin:0; font-size:12px; }
:is(#details, #customize-content)[data-mode="build"] .build-template-path { font:11px/18px var(--font-mono,monospace); overflow-wrap:anywhere; }
@container build-panel (max-width:600px) {
  :is(#details, #customize-content)[data-mode="build"] .build-workspace { padding:12px 12px 0; }
  :is(#details, #customize-content)[data-mode="build"] .build-content { --build-content-gutter:var(--canvas-spacing-condensed,8px); }
}
@container build-panel (max-width:420px) {
  :is(#details, #customize-content)[data-mode="build"] .build-explorer-heading { flex-wrap:wrap; padding:8px; }
}
@media (forced-colors:active) {
  :is(#details, #customize-content)[data-mode="build"] .build-highlight, :is(#details, #customize-content)[data-mode="build"] .build-highlight .token { color:CanvasText; }
  :is(#details, #customize-content)[data-mode="build"] .build-file-action-icon { forced-color-adjust:none; color:ButtonText; }
  :is(#details, #customize-content)[data-mode="build"] .build-source-preview[data-clipped]::after { background:none; border-bottom:2px dashed CanvasText; }
}
`;

export const BUILD_EXPLORER_CSS = `
:is(#details, #customize-content)[data-mode="build"] .build-file { padding:0; border:0; border-radius:0; background:transparent; }
:is(#details, #customize-content)[data-mode="build"] .build-explorer button.build-file-choice { display:block; box-sizing:border-box; width:100%; min-width:0; min-height:30px; padding:6px 10px; border:0; border-radius:0; background:transparent; color:var(--studio-ink); text-align:start; font:12px/18px var(--font-sans,system-ui); white-space:normal; overflow-wrap:anywhere; cursor:pointer; }
:is(#details, #customize-content)[data-mode="build"] .build-collection-path { display:block; margin-top:2px; color:var(--studio-muted); font:11px/16px var(--font-mono,monospace); }
:is(#details, #customize-content)[data-mode="build"] .build-sandbox-badge { display:inline-block; margin-inline-start:8px; vertical-align:middle; font-weight:normal; }
:is(#details, #customize-content)[data-mode="build"] .build-explorer button.build-file-choice:hover { background:var(--studio-raised); }
:is(#details, #customize-content)[data-mode="build"] .build-explorer button.build-file-choice[aria-current="true"] { background:var(--studio-accent-soft); box-shadow:inset 3px 0 var(--studio-accent); font-weight:600; }
:is(#details, #customize-content)[data-mode="build"] .build-explorer button.build-file-choice:focus-visible { outline:2px solid var(--studio-focus); outline-offset:-2px; }
:is(#details, #customize-content)[data-mode="build"] .build-file-header .build-file-actions { flex-direction:row; align-items:center; justify-content:flex-end; gap:4px; max-width:100%; margin:0; margin-inline-start:auto; }
:is(#details, #customize-content)[data-mode="build"] .build-file-overflow { display:none; }
:is(#details, #customize-content)[data-mode="build"] .build-compact-navigation { display:none; }
:is(#details, #customize-content)[data-mode="build"] .build-compact-actions { display:flex; align-items:center; width:100%; justify-content:space-between; gap:8px; }
:is(#details, #customize-content)[data-mode="build"] .build-block-header { padding-block:8px; border-bottom:1px solid var(--studio-line); }
:is(#details, #customize-content)[data-mode="build"] .build-block-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; }
:is(#details, #customize-content)[data-mode="build"] .build-block-heading .build-area-title { min-width:0; overflow-wrap:anywhere; }
:is(#details, #customize-content)[data-mode="build"] .build-block-controls { position:relative; display:flex; align-items:center; gap:8px; min-width:0; margin-top:4px; }
:is(#details, #customize-content)[data-mode="build"] .build-view-switch-mount { flex:none; }
:is(#details, #customize-content)[data-mode="build"] .build-page-switch-mount { flex:0 1 auto; min-width:0; }
:is(#details, #customize-content)[data-mode="build"] .build-collection-actions { flex:none; gap:4px; }
:is(#details, #customize-content)[data-mode="build"] .build-block-header .ct-toolbar { flex-wrap:nowrap; gap:2px; min-width:0; padding:2px; }
:is(#details, #customize-content)[data-mode="build"] .build-page-switch { overflow:clip; width:max-content; }
:is(#details, #customize-content)[data-mode="build"] .build-block-controls [hidden] { display:none; }
:is(#details, #customize-content)[data-mode="build"] .build-file-measure { position:absolute; width:0; height:0; overflow:hidden; visibility:hidden; pointer-events:none; }
:is(#details, #customize-content)[data-mode="build"] .build-block-header button { flex:none; white-space:nowrap; }
:is(#details, #customize-content)[data-mode="build"] .build-block-header button[aria-pressed="true"] { background:var(--studio-accent-soft); color:var(--studio-ink); box-shadow:inset 0 0 0 1px var(--studio-line); }
:is(#details, #customize-content)[data-mode="build"] .build-view-icon { width:16px; height:16px; }
:is(#details, #customize-content)[data-mode="build"] .build-content[data-block-view="page"] { overflow:hidden; }
:is(#details, #customize-content)[data-mode="build"] .build-content > .build-block-files[data-view="page"] { flex:1; min-height:0; overflow:auto; gap:0; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files[data-view="page"] .build-file { min-height:100%; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files[data-view="page"] .build-file-header { top:0; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files[data-view="page"] .build-file-source { flex:1; min-height:auto; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files[data-view="page"] .build-source-preview { flex:1; max-height:none; }
:is(#details, #customize-content)[data-mode="build"] .build-block-files[data-view="page"] .build-preview-expand { display:none; }
@media (forced-colors:active) {
  :is(#details, #customize-content)[data-mode="build"] .build-block-header button[aria-pressed="true"]:not(:focus-visible) { outline:1px solid Highlight; outline-offset:-3px; }
}
@container build-source (max-width:400px) {
  :is(#details, #customize-content)[data-mode="build"] .build-file-overflow { display:contents; }
  :is(#details, #customize-content)[data-mode="build"] .build-file-header [data-file-secondary] { display:none; }
  :is(#details, #customize-content)[data-mode="build"] .build-ai-form .build-actions { flex-direction:column; align-items:stretch; }
  :is(#details, #customize-content)[data-mode="build"] .build-ai-form .build-actions button { width:100%; white-space:normal; }
}
@container build-panel (max-width:520px) {
  :is(#details, #customize-content)[data-mode="build"] .build-compact-navigation { display:block; flex:none; margin-top:8px; }
  :is(#details, #customize-content)[data-mode="build"] .build-browser { grid-template-columns:minmax(0,1fr); grid-template-rows:minmax(0,1fr); margin-top:8px; }
  :is(#details, #customize-content)[data-mode="build"] .build-divider { display:none; }
  :is(#details, #customize-content)[data-mode="build"] .build-explorer { display:none; grid-area:1 / 1; background:var(--studio-bg); }
  :is(#details, #customize-content)[data-mode="build"] .build-content { grid-area:1 / 1; }
  :is(#details, #customize-content)[data-mode="build"] .build-workspace[data-files-open="true"] .build-explorer { display:flex; }
  :is(#details, #customize-content)[data-mode="build"] .build-workspace[data-files-open="true"] .build-content { visibility:hidden; }
  :is(#details, #customize-content)[data-mode="build"] .build-workspace[data-files-open="true"] [data-compact-block-actions] { display:none; }
  :is(#details, #customize-content)[data-mode="build"] .build-explorer-heading { flex-wrap:nowrap; }
}
`;

export const BUILD_PANEL_CSS = STUDIO_TABS_CSS + BUILD_PANEL_CONTENT_CSS + BUILD_EXPLORER_CSS;

export function createBuildPanel({ container, root, request, isActive, onRun, onModel, onSourceChange, syntax, editorSettings: initialEditorSettings, buttons, helpIcon, vsCodeIconMarkup }) {
  const areas = [
    { id: "web", tab: "User Experience" },
    { id: "triggers", tab: "Triggers" },
    { id: "agent", tab: "Agents" },
    { id: "connectors", tab: "Connectors" },
    { id: "skills", tab: "Tools" },
    { id: "workflows", tab: "Orchestrations" },
    { id: "gateway", tab: "AI Gateway" },
    { id: "sre", tab: "Operations" },
    { id: "data", tab: "Data" },
    { id: "application", tab: "App Configuration" },
    { id: "source", tab: "Source", label: "Source projects" },
  ];
  function artifactCategory(artifact) {
    const category = artifact.blockCategory ?? ({ behavior: "agent", tools: "skills", policies: "sandbox", runtime: "application" })[artifact.customizationArea] ?? artifact.customizationArea ?? "source";
    return category === "sandbox" ? "skills" : category;
  }
  function sandboxBadge(parent, members) {
    if (!members.some(artifact => artifact.blockCategory === "sandbox" || artifact.tierId === "sandbox")) return;
    const mount = element("span", undefined, parent, "build-sandbox-badge");
    mount.title = "Configured for sandbox execution. Deployment and isolation are verified separately.";
    buttons.renderComponent(mount, "Badge", { appearance: "tint", size: "small", children: "Sandboxed" });
  }
  const supportedEditors = [
    { id: "vscode", label: "VS Code" }, { id: "vscode-insiders", label: "VS Code Insiders" },
    { id: "cursor", label: "Cursor" }, { id: "windsurf", label: "Windsurf" },
    { id: "zed", label: "Zed" }, { id: "sublime", label: "Sublime Text" },
  ];
  function normalizeEditorSettings(settings) {
    const allowed = new Map(supportedEditors.map((editor) => [editor.id, editor]));
    const editors = Array.isArray(settings?.editors)
      ? settings.editors.filter((editor) => allowed.has(editor?.id)).map((editor) => allowed.get(editor.id))
      : supportedEditors;
    const choices = editors.length ? editors : supportedEditors;
    return {
      editorId: choices.some((editor) => editor.id === settings?.editorId) ? settings.editorId : choices[0].id,
      editors: choices,
    };
  }
  const pendingEditorLaunches = new Set(), pendingFilesLaunches = new Set();
  let fileOpenTarget = "editor";
  const handoffFeedback = new Map();
  const previewPositions = new Map();
  const expandedPreviews = new Set();
  const blockViews = new Map();
  let updateBlockView, rememberBlockView, updateFileOverflow;
  const collapsedCategories = new Set();
  let fileFilter = "";
  let artifacts = [], supportsDocuments = false, loadVersion = 0, workspace, renderedState, selectedArtifact, contentPanel;
  let adding = false, creating = false, templates, templateError, createdBlock;
  const pendingAdjustments = new Set();
  let addDraft = { templateId: "", name: "", instructions: "" };
  const aiDrafts = new Map();
  let refreshing = false, refreshTimer, panelScroll = 0, explorerScroll = 0, workspaceOpening = false, restoreOnShow = false;
  let splitRatio, disposeSplitPane, observePreviews;
  let compactFilesOpen = false;
  let currentEditorSettings = normalizeEditorSettings(initialEditorSettings);
  let editorSettingsSaving = false, editorSettingsVersion = 0;
  function element(tag, text, parent, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    parent?.append(node);
    return node;
  }
  function button(parent, label, action) {
    const control = buttons.create({ children: label, onClick: action });
    buttons.append(parent, control);
    return control;
  }
  function fileIcon(name) {
    return buttons.icon('<span class="build-file-action-icon build-icon-' + name + '" aria-hidden="true"></span>');
  }
  function setFileListOpen(open, restoreFocus = false) {
    if (compactFilesOpen === open) return;
    if (open) rememberView();
    compactFilesOpen = open;
    workspace.dataset.filesOpen = String(open);
    const toggle = workspace.querySelector("[data-files-toggle]");
    buttons.update(toggle, { "aria-expanded": open });
    if (open && toggle.getClientRects().length) {
      const current = workspace.querySelector('[data-file-choice][aria-current="true"]');
      const target = current?.getClientRects().length ? current : workspace.querySelector(".build-explorer button");
      target?.focus();
    } else if (restoreFocus && toggle.getClientRects().length) toggle.focus({ preventScroll: true });
  }
  function selectFile(id, returnToSource = true) {
    rememberView();
    selectedArtifact = id;
    adding = false;
    renderSelection({ revealSelected: true });
    if (returnToSource) setFileListOpen(false, true);
  }
  function fileAction(parent, label, name, action) {
    const control = buttons.create({
      size: "small", appearance: "secondary", icon: fileIcon(name),
      "aria-label": label, title: label, onClick: action,
    });
    buttons.append(parent, control);
    return control;
  }
  function navigationButton(parent, label, action) {
    const control = element("button", label, parent);
    control.type = "button";
    control.addEventListener("click", action);
    return control;
  }
  function error(parent, message) {
    let node = parent.querySelector(":scope > .build-error:not(.build-syntax-error):not(.build-handoff-feedback)");
    if (!node) node = element("div", undefined, parent, "build-error");
    buttons.renderComponent(node, "MessageBar", { intent: "error", children: message, role: "alert" });
  }
  function clearError(parent) {
    const node = parent.querySelector(".build-error");
    if (node) { buttons.clear(node); node.remove(); }
  }
  function field(parent, props) {
    const control = buttons.field(props);
    buttons.append(parent, control);
    return control;
  }
  function resizePanes(browser, divider) {
    let drag;
    const listeners = new AbortController();
    const direction = getComputedStyle(browser).direction === "rtl" ? -1 : 1;
    function bounds() {
      const available = Math.max(0, browser.clientWidth - divider.offsetWidth);
      const min = Math.min(96, available * .4);
      return { available, min, max: Math.max(min, Math.min(420, available - Math.min(120, available * .5))) };
    }
    function applyWidth(requested) {
      const { available, min, max } = bounds();
      const initial = browser.clientWidth <= 420 ? 112 : browser.clientWidth <= 600 ? 140 :
        Math.max(150, Math.min(240, available * .28));
      const width = Math.max(min, Math.min(max, requested ?? (splitRatio === undefined ? initial : splitRatio * available)));
      browser.style.setProperty("--build-rail-width", width + "px");
      divider.setAttribute("aria-valuemin", String(available ? Math.round(min / available * 100) : 0));
      divider.setAttribute("aria-valuemax", String(available ? Math.round(max / available * 100) : 0));
      divider.setAttribute("aria-valuenow", String(available ? Math.round(width / available * 100) : 0));
      divider.setAttribute("aria-valuetext", Math.round(width) + " pixels");
      return width;
    }
    function changeWidth(width) {
      const applied = applyWidth(width);
      const { available } = bounds();
      if (available) splitRatio = applied / available;
    }
    function endDrag(event) {
      if (!drag || (event && event.pointerId !== drag.id)) return;
      const { id } = drag;
      drag = undefined;
      delete divider.dataset.dragging;
      if (divider.hasPointerCapture(id)) divider.releasePointerCapture(id);
    }
    divider.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || drag) return;
      event.preventDefault();
      divider.focus({ preventScroll: true });
      drag = { id: event.pointerId, x: event.clientX, width: applyWidth() };
      divider.setPointerCapture(event.pointerId);
      divider.dataset.dragging = "true";
    }, { signal: listeners.signal });
    divider.addEventListener("pointermove", (event) => {
      if (event.pointerId === drag?.id) changeWidth(drag.width + direction * (event.clientX - drag.x));
    }, { signal: listeners.signal });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      divider.addEventListener(type, endDrag, { signal: listeners.signal });
    }
    divider.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const { min, max } = bounds();
      let width;
      if (event.key === "Home") width = min;
      else if (event.key === "End") width = max;
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        width = applyWidth() + (event.key === "ArrowRight" ? 1 : -1) * direction * (event.shiftKey ? 40 : 16);
      } else return;
      event.preventDefault();
      changeWidth(width);
    }, { signal: listeners.signal });
    function updateHeaderHeight() {
      const height = contentPanel.querySelector(".build-area-header")?.getBoundingClientRect().height ?? 0;
      contentPanel.style.setProperty("--build-header-height", height + "px");
    }
    const observer = new ResizeObserver(() => { applyWidth(); updateFileOverflow?.(); updateHeaderHeight(); updatePreviewEdges(); });
    observePreviews = () => {
      observer.disconnect();
      observer.observe(browser);
      for (const node of browser.querySelectorAll(".build-area-header,.build-block-controls,.build-file-measure > *,.build-block-files :is(.build-source-preview,.build-highlight)")) observer.observe(node);
      updateHeaderHeight();
      updatePreviewEdges();
    };
    observePreviews();
    applyWidth();
    disposeSplitPane = () => {
      observer.disconnect();
      endDrag();
      listeners.abort();
      disposeSplitPane = undefined;
      observePreviews = undefined;
      updateFileOverflow = undefined;
    };
  }
  function selectedEditorLabel() {
    return currentEditorSettings.editors.find((editor) => editor.id === currentEditorSettings.editorId)?.label ?? "editor";
  }
  function isVsCodeEditor() {
    return currentEditorSettings.editorId === "vscode" || currentEditorSettings.editorId === "vscode-insiders";
  }
  function updateEditorControls() {
    const editorIcon = isVsCodeEditor() ? buttons.icon(vsCodeIconMarkup) : undefined;
    for (const preview of container.querySelectorAll(".build-source-preview")) {
      preview.title = "Preview. Click Edit to modify in " + (fileOpenTarget === "files" ? "Files" : selectedEditorLabel()) + ".";
    }
    for (const control of container.querySelectorAll("[data-file-open]")) {
      const artifact = artifacts.find(item => item.id === control.dataset.fileOpen);
      if (!artifact) continue;
      buttons.update(control, fileOpenProps(artifact));
      const primary = control.querySelector("button");
      primary.toggleAttribute("data-files-launch", fileOpenTarget === "files");
      primary.toggleAttribute("data-editor-launch", fileOpenTarget === "editor");
      primary.dataset.artifactId = artifact.id;
      primary.dataset.focusKey = "open-" + artifact.id;
    }
    for (const control of container.querySelectorAll("[data-file-menu]")) {
      const artifact = artifacts.find(item => item.id === control.dataset.fileMenu);
      if (artifact) buttons.update(control, { items: fileMenuItems(artifact) });
    }
    for (const control of container.querySelectorAll("[data-ai-submit]")) {
      const busy = pendingAdjustments.has(control.dataset.aiSubmit);
      buttons.update(control, { children: busy ? "Requesting…" : "Adjust with AI", disabled: busy });
      buttons.setDisabled(control.closest("form").querySelector("textarea"), busy);
    }
    for (const control of container.querySelectorAll("[data-workspace-launch]")) {
      buttons.update(control, {
        children: "Open in " + selectedEditorLabel(),
        icon: editorIcon,
        disabled: workspaceOpening || editorSettingsSaving,
      });
    }
    for (const feedback of container.querySelectorAll(".build-handoff-feedback")) {
      const result = handoffFeedback.get(feedback.dataset.artifactId);
      feedback.hidden = !result;
      feedback.classList.toggle("build-error", result?.error === true);
      if (result) buttons.renderComponent(feedback, "MessageBar", {
        children: result.message, intent: result.error ? "error" : "info", role: result.error ? "alert" : "status",
      });
      else buttons.clear(feedback);
    }
  }
  function rememberPreview(source) {
    if (source?.isConnected && source.getClientRects().length) {
      previewPositions.set(source.dataset.artifactId, { top: source.scrollTop, left: source.scrollLeft });
    }
  }
  function rememberView() {
    if (!workspace?.isConnected) return;
    rememberBlockView?.();
    panelScroll = container.scrollTop;
    const list = workspace.querySelector(".build-explorer-body");
    explorerScroll = list?.scrollTop ?? 0;
    rememberCategories(list);
    for (const source of workspace.querySelectorAll(".build-source-preview")) rememberPreview(source);
  }
  function restorePreview(source, artifact) {
    requestAnimationFrame(() => {
      if (!source.isConnected || !source.getClientRects().length) return;
      const position = previewPositions.get(artifact.id);
      const highlight = source.querySelector(".build-highlight");
      source.scrollTop = position?.top ?? (Number.isInteger(artifact.focusLine)
        ? Math.max(0, artifact.focusLine - 3) * parseFloat(getComputedStyle(highlight).lineHeight) : 0);
      source.scrollLeft = position?.left ?? 0;
    });
  }
  async function openArtifact(artifact, native) {
    const pending = native ? pendingFilesLaunches : pendingEditorLaunches;
    if (pendingFilesLaunches.has(artifact.id) || pendingEditorLaunches.has(artifact.id)) return;
    pending.add(artifact.id);
    handoffFeedback.delete(artifact.id);
    updateEditorControls();
    try {
      const result = await request(native ? "/api/open-build-file-canvas" : "/api/open-build-file", {
        method: "POST", body: JSON.stringify({ root, id: artifact.id }),
      });
      handoffFeedback.set(artifact.id, { message: native
        ? "Opened in Files. Save there, then return to Build."
        : "Opened the worktree and file in " + (result.editorLabel || selectedEditorLabel()) + "." });
    } catch (cause) {
      if (native) {
        fileOpenTarget = "editor";
        pendingEditorLaunches.add(artifact.id);
        updateEditorControls();
        try {
          const result = await request("/api/open-build-file", {
            method: "POST", body: JSON.stringify({ root, id: artifact.id }),
          });
          handoffFeedback.set(artifact.id, { message: "Files is unavailable: " + cause.message +
            " Opened the worktree and file in " + (result.editorLabel || selectedEditorLabel()) + " instead." });
        } catch (editorCause) {
          handoffFeedback.set(artifact.id, { error: true, message: "Could not open Files: " + cause.message +
            " Could not open editor: " + editorCause.message });
        } finally { pendingEditorLaunches.delete(artifact.id); }
      } else handoffFeedback.set(artifact.id, { error: true, message: "Could not open editor: " + cause.message });
    } finally {
      pending.delete(artifact.id);
      if (isActive()) updateEditorControls();
    }
  }
  function setEditorSettings({ settings, busy = false }) {
    currentEditorSettings = normalizeEditorSettings(settings);
    editorSettingsSaving = busy;
    editorSettingsVersion++;
    if (isActive()) updateEditorControls();
  }
  function wrapSourceLines(highlight) {
    function linesFor(node) {
      if (node.nodeType === 3) return node.textContent.split("\n").map(text => [document.createTextNode(text)]);
      const lines = [[]];
      for (const child of node.childNodes) {
        const parts = linesFor(child);
        lines.at(-1).push(...parts[0]);
        lines.push(...parts.slice(1));
      }
      if (node === highlight) return lines;
      return lines.map(children => {
        const token = node.cloneNode(false);
        token.append(...children);
        return [token];
      });
    }
    const lines = linesFor(highlight);
    highlight.replaceChildren();
    lines.forEach((nodes, index) => {
      if (index) highlight.append("\n");
      const line = element("span", undefined, highlight, "build-code-line");
      line.dataset.line = String(index + 1);
      line.append(...nodes);
    });
  }
  function updatePreviewEdges() {
    for (const source of container.querySelectorAll(".build-block-files .build-source-preview")) {
      const stacked = source.closest(".build-block-files").dataset.view === "stack";
      const expanded = source.hasAttribute("data-expanded");
      const clipped = stacked && !expanded && source.scrollHeight > source.clientHeight + 1;
      source.toggleAttribute("data-clipped", clipped);
      source.parentElement.querySelector(".build-preview-expand").hidden = !stacked || (!expanded && !clipped);
    }
  }
  function renderPreview(body, artifact) {
    let source = body.querySelector(".build-source-preview");
    if (!source) {
      const language = syntax?.languageForPath(artifact.path) ?? { id: "plain", label: "Plain text" };
      source = element("div", undefined, body, "build-source-preview");
      source.dataset.language = language.id;
      source.dataset.artifactId = artifact.id;
      source.dataset.focusKey = "preview-" + artifact.id;
      source.tabIndex = 0;
      source.setAttribute("role", "region");
      source.setAttribute("aria-label", artifact.title + " source preview");
      source.setAttribute("aria-description", "Read-only saved source. Language: " + language.label + ". Edit in Files, open in your editor, or adjust with AI.");
      source.title = "Preview. Click Edit to modify in " + selectedEditorLabel() + ".";
      const count = (artifact.content.match(/\n/g)?.length ?? 0) + 1;
      element("pre", Array.from({ length: count }, (_, index) => String(index + 1)).join("\n"),
        source, "build-line-numbers").setAttribute("aria-hidden", "true");
      const highlight = element("pre", "", source, "build-highlight");
      try {
        if (!syntax) throw new Error("The bundled highlighter did not load.");
        highlight.innerHTML = syntax.highlight(artifact.content, artifact.path);
      } catch (cause) {
        highlight.textContent = artifact.content;
        element("p", "Syntax highlighting is unavailable: " + cause.message + " Plain text preview is still available.",
          body, "build-error build-syntax-error").setAttribute("role", "alert");
      }
      if (body.closest(".build-block-files")) {
        wrapSourceLines(highlight);
        source.id = "build-source-" + encodeURIComponent(artifact.id);
        const footer = element("div", undefined, body, "build-preview-expand");
        const expand = button(footer, "", () => {
          if (expandedPreviews.has(artifact.id)) expandedPreviews.delete(artifact.id);
          else expandedPreviews.add(artifact.id);
          updateExpansion();
          if (!expandedPreviews.has(artifact.id)) {
            const row = body.closest(".build-file");
            const stickyHeight = contentPanel.querySelector(".build-block-header")?.getBoundingClientRect().height ?? 0;
            if (row.getBoundingClientRect().top < contentPanel.getBoundingClientRect().top + stickyHeight) {
              contentPanel.scrollTop += row.getBoundingClientRect().top - contentPanel.getBoundingClientRect().top - stickyHeight;
            }
          }
        });
        expand.dataset.focusKey = "expand-" + artifact.id;
        function updateExpansion() {
          const expanded = expandedPreviews.has(artifact.id);
          source.toggleAttribute("data-expanded", expanded);
          buttons.update(expand, { children: expanded ? "Show less" : "Show full file",
            appearance: "subtle", size: "small", "aria-expanded": expanded, "aria-controls": source.id });
          updatePreviewEdges();
        }
        updateExpansion();
      }
      source.addEventListener("scroll", () => rememberPreview(source));
    }
    restorePreview(source, artifact);
    observePreviews?.();
  }
  function artifactLabel(artifact) {
    const file = artifact.path.split("/").pop();
    if (artifact.id === "tool" || file === "function_app.py") return "Implementation";
    if (artifact.id === "contract" || file === "contract.json") return "Input contract";
    if (artifact.id === "instructions" || artifact.path.endsWith("/prompts/system.md")) return "Instructions";
    if (artifact.customizationArea === "behavior") return "Instructions & agent implementation";
    return artifact.title.split(" · ")[0];
  }
  function sectionFileActions(artifact) {
    const items = [];
    if (supportsDocuments && artifact.id === "instructions" && typeof onRun === "function") {
      items.push({ id: "test", label: "Test with a document", icon: "test", onClick: onRun });
    }
    if (supportsDocuments && artifact.id === "runtime" && typeof onModel === "function") {
      items.push({ id: "model", label: "Model connection", icon: "settings", onClick: onModel });
    }
    return items;
  }
  function fileMenuItems(artifact) {
    return sectionFileActions(artifact).map(({ icon, ...item }) => ({ ...item, icon: fileIcon(icon) }));
  }
  function fileOpenProps(artifact) {
    const native = fileOpenTarget === "files";
    const opening = pendingFilesLaunches.has(artifact.id) || pendingEditorLaunches.has(artifact.id);
    const label = native ? "Edit in Files" : "Edit in " + selectedEditorLabel();
    const editorIcon = isVsCodeEditor() ? buttons.icon(vsCodeIconMarkup) : fileIcon("editor");
    function choose(target) {
      fileOpenTarget = target;
      updateEditorControls();
      void openArtifact(artifact, target === "files");
    }
    return {
      heading: "Open with", menuLabel: "Open with", collapseLabel: false,
      menuButton: { title: "Open with", "data-focus-key": "open-with-" + artifact.id },
      positioning: { position: "below", align: "end" },
      button: {
        children: "Edit", "aria-label": label, title: label, size: "small", appearance: "secondary",
        icon: native ? fileIcon("files") : editorIcon,
        disabled: opening || (!native && editorSettingsSaving),
        onClick: () => openArtifact(artifact, native),
      },
      items: [
        { id: "files", label: "Files", icon: fileIcon("files"),
          disabled: opening, onClick: () => choose("files") },
        { id: "editor", label: selectedEditorLabel(), icon: editorIcon,
          disabled: opening || editorSettingsSaving, onClick: () => choose("editor") },
      ],
    };
  }
  function renderArtifact(parent, artifact, headingTag = "h4") {
    const row = element("section", undefined, parent, "build-file");
    row.dataset.artifact = artifact.id;
    const header = element("header", undefined, row, "build-file-header");
    const identity = element("div", undefined, header, "build-file-identity");
    const heading = element("div", undefined, identity, "build-file-heading");
    element(headingTag, artifactLabel(artifact), heading);
    const previewLabel = element("span", undefined, heading, "build-preview-badge");
    const previewIcon = element("span", undefined, previewLabel, "build-file-action-icon build-icon-preview");
    previewIcon.setAttribute("aria-hidden", "true");
    previewLabel.append("Preview");
    element("code", artifact.path, identity, "build-source-path");
    const actions = buttons.actionGroup(header, { className: "build-actions build-file-actions", "aria-label": "File actions" });
    const open = buttons.split(fileOpenProps(artifact));
    open.dataset.fileOpen = artifact.id;
    buttons.append(actions, open);
    const adjust = fileAction(actions, "Adjust with AI", "ai", () => renderAdjustment(row, artifact));
    adjust.dataset.focusKey = "adjust-" + artifact.id;
    for (const item of sectionFileActions(artifact)) {
      const control = fileAction(actions, item.label, item.icon, item.onClick);
      control.dataset.fileSecondary = "true";
      control.dataset.focusKey = item.id === "test" ? "test-document" : "model";
    }
    if (sectionFileActions(artifact).length) {
      const more = buttons.menu({
        label: null,
        button: { size: "small", appearance: "secondary", icon: fileIcon("more"),
          "aria-label": "More file actions", title: "More file actions" },
        positioning: { position: "below", align: "end" },
        items: fileMenuItems(artifact),
      });
      more.dataset.fileMenu = artifact.id;
      buttons.host(more).classList.add("build-file-overflow");
      more.dataset.focusKey = "file-menu-" + artifact.id;
      buttons.append(actions, more);
    }
    element("div", undefined, row, "build-handoff-feedback").dataset.artifactId = artifact.id;
    if (supportsDocuments && artifact.id === "runtime") {
      try {
        const config = JSON.parse(artifact.content);
        const sandbox = config.agentRuntime === "copilot-sdk-sandbox";
        element("p", sandbox
          ? "Target: separate ACA sandboxes for the agent runtime and document tool. Check connections in Run."
          : "Local subprocess simulation. Use synthetic documents only; there is no OS or network isolation.",
        row, sandbox ? "build-runtime-info" : "build-warning");
      } catch (cause) { error(row, "Invalid runtime configuration: " + cause.message); }
    }
    const body = element("div", undefined, row, "build-file-source");
    body.dataset.previewFor = artifact.id;
    renderPreview(body, artifact);
  }
  function projectGroups(members) {
    const groups = new Map();
    for (const artifact of members) {
      const fallback = artifact.path.endsWith("/prompts/system.md")
        ? artifact.path.slice(0, -"/prompts/system.md".length)
        : artifact.path.split("/").slice(0, -1).join("/");
      const key = artifact.projectPath ?? (fallback || ".");
      if (!groups.has(key)) {
        const discoveredName = artifact.projectName ?? key.split("/").pop();
        const name = discoveredName && discoveredName !== "." ? discoveredName : "App";
        const label = name.replace(/[-_]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
        groups.set(key, { path: key, name: label, artifacts: [] });
      }
      groups.get(key).artifacts.push(artifact);
    }
    return [...groups.values()];
  }
  function rememberCategories(list) {
    if (list?.dataset.filtering !== "false") return;
    for (const category of list.querySelectorAll(".build-category")) {
      if (category.open) collapsedCategories.delete(category.dataset.categoryId);
      else collapsedCategories.add(category.dataset.categoryId);
    }
  }
  function matchingFiles(project) {
    const query = fileFilter.trim().toLowerCase();
    return project.artifacts.filter(artifact => !query ||
      [project.name, project.path, artifact.path, artifact.title, artifact.projectName]
        .some(value => value?.toLowerCase().includes(query)));
  }
  function selectCollection(project, returnToSource = true) {
    const matches = matchingFiles(project);
    const remembered = blockViews.get(project.path)?.activeId;
    const artifact = matches.find(item => item.id === remembered) ??
      matches.find(item => item.id === selectedArtifact) ?? matches[0];
    selectFile(artifact.id, returnToSource);
    if (fileFilter.trim() && matches.length === 1 && blockViews.has(project.path)) {
      blockViews.get(project.path).mode = "page";
      updateBlockView();
    }
  }
  function renderFileList(list, status) {
    rememberCategories(list);
    buttons.clear(list);
    list.replaceChildren();
    const query = fileFilter.trim().toLowerCase();
    list.dataset.filtering = String(Boolean(query));
    const projects = projectGroups(artifacts);
    const matches = projects.filter(project => matchingFiles(project).length);
    const selected = projects.find(project => project.artifacts.some(item => item.id === selectedArtifact));
    const nameCounts = new Map();
    for (const project of projects) nameCounts.set(project.name, (nameCounts.get(project.name) ?? 0) + 1);
    status.textContent = query ? matches.length + " of " + projects.length + " collections" : "";
    if (query && !matches.length) element("p", "No matching collections.", list, "build-search-empty");
    for (const area of areas) {
      const members = matches.filter(project => {
        const primaryArea = areas.find(candidate =>
          project.artifacts.some(artifact => artifactCategory(artifact) === candidate.id)) ?? areas.at(-1);
        return primaryArea.id === area.id;
      });
      if (!members.length) continue;
      const category = element("details", undefined, list, "build-category");
      category.dataset.categoryId = area.id;
      category.open = Boolean(query) || !collapsedCategories.has(area.id);
      element("summary", area.tab + " (" + members.length + ")", category);
      for (const project of members) {
        const choice = navigationButton(category, project.name, () => selectCollection(project));
        choice.className = "build-file-choice";
        choice.title = project.path || ".";
        sandboxBadge(choice, project.artifacts);
        if (nameCounts.get(project.name) > 1) {
          element("code", project.path || ".", choice, "build-collection-path");
          choice.setAttribute("aria-label", project.name + " (" + (project.path || ".") + ")");
        }
        choice.dataset.collectionPath = project.path;
        choice.dataset.fileChoice = project.artifacts[0].id;
        choice.dataset.focusKey = "collection-" + project.path;
        choice.setAttribute("aria-controls", "build-selected-file");
        choice.setAttribute("aria-current", String(!adding && project.path === selected?.path));
        choice.addEventListener("keydown", (event) => {
          const choices = [...list.querySelectorAll("[data-file-choice]")].filter((node) => node.getClientRects().length);
          const index = choices.indexOf(choice);
          let next;
          if (event.key === "ArrowDown") next = (index + 1) % choices.length;
          else if (event.key === "ArrowUp") next = (index - 1 + choices.length) % choices.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = choices.length - 1;
          else return;
          event.preventDefault();
          choices[next].focus();
          selectCollection(projects.find(project => project.path === choices[next].dataset.collectionPath), false);
        });
      }
    }
  }
  function renderAdjustment(row, artifact) {
    if (row.querySelector(".build-ai-form")) {
      row.querySelector("textarea").focus();
      return;
    }
    const form = element("form", undefined, row, "build-add-form build-ai-form");
    form.style.gridColumn = "1 / -1";
    const input = field(form, {
      kind: "Textarea", label: "What should change?", maxLength: 2000, rows: 4,
      defaultValue: aiDrafts.get(artifact.id) ?? "",
      hint: "Copilot edits the saved source in your app session. Review its changes, then refresh source.",
    });
    input.addEventListener("input", () => { aiDrafts.set(artifact.id, input.value); });
    const actions = buttons.actionGroup(form, { className: "build-actions", "aria-label": "AI adjustment actions" });
    const submit = button(actions, "Adjust with AI", async () => {
      if (pendingAdjustments.has(artifact.id)) return;
      if (!input.value.trim()) { error(form, "Describe the change first."); input.focus(); return; }
      pendingAdjustments.add(artifact.id);
      updateEditorControls();
      clearError(form);
      try {
        await sendAdjustment(artifact.id, input.value.trim());
        aiDrafts.delete(artifact.id);
        handoffFeedback.set(artifact.id, { message: "Requested in your app session. Review Copilot's changes, then refresh source." });
        buttons.clear(form);
        form.remove();
      } catch (cause) { error(form, "Could not request changes: " + cause.message); }
      finally {
        pendingAdjustments.delete(artifact.id);
        if (isActive()) updateEditorControls();
      }
    });
    submit.dataset.aiSubmit = artifact.id;
    buttons.update(submit, { appearance: "primary" });
    const cancel = button(actions, "Cancel", () => { buttons.clear(form); form.remove(); });
    buttons.update(cancel, { appearance: "secondary" });
    form.addEventListener("submit", (event) => { event.preventDefault(); submit.click(); });
    updateEditorControls();
    input.focus();
  }
  async function sendAdjustment(id, instructions) {
    await request("/api/adjust-build-file", {
      method: "POST", body: JSON.stringify({ root, id, instructions }),
    });
  }
  function renderSelection({ revealSelected = false } = {}) {
    const project = projectGroups(artifacts).find(project => project.artifacts.some(item => item.id === selectedArtifact));
    for (const choice of workspace.querySelectorAll("[data-file-choice]")) {
      choice.setAttribute("aria-current", String(!adding && choice.dataset.collectionPath === project?.path));
    }
    const artifact = artifacts.find((item) => item.id === selectedArtifact);
    const members = project?.artifacts ?? [];
    function reveal() {
      if (!revealSelected || contentPanel.dataset.blockView === "page") return;
      const selected = [...contentPanel.querySelectorAll(".build-file")].find(row => row.dataset.artifact === selectedArtifact);
      const stickyHeight = contentPanel.querySelector(".build-block-header")?.getBoundingClientRect().height ?? 0;
      if (selected) contentPanel.scrollTop += selected.getBoundingClientRect().top - contentPanel.getBoundingClientRect().top - stickyHeight;
    }
    const existing = [...contentPanel.querySelectorAll(".build-block-files .build-file")];
    if (!adding && members.length > 1 && existing.length === members.length &&
      existing.every((row, index) => row.dataset.artifact === members[index].id)) {
      updateBlockView?.();
      reveal();
      return;
    }
    buttons.clear(contentPanel);
    contentPanel.replaceChildren();
    observePreviews?.();
    contentPanel.scrollTop = 0;
    delete contentPanel.dataset.blockView;
    updateBlockView = undefined;
    rememberBlockView = undefined;
    updateFileOverflow = undefined;
    if (adding) { renderAddForm(); return; }
    if (!artifact) return;
    const area = areas.find((item) => item.id === artifactCategory(artifact)) ?? areas.at(-1);
    contentPanel.dataset.areaId = area.id;
    const header = element("div", undefined, contentPanel, "build-area-header");
    const parentName = project && (members.length > 1 || artifact.projectPath || artifact.projectName) ? project.name : undefined;
    const title = element("h3", parentName ?? artifact.path.split("/").pop(), header, "build-area-title");
    sandboxBadge(title, members);
    if (createdBlock?.paths.includes(artifact.path)) {
      const notice = element("div", undefined, contentPanel, "build-created");
      buttons.renderComponent(notice, "MessageBar", { intent: "info", role: "status",
        children: "Template created. Open it in your editor or adjust it with AI. Connect and test this block before running or deploying." });
    }
    const files = members.length > 1 ? element("div", undefined, contentPanel, "build-block-files") : contentPanel;
    for (const member of members) renderArtifact(files, member);
    if (members.length > 1) {
      header.classList.add("build-block-header");
      renderBlockControls(header, files, artifact, project);
    }
    if (createdBlock?.artifactId === artifact.id && aiDrafts.has(artifact.id) && !pendingAdjustments.has(artifact.id)) {
      renderAdjustment([...contentPanel.querySelectorAll(".build-file")].find(row => row.dataset.artifact === artifact.id), artifact);
    }
    updateEditorControls();
    observePreviews?.();
    reveal();
  }
  function renderBlockControls(header, files, artifact, project) {
    const members = project.artifacts;
    let view = blockViews.get(project.path);
    if (!view) {
      view = { mode: "stack", activeId: artifact.id, stackScroll: 0, pageScroll: new Map() };
      blockViews.set(project.path, view);
    }
    view.activeId = artifact.id;
    rememberBlockView = () => {
      if (view.mode === "page") view.pageScroll.set(view.activeId, files.scrollTop);
      else view.stackScroll = contentPanel.scrollTop;
    };
    const heading = element("div", undefined, header, "build-block-heading");
    heading.append(header.querySelector(".build-area-title"));
    function viewIcon(path) {
      return buttons.icon('<svg class="build-view-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + path + '"/></svg>');
    }
    function setMode(value) {
      rememberView();
      if (view.mode === "stack") view.stackScroll = contentPanel.scrollTop;
      else view.pageScroll.set(view.activeId, files.scrollTop);
      view.mode = value;
      updateBlockView();
      contentPanel.scrollTop = value === "stack" ? view.stackScroll : 0;
      files.scrollTop = value === "page" ? view.pageScroll.get(view.activeId) ?? 0 : 0;
    }
    const controls = element("div", undefined, header, "build-block-controls");
    const mode = buttons.create({
      "aria-label": "Stack view", title: "Stack view", "data-focus-key": "layout-stack",
      size: "small", appearance: "subtle", "aria-pressed": view.mode === "stack",
      icon: viewIcon("m2 5 6-3 6 3-6 3-6-3Zm0 3 6 3 6-3M2 11l6 3 6-3"),
      onClick: () => setMode(view.mode === "stack" ? "page" : "stack"),
    });
    buttons.host(mode).classList.add("build-view-switch-mount");
    buttons.append(controls, mode);
    const rows = [...files.querySelectorAll(".build-file")];
    for (const row of rows) row.id = "build-document-" + encodeURIComponent(row.dataset.artifact);
    const pageItems = members.map((member, index) => ({
      value: member.id, label: member.path.split("/").pop(), title: member.path,
      controls: rows[index].id, focusKey: "page-" + member.id,
    }));
    const pages = buttons.segmented({
      "aria-label": "File pages", className: "build-page-switch", value: view.mode === "page" ? selectedArtifact : undefined,
      items: pageItems,
      onValueChange(value) {
        rememberView();
        selectedArtifact = value;
        setMode("page");
        renderSelection({ revealSelected: true });
      },
      onReselect() {
        setMode("page");
      },
    });
    const pageMount = buttons.host(pages);
    pageMount.classList.add("build-page-switch-mount");
    buttons.append(controls, pages);
    // Measure the full canonical strip without adding another focusable toolbar or scrollable surface.
    const measure = element("div", undefined, controls, "build-file-measure");
    measure.inert = true;
    measure.setAttribute("aria-hidden", "true");
    const fullStrip = pages.cloneNode(true);
    for (const node of [fullStrip, ...fullStrip.querySelectorAll("*")]) {
      for (const attribute of ["id", "role", "aria-label", "aria-controls", "data-focus-key"]) node.removeAttribute(attribute);
    }
    measure.append(fullStrip);
    const actions = buttons.actionGroup(controls, { className: "build-collection-actions", "aria-label": "Collection actions" });
    let visibleCount = members.length;
    function collectionFileItems() {
      return members.slice(visibleCount).map(member => ({
        id: member.id, label: member.path.split("/").pop(), title: member.path,
        "aria-current": member.id === selectedArtifact ? "true" : undefined,
        icon: member.id === selectedArtifact ? fileIcon("check") : undefined,
        onClick: () => {
          rememberView();
          selectedArtifact = member.id;
          setMode("page");
          renderSelection({ revealSelected: true });
        },
      }));
    }
    const more = buttons.menu({
      label: null,
      button: { size: "small", appearance: "subtle",
        icon: buttons.icon('<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>'),
        "aria-label": "More files", title: "More files", "data-focus-key": "file-picker" },
      positioning: { position: "below", align: "end" },
      items: collectionFileItems(),
    });
    more.setAttribute("data-file-picker", "");
    buttons.append(actions, more);
    const add = fileAction(actions, "Add building block", "add", startAdding);
    buttons.update(add, { appearance: "subtle" });
    add.dataset.focusKey = "collection-add";
    const moreMount = buttons.host(more).closest(".ct-dom-content") ?? buttons.host(more);
    updateFileOverflow = () => {
      if (!controls.getClientRects().length || controls.clientWidth === 0) return;
      const gap = parseFloat(getComputedStyle(controls).columnGap) || 0;
      const stackWidth = mode.getBoundingClientRect().width + gap;
      const actionGap = parseFloat(getComputedStyle(actions.querySelector(".build-collection-actions")).columnGap) || 0;
      const addWidth = add.getBoundingClientRect().width;
      const fits = stackWidth + fullStrip.getBoundingClientRect().width + gap + addWidth <= controls.clientWidth;
      let nextCount = members.length;
      if (!fits) {
        moreMount.hidden = false;
        const available = controls.clientWidth - stackWidth - gap - addWidth - actionGap - more.getBoundingClientRect().width;
        const stripStyle = getComputedStyle(fullStrip);
        const itemGap = parseFloat(stripStyle.columnGap) || 0;
        let used = parseFloat(stripStyle.paddingLeft) + parseFloat(stripStyle.paddingRight);
        nextCount = 0;
        for (const item of fullStrip.querySelectorAll("button")) {
          used += item.getBoundingClientRect().width + (nextCount ? itemGap : 0);
          if (used > available) break;
          nextCount++;
        }
      }
      const focusedFile = pages.contains(document.activeElement) ? document.activeElement?.dataset.focusKey : undefined;
      const focusedMore = more === document.activeElement;
      if (nextCount === members.length && more.getAttribute("aria-expanded") === "true") more.click();
      moreMount.hidden = nextCount === members.length;
      controls.toggleAttribute("data-file-overflow", nextCount < members.length);
      pageMount.hidden = nextCount === 0;
      if (visibleCount !== nextCount) {
        visibleCount = nextCount;
        buttons.update(pages, { items: pageItems.slice(0, visibleCount), value: view.mode === "page" ? selectedArtifact : undefined });
        buttons.update(more, { items: collectionFileItems() });
        if (focusedFile && !pages.querySelector(`[data-focus-key="${CSS.escape(focusedFile)}"]`)) more.focus({ preventScroll: true });
      }
      if (focusedMore && moreMount.hidden) add.focus({ preventScroll: true });
    };
    updateBlockView = () => {
      const changedPage = view.activeId !== selectedArtifact;
      if (changedPage && view.mode === "page") view.pageScroll.set(view.activeId, files.scrollTop);
      view.activeId = selectedArtifact;
      contentPanel.dataset.blockView = view.mode;
      files.dataset.view = view.mode;
      for (const row of rows) row.hidden = view.mode === "page" && row.dataset.artifact !== selectedArtifact;
      buttons.update(mode, { "aria-pressed": view.mode === "stack" });
      buttons.update(pages, { value: view.mode === "page" ? selectedArtifact : undefined });
      buttons.update(more, { items: collectionFileItems() });
      updateFileOverflow();
      if (changedPage && view.mode === "page") files.scrollTop = view.pageScroll.get(view.activeId) ?? 0;
      updatePreviewEdges();
    };
    updateBlockView();
    contentPanel.scrollTop = view.mode === "stack" ? view.stackScroll : 0;
    files.scrollTop = view.mode === "page" ? view.pageScroll.get(view.activeId) ?? 0 : 0;
  }
  async function startAdding() {
    rememberView();
    adding = true;
    setFileListOpen(false);
    renderSelection();
    if (!templates) {
      try {
        const result = await request("/api/build-templates?root=" + encodeURIComponent(root));
        templates = result.templates;
        templateError = undefined;
      } catch (cause) { templateError = cause.message; }
      if (isActive() && adding && contentPanel?.isConnected) renderSelection();
    }
    contentPanel?.querySelector("select,button")?.focus({ preventScroll: true });
  }
  function renderAddForm() {
    const form = element("form", undefined, contentPanel, "build-add-form");
    element("h3", "Add building block", form, "build-area-title");
    element("p", "Start with a template, then make it yours in your editor or with AI.", form);
    if (!templates) {
      if (templateError) {
        error(form, "Could not load templates: " + templateError);
        button(form, "Retry templates", startAdding);
      } else element("p", "Loading templates…", form).setAttribute("role", "status");
      button(form, "Cancel", () => { adding = false; renderSelection(); });
      return;
    }
    const picker = field(form, {
      kind: "Select", label: "Template",
      defaultValue: templates.some((item) => item.id === addDraft.templateId) ? addDraft.templateId : templates[0]?.id ?? "",
      options: templates.map(template => ({ value: template.id, label: template.name })),
    });
    addDraft.templateId = picker.value;
    const name = field(form, {
      kind: "TextInput", label: "Block name", defaultValue: addDraft.name, placeholder: "my-block",
      pattern: "[a-z][a-z0-9-]{0,39}", maxLength: 40, required: true,
    });
    const path = element("code", "", form, "build-template-path");
    const instructions = field(form, {
      kind: "Textarea", label: "Instructions (optional)", maxLength: 2000, rows: 4,
      defaultValue: addDraft.instructions,
      placeholder: "Describe what this block should do, its inputs, and the result you need.",
    });
    function updateTemplate() {
      const template = templates.find((item) => item.id === picker.value);
      addDraft = { templateId: picker.value, name: name.value, instructions: instructions.value };
      buttons.update(picker, { hint: template?.description ?? "No templates available." });
      path.textContent = template?.projectPath.replace("{name}", name.value || "my-block") ?? "";
      buttons.update(instructions, { hint: "Leave blank for the starter only. Otherwise, Copilot applies your instructions using "
        + (template?.name ?? "block") + " best practices." });
    }
    picker.addEventListener("change", updateTemplate);
    name.addEventListener("input", updateTemplate);
    instructions.addEventListener("input", updateTemplate);
    updateTemplate();
    for (const control of [picker, name, instructions]) buttons.setDisabled(control, creating);
    element("p", "Creates new files only. Existing files are never replaced. Runtime connections and deployment are separate.", form);
    const actions = buttons.actionGroup(form, { className: "build-actions", "aria-label": "Block creation actions" });
    const create = button(actions, creating ? "Creating…" : "Create from template", async () => {
      if (creating || !form.reportValidity()) return;
      const requestedInstructions = instructions.value.trim();
      creating = true;
      buttons.setDisabled(create, true);
      buttons.setDisabled(cancel, true);
      for (const control of [picker, name, instructions]) buttons.setDisabled(control, true);
      clearError(form);
      try {
        const result = await request("/api/build-block", {
          method: "POST", body: JSON.stringify({ root, templateId: picker.value, name: name.value }),
        });
        createdBlock = result;
        onSourceChange?.();
        selectedArtifact = result.artifactId;
        adding = false;
        addDraft = { templateId: "", name: "", instructions: "" };
        if (requestedInstructions) {
          aiDrafts.set(result.artifactId, requestedInstructions);
          pendingAdjustments.add(result.artifactId);
          handoffFeedback.set(result.artifactId, { message: "Template created. Requesting AI customization..." });
        }
        renderedState = undefined;
        if (isActive()) await show({ refresh: true });
        if (requestedInstructions) {
          try {
            await sendAdjustment(result.artifactId, requestedInstructions);
            aiDrafts.delete(result.artifactId);
            handoffFeedback.set(result.artifactId, { message: "Requested in your app session. Review Copilot's changes, then refresh source." });
          } catch (cause) {
            handoffFeedback.set(result.artifactId, { error: true, message: "Template saved, but AI customization could not be requested: " + cause.message + ". Retry Adjust with AI; do not create the block again." });
          } finally {
            pendingAdjustments.delete(result.artifactId);
            if (isActive() && selectedArtifact === result.artifactId && !adding) renderSelection();
          }
        }
      } catch (cause) { error(form, "Could not create block: " + cause.message); }
      finally {
        creating = false;
        for (const control of [picker, name, instructions]) buttons.setDisabled(control, false);
        if (create.isConnected) buttons.setDisabled(create, false);
        if (cancel.isConnected) buttons.setDisabled(cancel, false);
      }
    });
    buttons.update(create, { appearance: "primary", disabled: creating || !templates.length });
    const cancel = button(actions, "Cancel", () => { adding = false; renderSelection(); });
    buttons.update(cancel, { appearance: "secondary", disabled: creating });
    form.addEventListener("submit", (event) => { event.preventDefault(); create.click(); });
  }
  function renderWorkspace(diagnostics) {
    workspace = element("div", undefined, container, "build-workspace");
    workspace.dataset.filesOpen = String(compactFilesOpen);
    for (const diagnostic of diagnostics ?? []) {
      element("p", (diagnostic.path ? diagnostic.path + ": " : "") + diagnostic.message, workspace, "build-warning");
    }
    if (!artifacts.length) {
      const empty = element("section", undefined, workspace, "build-empty");
      element("h3", "No recognized customization points", empty);
      element("p", "No supported customization points were found. Open the project in your code editor; Build only shows recognized decision points.", empty);
      const open = button(empty, "Open in " + selectedEditorLabel(), async () => {
        if (workspaceOpening) return;
        workspaceOpening = true;
        handoffFeedback.delete("workspace");
        updateEditorControls();
        try {
          const result = await request("/api/open-editor", { method: "POST", body: JSON.stringify({ root }) });
          handoffFeedback.set("workspace", { message: "Opened the worktree in " + (result.editorLabel || selectedEditorLabel()) + "." });
        } catch (cause) { handoffFeedback.set("workspace", { error: true, message: cause.message }); }
        finally {
          workspaceOpening = false;
          if (isActive()) updateEditorControls();
        }
      });
      buttons.update(open, {
        className: "build-open-editor",
        appearance: "secondary",
        icon: isVsCodeEditor() ? buttons.icon(vsCodeIconMarkup) : undefined,
      });
      open.dataset.workspaceLaunch = "true";
      open.dataset.focusKey = "workspace";
      element("div", undefined, empty, "build-handoff-feedback").dataset.artifactId = "workspace";
    }
    const compactNavigation = element("div", undefined, workspace, "build-compact-navigation");
    const compactActions = element("div", undefined, compactNavigation, "build-compact-actions");
    compactActions.setAttribute("role", "toolbar");
    compactActions.setAttribute("aria-label", "File navigation");
    const filesToggle = button(compactActions, "Files", () => setFileListOpen(!compactFilesOpen));
    buttons.update(filesToggle, {
      appearance: "secondary", icon: fileIcon("files"),
      "aria-controls": "build-file-list", "aria-expanded": compactFilesOpen,
    });
    filesToggle.dataset.filesToggle = "true";
    filesToggle.dataset.focusKey = "files-toggle";
    const compactBlockActions = buttons.actionGroup(compactActions, { "aria-label": "Building block actions" });
    compactBlockActions.dataset.compactBlockActions = "true";
    renderRefreshButton(compactBlockActions);
    const compactAdd = button(compactBlockActions, "", startAdding);
    buttons.update(compactAdd, { appearance: "subtle", icon: fileIcon("add"), "aria-label": "+ Add building block", title: "Add building block" });
    compactAdd.dataset.focusKey = "compact-add-block";
    compactAdd.dataset.compactAdd = "true";
    const browser = element("div", undefined, workspace, "build-browser");
    const explorer = element("nav", undefined, browser, "build-explorer");
    explorer.id = "build-file-list";
    explorer.setAttribute("aria-label", "Build files");
    explorer.addEventListener("keydown", event => {
      if (event.key !== "Escape" || event.defaultPrevented || !filesToggle.getClientRects().length) return;
      event.preventDefault();
      setFileListOpen(false, true);
    });
    const explorerHeader = element("div", undefined, explorer, "build-explorer-header");
    const explorerHeading = element("div", undefined, explorerHeader, "build-explorer-heading");
    element("strong", "Building blocks", explorerHeading);
    const explorerActions = buttons.actionGroup(explorerHeading, { "aria-label": "Building block actions" });
    renderRefreshButton(explorerActions);
    const add = button(explorerActions, "", startAdding);
    add.setAttribute("aria-label", "+ Add building block");
    add.dataset.focusKey = "add-block";
    buttons.update(add, { appearance: "subtle", icon: fileIcon("add"), title: "Add building block" });
    if (!artifacts.some((artifact) => artifact.id === selectedArtifact)) selectedArtifact = artifacts[0]?.id;
    const searchHost = element("div", undefined, explorerHeader, "build-file-search");
    const search = field(searchHost, {
      kind: "TextInput", label: "Filter files", type: "search", placeholder: "Name or path",
      defaultValue: fileFilter, "aria-controls": "build-file-results",
    });
    search.dataset.focusKey = "file-filter";
    const filterStatus = element("p", "", explorerHeader, "build-filter-status");
    filterStatus.setAttribute("role", "status");
    const list = element("div", undefined, explorer, "build-explorer-body");
    list.id = "build-file-results";
    function filterFiles() {
      fileFilter = search.value;
      renderFileList(list, filterStatus);
      list.scrollTop = 0;
      explorerScroll = 0;
    }
    search.addEventListener("input", filterFiles);
    search.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !search.value) return;
      event.preventDefault();
      search.value = "";
      filterFiles();
    });
    renderFileList(list, filterStatus);
    const divider = element("div", undefined, browser, "build-divider");
    divider.tabIndex = 0;
    divider.setAttribute("role", "separator");
    divider.setAttribute("aria-label", "File list width");
    divider.setAttribute("aria-orientation", "vertical");
    divider.setAttribute("aria-controls", explorer.id);
    divider.dataset.focusKey = "file-list-width";
    contentPanel = element("section", undefined, browser, "build-area build-content");
    contentPanel.id = "build-selected-file";
    contentPanel.setAttribute("aria-label", "Selected file");
    renderSelection();
    resizePanes(browser, divider);
    list.scrollTop = explorerScroll;
    updateEditorControls();
  }
  async function show({ refresh = false } = {}) {
    clearTimeout(refreshTimer);
    if (restoreOnShow && workspace?.isConnected) {
      const browser = workspace.querySelector(".build-browser");
      const divider = workspace.querySelector(".build-divider");
      if (browser && divider && !disposeSplitPane) resizePanes(browser, divider);
      container.scrollTop = panelScroll;
      for (const source of workspace.querySelectorAll(".build-source-preview")) {
        const artifact = artifacts.find(item => item.id === source.dataset.artifactId);
        if (artifact) restorePreview(source, artifact);
      }
    }
    restoreOnShow = false;
    const version = ++loadVersion;
    const settingsVersion = editorSettingsVersion;
    const initiatingFocusKey = container.contains(document.activeElement)
      ? document.activeElement.dataset.focusKey : undefined;
    let restoreFocusKey;
    refreshing = true;
    setRefreshDisabled(true);
    let loading;
    if (!refresh || !container.childElementCount) {
      rememberView();
      disposeSplitPane?.();
      buttons.clear(container);
      container.replaceChildren();
      loading = element("p", "Loading app source...", container, "build-loading");
      loading.setAttribute("role", "status");
    }
    try {
      const state = await request("/api/build-workspace?root=" + encodeURIComponent(root));
      if (!isActive() || version !== loadVersion) return;
      if (state.editorSettings && !editorSettingsSaving && settingsVersion === editorSettingsVersion) {
        currentEditorSettings = normalizeEditorSettings(state.editorSettings);
      }
      container.querySelector(":scope > .build-error")?.remove();
      const next = state.artifacts.filter((artifact) => artifact.available
        && areas.some((area) => area.id === artifactCategory(artifact)));
      const signature = JSON.stringify([next, state.supportsDocuments, state.diagnostics]);
      if (refresh && workspace?.isConnected && renderedState === signature) {
        updateEditorControls();
        return;
      }
      rememberView();
      const focusKey = container.contains(document.activeElement) ? document.activeElement.dataset.focusKey
        : document.activeElement === document.body ? initiatingFocusKey : undefined;
      artifacts = next;
      supportsDocuments = state.supportsDocuments === true;
      renderedState = signature;
      disposeSplitPane?.();
      buttons.clear(container);
      container.replaceChildren();
      renderWorkspace(state.diagnostics);
      container.scrollTop = panelScroll;
      restoreFocusKey = focusKey;
    } catch (cause) {
      if (isActive() && version === loadVersion) {
        loading?.remove();
        error(container, "Could not refresh saved files: " + cause.message);
        if (!container.querySelector(".build-refresh")) {
          renderRefreshButton(container);
        }
      }
    } finally {
      if (version === loadVersion) {
        refreshing = false;
        setRefreshDisabled(false);
        if (restoreFocusKey) [...container.querySelectorAll("[data-focus-key]")]
          .find((node) => node.dataset.focusKey === restoreFocusKey && node.checkVisibility())?.focus({ preventScroll: true });
      }
    }
  }
  function renderRefreshButton(parent) {
    const refresh = buttons.create({
      className: "build-refresh", appearance: "subtle", size: "small", disabled: refreshing,
      icon: fileIcon("refresh"), "aria-label": "Refresh source", title: "Refresh source",
      "data-focus-key": "refresh", onClick: () => show({ refresh: true }),
    });
    buttons.append(parent, refresh);
  }
  function setRefreshDisabled(disabled) {
    for (const control of container.querySelectorAll(".build-refresh")) buttons.setDisabled(control, disabled);
  }
  function scheduleRefresh() {
    if (!isActive() || document.visibilityState === "hidden") return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (isActive()) void show({ refresh: true }); }, 100);
  }
  window.addEventListener("focus", scheduleRefresh);
  document.addEventListener("visibilitychange", scheduleRefresh);
  function hide() {
    loadVersion++;
    clearTimeout(refreshTimer);
    refreshing = false;
    setRefreshDisabled(false);
    rememberView();
    restoreOnShow = true;
    disposeSplitPane?.();
  }
  return { show, hide, setEditorSettings };
}
