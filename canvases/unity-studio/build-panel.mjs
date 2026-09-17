import { ACTION_BUTTON_STYLE, FORM_CONTROL_STYLE } from "./control-styles.mjs";

export const BUILD_PANEL_CSS = `
#details[data-mode="build"] { display:flex; flex-direction:column; padding:0; font:13px/1.5 var(--font-sans,system-ui); }
#details[data-mode="build"] h2 { margin:0; font-size:16px; }
#details[data-mode="build"] p { color:var(--text-color-muted,#6a6775); font-size:12px; }
#details[data-mode="build"] .build-header { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:10px 12px; border-bottom:1px solid var(--border-color-default,#ddd); }
#details[data-mode="build"] .build-header h2 { margin-right:auto; }
#details[data-mode="build"] .build-header .build-actions { margin:0; }
#details[data-mode="build"] .build-workspace { display:grid; grid-template-columns:220px minmax(0,1fr); flex:1; min-height:320px; }
#details[data-mode="build"] .build-workspace[data-files-visible="false"],
#details[data-mode="build"] .build-workspace[data-compact="true"] { grid-template-columns:minmax(0,1fr); }
#details[data-mode="build"] .build-explorer { min-width:0; min-height:0; overflow:auto; border-right:1px solid var(--border-color-default,#ddd); background:var(--surface-muted,var(--background-color-default,#fff)); }
#details[data-mode="build"] .build-workspace[data-compact="true"] .build-explorer { border-right:0; }
#details[data-mode="build"] .build-explorer-header { position:sticky; top:0; z-index:1; padding:12px; background:inherit; }
#details[data-mode="build"] .build-explorer h3 { margin:0 0 8px; font-size:12px; }
#details[data-mode="build"] .build-filter { display:flex; align-items:center; gap:4px; }
#details[data-mode="build"] input[type="search"] { ${FORM_CONTROL_STYLE} width:100%; min-width:0; }
#details[data-mode="build"] input[type="search"]::placeholder { color:var(--text-color-muted,#6a6775); opacity:1; }
#details[data-mode="build"] .build-file-count { display:block; margin-top:6px; color:var(--text-color-muted,#6a6775); font-size:11px; }
#details[data-mode="build"] .build-file-list { padding:0 8px 12px; }
#details[data-mode="build"] .build-file-list ul { list-style:none; margin:0; padding:0 0 0 12px; }
#details[data-mode="build"] .build-file-list > ul { padding:0; }
#details[data-mode="build"] .build-file-list li { margin:0; padding:0; }
#details[data-mode="build"] .build-folder > summary { cursor:pointer; padding:6px 4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
#details[data-mode="build"] .build-file-list .build-file-button { display:flex; width:100%; min-width:0; justify-content:flex-start; gap:6px; padding:5px 6px; border:1px solid transparent; border-radius:4px; background:transparent; color:var(--text-color-default,#222); font-weight:400; text-align:left; }
#details[data-mode="build"] .build-file-button:hover { background:var(--background-color-default,#fff); border-color:var(--border-color-default,#ddd); }
#details[data-mode="build"] .build-file-button[aria-current="true"] { background:var(--true-color-blue-muted,#e4f1fc); color:var(--true-color-blue,#007acc); border-color:currentColor; }
#details[data-mode="build"] .build-file-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#details[data-mode="build"] .build-file-status { margin-left:auto; flex:none; font-size:11px; }
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
#details[data-mode="build"] .code-edit { color:var(--true-color-blue,#007acc); border-color:currentColor; }
#details[data-mode="build"] .code-edit svg { width:16px; height:16px; flex:none; fill:currentColor; }
#details[data-mode="build"] textarea, #details[data-mode="build"] select { width:100%; min-width:0; box-sizing:border-box; padding:10px; border:1px solid var(--border-color-default,#ddd); border-radius:8px; color:var(--text-color-default,#222); background:var(--background-color-default,#fff); }
#details[data-mode="build"] textarea { flex:1; min-height:240px; resize:vertical; tab-size:2; font:12px/1.6 var(--font-mono,monospace); }
#details[data-mode="build"] select { ${FORM_CONTROL_STYLE} }
#details[data-mode="build"] pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:300px; overflow:auto; font:12px/1.5 var(--font-mono,monospace); padding:10px; border:1px solid var(--border-color-default,#ddd); border-radius:8px; }
#details[data-mode="build"] .build-source-editor { position:relative; flex:1; min-height:240px; overflow:hidden; border:1px solid var(--border-color-default,#ddd); border-radius:8px; background:var(--background-color-default,#fff); }
#details[data-mode="build"] .build-source-editor:focus-within { outline:2px solid var(--true-color-blue,#007acc); outline-offset:2px; }
#details[data-mode="build"] .build-source-editor :is(textarea,.build-highlight) { position:absolute; inset:0; box-sizing:border-box; border:0; border-radius:0; margin:0; padding:12px; white-space:pre; overflow-wrap:normal; tab-size:4; font:12px/1.6 var(--font-mono,monospace); font-variant-ligatures:none; letter-spacing:normal; text-align:left; direction:ltr; }
#details[data-mode="build"] .build-source-editor textarea { width:100%; height:100%; min-height:0; resize:none; z-index:1; color:transparent; caret-color:var(--text-color-default,#222); background:transparent; outline:none; }
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
  #details[data-mode="build"] .build-source-editor textarea { color:CanvasText; caret-color:CanvasText; }
  #details[data-mode="build"] .build-source-editor textarea::selection { color:HighlightText; background:Highlight; }
  #details[data-mode="build"] .build-source-editor .build-highlight { visibility:hidden; }
}
#details[data-mode="build"] .build-warning { color:var(--true-color-orange,#a66700); }
#details[data-mode="build"] .build-error { color:var(--true-color-red,#c43232); }
#details[data-mode="build"] .build-error:empty { display:none; }
#details[data-mode="build"] [hidden] { display:none; }
`;

