import { ACTION_BUTTON_STYLE, FORM_CONTROL_STYLE } from "./control-styles.mjs";

export const BUILD_PANEL_CSS = `
#details[data-mode="build"] { display:flex; flex-direction:column; padding:0; font:13px/1.5 var(--font-sans,system-ui); }
#details[data-mode="build"] h2 { margin:0; font-size:16px; }
#details[data-mode="build"] p { color:var(--text-color-muted,#6a6775); font-size:12px; }
#details[data-mode="build"] .build-workspace { --build-explorer-width:220px; position:relative; display:grid; grid-template-columns:var(--build-explorer-width) 8px minmax(0,1fr); flex:1; min-height:320px; }
#details[data-mode="build"] .build-workspace[data-compact="true"] { grid-template-columns:minmax(0,1fr); }
#details[data-mode="build"] .build-workspace[data-files-visible="false"] { grid-template-columns:40px minmax(0,1fr); }
#details[data-mode="build"] .build-workspace[data-files-visible="false"] .build-editor { grid-column:2; grid-row:1; }
#details[data-mode="build"] .build-explorer { min-width:0; min-height:0; overflow:auto; background:var(--surface-muted,var(--background-color-default,#fff)); }
#details[data-mode="build"] .build-explorer-header { position:sticky; top:0; z-index:1; padding:12px; background:inherit; }
#details[data-mode="build"] .build-explorer-title { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
#details[data-mode="build"] .build-explorer h3 { min-width:0; margin:0; font-size:12px; }
#details[data-mode="build"] .build-files-toggle { flex:none; width:28px; min-width:28px; height:28px; min-height:28px; padding:5px; }
#details[data-mode="build"] .build-explorer-title .build-files-toggle { margin-inline-start:auto; }
#details[data-mode="build"] .build-files-toggle svg { width:16px; height:16px; flex:none; }
#details[data-mode="build"] .build-explorer-reopen { grid-column:1; grid-row:1; display:flex; flex-direction:column; align-items:center; box-sizing:border-box; min-height:0; padding:12px 0; border-inline-end:1px solid var(--border-color-default,#ddd); background:var(--surface-muted,var(--background-color-default,#fff)); }
#details[data-mode="build"] .build-splitter { position:relative; min-width:8px; cursor:col-resize; touch-action:none; user-select:none; }
#details[data-mode="build"] .build-splitter::before { content:""; position:absolute; inset-block:0; inset-inline-start:50%; width:1px; background:var(--border-color-default,#ddd); transform:translateX(-50%); }
#details[data-mode="build"] .build-splitter::after { content:""; position:absolute; inset-block-start:50%; inset-inline-start:50%; width:4px; height:4px; border-radius:50%; color:var(--text-color-muted,#6a6775); background:currentColor; box-shadow:0 -7px 0 currentColor,0 7px 0 currentColor; transform:translate(-50%,-50%); }
#details[data-mode="build"] .build-splitter:hover::before,
#details[data-mode="build"] .build-splitter:focus-visible::before { width:3px; background:var(--true-color-blue,#007acc); }
#details[data-mode="build"] .build-splitter:hover::after,
#details[data-mode="build"] .build-splitter:focus-visible::after { color:var(--true-color-blue,#007acc); }
#details[data-mode="build"] .build-workspace[data-resizing="true"] { cursor:col-resize; user-select:none; }
#details[data-mode="build"] .build-area-list { display:flex; flex-direction:column; gap:20px; padding:0 8px 12px; }
#details[data-mode="build"] .build-area-header { display:flex; align-items:center; gap:8px; box-sizing:border-box; min-height:32px; padding:4px 8px; border-radius:6px; list-style:none; cursor:pointer; }
#details[data-mode="build"] .build-area-header::-webkit-details-marker { display:none; }
#details[data-mode="build"] .build-area-header:hover { background:var(--background-color-default,#fff); }
#details[data-mode="build"] .build-area-header h4 { flex:1; min-width:0; margin:0; font-size:12px; overflow-wrap:anywhere; }
#details[data-mode="build"] .build-area-chevron { flex:none; width:12px; height:12px; }
#details[data-mode="build"] .build-area[open] > .build-area-header .build-area-chevron { transform:rotate(90deg); }
#details[data-mode="build"] .build-file-list { display:flex; flex-direction:column; gap:2px; list-style:none; margin:0; padding:0 0 0 8px; }
#details[data-mode="build"] .build-file-list .build-file-button { display:grid; grid-template-columns:16px minmax(0,1fr); align-items:start; gap:2px 8px; width:100%; min-width:0; padding:6px 8px; border:1px solid transparent; border-radius:6px; background:transparent; color:var(--text-color-default,#222); text-align:left; white-space:normal; }
#details[data-mode="build"] .build-file-button:hover { background:var(--background-color-default,#fff); border-color:var(--border-color-default,#ddd); }
#details[data-mode="build"] .build-file-button[aria-current="true"] { background:var(--true-color-blue-muted,#e4f1fc); border-color:var(--true-color-blue,#007acc); }
#details[data-mode="build"] .build-file-button svg { width:16px; height:16px; margin-top:1px; }
#details[data-mode="build"] .build-file-name { font:12px/1.5 var(--font-mono,monospace); overflow-wrap:anywhere; }
#details[data-mode="build"] .build-file-location { grid-column:2; color:var(--text-color-muted,#6a6775); font-size:11px; font-weight:400; overflow-wrap:anywhere; }
#details[data-mode="build"] :is(.build-area-status,.build-file-status) { font-size:11px; font-weight:600; color:var(--true-color-blue,#007acc); }
#details[data-mode="build"] .build-file-status { grid-column:2; }
#details[data-mode="build"] .build-empty { max-width:480px; padding:24px; }
#details[data-mode="build"] .build-editor { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:auto; padding:16px; }
#details[data-mode="build"] .build-file { display:flex; flex-direction:column; flex:1; min-width:0; }
#details[data-mode="build"] .build-file-heading { display:flex; align-items:baseline; flex-wrap:wrap; gap:8px; justify-content:space-between; }
#details[data-mode="build"] .build-file h3 { margin:0; font-size:14px; overflow-wrap:anywhere; }
#details[data-mode="build"] .build-language { color:var(--text-color-muted,#6a6775); font-size:11px; }
#details[data-mode="build"] .build-file > p { margin:4px 0 8px; }
#details[data-mode="build"] .build-discovery { padding:8px 12px; border-top:1px solid var(--border-color-default,#ddd); font-size:11px; }
#details[data-mode="build"] .build-discovery > summary { cursor:pointer; color:var(--text-color-muted,#6a6775); }
#details[data-mode="build"] > .build-warning, #details[data-mode="build"] > .build-error, #details[data-mode="build"] > .build-loading { margin:8px 12px; }
#details[data-mode="build"] code { display:block; overflow-wrap:anywhere; font-size:11px; margin:6px 0; }
#details[data-mode="build"] .build-actions { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; }
#details[data-mode="build"] button { ${ACTION_BUTTON_STYLE} }
#details[data-mode="build"] :is(button,input,textarea,select,summary):focus-visible { outline:2px solid var(--true-color-blue,#007acc); outline-offset:2px; }
#details[data-mode="build"] .code-edit { color:var(--true-color-blue,#007acc); border-color:currentColor; background:var(--background-color-default,#fff); }
#details[data-mode="build"] .code-edit svg { width:16px; height:16px; flex:none; fill:currentColor; }
#details[data-mode="build"] .build-editor-controls { display:flex; align-items:center; flex-wrap:wrap; gap:6px; min-width:0; }
#details[data-mode="build"] .build-editor-split { display:inline-flex; align-items:stretch; max-width:100%; }
#details[data-mode="build"] .build-editor-split .code-edit { border:1px solid currentColor; border-radius:6px 0 0 6px; }
#details[data-mode="build"] .build-editor-picker { position:relative; display:inline-flex; align-items:center; justify-content:center; flex:none; box-sizing:border-box; width:28px; height:32px; border:1px solid currentColor; border-inline-start:0; border-radius:0 6px 6px 0; color:var(--true-color-blue,#007acc); background:var(--background-color-default,#fff); }
#details[data-mode="build"] .build-editor-picker svg { width:14px; height:14px; pointer-events:none; }
/* Keep the native picker and keyboard behavior beneath the compact chevron. */
#details[data-mode="build"] .build-editor-picker .build-editor-select { position:absolute; inset-block:-1px; inset-inline:0 -1px; width:auto; height:auto; min-height:0; padding:0; opacity:0; cursor:pointer; }
#details[data-mode="build"] .build-editor-picker:focus-within { outline:2px solid var(--true-color-blue,#007acc); outline-offset:2px; }
#details[data-mode="build"] .build-editor-split > :is(.code-edit:hover:not(:disabled),.build-editor-picker:hover:not([data-disabled="true"])) { background:var(--true-color-blue-muted,#e4f1fc); }
#details[data-mode="build"] .build-editor-split > :is(.code-edit:disabled,.build-editor-picker[data-disabled="true"]) { opacity:.65; cursor:not-allowed; }
#details[data-mode="build"] .build-editor-picker .build-editor-select:disabled { cursor:not-allowed; }
#details[data-mode="build"] .build-editor-feedback { flex-basis:100%; margin:0; font-size:11px; }
#details[data-mode="build"] textarea, #details[data-mode="build"] select { width:100%; min-width:0; box-sizing:border-box; padding:10px; border:1px solid var(--border-color-default,#ddd); border-radius:8px; color:var(--text-color-default,#222); background:var(--background-color-default,#fff); }
#details[data-mode="build"] textarea { flex:1; min-height:240px; resize:vertical; tab-size:2; font:12px/1.6 var(--font-mono,monospace); }
#details[data-mode="build"] select { ${FORM_CONTROL_STYLE} }
#details[data-mode="build"] pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:300px; overflow:auto; font:12px/1.5 var(--font-mono,monospace); padding:10px; border:1px solid var(--border-color-default,#ddd); border-radius:8px; }
#details[data-mode="build"] .build-review { display:flex; flex:1; flex-direction:column; min-width:0; min-height:240px; }
#details[data-mode="build"] .build-review-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
#details[data-mode="build"] .build-review-summary { display:flex; gap:10px; margin-inline-start:auto; font:11px/1.4 var(--font-mono,monospace); }
#details[data-mode="build"] .build-review-additions { color:var(--true-color-green,#137333); }
#details[data-mode="build"] .build-review-deletions { color:var(--true-color-red,#c43232); }
#details[data-mode="build"] .build-diff { flex:1; height:0; min-width:0; min-height:240px; overflow:auto; border:1px solid var(--border-color-default,#ddd); border-radius:8px; color:var(--text-color-default,#222); background:var(--background-color-default,#fff); font:12px/1.6 var(--font-mono,monospace); }
#details[data-mode="build"] .build-diff:focus-within { outline:2px solid var(--true-color-blue,#007acc); outline-offset:2px; }
#details[data-mode="build"] .build-diff-hunk { width:max-content; min-width:100%; }
#details[data-mode="build"] .build-diff-hunk-header { padding:4px 8px; color:var(--text-color-muted,#6a6775); background:var(--surface-muted,#f0f3f8); border-block:1px solid var(--border-color-default,#ddd); }
#details[data-mode="build"] .build-diff-row { display:grid; grid-template-columns:5ch 5ch 2ch auto; width:max-content; min-width:100%; }
#details[data-mode="build"] .build-diff-line-number { padding:0 4px; color:var(--text-color-muted,#6a6775); text-align:right; user-select:none; }
#details[data-mode="build"] .build-diff-marker { text-align:center; user-select:none; }
#details[data-mode="build"] .build-diff-text { padding-inline-end:12px; white-space:pre; }
#details[data-mode="build"] .build-diff-removed { background:color-mix(in srgb,var(--true-color-red,#c43232) 14%,var(--background-color-default,#fff)); }
#details[data-mode="build"] .build-diff-added { background:color-mix(in srgb,var(--true-color-green,#137333) 14%,var(--background-color-default,#fff)); }
#details[data-mode="build"] .build-diff-gap { padding:4px 8px; color:var(--text-color-muted,#6a6775); font:11px/1.5 var(--font-sans,system-ui); }
#details[data-mode="build"] .build-diff-notice { color:var(--text-color-muted,#6a6775); font-style:italic; }
#details[data-mode="build"] .build-source-editor { --build-line-gutter-width:44px; position:relative; flex:1; min-height:240px; overflow:hidden; border:1px solid var(--border-color-default,#ddd); border-radius:8px; background:var(--background-color-default,#fff); }
#details[data-mode="build"] .build-source-editor:focus-within { outline:2px solid var(--true-color-blue,#007acc); outline-offset:2px; }
#details[data-mode="build"] .build-source-editor :is(textarea,.build-highlight) { position:absolute; inset:0; inset-inline-start:var(--build-line-gutter-width); box-sizing:border-box; border:0; border-radius:0; margin:0; padding:12px; white-space:pre; overflow-wrap:normal; tab-size:4; font:12px/1.6 var(--font-mono,monospace); font-variant-ligatures:none; letter-spacing:normal; text-align:left; direction:ltr; }
#details[data-mode="build"] .build-source-editor textarea { width:calc(100% - var(--build-line-gutter-width)); height:100%; min-height:0; resize:none; z-index:1; color:transparent; caret-color:var(--text-color-default,#222); background:transparent; outline:none; }
#details[data-mode="build"] .build-source-editor .build-line-numbers { position:absolute; inset-block:0; inset-inline-start:0; box-sizing:border-box; width:var(--build-line-gutter-width); max-height:none; margin:0; padding:12px 8px; overflow:hidden; border:0; border-inline-end:1px solid var(--border-color-default,#ddd); border-radius:0; color:var(--text-color-muted,#6a6775); background:var(--surface-muted,var(--background-color-default,#fff)); font:12px/1.6 var(--font-mono,monospace); white-space:pre; text-align:right; direction:ltr; user-select:none; pointer-events:none; }
#details[data-mode="build"] .build-source-editor textarea::selection { color:transparent; background:color-mix(in srgb,var(--true-color-blue,#007acc) 25%,transparent); }
#details[data-mode="build"] .build-source-editor .build-highlight { max-height:none; overflow:hidden; pointer-events:none; color:var(--text-color-default,#222); background:transparent; }
#details[data-mode="build"] .build-highlight .token { font:inherit; letter-spacing:inherit; }
#details[data-mode="build"] .build-highlight :is(.comment,.prolog,.doctype,.cdata) { color:var(--text-color-muted,#6a6775); }
#details[data-mode="build"] .build-highlight :is(.keyword,.property,.tag,.selector,.atrule,.important) { color:var(--true-color-purple,#6b3fd6); }
#details[data-mode="build"] .build-highlight :is(.string,.char,.attr-value,.regex,.inserted) { color:var(--true-color-green,#137333); }
#details[data-mode="build"] .build-highlight :is(.number,.boolean,.constant,.symbol,.builtin) { color:var(--true-color-orange,#a66700); }
#details[data-mode="build"] .build-highlight :is(.function,.class-name,.attr-name,.title) { color:var(--true-color-blue,#007acc); }
#details[data-mode="build"] .build-highlight .deleted { color:var(--true-color-red,#c43232); }
#details[data-mode="build"] .build-source-editor:is([data-highlight="false"],[data-composing="true"]) textarea { color:var(--text-color-default,#222); }
#details[data-mode="build"] .build-source-editor:is([data-highlight="false"],[data-composing="true"]) .build-highlight { visibility:hidden; }
@media (forced-colors:active) {
  #details[data-mode="build"] .build-editor-picker:focus-within { outline-color:Highlight; }
  #details[data-mode="build"] .build-splitter::before { background:ButtonText; }
  #details[data-mode="build"] .build-splitter::after { color:ButtonText; }
  #details[data-mode="build"] .build-splitter:hover::before,
  #details[data-mode="build"] .build-splitter:focus-visible::before { background:Highlight; }
  #details[data-mode="build"] .build-splitter:hover::after,
  #details[data-mode="build"] .build-splitter:focus-visible::after { color:Highlight; }
  #details[data-mode="build"] .build-source-editor textarea { color:CanvasText; caret-color:CanvasText; }
  #details[data-mode="build"] .build-source-editor textarea::selection { color:HighlightText; background:Highlight; }
  #details[data-mode="build"] .build-source-editor .build-highlight { visibility:hidden; }
}
#details[data-mode="build"] .build-warning { color:var(--true-color-orange,#a66700); }
#details[data-mode="build"] .build-error { color:var(--true-color-red,#c43232); }
#details[data-mode="build"] .build-error:empty { display:none; }
#details[data-mode="build"] [hidden] { display:none; }
`;

