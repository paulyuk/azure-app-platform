import { ACTION_BUTTON_STYLE } from "./control-styles.mjs";

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
#details[data-mode="build"] .build-empty { max-width:480px; padding:24px; }
#details[data-mode="build"] .build-editor { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:auto; padding:16px; }
#details[data-mode="build"] .build-file { display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; }
#details[data-mode="build"] .build-file-heading { display:flex; align-items:baseline; flex-wrap:wrap; gap:8px; justify-content:space-between; }
#details[data-mode="build"] .build-file h3 { margin:0; font-size:14px; overflow-wrap:anywhere; }
#details[data-mode="build"] .build-language { color:var(--text-color-muted,#6a6775); font-size:11px; }
#details[data-mode="build"] .build-file > p { margin:4px 0 8px; }
#details[data-mode="build"] .build-discovery { padding:8px 12px; border-top:1px solid var(--border-color-default,#ddd); font-size:11px; }
#details[data-mode="build"] .build-discovery > summary { cursor:pointer; color:var(--text-color-muted,#6a6775); }
#details[data-mode="build"] > :is(.build-warning,.build-error,.build-loading) { margin:8px 12px; }
#details[data-mode="build"] code { display:block; overflow-wrap:anywhere; font-size:11px; margin:6px 0; }
#details[data-mode="build"] .build-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:10px 0; }
#details[data-mode="build"] button { ${ACTION_BUTTON_STYLE} }
#details[data-mode="build"] :is(button,select,summary,.build-source-preview):focus-visible { outline:2px solid var(--true-color-blue,#007acc); outline-offset:2px; }
#details[data-mode="build"] .build-edit-files { color:var(--studio-on-accent,#fff); border:1px solid var(--studio-accent,#6b3fd6); background:var(--studio-accent,#6b3fd6); }
#details[data-mode="build"] .build-edit-files:hover:not(:disabled) { background:var(--studio-accent-2,#5932b8); border-color:var(--studio-accent-2,#5932b8); }
#details[data-mode="build"] .build-editor-controls { display:flex; align-items:center; flex-wrap:wrap; gap:6px; min-width:0; }
#details[data-mode="build"] .build-editor-split { display:inline-flex; align-items:stretch; max-width:100%; }
#details[data-mode="build"] .code-edit { color:var(--text-color-default,#222); border:1px solid var(--border-color-default,#ddd); background:var(--background-color-default,#fff); }
#details[data-mode="build"] .code-edit svg { width:16px; height:16px; flex:none; fill:currentColor; }
#details[data-mode="build"] .build-editor-split .code-edit { border-radius:6px 0 0 6px; }
#details[data-mode="build"] .build-editor-picker { position:relative; display:inline-flex; align-items:center; justify-content:center; flex:none; box-sizing:border-box; width:28px; height:32px; border:1px solid var(--border-color-default,#ddd); border-inline-start:0; border-radius:0 6px 6px 0; color:var(--text-color-default,#222); background:var(--background-color-default,#fff); }
#details[data-mode="build"] .build-editor-picker svg { width:14px; height:14px; pointer-events:none; }
/* Preserve native picker behavior beneath the compact chevron. */
#details[data-mode="build"] .build-editor-picker .build-editor-select { position:absolute; inset-block:-1px; inset-inline:0 -1px; width:auto; height:auto; min-height:0; padding:0; opacity:0; cursor:pointer; }
#details[data-mode="build"] .build-editor-picker:focus-within { outline:2px solid var(--true-color-blue,#007acc); outline-offset:2px; }
#details[data-mode="build"] .build-editor-split > :is(.code-edit:hover:not(:disabled),.build-editor-picker:hover:not([data-disabled="true"])) { background:var(--true-color-blue-muted,#e4f1fc); }
#details[data-mode="build"] button:disabled,
#details[data-mode="build"] .build-editor-picker[data-disabled="true"] { opacity:.65; cursor:not-allowed; }
#details[data-mode="build"] .build-editor-picker .build-editor-select:disabled { cursor:not-allowed; }
#details[data-mode="build"] .build-editor-feedback { flex-basis:100%; margin:0; font-size:11px; }
#details[data-mode="build"] .build-preview-toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; }
#details[data-mode="build"] .build-preview-toolbar span { color:var(--text-color-muted,#6a6775); font-size:11px; }
#details[data-mode="build"] .build-refresh { min-height:28px; padding:4px 6px; border:0; background:transparent; color:var(--text-color-muted,#6a6775); font-size:11px; font-weight:400; }
#details[data-mode="build"] .build-refresh:hover:not(:disabled) { color:var(--text-color-default,#222); background:var(--surface-muted,#f0f3f8); }
#details[data-mode="build"] .build-source-preview { display:grid; grid-template-columns:max-content minmax(max-content,1fr); align-items:start; flex:1; height:0; min-height:240px; overflow:auto; border:1px solid var(--border-color-default,#ddd); border-radius:8px; background:var(--background-color-default,#fff); direction:ltr; }
#details[data-mode="build"] .build-source-preview pre { box-sizing:border-box; min-height:100%; margin:0; padding:12px; white-space:pre; overflow-wrap:normal; tab-size:4; font:12px/1.6 var(--font-mono,monospace); font-variant-ligatures:none; letter-spacing:normal; text-align:left; }
#details[data-mode="build"] .build-source-preview .build-line-numbers { position:sticky; left:0; z-index:1; min-width:5ch; padding-inline:8px; border-inline-end:1px solid var(--border-color-default,#ddd); color:var(--text-color-muted,#6a6775); background:var(--surface-muted,var(--background-color-default,#fff)); text-align:right; user-select:none; }
#details[data-mode="build"] .build-highlight { color:var(--text-color-default,#222); }
#details[data-mode="build"] .build-highlight::after { content:" "; }
#details[data-mode="build"] .build-highlight .token { font:inherit; letter-spacing:inherit; }
#details[data-mode="build"] .build-highlight :is(.comment,.prolog,.doctype,.cdata) { color:var(--text-color-muted,#6a6775); }
#details[data-mode="build"] .build-highlight :is(.keyword,.property,.tag,.selector,.atrule,.important) { color:var(--true-color-purple,#6b3fd6); }
#details[data-mode="build"] .build-highlight :is(.string,.char,.attr-value,.regex,.inserted) { color:var(--true-color-green,#137333); }
#details[data-mode="build"] .build-highlight :is(.number,.boolean,.constant,.symbol,.builtin) { color:var(--true-color-orange,#a66700); }
#details[data-mode="build"] .build-highlight :is(.function,.class-name,.attr-name,.title) { color:var(--true-color-blue,#007acc); }
#details[data-mode="build"] .build-highlight .deleted { color:var(--true-color-red,#c43232); }
@media (forced-colors:active) {
  #details[data-mode="build"] .build-editor-picker:focus-within { outline-color:Highlight; }
  #details[data-mode="build"] .build-splitter::before { background:ButtonText; }
  #details[data-mode="build"] .build-splitter::after { color:ButtonText; }
  #details[data-mode="build"] .build-splitter:hover::before,
  #details[data-mode="build"] .build-splitter:focus-visible::before { background:Highlight; }
  #details[data-mode="build"] .build-splitter:hover::after,
  #details[data-mode="build"] .build-splitter:focus-visible::after { color:Highlight; }
  #details[data-mode="build"] .build-highlight, #details[data-mode="build"] .build-highlight .token { color:CanvasText; }
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
  const pendingEditorLaunches = new Set();
  const pendingFilesLaunches = new Set();
  const handoffFeedback = new Map();
  const areaGroups = new Map();
  const collapsedAreas = new Set();
  const fileButtons = new Map();
  const previewPositions = new Map();
  const explorerMinWidth = 176, explorerMaxWidth = 460, editorMinWidth = 320, splitterWidth = 8;
  let artifacts = [], supportsDocuments = false, loadVersion = 0, selectedId;
  let explorerCollapsed = false, compactFilesVisible = false, explorerPreferredWidth = 220;
  let confirmedEditorSettings = normalizeEditorSettings(initialEditorSettings);
  let currentEditorSettings = confirmedEditorSettings;
  let editorSettingsSaving = false, editorSettingsVersion = 0, editorSettingsFeedback;
  let workspace, explorer, editorPane, areaList, filesToggle, explorerTitle, explorerReopen, explorerSplitter;
  let renderedState, refreshing = false, refreshTimer;
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
    let node = parent.querySelector(":scope > .build-error:not(.build-syntax-error):not(.build-handoff-feedback)");
    if (!node) node = element("p", "", parent, "build-error");
    node.setAttribute("role", "alert");
    node.textContent = message;
  }
  function selectedEditorLabel() {
    return currentEditorSettings.editors.find((editor) => editor.id === currentEditorSettings.editorId)?.label ?? "editor";
  }
  function updateEditorControls() {
    for (const select of container.querySelectorAll("[data-editor-select]")) {
      select.replaceChildren();
      for (const editor of currentEditorSettings.editors) element("option", editor.label, select).value = editor.id;
      select.value = currentEditorSettings.editorId;
      select.disabled = editorSettingsSaving;
      select.title = "Choose code editor (current: " + selectedEditorLabel() + ")";
      select.parentElement.dataset.disabled = String(editorSettingsSaving);
    }
    for (const control of container.querySelectorAll("[data-editor-launch]")) {
      control.querySelector(".build-editor-launch-label").textContent = "Open in " + selectedEditorLabel();
      control.setAttribute("aria-label", "Open in " + selectedEditorLabel());
      control.title = "Open the worktree and file in " + selectedEditorLabel();
      control.disabled = editorSettingsSaving || pendingEditorLaunches.has(control.dataset.artifactId);
    }
    for (const feedback of container.querySelectorAll("[data-editor-feedback]")) {
      feedback.textContent = editorSettingsFeedback?.message ?? "";
      feedback.hidden = !editorSettingsFeedback?.message;
      if (editorSettingsFeedback?.error) feedback.setAttribute("role", "alert");
      else feedback.removeAttribute("role");
    }
    for (const control of container.querySelectorAll("[data-files-launch]")) {
      control.disabled = pendingFilesLaunches.has(control.dataset.artifactId);
      control.textContent = control.disabled ? "Opening Files..." : "Edit in Files";
    }
    const feedback = container.querySelector(".build-handoff-feedback");
    if (feedback) {
      const result = handoffFeedback.get(selectedId);
      feedback.textContent = result?.message ?? "";
      feedback.hidden = !result;
      feedback.classList.toggle("build-error", result?.error === true);
      feedback.setAttribute("role", result?.error ? "alert" : "status");
    }
  }
  function isCompact() { return container.getBoundingClientRect().width < 600; }
  function availableExplorerWidth() {
    return Math.max(explorerMinWidth, Math.min(explorerMaxWidth,
      workspace.clientWidth - editorMinWidth - splitterWidth));
  }
  function applyExplorerWidth() {
    if (!workspace?.isConnected) return;
    const maximum = availableExplorerWidth();
    const effective = Math.min(Math.max(explorerPreferredWidth, explorerMinWidth), maximum);
    workspace.style.setProperty("--build-explorer-width", effective + "px");
    explorerSplitter.setAttribute("aria-valuemin", String(explorerMinWidth));
    explorerSplitter.setAttribute("aria-valuemax", String(Math.round(maximum)));
    explorerSplitter.setAttribute("aria-valuenow", String(Math.round(effective)));
    explorerSplitter.setAttribute("aria-valuetext", `${Math.round(effective)} pixels`);
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
    if (visible) explorerTitle.append(filesToggle);
    else explorerReopen.append(filesToggle);
    explorerReopen.hidden = visible;
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
  function updateFileSelection() {
    for (const [id, control] of fileButtons) control.setAttribute("aria-current", String(id === selectedId));
  }
  function rememberAreaVisibility() {
    for (const [id, group] of areaGroups) {
      if (!group.isConnected) continue;
      if (group.open) collapsedAreas.delete(id);
      else collapsedAreas.add(id);
    }
  }
  function rememberPreviewPosition() {
    const source = editorPane?.querySelector(".build-source-preview");
    if (source?.isConnected) previewPositions.set(source.dataset.artifactId, { top: source.scrollTop, left: source.scrollLeft });
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
      group.setAttribute("aria-label", area.label);
      group.open = !collapsedAreas.has(area.id);
      group.addEventListener("toggle", rememberAreaVisibility);
      const header = element("summary", undefined, group, "build-area-header");
      header.setAttribute("aria-label", area.label);
      header.dataset.focusKey = "area-" + area.id;
      header.innerHTML = '<svg class="build-area-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>';
      element("h4", area.label, header);
      areaGroups.set(area.id, group);
      const list = element("ul", undefined, group, "build-file-list");
      for (const artifact of members) {
        const control = button(element("li", undefined, list), "", () => {
          if (selectedId !== artifact.id) {
            rememberPreviewPosition();
            selectedId = artifact.id;
            renderSelectedArtifact();
            updateFileSelection();
          }
          if (isCompact()) {
            compactFilesVisible = false;
            updateExplorerVisibility();
            editorPane.querySelector("h3")?.focus();
          }
        });
        control.className = "build-file-button";
        control.dataset.fileId = artifact.id;
        control.dataset.focusKey = "file-" + artifact.id;
        control.title = artifact.title + " — " + artifact.path;
        control.setAttribute("aria-label", artifact.path);
        control.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"><path d="M9.5 1.5h-6v13h9V5zm0 0V5h3"/></svg>';
        const parts = artifact.path.split("/");
        element("span", parts.pop(), control, "build-file-name");
        if (parts.length) element("span", parts.join("/"), control, "build-file-location");
        fileButtons.set(artifact.id, control);
      }
    }
    updateFileSelection();
  }
  async function openArtifact(artifact, native) {
    const pending = native ? pendingFilesLaunches : pendingEditorLaunches;
    if (pending.has(artifact.id)) return;
    pending.add(artifact.id);
    handoffFeedback.delete(artifact.id);
    updateEditorControls();
    try {
      const result = await request(native ? "/api/open-build-file-canvas" : "/api/open-build-file", {
        method: "POST", body: JSON.stringify({ root, id: artifact.id }),
      });
      handoffFeedback.set(artifact.id, { message: native
        ? "Opened in Files. Save there, then return here to see the updated preview."
        : "Opened the worktree and file in " + (result.editorLabel || selectedEditorLabel()) + "." });
    } catch (cause) {
      handoffFeedback.set(artifact.id, { error: true, message: (native ? "Could not open Files: " : "Could not open editor: ") + cause.message });
    } finally {
      pending.delete(artifact.id);
      if (isActive()) updateEditorControls();
    }
  }
  function renderEditorActions(actions, artifact) {
    const files = button(actions, "Edit in Files", () => openArtifact(artifact, true));
    files.className = "build-edit-files";
    files.dataset.filesLaunch = "true";
    files.dataset.artifactId = artifact.id;
    files.dataset.focusKey = "files";
    const controls = element("div", undefined, actions, "build-editor-controls");
    const split = element("div", undefined, controls, "build-editor-split");
    split.setAttribute("role", "group");
    split.setAttribute("aria-label", "Code editor");
    const code = button(split, "", () => openArtifact(artifact, false));
    code.className = "code-edit";
    code.dataset.editorLaunch = "true";
    code.dataset.artifactId = artifact.id;
    code.dataset.focusKey = "editor";
    code.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.7 5.3 2 12l6.7 6.7 1.4-1.4L4.8 12l5.3-5.3zm6.6 0-1.4 1.4 5.3 5.3-5.3 5.3 1.4 1.4L22 12z"/></svg>';
    element("span", "", code, "build-editor-launch-label");
    const picker = element("span", undefined, split, "build-editor-picker");
    picker.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4"/></svg>';
    const select = element("select", undefined, picker, "build-editor-select");
    select.dataset.editorSelect = "true";
    select.dataset.focusKey = "editor-picker";
    select.setAttribute("aria-label", "Supported editor");
    const feedback = element("p", "", controls, "build-editor-feedback");
    feedback.dataset.editorFeedback = "true";
    select.addEventListener("change", async () => {
      const editorId = select.value;
      if (editorSettingsSaving || editorId === confirmedEditorSettings.editorId) return updateEditorControls();
      currentEditorSettings = { ...currentEditorSettings, editorId };
      editorSettingsSaving = true;
      editorSettingsVersion++;
      editorSettingsFeedback = undefined;
      updateEditorControls();
      try {
        const settings = await request("/api/editor-settings", { method: "POST", body: JSON.stringify({ editorId }) });
        currentEditorSettings = confirmedEditorSettings = normalizeEditorSettings(settings);
      } catch (cause) {
        currentEditorSettings = confirmedEditorSettings;
        editorSettingsFeedback = { error: true, message: "Could not save editor preference: " + cause.message };
      } finally {
        editorSettingsSaving = false;
        editorSettingsVersion++;
        if (isActive()) updateEditorControls();
      }
    });
  }
  function renderSelectedArtifact() {
    editorPane.replaceChildren();
    editorPane.scrollTop = 0;
    const artifact = artifacts.find((item) => item.id === selectedId);
    if (!artifact) return;
    const card = element("section", undefined, editorPane, "build-file");
    card.dataset.artifact = artifact.id;
    const area = areas.find((item) => item.id === artifact.customizationArea);
    const fileHeading = element("div", undefined, card, "build-file-heading");
    const heading = element("h3", area.label, fileHeading);
    heading.tabIndex = -1;
    heading.dataset.focusKey = "heading";
    const language = syntax?.languageForPath(artifact.path) ?? { id: "plain", label: "Plain text" };
    element("span", language.label, fileHeading, "build-language").setAttribute("aria-label", "Language: " + language.label);
    element("p", area.description, card);
    element("code", artifact.path, card);
    const actions = element("div", undefined, card, "build-actions");
    renderEditorActions(actions, artifact);
    if (supportsDocuments) button(actions, "Test with a document", onRun);
    if (supportsDocuments && artifact.id === "runtime") button(actions, "Model connection", onModel);
    element("p", "", card, "build-handoff-feedback");
    if (supportsDocuments && ["tool", "contract", "policy"].includes(artifact.id)) {
      element("p", "Developer-owned enforcement. Test changes and rebuild cloud images before deployment.", card, "build-warning");
    }
    if (supportsDocuments && artifact.id === "runtime") {
      try {
        const config = JSON.parse(artifact.content);
        element("p", config.agentRuntime === "copilot-sdk-sandbox"
          ? "Two separate ACA sandboxes: agent runtime and document validation tool. The agent harness remains local. Configuration is not proof of deployment or isolation."
          : "Local subprocess simulation. Use synthetic documents only; there is no OS or network isolation.", card, "build-warning");
      } catch (cause) { error(card, "Invalid runtime configuration: " + cause.message); }
    }
    const toolbar = element("div", undefined, card, "build-preview-toolbar");
    element("span", "Read-only preview · Saved file", toolbar);
    const refresh = button(toolbar, "Refresh preview", () => show({ refresh: true }));
    refresh.className = "build-refresh";
    refresh.dataset.focusKey = "refresh";
    refresh.disabled = refreshing;
    const source = element("div", undefined, card, "build-source-preview");
    source.dataset.language = language.id;
    source.dataset.artifactId = artifact.id;
    source.dataset.focusKey = "preview";
    source.tabIndex = 0;
    source.setAttribute("role", "region");
    source.setAttribute("aria-label", artifact.title + " source preview");
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
        card, "build-error build-syntax-error").setAttribute("role", "alert");
    }
    const position = previewPositions.get(artifact.id);
    requestAnimationFrame(() => {
      if (!source.isConnected) return;
      source.scrollTop = position?.top ?? (Number.isInteger(artifact.focusLine)
        ? Math.max(0, artifact.focusLine - 3) * parseFloat(getComputedStyle(highlight).lineHeight) : 0);
      source.scrollLeft = position?.left ?? 0;
    });
    updateEditorControls();
  }
  function renderWorkspace() {
    workspace = element("div", undefined, container, "build-workspace");
    explorer = element("nav", undefined, workspace, "build-explorer");
    explorer.id = "build-explorer";
    explorer.setAttribute("aria-label", "Key files");
    const header = element("div", undefined, explorer, "build-explorer-header");
    explorerTitle = element("div", undefined, header, "build-explorer-title");
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
    filesToggle.dataset.focusKey = "files-toggle";
    filesToggle.setAttribute("aria-controls", "build-explorer");
    areaList = element("div", undefined, explorer, "build-area-list");
    explorerSplitter = element("div", undefined, workspace, "build-splitter");
    explorerSplitter.tabIndex = 0;
    explorerSplitter.dataset.focusKey = "splitter";
    explorerSplitter.setAttribute("role", "separator");
    explorerSplitter.setAttribute("aria-orientation", "vertical");
    explorerSplitter.setAttribute("aria-label", "Resize key files");
    explorerSplitter.title = "Drag to resize navigation. Arrow keys also adjust the width.";
    let resize;
    function endResize(pointerId, releaseCapture) {
      if (!resize || resize.pointerId !== pointerId) return;
      resize = undefined;
      delete workspace.dataset.resizing;
      if (releaseCapture && explorerSplitter.hasPointerCapture(pointerId)) explorerSplitter.releasePointerCapture(pointerId);
    }
    explorerSplitter.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || explorerSplitter.hidden) return;
      event.preventDefault();
      resize = { pointerId: event.pointerId, startX: event.clientX, startWidth: explorer.getBoundingClientRect().width };
      workspace.dataset.resizing = "true";
      explorerSplitter.setPointerCapture(event.pointerId);
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
    renderCustomizations();
    renderSelectedArtifact();
    updateExplorerVisibility();
    const discovery = element("details", undefined, container, "build-discovery");
    element("summary", "About these customization points", discovery);
    element("p", "Build highlights recognized instructions, tools, settings, and policies. Edit in Files or your code editor; this preview shows saved content only.", discovery);
    element("p", supportsDocuments
      ? "Instructions guide the model. Trusted tool code and operator-owned policy enforce the rules; the running model cannot change them."
      : "Best-effort source discovery using known filenames and code patterns. Custom implementations may be missed; not discovered does not mean not implemented. Finding source is not proof of runtime readiness.", discovery);
  }
  async function show({ refresh = false } = {}) {
    clearTimeout(refreshTimer);
    const version = ++loadVersion;
    const settingsVersion = editorSettingsVersion;
    refreshing = true;
    for (const control of container.querySelectorAll(".build-refresh")) control.disabled = true;
    let loading;
    if (!refresh || !container.childElementCount) {
      rememberAreaVisibility();
      rememberPreviewPosition();
      container.replaceChildren();
      loading = element("p", "Loading app source...", container, "build-loading");
      loading.setAttribute("role", "status");
    }
    try {
      const state = await request("/api/build-workspace?root=" + encodeURIComponent(root));
      if (!isActive() || version !== loadVersion) return;
      if (state.editorSettings && !editorSettingsSaving && settingsVersion === editorSettingsVersion) {
        currentEditorSettings = confirmedEditorSettings = normalizeEditorSettings(state.editorSettings);
      }
      container.querySelector(":scope > .build-error")?.remove();
      const next = state.artifacts.filter((artifact) => artifact.available
        && areas.some((area) => area.id === artifact.customizationArea));
      const signature = JSON.stringify([next, state.supportsDocuments, state.diagnostics]);
      if (refresh && workspace?.isConnected && renderedState === signature) {
        updateEditorControls();
        return;
      }
      rememberAreaVisibility();
      rememberPreviewPosition();
      const explorerScroll = explorer?.scrollTop ?? 0;
      const editorScroll = editorPane?.scrollTop ?? 0;
      const focusKey = container.contains(document.activeElement) ? document.activeElement.dataset.focusKey : undefined;
      artifacts = next;
      supportsDocuments = state.supportsDocuments === true;
      renderedState = signature;
      container.replaceChildren();
      areaGroups.clear();
      fileButtons.clear();
      for (const diagnostic of state.diagnostics ?? []) {
        element("p", (diagnostic.path ? diagnostic.path + ": " : "") + diagnostic.message, container, "build-warning");
      }
      if (!artifacts.length) {
        const empty = element("section", undefined, container, "build-empty");
        element("h2", "Key files", empty);
        element("p", "No supported customization points were found. Browse the project in Files or your code editor; Build only shows recognized decision points.", empty);
        const open = button(empty, "Open in " + selectedEditorLabel(), async () => {
          open.disabled = true;
          error(empty, "");
          try {
            const result = await request("/api/open-editor", { method: "POST", body: JSON.stringify({ root }) });
            element("p", "Opened the worktree in " + (result.editorLabel || selectedEditorLabel()) + ".", empty).setAttribute("role", "status");
          } catch (cause) { error(empty, cause.message); }
          finally { open.disabled = false; }
        });
        button(empty, "Refresh preview", () => show({ refresh: true })).className = "build-refresh";
        return;
      }
      if (!artifacts.some((artifact) => artifact.id === selectedId)) {
        const firstArea = areas.find((area) => artifacts.some((artifact) => artifact.customizationArea === area.id));
        selectedId = artifacts.find((artifact) => artifact.customizationArea === firstArea.id).id;
      }
      renderWorkspace();
      explorer.scrollTop = explorerScroll;
      editorPane.scrollTop = editorScroll;
      if (focusKey) [...container.querySelectorAll("[data-focus-key]")]
        .find((node) => node.dataset.focusKey === focusKey)?.focus({ preventScroll: true });
    } catch (cause) {
      if (isActive() && version === loadVersion) {
        loading?.remove();
        error(container, "Could not refresh saved files: " + cause.message);
        if (!container.querySelector(".build-refresh")) {
          button(container, "Refresh preview", () => show({ refresh: true })).className = "build-refresh";
        }
      }
    } finally {
      if (version === loadVersion) {
        refreshing = false;
        for (const control of container.querySelectorAll(".build-refresh")) control.disabled = false;
      }
    }
  }
  function scheduleRefresh() {
    if (!isActive() || document.visibilityState === "hidden") return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (isActive()) void show({ refresh: true }); }, 100);
  }
  new ResizeObserver(updateExplorerVisibility).observe(container);
  window.addEventListener("focus", scheduleRefresh);
  document.addEventListener("visibilitychange", scheduleRefresh);
  function hide() {
    loadVersion++;
    clearTimeout(refreshTimer);
    refreshing = false;
    rememberAreaVisibility();
    rememberPreviewPosition();
  }
  return { show, hide };
}