export function createBuildPanel({ container, root, request, isActive, onRun, onModel, onStructure, syntax }) {
  const drafts = new Map();
  const pendingSaves = new Set();
  const collapsedFolders = new Set();
  const saveFeedback = new Map();
  const fileButtons = new Map();
  let artifacts = [];
  let supportsDocuments = false;
  let loadVersion = 0;
  let selectedId;
  let filter = "";
  let explorerCollapsed = false;
  let compactFilesVisible = false;
  let workspace, explorer, editorPane, fileList, fileCount, filterInput, filesToggle;
  let sourceLayoutObserver;
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
  function isCompact() { return container.getBoundingClientRect().width < 600; }
  function updateExplorerVisibility() {
    if (!workspace?.isConnected || !isActive()) return;
    const compact = isCompact();
    const visible = compact ? compactFilesVisible : !explorerCollapsed;
    workspace.dataset.compact = String(compact);
    workspace.dataset.filesVisible = String(visible);
    explorer.hidden = !visible;
    editorPane.hidden = compact && visible;
    filesToggle.textContent = visible ? (compact ? "Back to editor" : "Hide files") : "Files";
    filesToggle.setAttribute("aria-expanded", String(visible));
  }
  function updateFileStates() {
    for (const artifact of artifacts) {
      const entry = fileButtons.get(artifact.id);
      if (!entry) continue;
      const status = pendingSaves.has(artifact.id) ? "Saving"
        : saveFeedback.get(artifact.id)?.error ? "Save failed"
          : drafts.has(artifact.id) ? "Unsaved" : !artifact.available ? "Unavailable" : "";
      entry.button.setAttribute("aria-current", String(artifact.id === selectedId));
      entry.button.setAttribute("aria-label", artifact.path + (status ? ", " + status : ""));
      entry.status.textContent = status;
      entry.status.hidden = !status;
    }
  }
  function renderFileList() {
    fileList.replaceChildren();
    fileButtons.clear();
    const query = filter.trim().toLowerCase();
    const matches = artifacts.filter((artifact) =>
      !query || (artifact.path + " " + artifact.title).toLowerCase().includes(query));
    fileCount.textContent = query ? `${matches.length} of ${artifacts.length} files` : `${artifacts.length} files`;
    if (!matches.length) {
      element("p", "No files match this filter.", fileList);
      return;
    }
    const tree = { folders: new Map(), files: [] };
    for (const artifact of matches) {
      const parts = artifact.path.split("/");
      let branch = tree;
      let path = "";
      for (const name of parts.slice(0, -1)) {
        path = path ? path + "/" + name : name;
        if (!branch.folders.has(name)) branch.folders.set(name, { path, folders: new Map(), files: [] });
        branch = branch.folders.get(name);
      }
      branch.files.push(artifact);
    }
    function renderBranch(branch, parent) {
      const list = element("ul", undefined, parent);
      for (const [name, child] of [...branch.folders].sort(([a], [b]) => a.localeCompare(b))) {
        let folder = child;
        let label = name;
        while (!folder.files.length && folder.folders.size === 1) {
          const [nextName, nextFolder] = [...folder.folders][0];
          label += "/" + nextName;
          folder = nextFolder;
        }
        const item = element("li", undefined, list);
        const details = element("details", undefined, item, "build-folder");
        details.open = Boolean(query) || !collapsedFolders.has(folder.path);
        const summary = element("summary", label, details);
        summary.title = folder.path;
        function rememberExpanded(open) {
          if (query) return;
          if (open) collapsedFolders.delete(folder.path);
          else collapsedFolders.add(folder.path);
        }
        // Native toggle events are queued; capture clicks before a filter can replace the list.
        summary.addEventListener("click", () => rememberExpanded(!details.open));
        details.addEventListener("toggle", () => {
          if (details.isConnected) rememberExpanded(details.open);
        });
        renderBranch(folder, details);
      }
      for (const artifact of [...branch.files].sort((a, b) => a.path.localeCompare(b.path))) {
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
            (editorPane.querySelector("textarea") ?? editorPane.querySelector("h3"))?.focus();
          }
        });
        control.className = "build-file-button";
        control.dataset.fileId = artifact.id;
        control.title = artifact.path + "\n" + artifact.title;
        element("span", artifact.path.split("/").at(-1), control, "build-file-name");
        const status = element("span", "", control, "build-file-status");
        status.setAttribute("aria-hidden", "true");
        fileButtons.set(artifact.id, { button: control, status });
      }
    }
    renderBranch(tree, fileList);
    updateFileStates();
  }
  function renderSelectedArtifact() {
    sourceLayoutObserver?.disconnect();
    editorPane.replaceChildren();
    editorPane.scrollTop = 0;
    const artifact = artifacts.find((item) => item.id === selectedId);
    if (artifact) renderArtifact(artifact);
  }
  function renderArtifact(artifact) {
    const card = element("section", undefined, editorPane, "build-file");
    card.dataset.artifact = artifact.id;
    const fileHeading = element("div", undefined, card, "build-file-heading");
    const heading = element("h3", artifact.title, fileHeading);
    heading.tabIndex = -1;
    const language = syntax?.languageForPath(artifact.path) ?? { id: "plain", label: "Plain text" };
    element("span", language.label, fileHeading, "build-language").setAttribute("aria-label", "Language: " + language.label);
    element("code", artifact.path, card);
    element("p", artifact.description, card);
    if (!artifact.available) {
      element("p", artifact.detail, card, "build-warning");
      return;
    }
    if (supportsDocuments && ["tool", "contract", "policy"].includes(artifact.id)) {
      element("p", "Developer-owned enforcement. Review changes, test, and rebuild cloud images before deployment.", card, "build-warning");
    }
    const actions = element("div", undefined, card, "build-actions");
    const source = element("div", undefined, card, "build-source-editor");
    source.dataset.language = language.id;
    const highlight = element("pre", "", source, "build-highlight");
    highlight.setAttribute("aria-hidden", "true");
    const editor = element("textarea", undefined, source);
    editor.rows = 16;
    editor.wrap = "off";
    editor.setAttribute("aria-label", artifact.title + " source");
    editor.spellcheck = false;
    editor.setAttribute("autocapitalize", "off");
    editor.setAttribute("autocorrect", "off");
    editor.value = drafts.get(artifact.id)?.content ?? artifact.content;
    let highlightFrame, syntaxError;
    function syncHighlight() {
      highlight.style.width = editor.clientWidth + "px";
      highlight.style.height = editor.clientHeight + "px";
      highlight.scrollTop = editor.scrollTop;
      highlight.scrollLeft = editor.scrollLeft;
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
    refreshHighlight();
    function rememberDraft() {
      if (editor.value === artifact.content && !pendingSaves.has(artifact.id)) drafts.delete(artifact.id);
      else drafts.set(artifact.id, {
        content: editor.value, baseSha: drafts.get(artifact.id)?.baseSha ?? artifact.sha,
      });
      discard.hidden = !drafts.has(artifact.id);
      saveFeedback.delete(artifact.id);
      updateFileStates();
      queueHighlight();
    }
    editor.addEventListener("input", rememberDraft);
    const code = button(actions, "Edit in Code", async () => {
      code.disabled = true;
      error(card, "");
      try {
        await request("/api/open-build-file", {
          method: "POST", body: JSON.stringify({ root, id: artifact.id }),
        });
        let notice = card.querySelector("[data-editor-notice]");
        if (!notice) {
          notice = element("p", "", card);
          notice.dataset.editorNotice = "true";
        }
        notice.textContent = "Opened the worktree and file in VS Code." +
          (drafts.has(artifact.id) ? " Your inline draft has not been saved." : "");
      } catch (cause) { error(card, cause.message); }
      finally { code.disabled = false; }
    });
    code.className = "code-edit";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("d", "M17.5 2 7.7 10.1 3.8 7.2 2 8.2v7.6l1.8 1 3.9-2.9L17.5 22 22 20V4zM17.5 7.5v9l-6-4.5zM4 10l2.7 2L4 14z");
    icon.append(path);
    code.prepend(icon);
    const review = element("div", undefined, card);
    const reviewChanges = button(actions, "Review changes", () => {
        if (pendingSaves.has(artifact.id)) return;
        review.replaceChildren();
        if (drafts.get(artifact.id)?.baseSha && drafts.get(artifact.id).baseSha !== artifact.sha) {
          error(card, "The saved file changed while you had an inline draft. Discard the draft and reload before editing again.");
          return;
        }
        if (editor.value === artifact.content) {
          element("p", "No changes to review.", review);
          return;
        }
        const reviewed = editor.value;
        element("strong", "Current source", review);
        element("pre", artifact.content, review);
        element("strong", "Proposed source", review);
        element("pre", reviewed, review);
        if (supportsDocuments && ["tool", "contract", "policy"].includes(artifact.id)) element("p", "Developer enforcement change. Test before use and rebuild cloud images before deployment.", review, "build-warning");
        const save = button(review, "Save reviewed changes", async () => {
          if (editor.value !== reviewed) {
            error(card, "The draft changed. Review it again before saving.");
            return;
          }
          if (pendingSaves.has(artifact.id)) return;
          pendingSaves.add(artifact.id);
          saveFeedback.delete(artifact.id);
          error(card, "");
          updateFileStates();
          save.disabled = true;
          reviewChanges.disabled = discard.disabled = true;
          try {
            const updated = await request("/api/build-file", {
              method: "POST", body: JSON.stringify({ root, id: artifact.id, baseSha: drafts.get(artifact.id)?.baseSha ?? artifact.sha, content: reviewed }),
            });
            Object.assign(artifact, updated);
            const currentArtifact = artifacts.find((item) => item.id === artifact.id);
            if (currentArtifact) Object.assign(currentArtifact, updated);
            const draft = drafts.get(artifact.id);
            if (draft && draft.content !== updated.content) {
              drafts.set(artifact.id, { ...draft, baseSha: updated.sha });
            } else {
              drafts.delete(artifact.id);
            }
            discard.hidden = !drafts.has(artifact.id);
            review.replaceChildren();
            const message = "Saved. Restart the app for runtime/code changes; rebuild cloud images before deployment." +
              (drafts.has(artifact.id) ? " Your newer edits are still unsaved. Review them before saving again." : "");
            saveFeedback.set(artifact.id, { message });
            element("p", message, review).setAttribute("role", "status");
          } catch (cause) {
            saveFeedback.set(artifact.id, { error: cause.message });
            error(card, cause.message);
            save.disabled = false;
          }
          finally {
            pendingSaves.delete(artifact.id);
            reviewChanges.disabled = discard.disabled = false;
            updateFileStates();
            if (isActive() && editorPane?.isConnected && !card.isConnected && selectedId === artifact.id) renderSelectedArtifact();
          }
        });
    });
    reviewChanges.disabled = pendingSaves.has(artifact.id);
    if (drafts.has(artifact.id) && drafts.get(artifact.id).baseSha !== artifact.sha) error(card, "The saved file changed in Code or another editor. Your inline draft is preserved but cannot overwrite it.");
    const discard = button(actions, "Discard draft & reload", () => {
      drafts.delete(artifact.id);
      saveFeedback.delete(artifact.id);
      void show();
    });
    discard.disabled = pendingSaves.has(artifact.id);
    discard.hidden = !drafts.has(artifact.id);
    if (supportsDocuments) button(actions, "Test with a document", onRun);
    const feedback = saveFeedback.get(artifact.id);
    if (feedback?.error) error(card, feedback.error);
    else if (feedback?.message) element("p", feedback.message, review).setAttribute("role", "status");
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
  }
  async function show() {
    const version = ++loadVersion;
    sourceLayoutObserver?.disconnect();
    container.replaceChildren();
    fileButtons.clear();
    const header = element("div", undefined, container, "build-header");
    element("h2", "Build", header);
    filesToggle = button(header, "Files", () => {
      if (isCompact()) compactFilesVisible = !compactFilesVisible;
      else explorerCollapsed = !explorerCollapsed;
      updateExplorerVisibility();
      if (!explorer.hidden) filterInput.focus();
    });
    filesToggle.dataset.buildFilesToggle = "true";
    filesToggle.setAttribute("aria-controls", "build-explorer");
    filesToggle.hidden = true;
    const structure = element("div", undefined, header, "build-actions build-structure");
    button(structure, "Edit on App Map", onStructure);
    button(structure, "Run/Debug", onRun);
    const loading = element("p", "Loading app source...", container, "build-loading");
    loading.setAttribute("role", "status");
    try {
      const state = await request("/api/build-workspace?root=" + encodeURIComponent(root));
      if (!isActive() || version !== loadVersion) return;
      artifacts = state.artifacts;
      supportsDocuments = state.supportsDocuments === true;
      loading.remove();
      for (const diagnostic of state.diagnostics ?? []) {
        element("p", (diagnostic.path ? diagnostic.path + ": " : "") + diagnostic.message, container, "build-warning");
      }
      if (!artifacts.length) {
        element("p", "No supported editable source was discovered in this app. Check unity.app.yaml capability paths or inspect the source in Observe/Map.", container, "build-warning");
        return;
      }
      if (!artifacts.some((artifact) => artifact.id === selectedId)) {
        selectedId = (artifacts.find((artifact) => artifact.available) ?? artifacts[0]).id;
      }
      workspace = element("div", undefined, container, "build-workspace");
      explorer = element("nav", undefined, workspace, "build-explorer");
      explorer.id = "build-explorer";
      explorer.setAttribute("aria-label", "Discovered files");
      const explorerHeader = element("div", undefined, explorer, "build-explorer-header");
      element("h3", "Discovered files", explorerHeader);
      const filterRow = element("div", undefined, explorerHeader, "build-filter");
      filterInput = element("input", undefined, filterRow);
      filterInput.type = "search";
      filterInput.placeholder = "Filter files";
      filterInput.setAttribute("aria-label", "Filter discovered files");
      filterInput.value = filter;
      const clearFilter = button(filterRow, "Clear", () => {
        filterInput.value = "";
        applyFilter();
        filterInput.focus();
      });
      clearFilter.hidden = !filter;
      function applyFilter() {
        filter = filterInput.value;
        clearFilter.hidden = !filter;
        renderFileList();
      }
      filterInput.addEventListener("input", applyFilter);
      fileCount = element("span", "", explorerHeader, "build-file-count");
      fileCount.setAttribute("role", "status");
      fileList = element("div", undefined, explorer, "build-file-list");
      editorPane = element("div", undefined, workspace, "build-editor");
      editorPane.setAttribute("role", "region");
      editorPane.setAttribute("aria-label", "Selected file");
      renderFileList();
      renderSelectedArtifact();
      filesToggle.hidden = false;
      updateExplorerVisibility();
      const discovery = element("details", undefined, container, "build-discovery");
      element("summary", "About discovery and editing", discovery);
      element("p", "Edit in Code opens this worktree and the selected file. Inline drafts stay here until you review and save them.", discovery);
      element("p", supportsDocuments
        ? "Instructions guide the model. Trusted tool code and operator-owned policy enforce the rules; the running model cannot change them."
        : "Best-effort source discovery using known filenames and code patterns. Custom implementations may be missed; not discovered does not mean not implemented. Finding source is not proof of runtime readiness.", discovery);
    } catch (cause) { if (isActive() && version === loadVersion) { loading.remove(); error(container, cause.message); } }
  }
  new ResizeObserver(updateExplorerVisibility).observe(container);
  window.addEventListener("focus", () => { if (isActive()) void show(); });
  return { show };
}