export function createBuildPanel({ container, root, request, isActive, onRun, onModel, syntax, editorSettings: initialEditorSettings }) {
  const areas = [
    { id: "behavior", label: "Agent behavior", description: "Shape what your agent should do and how it responds." },
    { id: "tools", label: "Tools & contracts", description: "Customize the actions your agent can use and their input contracts." },
    { id: "runtime", label: "Runtime", description: "Adjust the execution settings and app configuration recognized in this workspace." },
    { id: "policies", label: "Policies & limits", description: "Review developer-owned rules and limits separately from model instructions." },
  ];
  const supportedEditors = [
    { id: "vscode", label: "VS Code" },
    { id: "vscode-insiders", label: "VS Code Insiders" },
    { id: "cursor", label: "Cursor" },
    { id: "windsurf", label: "Windsurf" },
    { id: "zed", label: "Zed" },
    { id: "sublime", label: "Sublime Text" },
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
  const drafts = new Map();
  const pendingSaves = new Set();
  const pendingEditorLaunches = new Set();
  const saveFeedback = new Map();
  const areaGroups = new Map();
  const collapsedAreas = new Set();
  const fileButtons = new Map();
  const explorerMinWidth = 176;
  const explorerMaxWidth = 460;
  const editorMinWidth = 320;
  const splitterWidth = 8;
  let artifacts = [];
  let supportsDocuments = false;
  let loadVersion = 0;
  let selectedId;
  let explorerCollapsed = false;
  let compactFilesVisible = false;
  let explorerPreferredWidth = 220;
  let confirmedEditorSettings = normalizeEditorSettings(initialEditorSettings);
  let currentEditorSettings = confirmedEditorSettings;
  let editorSettingsSaving = false;
  let editorSettingsVersion = 0;
  let editorSettingsFeedback;
  let workspace, explorer, editorPane, areaList, filesToggle;
  let explorerTitle, explorerReopen, explorerSplitter;
  let sourceLayoutObserver;
  let cleanupReview;
  function element(tag, text, parent, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    parent?.append(node);
    return node;
  }
  function button(parent, label, action) {
    const control = element("button", label, parent);
    control.type = "button";
    control.addEventListener("click", action);
    return control;
  }
  function error(parent, message) {
    let node = parent.querySelector(".build-error:not(.build-syntax-error)");
    if (!node) node = element("p", "", parent, "build-error");
    node.setAttribute("role", "alert");
    node.textContent = message;
  }
  function selectedEditorLabel() {
    return currentEditorSettings.editors.find((editor) => editor.id === currentEditorSettings.editorId)?.label
      ?? supportedEditors.find((editor) => editor.id === currentEditorSettings.editorId)?.label
      ?? "editor";
  }
  function updateEditorControls() {
    for (const select of container.querySelectorAll("[data-editor-select]")) {
      select.replaceChildren();
      for (const editor of currentEditorSettings.editors) {
        const option = element("option", editor.label, select);
        option.value = editor.id;
      }
      select.value = currentEditorSettings.editorId;
      select.disabled = editorSettingsSaving;
      select.title = "Choose code editor (current: " + selectedEditorLabel() + ")";
      select.parentElement.dataset.disabled = String(editorSettingsSaving);
    }
    for (const control of container.querySelectorAll("[data-editor-launch]")) {
      const label = control.querySelector(".build-editor-launch-label");
      if (label) label.textContent = selectedEditorLabel();
      control.setAttribute("aria-label", "Open in " + selectedEditorLabel());
      control.title = "Open in " + selectedEditorLabel();
      control.disabled = editorSettingsSaving || pendingEditorLaunches.has(control.dataset.artifactId);
    }
    for (const feedback of container.querySelectorAll("[data-editor-feedback]")) {
      feedback.textContent = editorSettingsFeedback?.message ?? "";
      feedback.hidden = !editorSettingsFeedback?.message;
      if (editorSettingsFeedback?.error) feedback.setAttribute("role", "alert");
      else feedback.removeAttribute("role");
    }
  }
  function isCompact() { return container.getBoundingClientRect().width < 600; }
  function availableExplorerWidth() {
    if (!workspace?.isConnected) return explorerMaxWidth;
    return Math.max(explorerMinWidth, Math.min(explorerMaxWidth,
      workspace.clientWidth - editorMinWidth - splitterWidth));
  }
  function applyExplorerWidth() {
    if (!workspace?.isConnected) return;
    const maximum = availableExplorerWidth();
    const effective = Math.min(Math.max(explorerPreferredWidth, explorerMinWidth), maximum);
    workspace.style.setProperty("--build-explorer-width", effective + "px");
    if (explorerSplitter) {
      explorerSplitter.setAttribute("aria-valuemin", String(explorerMinWidth));
      explorerSplitter.setAttribute("aria-valuemax", String(Math.round(maximum)));
      explorerSplitter.setAttribute("aria-valuenow", String(Math.round(effective)));
      explorerSplitter.setAttribute("aria-valuetext", `${Math.round(effective)} pixels`);
    }
  }
  function updateExplorerVisibility() {
    if (!workspace?.isConnected || !isActive()) return;
    const compact = isCompact();
    const visible = compact ? compactFilesVisible : !explorerCollapsed;
    workspace.dataset.compact = String(compact);
    workspace.dataset.filesVisible = String(visible);
    explorer.hidden = !visible;
    editorPane.hidden = compact && visible;
    explorerSplitter.hidden = compact || !visible;
    if (visible) {
      explorerTitle.append(filesToggle);
      explorerReopen.hidden = true;
    } else {
      explorerReopen.append(filesToggle);
      explorerReopen.hidden = false;
    }
    const label = visible ? (compact ? "Back to file" : "Hide key files") : "Show key files";
    filesToggle.setAttribute("aria-label", label);
    filesToggle.title = label;
    const toggleIcon = visible
      ? '<rect x="1.5" y="2" width="13" height="12" rx="1.5"/><path d="M6 2v12m5.5-8-2 2 2 2"/>'
      : '<path d="M2 4h12M2 8h12M2 12h12"/><circle cx="5" cy="4" r="1.5" fill="var(--surface-muted)"/><circle cx="10" cy="8" r="1.5" fill="var(--surface-muted)"/><circle cx="6" cy="12" r="1.5" fill="var(--surface-muted)"/>';
    filesToggle.innerHTML = '<svg data-icon="' + (visible ? "collapse-sidebar" : "customize") +
      '" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + toggleIcon + '</svg>';
    filesToggle.setAttribute("aria-expanded", String(visible));
    applyExplorerWidth();
  }
  function updateFileStates() {
    function statusFor(artifact) {
      return pendingSaves.has(artifact.id) ? "Saving"
        : saveFeedback.get(artifact.id)?.error ? "Save failed"
          : drafts.has(artifact.id) ? "Unsaved" : "";
    }
    for (const artifact of artifacts) {
      const entry = fileButtons.get(artifact.id);
      if (!entry) continue;
      const status = statusFor(artifact);
      entry.button.setAttribute("aria-current", String(artifact.id === selectedId));
      entry.button.setAttribute("aria-label", artifact.path + (status ? ", " + status : ""));
      entry.status.textContent = status;
      entry.status.hidden = !status;
    }
    for (const area of areas) {
      const entry = areaGroups.get(area.id);
      if (!entry) continue;
      const members = artifacts.filter((artifact) => artifact.customizationArea === area.id);
      const statuses = members.map(statusFor);
      const status = ["Saving", "Save failed", "Unsaved"].find((value) => statuses.includes(value)) ?? "";
      const label = area.label + (status ? ", " + status : "");
      entry.group.setAttribute("aria-label", label);
      entry.header.setAttribute("aria-label", label);
      entry.status.textContent = status;
      entry.status.hidden = !status;
    }
  }
  function rememberAreaVisibility() {
    for (const [id, { group }] of areaGroups) {
      if (!group.isConnected) continue;
      if (group.open) collapsedAreas.delete(id);
      else collapsedAreas.add(id);
    }
  }
  function renderCustomizations() {
    areaList.replaceChildren();
    areaGroups.clear();
    fileButtons.clear();
    for (const area of areas) {
      const members = artifacts.filter((artifact) => artifact.customizationArea === area.id);
      if (!members.length) continue;
      const group = element("details", undefined, areaList, "build-area");
      group.dataset.areaId = area.id;
      group.setAttribute("role", "group");
      group.open = !collapsedAreas.has(area.id);
      group.addEventListener("toggle", rememberAreaVisibility);
      const header = element("summary", undefined, group, "build-area-header");
      header.innerHTML = '<svg class="build-area-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>';
      element("h4", area.label, header);
      const status = element("span", "", header, "build-area-status");
      status.setAttribute("aria-hidden", "true");
      areaGroups.set(area.id, { group, header, status });
      const list = element("ul", undefined, group, "build-file-list");
      for (const artifact of members) {
        const item = element("li", undefined, list);
        const control = button(item, "", () => {
          if (selectedId !== artifact.id) {
            selectedId = artifact.id;
            renderSelectedArtifact();
            updateFileStates();
          }
          if (isCompact()) {
            compactFilesVisible = false;
            updateExplorerVisibility();
            editorPane.querySelector("h3")?.focus();
          }
        });
        control.className = "build-file-button";
        control.dataset.fileId = artifact.id;
        control.title = artifact.title + " — " + artifact.path;
        control.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"><path d="M9.5 1.5h-6v13h9V5zm0 0V5h3"/></svg>';
        const parts = artifact.path.split("/");
        element("span", parts.pop(), control, "build-file-name");
        if (parts.length) element("span", parts.join("/"), control, "build-file-location");
        const fileStatus = element("span", "", control, "build-file-status");
        fileStatus.setAttribute("aria-hidden", "true");
        fileButtons.set(artifact.id, { button: control, status: fileStatus });
      }
    }
    updateFileStates();
  }
  function renderSelectedArtifact() {
    cleanupReview?.();
    cleanupReview = undefined;
    sourceLayoutObserver?.disconnect();
    editorPane.replaceChildren();
    editorPane.scrollTop = 0;
    const artifact = artifacts.find((item) => item.id === selectedId);
    if (artifact) renderArtifact(artifact);
  }
  function renderArtifact(artifact) {
    const card = element("section", undefined, editorPane, "build-file");
    card.dataset.artifact = artifact.id;
    const area = areas.find((item) => item.id === artifact.customizationArea);
    const fileHeading = element("div", undefined, card, "build-file-heading");
    const heading = element("h3", area.label, fileHeading);
    heading.tabIndex = -1;
    const language = syntax?.languageForPath(artifact.path) ?? { id: "plain", label: "Plain text" };
    element("span", language.label, fileHeading, "build-language").setAttribute("aria-label", "Language: " + language.label);
    element("p", area.description, card);
    element("code", artifact.path, card);
    if (!artifact.available) {
      element("p", artifact.detail, card, "build-warning");
      if (!drafts.has(artifact.id)) return;
    }
    if (supportsDocuments && ["tool", "contract", "policy"].includes(artifact.id)) {
      element("p", "Developer-owned enforcement. Review changes, test, and rebuild cloud images before deployment.", card, "build-warning");
    }
    const actions = element("div", undefined, card, "build-actions");
    const source = element("div", undefined, card, "build-source-editor");
    source.dataset.language = language.id;
    const lineNumbers = element("pre", "", source, "build-line-numbers");
    lineNumbers.setAttribute("aria-hidden", "true");
    const highlight = element("pre", "", source, "build-highlight");
    highlight.setAttribute("aria-hidden", "true");
    const editor = element("textarea", undefined, source);
    editor.rows = 16;
    editor.wrap = "off";
    editor.setAttribute("aria-label", artifact.title + " source");
    editor.spellcheck = false;
    editor.readOnly = !artifact.available;
    editor.setAttribute("autocapitalize", "off");
    editor.setAttribute("autocorrect", "off");
    editor.value = drafts.get(artifact.id)?.content ?? artifact.content;
    let highlightFrame, syntaxError;
    let displayedLineCount = 0;
    function updateLineNumbers() {
      const count = (editor.value.match(/\n/g)?.length ?? 0) + 1;
      if (count !== displayedLineCount) {
        lineNumbers.textContent = Array.from({ length: count }, (_, index) => String(index + 1)).join("\n");
        source.style.setProperty("--build-line-gutter-width", `calc(${Math.max(3, String(count).length)}ch + 20px)`);
        displayedLineCount = count;
      }
      lineNumbers.scrollTop = editor.scrollTop;
    }
    function syncHighlight() {
      highlight.style.width = editor.clientWidth + "px";
      highlight.style.height = editor.clientHeight + "px";
      highlight.scrollTop = editor.scrollTop;
      highlight.scrollLeft = editor.scrollLeft;
      lineNumbers.scrollTop = editor.scrollTop;
    }
    function refreshHighlight() {
      highlightFrame = null;
      if (!card.isConnected || source.dataset.composing === "true") return;
      try {
        if (!syntax) throw new Error("The bundled highlighter did not load.");
        // A final newline needs a following glyph to occupy the textarea's last line.
        highlight.innerHTML = syntax.highlight(editor.value + (editor.value.endsWith("\n") ? " " : ""), artifact.path);
        source.dataset.highlight = "true";
        syntaxError?.remove();
        syntaxError = null;
        syncHighlight();
      } catch (cause) {
        source.dataset.highlight = "false";
        if (!syntaxError) syntaxError = element("p", "", card, "build-error build-syntax-error");
        syntaxError.setAttribute("role", "alert");
        syntaxError.textContent = "Syntax highlighting is unavailable: " + cause.message + " Plain text editing is still available.";
      }
    }
    function queueHighlight() {
      if (!highlightFrame) highlightFrame = requestAnimationFrame(refreshHighlight);
    }
    editor.addEventListener("scroll", syncHighlight);
    editor.addEventListener("compositionstart", () => { source.dataset.composing = "true"; });
    editor.addEventListener("compositionend", () => { source.dataset.composing = "false"; queueHighlight(); });
    sourceLayoutObserver = new ResizeObserver(syncHighlight);
    sourceLayoutObserver.observe(editor);
    updateLineNumbers();
    refreshHighlight();
    function rememberDraft() {
      if (editor.value === artifact.content && !pendingSaves.has(artifact.id)) drafts.delete(artifact.id);
      else drafts.set(artifact.id, {
        content: editor.value, baseSha: drafts.get(artifact.id)?.baseSha ?? artifact.sha,
      });
      updateDiscardVisibility();
      saveFeedback.delete(artifact.id);
      updateFileStates();
      updateLineNumbers();
      queueHighlight();
    }
    editor.addEventListener("input", rememberDraft);
    const editorControls = element("div", undefined, actions, "build-editor-controls");
    const editorSplit = element("div", undefined, editorControls, "build-editor-split");
    editorSplit.setAttribute("role", "group");
    editorSplit.setAttribute("aria-label", "Code editor");
    const code = button(editorSplit, "", async () => {
      pendingEditorLaunches.add(artifact.id);
      updateEditorControls();
      error(card, "");
      try {
        const opened = await request("/api/open-build-file", {
          method: "POST", body: JSON.stringify({ root, id: artifact.id }),
        });
        let notice = card.querySelector("[data-editor-notice]");
        if (!notice) {
          notice = element("p", "", card);
          notice.dataset.editorNotice = "true";
        }
        notice.textContent = "Opened the worktree and file in " + (opened.editorLabel || selectedEditorLabel()) + "." +
          (drafts.has(artifact.id) ? " Your inline draft has not been saved." : "");
      } catch (cause) { error(card, cause.message); }
      finally {
        pendingEditorLaunches.delete(artifact.id);
        updateEditorControls();
      }
    });
    code.className = "code-edit";
    code.dataset.editorLaunch = "true";
    code.dataset.artifactId = artifact.id;
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M8.7 5.3 2 12l6.7 6.7 1.4-1.4L4.8 12l5.3-5.3zm6.6 0-1.4 1.4 5.3 5.3-5.3 5.3 1.4 1.4L22 12z");
    icon.append(path);
    code.prepend(icon);
    element("span", "", code, "build-editor-launch-label");
    const picker = element("span", undefined, editorSplit, "build-editor-picker");
    picker.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4"/></svg>';
    const editorSelect = element("select", undefined, picker, "build-editor-select");
    editorSelect.dataset.editorSelect = "true";
    editorSelect.setAttribute("aria-label", "Supported editor");
    const editorFeedback = element("p", "", editorControls, "build-editor-feedback");
    editorFeedback.dataset.editorFeedback = "true";
    editorFeedback.hidden = true;
    editorSelect.addEventListener("change", async () => {
      const editorId = editorSelect.value;
      if (editorSettingsSaving || editorId === confirmedEditorSettings.editorId) {
        updateEditorControls();
        return;
      }
      currentEditorSettings = { ...currentEditorSettings, editorId };
      editorSettingsSaving = true;
      editorSettingsVersion++;
      editorSettingsFeedback = undefined;
      updateEditorControls();
      try {
        const settings = await request("/api/editor-settings", {
          method: "POST", body: JSON.stringify({ editorId }),
        });
        confirmedEditorSettings = normalizeEditorSettings(settings);
        currentEditorSettings = confirmedEditorSettings;
      } catch (cause) {
        currentEditorSettings = confirmedEditorSettings;
        editorSettingsFeedback = {
          error: true,
          message: "Could not save editor preference: " + cause.message,
        };
      } finally {
        editorSettingsSaving = false;
        editorSettingsVersion++;
        updateEditorControls();
      }
    });
    updateEditorControls();
    const review = element("div", undefined, card, "build-review");
    review.hidden = true;
    const reviewFeedback = element("div", undefined, card, "build-review-feedback");
    let reviewing = false;
    let reviewRequestVersion = 0;
    function stopReview() {
      reviewRequestVersion++;
    }
    cleanupReview = () => {
      stopReview();
      if (highlightFrame) cancelAnimationFrame(highlightFrame);
    };
    function updateDiscardVisibility() {
      discard.hidden = reviewing || !drafts.has(artifact.id);
    }
    function showEditing(focusState) {
      stopReview();
      reviewing = false;
      review.hidden = true;
      source.hidden = false;
      reviewChanges.hidden = false;
      reviewChanges.textContent = "Review changes";
      reviewChanges.disabled = pendingSaves.has(artifact.id) || !artifact.available;
      updateDiscardVisibility();
      if (focusState && isActive() && editor.isConnected) {
        editor.focus({ preventScroll: true });
        editor.setSelectionRange(focusState.start, focusState.end, focusState.direction);
        editor.scrollTop = focusState.scrollTop;
        editor.scrollLeft = focusState.scrollLeft;
        syncHighlight();
      }
    }
    function validateDiff(diff) {
      if (!diff || !Array.isArray(diff.hunks) || !Number.isFinite(diff.additions) || !Number.isFinite(diff.deletions)) {
        throw new Error("The review response was invalid.");
      }
      for (const hunk of diff.hunks) {
        if (!Number.isFinite(hunk?.oldStart) || !Number.isFinite(hunk?.oldCount)
          || !Number.isFinite(hunk?.newStart) || !Number.isFinite(hunk?.newCount)
          || !Array.isArray(hunk?.lines)) throw new Error("The review response was invalid.");
        for (const line of hunk.lines) {
          if (!["context", "removed", "added", "notice"].includes(line?.kind)
            || (line.oldLine !== null && !Number.isFinite(line.oldLine))
            || (line.newLine !== null && !Number.isFinite(line.newLine))
            || typeof line.text !== "string") throw new Error("The review response was invalid.");
        }
      }
    }
    function renderDiff(diff, reviewed, reviewedBaseSha, focusState) {
      review.replaceChildren();
      reviewFeedback.replaceChildren();
      reviewing = true;
      source.hidden = true;
      reviewChanges.hidden = true;
      updateDiscardVisibility();
      let saveFailed = false;
      const toolbar = element("div", undefined, review, "build-review-toolbar");
      const back = button(toolbar, "Back to editing", () => showEditing(focusState));
      const save = button(toolbar, "Save reviewed changes", async () => {
        if (editor.value !== reviewed) {
          error(card, "The draft changed. Review the latest draft again before saving.");
          showEditing({
            start: editor.selectionStart, end: editor.selectionEnd, direction: editor.selectionDirection,
            scrollTop: editor.scrollTop, scrollLeft: editor.scrollLeft,
          });
          return;
        }
        if (artifact.sha !== reviewedBaseSha || (drafts.get(artifact.id)?.baseSha ?? artifact.sha) !== reviewedBaseSha) {
          error(card, "The saved file changed after this review. Discard the draft and reload before editing again.");
          save.disabled = true;
          return;
        }
        if (pendingSaves.has(artifact.id) || saveFailed) return;
        const saveContent = reviewed;
        const saveBaseSha = reviewedBaseSha;
        pendingSaves.add(artifact.id);
        saveFeedback.delete(artifact.id);
        reviewFeedback.replaceChildren();
        error(card, "");
        updateFileStates();
        save.disabled = true;
        reviewChanges.disabled = discard.disabled = true;
        try {
          const updated = await request("/api/build-file", {
            method: "POST", body: JSON.stringify({
              root, id: artifact.id, baseSha: saveBaseSha, content: saveContent,
            }),
          });
          Object.assign(artifact, updated, { customizationArea: artifact.customizationArea });
          const currentArtifact = artifacts.find((item) => item.id === artifact.id);
          if (currentArtifact) Object.assign(currentArtifact, updated, { customizationArea: currentArtifact.customizationArea });
          const draft = drafts.get(artifact.id);
          if (draft && draft.content !== updated.content) {
            drafts.set(artifact.id, { ...draft, baseSha: updated.sha });
          } else {
            drafts.delete(artifact.id);
          }
          showEditing(!review.hidden ? focusState : undefined);
          review.replaceChildren();
          const message = "Saved. Restart the app for runtime/code changes; rebuild cloud images before deployment." +
            (drafts.has(artifact.id) ? " Your newer edits are still unsaved. Review them before saving again." : "");
          saveFeedback.set(artifact.id, { message });
          element("p", message, reviewFeedback).setAttribute("role", "status");
        } catch (cause) {
          saveFeedback.set(artifact.id, { error: cause.message });
          error(card, cause.message);
          saveFailed = true;
          summary.textContent = "Return to editing and review before retrying.";
        }
        finally {
          pendingSaves.delete(artifact.id);
          reviewChanges.disabled = !artifact.available;
          discard.disabled = false;
          updateDiscardVisibility();
          updateFileStates();
          save.disabled = saveFailed || pendingSaves.has(artifact.id);
          if (isActive() && editorPane?.isConnected && !card.isConnected && selectedId === artifact.id) renderSelectedArtifact();
        }
      });
      const summary = element("div", undefined, toolbar, "build-review-summary");
      summary.setAttribute("role", "status");
      element("span", `+${diff.additions} ${diff.additions === 1 ? "addition" : "additions"}`, summary, "build-review-additions");
      element("span", `-${diff.deletions} ${diff.deletions === 1 ? "deletion" : "deletions"}`, summary, "build-review-deletions");
      if (supportsDocuments && ["tool", "contract", "policy"].includes(artifact.id)) {
        element("p", "Developer enforcement change. Test before use and rebuild cloud images before deployment.", review, "build-warning");
      }
      const diffView = element("div", undefined, review, "build-diff");
      diffView.tabIndex = 0;
      diffView.setAttribute("role", "region");
      diffView.setAttribute("aria-label", "Unified source changes");
      if (artifact.content.includes("\r\n") && !reviewed.includes("\r\n")) {
        element("p", "Draft line endings are LF; the saved file contains CRLF.", review, "build-diff-notice");
      }
      let previousHunk;
      for (const hunk of diff.hunks) {
        const omitted = previousHunk
          ? Math.max(0, hunk.oldStart - previousHunk.oldStart - previousHunk.oldCount)
          : Math.max(0, hunk.oldStart - 1);
        if (omitted) element("div", `${omitted} unchanged lines omitted`, diffView, "build-diff-gap");
        const block = element("div", undefined, diffView, "build-diff-hunk");
        element("div", `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`, block, "build-diff-hunk-header");
        for (const line of hunk.lines) {
          const row = element("div", undefined, block, "build-diff-row build-diff-" + line.kind);
          row.dataset.diffKind = line.kind;
          const kind = { added: "Added", removed: "Removed", context: "Unchanged", notice: "Notice" }[line.kind];
          row.setAttribute("role", "group");
          row.setAttribute("aria-label", kind + (line.newLine ?? line.oldLine ? " line " + (line.newLine ?? line.oldLine) : ""));
          element("span", line.oldLine === null ? "" : String(line.oldLine), row, "build-diff-line-number").setAttribute("aria-hidden", "true");
          element("span", line.newLine === null ? "" : String(line.newLine), row, "build-diff-line-number").setAttribute("aria-hidden", "true");
          element("span", { added: "+", removed: "-", context: " ", notice: "\\" }[line.kind], row, "build-diff-marker").setAttribute("aria-hidden", "true");
          element("span", line.text, row, "build-diff-text");
        }
        previousHunk = hunk;
      }
      review.hidden = false;
      back.focus();
    }
    const reviewChanges = button(actions, "Review changes", async () => {
      if (pendingSaves.has(artifact.id) || !artifact.available) return;
      reviewFeedback.replaceChildren();
      error(card, "");
      if (drafts.get(artifact.id)?.baseSha && drafts.get(artifact.id).baseSha !== artifact.sha) {
        error(card, "The saved file changed while you had an inline draft. Discard the draft and reload before editing again.");
        return;
      }
      if (editor.value === artifact.content) {
        element("p", "No changes to review.", reviewFeedback).setAttribute("role", "status");
        return;
      }
      const reviewed = editor.value;
      const reviewedBaseSha = drafts.get(artifact.id)?.baseSha ?? artifact.sha;
      const focusState = {
        start: editor.selectionStart, end: editor.selectionEnd, direction: editor.selectionDirection,
        scrollTop: editor.scrollTop, scrollLeft: editor.scrollLeft,
      };
      const version = ++reviewRequestVersion;
      reviewChanges.disabled = true;
      reviewChanges.textContent = "Preparing review...";
      try {
        const diff = await request("/api/build-diff", {
          method: "POST", body: JSON.stringify({
            root, id: artifact.id, baseSha: reviewedBaseSha, content: reviewed,
          }),
        });
        if (!card.isConnected || version !== reviewRequestVersion) return;
        validateDiff(diff);
        if (editor.value !== reviewed) {
          error(card, "The draft changed while the review was loading. Review the latest draft again.");
          editor.focus();
          return;
        }
        if (diff.baseSha !== reviewedBaseSha) {
          error(card, "The saved file changed while the review was loading. Discard the draft and reload before editing again.");
          editor.focus();
          return;
        }
        if (!diff.hunks.length) {
          element("p", "No changes to review.", reviewFeedback).setAttribute("role", "status");
          editor.focus();
          return;
        }
        renderDiff(diff, reviewed, reviewedBaseSha, focusState);
      } catch (cause) {
        if (card.isConnected && version === reviewRequestVersion) {
          if (reviewing) showEditing(focusState);
          error(card, "Could not prepare review: " + cause.message);
          editor.focus();
        }
      } finally {
        if (card.isConnected && version === reviewRequestVersion) {
          reviewChanges.textContent = "Review changes";
          reviewChanges.disabled = pendingSaves.has(artifact.id) || !artifact.available;
        }
      }
    });
    reviewChanges.disabled = pendingSaves.has(artifact.id) || !artifact.available;
    if (drafts.has(artifact.id) && drafts.get(artifact.id).baseSha !== artifact.sha) error(card, "The saved file changed in another editor. Your inline draft is preserved but cannot overwrite it.");
    const discard = button(actions, "Discard draft & reload", () => {
      drafts.delete(artifact.id);
      saveFeedback.delete(artifact.id);
      void show();
    });
    discard.disabled = pendingSaves.has(artifact.id);
    updateDiscardVisibility();
    if (supportsDocuments) button(actions, "Test with a document", onRun);
    const feedback = saveFeedback.get(artifact.id);
    if (feedback?.error) error(card, feedback.error);
    else if (feedback?.message) element("p", feedback.message, reviewFeedback).setAttribute("role", "status");
    if (supportsDocuments && artifact.id === "runtime") {
      try {
        const config = JSON.parse(editor.value);
        const select = element("select", undefined, card);
        select.setAttribute("aria-label", "Agent runtime");
        for (const [value, label] of [["local", "Local simulation (not isolated)"], ["copilot-sdk-sandbox", "Copilot SDK in ACA Sandbox"]]) {
          const option = element("option", label, select);
          option.value = value;
        }
        select.value = config.agentRuntime;
        select.addEventListener("change", () => {
          try {
            const next = JSON.parse(editor.value);
            next.agentRuntime = select.value;
            editor.value = JSON.stringify(next, null, 2) + "\n";
            rememberDraft();
          } catch (cause) { error(card, "Fix the runtime JSON before selecting a runtime: " + cause.message); }
        });
        element("p", config.agentRuntime === "copilot-sdk-sandbox"
          ? "Two separate ACA sandboxes: agent runtime and document validation tool. The agent harness remains local. Selection is not proof of deployment or isolation."
          : "Local subprocess simulation. Use synthetic documents only; there is no OS or network isolation.", card, "build-warning");
      } catch (cause) { error(card, "Invalid runtime configuration: " + cause.message); }
      button(actions, "Model connection", onModel);
    }
    if (!drafts.has(artifact.id) && Number.isInteger(artifact.focusLine) && artifact.focusLine > 1) {
      const offset = editor.value.split("\n").slice(0, artifact.focusLine - 1).join("\n").length + 1;
      editor.setSelectionRange(offset, offset);
      requestAnimationFrame(() => {
        if (!editor.isConnected || source.hidden) return;
        editor.scrollTop = Math.max(0, artifact.focusLine - 3) * parseFloat(getComputedStyle(editor).lineHeight);
        syncHighlight();
      });
    }
  }
  async function show() {
    const version = ++loadVersion;
    const settingsVersion = editorSettingsVersion;
    rememberAreaVisibility();
    sourceLayoutObserver?.disconnect();
    cleanupReview?.();
    cleanupReview = undefined;
    container.replaceChildren();
    areaGroups.clear();
    fileButtons.clear();
    const loading = element("p", "Loading app source...", container, "build-loading");
    loading.setAttribute("role", "status");
    try {
      const state = await request("/api/build-workspace?root=" + encodeURIComponent(root));
      if (!isActive() || version !== loadVersion) return;
      const previous = artifacts;
      const discovered = [...state.artifacts];
      for (const artifact of previous) {
        if (!drafts.has(artifact.id) && !pendingSaves.has(artifact.id)) continue;
        const current = discovered.find((item) => item.id === artifact.id);
        if (!current || !areas.some((area) => area.id === current.customizationArea)) {
          const retained = {
            ...artifact, ...current, customizationArea: artifact.customizationArea, available: false,
            detail: "This file is no longer a recognized customization point. Copy your draft before discarding it; it cannot be saved here.",
          };
          if (current) discovered[discovered.indexOf(current)] = retained;
          else discovered.push(retained);
        }
      }
      artifacts = discovered.filter((artifact) => areas.some((area) => area.id === artifact.customizationArea)
        && (artifact.available || drafts.has(artifact.id) || pendingSaves.has(artifact.id)));
      supportsDocuments = state.supportsDocuments === true;
      if (state.editorSettings && !editorSettingsSaving && settingsVersion === editorSettingsVersion) {
        confirmedEditorSettings = normalizeEditorSettings(state.editorSettings);
        currentEditorSettings = confirmedEditorSettings;
        editorSettingsFeedback = undefined;
      }
      loading.remove();
      for (const diagnostic of state.diagnostics ?? []) {
        element("p", (diagnostic.path ? diagnostic.path + ": " : "") + diagnostic.message, container, "build-warning");
      }
      if (!artifacts.length) {
        const empty = element("section", undefined, container, "build-empty");
        element("h2", "Key files", empty);
        element("p", "No supported customization points were found. Open the project in your editor for source changes; Build only shows recognized decision points.", empty);
        const open = button(empty, "Open in " + selectedEditorLabel(), async () => {
          open.disabled = true;
          error(empty, "");
          try {
            const result = await request("/api/open-editor", { method: "POST", body: JSON.stringify({ root }) });
            element("p", "Opened the worktree in " + (result.editorLabel || selectedEditorLabel()) + ".", empty).setAttribute("role", "status");
          } catch (cause) { error(empty, cause.message); }
          finally { open.disabled = false; }
        });
        return;
      }
      if (!artifacts.some((artifact) => artifact.id === selectedId)) {
        const firstArea = areas.find((area) => artifacts.some((artifact) => artifact.customizationArea === area.id));
        selectedId = (artifacts.find((artifact) => artifact.customizationArea === firstArea.id && artifact.available)
          ?? artifacts.find((artifact) => artifact.customizationArea === firstArea.id)).id;
      }
      workspace = element("div", undefined, container, "build-workspace");
      explorer = element("nav", undefined, workspace, "build-explorer");
      explorer.id = "build-explorer";
      explorer.setAttribute("aria-label", "Key files");
      const explorerHeader = element("div", undefined, explorer, "build-explorer-header");
      explorerTitle = element("div", undefined, explorerHeader, "build-explorer-title");
      element("h3", "Key files", explorerTitle);
      filesToggle = button(explorerTitle, "Hide key files", () => {
        if (isCompact()) compactFilesVisible = !compactFilesVisible;
        else explorerCollapsed = !explorerCollapsed;
        updateExplorerVisibility();
        if (!explorer.hidden) {
          const selected = explorer.querySelector('[aria-current="true"]');
          const group = selected?.closest(".build-area");
          (group && !group.open ? group.querySelector("summary") : selected)?.focus();
        }
      });
      filesToggle.className = "build-files-toggle";
      filesToggle.dataset.buildFilesToggle = "true";
      filesToggle.setAttribute("aria-controls", "build-explorer");
      areaList = element("div", undefined, explorer, "build-area-list");
      explorerSplitter = element("div", undefined, workspace, "build-splitter");
      explorerSplitter.tabIndex = 0;
      explorerSplitter.setAttribute("role", "separator");
      explorerSplitter.setAttribute("aria-orientation", "vertical");
      explorerSplitter.setAttribute("aria-label", "Resize key files");
      explorerSplitter.title = "Drag to resize navigation. Arrow keys also adjust the width.";
      let resize;
      function endResize(pointerId, releaseCapture) {
        if (!resize || resize.pointerId !== pointerId) return;
        resize = undefined;
        delete workspace.dataset.resizing;
        if (releaseCapture && explorerSplitter.hasPointerCapture(pointerId)) {
          try { explorerSplitter.releasePointerCapture(pointerId); } catch {}
        }
      }
      explorerSplitter.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || explorerSplitter.hidden) return;
        event.preventDefault();
        resize = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: explorer.getBoundingClientRect().width,
        };
        workspace.dataset.resizing = "true";
        try { explorerSplitter.setPointerCapture(event.pointerId); } catch {}
      });
      explorerSplitter.addEventListener("pointermove", (event) => {
        if (!resize || resize.pointerId !== event.pointerId) return;
        event.preventDefault();
        explorerPreferredWidth = Math.min(explorerMaxWidth, Math.max(explorerMinWidth,
          resize.startWidth + event.clientX - resize.startX));
        applyExplorerWidth();
      });
      explorerSplitter.addEventListener("pointerup", (event) => endResize(event.pointerId, true));
      explorerSplitter.addEventListener("pointercancel", (event) => endResize(event.pointerId, true));
      explorerSplitter.addEventListener("lostpointercapture", (event) => endResize(event.pointerId, false));
      explorerSplitter.addEventListener("selectstart", (event) => event.preventDefault());
      explorerSplitter.addEventListener("keydown", (event) => {
        const width = explorer.getBoundingClientRect().width;
        const maximum = availableExplorerWidth();
        let next;
        if (event.key === "ArrowLeft") next = width - 10;
        else if (event.key === "ArrowRight") next = width + 10;
        else if (event.key === "Home") next = explorerMinWidth;
        else if (event.key === "End") next = maximum;
        else return;
        event.preventDefault();
        explorerPreferredWidth = Math.min(maximum, Math.max(explorerMinWidth, next));
        applyExplorerWidth();
      });
      editorPane = element("div", undefined, workspace, "build-editor");
      editorPane.setAttribute("role", "region");
      editorPane.setAttribute("aria-label", "Selected customization");
      explorerReopen = element("div", undefined, workspace, "build-explorer-reopen");
      explorerReopen.hidden = true;
      renderCustomizations();
      renderSelectedArtifact();
      updateExplorerVisibility();
      const discovery = element("details", undefined, container, "build-discovery");
      element("summary", "About these customization points", discovery);
      element("p", "Build highlights recognized instructions, tools, settings, and policies. Use your editor for broader implementation work. Drafts stay here until you review and save them.", discovery);
      element("p", supportsDocuments
        ? "Instructions guide the model. Trusted tool code and operator-owned policy enforce the rules; the running model cannot change them."
        : "Best-effort source discovery using known filenames and code patterns. Custom implementations may be missed; not discovered does not mean not implemented. Finding source is not proof of runtime readiness.", discovery);
    } catch (cause) { if (isActive() && version === loadVersion) { loading.remove(); error(container, cause.message); } }
  }
  new ResizeObserver(updateExplorerVisibility).observe(container);
  window.addEventListener("focus", () => { if (isActive()) void show(); });
  function hide() {
    loadVersion++;
    rememberAreaVisibility();
    sourceLayoutObserver?.disconnect();
    cleanupReview?.();
    cleanupReview = undefined;
  }
  return { show, hide };
}
