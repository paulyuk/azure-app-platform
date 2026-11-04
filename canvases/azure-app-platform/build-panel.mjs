import { ACTION_BUTTON_STYLE } from "./control-styles.mjs";
import { STUDIO_TABS_CSS } from "./studio-tabs.mjs";

export const BUILD_PANEL_CONTENT_CSS = `
:is(#details, #customize-content)[data-mode="build"] { display:block; overflow:auto; container-type:inline-size; container-name:build-panel; padding:0; font:13px/20px var(--font-sans,system-ui); }
:is(#details, #customize-content)[data-mode="build"] .build-workspace { box-sizing:border-box; width:100%; max-width:880px; margin-inline:auto; padding:20px 24px; }
:is(#details, #customize-content)[data-mode="build"] .build-heading { display:flex; align-items:start; justify-content:space-between; gap:16px; margin-bottom:12px; }
:is(#details, #customize-content)[data-mode="build"] h2 { margin:0; font-size:15px; line-height:22px; font-weight:600; color:var(--studio-ink); }
:is(#details, #customize-content)[data-mode="build"] p { margin:4px 0 12px; color:var(--studio-muted); font-size:13px; line-height:20px; }
:is(#details, #customize-content)[data-mode="build"] .build-heading p { max-width:60ch; margin-bottom:0; }
:is(#details, #customize-content)[data-mode="build"] .build-heading-title { position:relative; display:flex; align-items:center; gap:8px; }
:is(#details, #customize-content)[data-mode="build"] .build-help-button { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; min-height:28px; padding:4px; border:0; background:transparent; color:var(--studio-muted); }
:is(#details, #customize-content)[data-mode="build"] .build-help-button:hover { background:var(--studio-panel); color:var(--studio-ink); }
:is(#details, #customize-content)[data-mode="build"] .build-help-tooltip { position:absolute; z-index:3; inset-inline-start:0; top:calc(100% + 6px); box-sizing:border-box; width:320px; max-width:100%; padding:12px; border:1px solid var(--studio-line); border-radius:6px; background:var(--studio-raised); color:var(--studio-ink); box-shadow:0 8px 24px rgb(0 0 0 / .18); font:12px/1.5 var(--font-sans,system-ui); }
:is(#details, #customize-content)[data-mode="build"] button:not([role="tab"]) { ${ACTION_BUTTON_STYLE} }
:is(#details, #customize-content)[data-mode="build"] :is(button,select,summary,.build-source-preview):focus-visible { outline:2px solid var(--studio-focus); outline-offset:2px; }
:is(#details, #customize-content)[data-mode="build"] .build-refresh { flex:none; min-height:28px; padding:4px 10px; border:1px solid var(--studio-line); border-radius:6px; background:var(--studio-raised); color:var(--studio-ink); font-size:12px; font-weight:500; }
:is(#details, #customize-content)[data-mode="build"] .build-refresh:hover:not(:disabled) { border-color:var(--studio-accent); background:var(--studio-panel); }
:is(#details, #customize-content)[data-mode="build"] .build-heading-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; flex:none; }
:is(#details, #customize-content)[data-mode="build"] .build-blocks-bar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px 16px; margin:12px 0 16px; padding:12px 14px; border:1px solid var(--studio-line); border-radius:8px; background:var(--studio-panel); }
:is(#details, #customize-content)[data-mode="build"] .build-blocks-copy { min-width:0; }
:is(#details, #customize-content)[data-mode="build"] .build-blocks-copy strong { display:block; font-size:13px; line-height:18px; font-weight:600; color:var(--studio-ink); }
:is(#details, #customize-content)[data-mode="build"] .build-blocks-copy span { display:block; font-size:12px; line-height:18px; color:var(--studio-muted); }
:is(#details, #customize-content)[data-mode="build"] .build-blocks-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
:is(#details, #customize-content)[data-mode="build"] .build-tabs { margin:16px 0 20px; }
:is(#details, #customize-content)[data-mode="build"] .build-area { margin:0; min-width:0; }
:is(#details, #customize-content)[data-mode="build"] .build-area-header { margin-bottom:16px; }
:is(#details, #customize-content)[data-mode="build"] .build-area-title { margin:0; font-size:14px; line-height:20px; font-weight:600; color:var(--studio-ink); }
:is(#details, #customize-content)[data-mode="build"] .build-area-description { max-width:65ch; color:var(--studio-muted); font-size:12px; line-height:18px; font-weight:400; }
:is(#details, #customize-content)[data-mode="build"] .build-project-list { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 16px; padding:0; list-style:none; }
:is(#details, #customize-content)[data-mode="build"] .build-project-list li { margin:0; }
:is(#details, #customize-content)[data-mode="build"] .build-project-list button { min-height:28px; max-width:100%; padding:4px 10px; background:transparent; color:var(--studio-muted); font-size:12px; font-weight:500; white-space:normal; overflow-wrap:anywhere; }
:is(#details, #customize-content)[data-mode="build"] .build-project-list button:hover { background:var(--studio-panel); color:var(--studio-ink); }
:is(#details, #customize-content)[data-mode="build"] .build-project-list button[aria-current="true"] { border-color:var(--studio-accent); background:var(--studio-accent-soft); color:var(--studio-ink); font-weight:600; }
:is(#details, #customize-content)[data-mode="build"] .build-project-list .build-project-location { display:block; color:var(--studio-muted); font-size:11px; font-weight:400; overflow-wrap:anywhere; }
:is(#details, #customize-content)[data-mode="build"] .build-project-picker { display:grid; gap:6px; max-width:360px; min-width:0; margin:0 0 16px; color:var(--studio-muted); font-size:12px; }
:is(#details, #customize-content)[data-mode="build"] .build-project-picker select { box-sizing:border-box; width:100%; max-width:100%; min-width:0; min-height:32px; padding:4px 10px; border:1px solid var(--studio-line); border-radius:6px; background:var(--studio-raised); color:var(--studio-ink); font:12px/18px var(--font-sans,system-ui); }
:is(#details, #customize-content)[data-mode="build"] .build-customization h4.build-project-title { margin:0 0 12px; font-size:13px; font-weight:600; overflow-wrap:anywhere; }
:is(#details, #customize-content)[data-mode="build"] .build-file { box-sizing:border-box; min-width:0; padding:14px 16px; border:1px solid var(--studio-line); border-radius:8px; background:var(--studio-panel); }
:is(#details, #customize-content)[data-mode="build"] .build-file + .build-file { margin-top:14px; }
:is(#details, #customize-content)[data-mode="build"] .build-file-heading { display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 12px; }
:is(#details, #customize-content)[data-mode="build"] .build-file-heading :is(h4,h5) { margin:0; font-size:13px; line-height:18px; font-weight:600; overflow-wrap:anywhere; }
:is(#details, #customize-content)[data-mode="build"] .build-source-path { display:block; margin:2px 0 8px; font:11px/1.5 var(--font-mono,monospace); color:var(--studio-muted); overflow-wrap:anywhere; }
:is(#details, #customize-content)[data-mode="build"] .build-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:6px 0; }
:is(#details, #customize-content)[data-mode="build"] .build-actions button { min-height:28px; padding:4px 10px; font-size:12px; line-height:18px; font-weight:500; }
:is(#details, #customize-content)[data-mode="build"] .build-actions .vscode-icon { width:14px; height:14px; flex:none; }
:is(#details, #customize-content)[data-mode="build"] .build-open-editor { border:1px solid var(--studio-line); background:var(--studio-raised); color:var(--studio-ink); font-weight:500; }
:is(#details, #customize-content)[data-mode="build"] .build-open-editor:hover:not(:disabled) { border-color:var(--studio-accent); background:var(--studio-panel); text-decoration:none; }
:is(#details, #customize-content)[data-mode="build"] .build-edit-files { border:1px solid var(--studio-line); background:transparent; color:var(--studio-muted); font-weight:500; }
:is(#details, #customize-content)[data-mode="build"] .build-edit-files:hover:not(:disabled) { border-color:var(--studio-accent); color:var(--studio-ink); background:var(--studio-panel); }
:is(#details, #customize-content)[data-mode="build"] :is(button,select):disabled { opacity:.65; cursor:not-allowed; }
:is(#details, #customize-content)[data-mode="build"] .build-handoff-feedback { margin:4px 0 8px; font-size:12px; }
:is(#details, #customize-content)[data-mode="build"] .build-source-disclosure { margin:8px 0 0; min-width:0; }
:is(#details, #customize-content)[data-mode="build"] .build-source-disclosure > summary { width:fit-content; padding:4px 0; color:var(--studio-muted); font-size:12px; cursor:pointer; }
:is(#details, #customize-content)[data-mode="build"] .build-preview-toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:8px 0; color:var(--studio-muted); font-size:11px; }
/* Reserve horizontal scrollbar space so WebKit includes it in the disclosure's intrinsic height. */
:is(#details, #customize-content)[data-mode="build"] .build-source-preview { box-sizing:border-box; display:grid; grid-template-columns:max-content minmax(max-content,1fr); align-items:start; min-width:0; max-width:100%; max-height:360px; overflow-x:scroll; overflow-y:auto; border:1px solid var(--studio-line); border-radius:6px; background:var(--studio-raised); direction:ltr; }
:is(#details, #customize-content)[data-mode="build"] .build-source-preview pre { box-sizing:border-box; min-height:100%; margin:0; padding:12px; white-space:pre; overflow-wrap:normal; tab-size:4; font:12px/1.6 var(--font-mono,monospace); font-variant-ligatures:none; letter-spacing:normal; text-align:left; }
:is(#details, #customize-content)[data-mode="build"] .build-source-preview .build-line-numbers { position:sticky; left:0; z-index:1; min-width:5ch; padding-inline:8px; border-inline-end:1px solid var(--studio-line); color:var(--studio-muted); background:var(--studio-panel); text-align:right; user-select:none; }
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
@container build-panel (max-width:600px) {
  :is(#details, #customize-content)[data-mode="build"] .build-workspace { padding:16px; }
  :is(#details, #customize-content)[data-mode="build"] .build-file { padding:12px; }
  :is(#details, #customize-content)[data-mode="build"] .build-heading { flex-wrap:wrap; gap:4px; }
}
@container build-panel (min-width:601px) {
  :is(#details, #customize-content)[data-mode="build"] .build-file { display:grid; grid-template-columns:minmax(0,1fr) auto; column-gap:16px; align-items:start; }
  :is(#details, #customize-content)[data-mode="build"] .build-file-heading { grid-column:1; grid-row:1; }
  :is(#details, #customize-content)[data-mode="build"] .build-source-path { grid-column:1; grid-row:2; margin-bottom:0; }
  :is(#details, #customize-content)[data-mode="build"] .build-file > .build-actions { grid-column:2; grid-row:1 / 3; align-self:center; margin:0; }
  :is(#details, #customize-content)[data-mode="build"] .build-file > :is(.build-source-disclosure,.build-handoff-feedback,.build-warning,.build-error) { grid-column:1 / -1; }
}
@media (forced-colors:active) {
  :is(#details, #customize-content)[data-mode="build"] .build-highlight, :is(#details, #customize-content)[data-mode="build"] .build-highlight .token { color:CanvasText; }
}
`;

export const BUILD_PANEL_CSS = STUDIO_TABS_CSS + BUILD_PANEL_CONTENT_CSS;

export function createBuildPanel({ container, root, request, isActive, onRun, onModel, onOpenStructure, syntax, editorSettings: initialEditorSettings, buttons, helpIcon }) {
  const areas = [
    { id: "behavior", tab: "Behavior", icon: "behavior", label: "Agent behavior", description: "Shape what your agent does and how it responds." },
    { id: "tools", tab: "Tools", icon: "tools", label: "Tools & contracts", description: "Choose a tool to change its implementation or the inputs it accepts." },
    { id: "runtime", tab: "Runtime", icon: "runtime", label: "Runtime", description: "Review how your app is configured to run. Model connections and ports live in Settings." },
    { id: "policies", tab: "Policies", icon: "policies", label: "Policies & limits", description: "Review developer-owned rules and limits separately from model instructions." },
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
  const pendingEditorLaunches = new Set(), pendingFilesLaunches = new Set();
  const handoffFeedback = new Map(), areaPanels = new Map(), areaTabs = new Map(), selectedProjects = new Map();
  const previewVisibility = new Map(), previewPositions = new Map();
  let artifacts = [], supportsDocuments = false, loadVersion = 0, workspace, renderedState, selectedArea;
  let refreshing = false, refreshTimer, panelScroll = 0, workspaceOpening = false;
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
  function navigationButton(parent, label, action) {
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
  function isVsCodeEditor() {
    return currentEditorSettings.editorId === "vscode" || currentEditorSettings.editorId === "vscode-insiders";
  }
  const vsCodeIconMarkup = '<svg class="vscode-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M11.8 1.1a.9.9 0 0 1 .95.08l2.1 1.56c.3.22.48.57.48.95v8.62c0 .38-.18.73-.48.95l-2.1 1.56a.9.9 0 0 1-1.15-.06L6.42 9.93 3.2 12.4a.75.75 0 0 1-.96-.04l-1.1-1a.75.75 0 0 1 0-1.1L4.6 8 1.14 5.74a.75.75 0 0 1 0-1.1l1.1-1a.75.75 0 0 1 .96-.04l3.22 2.47 5.18-4.83c.06-.05.13-.1.2-.14Zm.45 2.75L8.2 7.5l4.05 3.65V3.85ZM3.1 5.58 2.38 6.2 4.9 8l-2.52 1.8.72.62L6.2 8 3.1 5.58Z"/></svg>';
  function updateEditorControls() {
    const editorIcon = isVsCodeEditor() ? buttons.icon(vsCodeIconMarkup) : undefined;
    for (const control of container.querySelectorAll("[data-editor-launch]")) {
      buttons.update(control, {
        children: "Open in " + selectedEditorLabel(),
        icon: editorIcon,
        disabled: editorSettingsSaving || pendingEditorLaunches.has(control.dataset.artifactId),
      });
      control.title = "Open the worktree and file in " + selectedEditorLabel();
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
      feedback.textContent = result?.message ?? "";
      feedback.hidden = !result;
      feedback.classList.toggle("build-error", result?.error === true);
      feedback.setAttribute("role", result?.error ? "alert" : "status");
    }
  }
  function rememberPreview(source) {
    if (source?.isConnected && source.getClientRects().length) {
      previewPositions.set(source.dataset.artifactId, { top: source.scrollTop, left: source.scrollLeft });
    }
  }
  function rememberView() {
    if (!workspace?.isConnected) return;
    panelScroll = container.scrollTop;
    for (const disclosure of workspace.querySelectorAll(".build-source-disclosure")) {
      previewVisibility.set(disclosure.dataset.previewFor, disclosure.open);
      rememberPreview(disclosure.querySelector(".build-source-preview"));
    }
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
    if (pending.has(artifact.id)) return;
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
      handoffFeedback.set(artifact.id, { error: true, message: (native ? "Could not open Files: " : "Could not open editor: ") + cause.message });
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
  function renderHelp(parent) {
    const help = element("span", undefined, parent, "build-help");
    const control = button(help, "", () => {
      pinned = !pinned;
      dismissed = !pinned;
      tooltip.hidden = !pinned;
    });
    buttons.update(control, { className: "build-help-button", appearance: "subtle" });
    control.setAttribute("aria-label", "About Build");
    control.setAttribute("aria-describedby", "build-help-tooltip");
    control.dataset.focusKey = "help";
    buttons.update(control, { icon: buttons.icon(helpIcon) });
    const tooltip = element("span", "Build shows recognized source, tool, runtime, and policy building blocks. Previews show saved source; Files and your external editor own editing. Discovery is best effort, and finding source does not prove runtime readiness." + (supportsDocuments
      ? " Instructions guide the model; trusted tool code and operator-owned policy enforce the rules." : ""), help, "build-help-tooltip");
    tooltip.id = "build-help-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    let pinned = false, dismissed = false, leaveTimer;
    function reveal() {
      clearTimeout(leaveTimer);
      if (!dismissed) tooltip.hidden = false;
    }
    function leave() {
      dismissed = false;
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        if (!pinned && !help.contains(document.activeElement) && !help.matches(":hover")) tooltip.hidden = true;
      }, 120);
    }
    help.addEventListener("pointerenter", reveal);
    help.addEventListener("pointerleave", leave);
    help.addEventListener("focusin", reveal);
    help.addEventListener("focusout", () => { pinned = false; leave(); });
    help.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      pinned = false;
      dismissed = true;
      tooltip.hidden = true;
    });
  }
  function renderPreview(disclosure, artifact) {
    let source = disclosure.querySelector(".build-source-preview");
    if (!source) {
      const language = syntax?.languageForPath(artifact.path) ?? { id: "plain", label: "Plain text" };
      const toolbar = element("div", undefined, disclosure, "build-preview-toolbar");
      element("span", "Read-only preview · Saved file", toolbar);
      element("span", language.label, toolbar, "build-language").setAttribute("aria-label", "Language: " + language.label);
      source = element("div", undefined, disclosure, "build-source-preview");
      source.dataset.language = language.id;
      source.dataset.artifactId = artifact.id;
      source.dataset.focusKey = "preview-" + artifact.id;
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
          disclosure, "build-error build-syntax-error").setAttribute("role", "alert");
      }
      source.addEventListener("scroll", () => rememberPreview(source));
    }
    restorePreview(source, artifact);
  }
  function artifactLabel(artifact) {
    const file = artifact.path.split("/").pop();
    if (artifact.id === "tool" || file === "function_app.py") return "Implementation";
    if (artifact.id === "contract" || file === "contract.json") return "Input contract";
    if (artifact.id === "instructions" || artifact.path.endsWith("/prompts/system.md")) return "Instructions";
    if (artifact.customizationArea === "behavior") return "Instructions & agent implementation";
    return artifact.title.split(" · ")[0];
  }
  function renderArtifact(parent, artifact, headingTag = "h4") {
    const row = element("section", undefined, parent, "build-file");
    row.dataset.artifact = artifact.id;
    const heading = element("div", undefined, row, "build-file-heading");
    element(headingTag, artifactLabel(artifact), heading);
    element("code", artifact.path, row, "build-source-path");
    const actions = element("div", undefined, row, "build-actions");
    const external = button(actions, "Open in " + selectedEditorLabel(), () => openArtifact(artifact, false));
    buttons.update(external, {
      className: "build-open-editor",
      appearance: "secondary",
      icon: isVsCodeEditor() ? buttons.icon(vsCodeIconMarkup) : undefined,
    });
    external.dataset.editorLaunch = "true";
    external.dataset.artifactId = artifact.id;
    external.dataset.focusKey = "editor-" + artifact.id;
    if (supportsDocuments && artifact.id === "instructions" && typeof onRun === "function") {
      const testDoc = button(actions, "Test with a document", onRun);
      buttons.update(testDoc, { appearance: "secondary" });
      testDoc.dataset.focusKey = "test-document";
    }
    if (supportsDocuments && artifact.id === "runtime") {
      const modelButton = button(actions, "Model connection", onModel);
      buttons.update(modelButton, { appearance: "secondary" });
      modelButton.dataset.focusKey = "model";
    }
    element("p", "", row, "build-handoff-feedback").dataset.artifactId = artifact.id;
    if (supportsDocuments && ["tool", "contract", "policy"].includes(artifact.id)) {
      element("p", "Developer-owned enforcement. Test changes and rebuild cloud images before deployment.", row, "build-warning");
    }
    if (supportsDocuments && artifact.id === "runtime") {
      try {
        const config = JSON.parse(artifact.content);
        element("p", config.agentRuntime === "copilot-sdk-sandbox"
          ? "Two separate ACA sandboxes: agent runtime and document validation tool. The agent harness remains local. Configuration is not proof of deployment or isolation."
          : "Local subprocess simulation. Use synthetic documents only; there is no OS or network isolation.", row, "build-warning");
      } catch (cause) { error(row, "Invalid runtime configuration: " + cause.message); }
    }
    const disclosure = element("details", undefined, row, "build-source-disclosure");
    disclosure.dataset.previewFor = artifact.id;
    element("summary", "Preview source", disclosure).dataset.focusKey = "source-" + artifact.id;
    disclosure.open = previewVisibility.get(artifact.id) ?? true;
    disclosure.addEventListener("toggle", () => {
      if (!disclosure.isConnected) return;
      if (disclosure.open) {
        previewVisibility.set(artifact.id, true);
        renderPreview(disclosure, artifact);
      } else previewVisibility.set(artifact.id, false);
    });
    if (disclosure.open) renderPreview(disclosure, artifact);
  }
  function projectGroups(members) {
    const groups = new Map();
    for (const artifact of members) {
      const fallback = artifact.path.endsWith("/prompts/system.md")
        ? artifact.path.slice(0, -"/prompts/system.md".length)
        : artifact.path.split("/").slice(0, -1).join("/");
      const key = artifact.projectPath ?? fallback;
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
  function restoreOpenPreviews(panel) {
    for (const disclosure of panel.querySelectorAll(".build-source-disclosure")) {
      if (!disclosure.open) continue;
      const artifact = artifacts.find((item) => item.id === disclosure.dataset.previewFor);
      if (artifact) renderPreview(disclosure, artifact);
    }
  }
  function renderArea(panel, area) {
    buttons.clear(panel);
    panel.replaceChildren();
    const header = element("div", undefined, panel, "build-area-header");
    element("h3", area.label, header, "build-area-title");
    element("p", area.description, header, "build-area-description");
    const projects = projectGroups(artifacts.filter((artifact) => artifact.customizationArea === area.id));
    const nameCounts = new Map();
    for (const project of projects) nameCounts.set(project.name, (nameCounts.get(project.name) ?? 0) + 1);
    const selected = projects.find((project) => project.path === selectedProjects.get(area.id)) ?? projects[0];
    selectedProjects.set(area.id, selected.path);
    if (projects.length > 1 && area.id === "tools") {
      const label = element("label", undefined, panel, "build-project-picker");
      element("span", "Tool", label);
      const picker = element("select", undefined, label);
      picker.setAttribute("aria-label", "Tool");
      picker.dataset.focusKey = "project-tools";
      for (const project of projects) {
        const duplicate = nameCounts.get(project.name) > 1;
        const option = element("option", project.name + (duplicate ? " (" + project.path + ")" : ""), picker);
        option.value = project.path;
      }
      picker.value = selected.path;
      picker.addEventListener("change", () => {
        rememberView();
        selectedProjects.set(area.id, picker.value);
        renderArea(panel, area);
        panel.querySelector('[data-focus-key="project-tools"]').focus({ preventScroll: true });
        updateEditorControls();
      });
    } else if (projects.length > 1) {
      const choices = element("ul", undefined, panel, "build-project-list");
      choices.setAttribute("aria-label", area.id === "tools" ? "Tools" : area.label + " implementations");
      for (const project of projects) {
        const focusKey = "project-" + area.id + "-" + project.path;
        const control = navigationButton(element("li", undefined, choices), project.name, () => {
          if (selectedProjects.get(area.id) === project.path) return;
          rememberView();
          selectedProjects.set(area.id, project.path);
          renderArea(panel, area);
          [...panel.querySelectorAll("[data-focus-key]")].find((node) => node.dataset.focusKey === focusKey)?.focus({ preventScroll: true });
          updateEditorControls();
        });
        control.dataset.projectPath = project.path;
        control.dataset.focusKey = focusKey;
        control.title = project.path;
        if (nameCounts.get(project.name) > 1) {
          element("small", project.path, control, "build-project-location");
        }
        control.setAttribute("aria-current", String(project.path === selected.path));
      }
    }
    const entry = element("div", undefined, panel, "build-customization");
    entry.dataset.projectPath = selected.path;
    const named = area.id === "tools" || projects.length > 1;
    if (named) element("h4", selected.name, entry, "build-project-title");
    for (const artifact of selected.artifacts) renderArtifact(entry, artifact, named ? "h5" : "h4");
  }
  function activateArea(areaId, focus = false, remember = true) {
    if (remember) rememberView();
    selectedArea = areaId;
    for (const [id, tab] of areaTabs) {
      tab.setAttribute("aria-selected", String(id === areaId));
      tab.tabIndex = id === areaId ? 0 : -1;
    }
    for (const [id, panel] of areaPanels) {
      panel.hidden = id !== areaId;
      if (id !== areaId) continue;
      if (!panel.childElementCount) renderArea(panel, areas.find((area) => area.id === id));
      restoreOpenPreviews(panel);
    }
    updateEditorControls();
    if (focus) areaTabs.get(areaId).focus({ preventScroll: true });
  }
  function renderWorkspace(diagnostics) {
    workspace = element("div", undefined, container, "build-workspace");
    const header = element("div", undefined, workspace, "build-heading");
    const intro = element("div", undefined, header);
    const title = element("div", undefined, intro, "build-heading-title");
    element("h2", "Build your app", title);
    renderHelp(title);
    element("p", "Edit code, add building blocks, and configure tools, runtime, and policies.", intro);
    const headerActions = element("div", undefined, header, "build-heading-actions");
    if (typeof onRun === "function") {
      const quickRun = button(headerActions, "Run & Debug", onRun);
      buttons.update(quickRun, { className: "build-quick-run", appearance: "primary" });
      quickRun.dataset.focusKey = "quick-run";
    }
    const refresh = button(headerActions, "Refresh source", () => show({ refresh: true }));
    buttons.update(refresh, { className: "build-refresh", appearance: "secondary", disabled: refreshing });
    refresh.dataset.focusKey = "refresh";
    if (typeof onOpenStructure === "function") {
      const blocksBar = element("section", undefined, workspace, "build-blocks-bar");
      blocksBar.setAttribute("aria-label", "Architecture building blocks");
      const copy = element("div", undefined, blocksBar, "build-blocks-copy");
      element("strong", "Building blocks & architecture", copy);
      element("span", "Add capabilities (Agent, Tools, Gateway, Workflows) or wire stage connections on the App Map.", copy);
      const blockActions = element("div", undefined, blocksBar, "build-blocks-actions");
      const editArch = button(blockActions, "+ Add building block", onOpenStructure);
      buttons.update(editArch, { appearance: "secondary" });
      editArch.dataset.focusKey = "open-structure";
    }
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
        icon: isVsCodeEditor() ? buttons.icon(VSCODE_ICON_MARKUP) : undefined,
      });
      open.dataset.workspaceLaunch = "true";
      open.dataset.focusKey = "workspace";
      element("p", "", empty, "build-handoff-feedback").dataset.artifactId = "workspace";
    }
    const availableAreas = areas.filter((area) => artifacts.some((artifact) => artifact.customizationArea === area.id));
    if (availableAreas.length) {
      const tabs = element("div", undefined, workspace, "build-tabs studio-tabs");
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "App customization areas");
      for (const area of availableAreas) {
        const tab = navigationButton(tabs, "", () => activateArea(area.id));
        tab.className = "build-tab studio-tab";
        tab.id = "build-tab-" + area.id;
        tab.dataset.focusKey = "area-" + area.id;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", "build-area-" + area.id);
        const main = element("span", undefined, tab, "studio-tab-main");
        const icon = element("span", undefined, main, "studio-tab-icon studio-tab-icon--" + area.icon);
        icon.setAttribute("aria-hidden", "true");
        element("span", area.tab, main, "studio-tab-label");
        areaTabs.set(area.id, tab);
        tab.addEventListener("keydown", (event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          const index = availableAreas.findIndex((item) => item.id === area.id);
          const direction = getComputedStyle(tabs).direction === "rtl" ? -1 : 1;
          let next;
          if (event.key === "ArrowRight") next = (index + direction + availableAreas.length) % availableAreas.length;
          else if (event.key === "ArrowLeft") next = (index - direction + availableAreas.length) % availableAreas.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = availableAreas.length - 1;
          else return;
          event.preventDefault();
          activateArea(availableAreas[next].id, true);
          areaTabs.get(availableAreas[next].id).scrollIntoView({ block: "nearest", inline: "nearest" });
        });
      }
      for (const area of availableAreas) {
        const panel = element("section", undefined, workspace, "build-area studio-tab-panel");
        panel.id = "build-area-" + area.id;
        panel.dataset.areaId = area.id;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", "build-tab-" + area.id);
        panel.hidden = true;
        areaPanels.set(area.id, panel);
      }
      if (!areaPanels.has(selectedArea)) selectedArea = availableAreas[0].id;
      activateArea(selectedArea, false, false);
    }
    updateEditorControls();
  }
  async function show({ refresh = false } = {}) {
    clearTimeout(refreshTimer);
    const version = ++loadVersion;
    const settingsVersion = editorSettingsVersion;
    refreshing = true;
    for (const control of container.querySelectorAll(".build-refresh")) buttons.setDisabled(control, true);
    let loading;
    if (!refresh || !container.childElementCount) {
      rememberView();
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
        && areas.some((area) => area.id === artifact.customizationArea));
      const signature = JSON.stringify([next, state.supportsDocuments, state.diagnostics]);
      if (refresh && workspace?.isConnected && renderedState === signature) {
        updateEditorControls();
        return;
      }
      rememberView();
      const focusKey = container.contains(document.activeElement) ? document.activeElement.dataset.focusKey : undefined;
      artifacts = next;
      supportsDocuments = state.supportsDocuments === true;
      renderedState = signature;
      buttons.clear(container);
      container.replaceChildren();
      areaPanels.clear();
      areaTabs.clear();
      renderWorkspace(state.diagnostics);
      container.scrollTop = panelScroll;
      if (focusKey) [...container.querySelectorAll("[data-focus-key]")]
        .find((node) => node.dataset.focusKey === focusKey)?.focus({ preventScroll: true });
    } catch (cause) {
      if (isActive() && version === loadVersion) {
        loading?.remove();
        error(container, "Could not refresh saved files: " + cause.message);
        if (!container.querySelector(".build-refresh")) {
          buttons.update(button(container, "Refresh source", () => show({ refresh: true })), { className: "build-refresh" });
        }
      }
    } finally {
      if (version === loadVersion) {
        refreshing = false;
        for (const control of container.querySelectorAll(".build-refresh")) buttons.setDisabled(control, false);
      }
    }
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
    rememberView();
  }
  return { show, hide, setEditorSettings };
}
