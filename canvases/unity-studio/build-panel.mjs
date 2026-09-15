export const BUILD_PANEL_CSS = `
#details[data-mode="build"] { padding:20px 16px; font:13px/1.5 var(--font-sans,system-ui); }
#details[data-mode="build"] h2 { margin:0 0 8px; font-size:20px; }
#details[data-mode="build"] p { color:var(--text-color-muted,#6a6775); font-size:12px; }
#details[data-mode="build"] .build-card { margin:14px 0; padding:14px; border:1px solid var(--border-color-default,#ddd); border-radius:12px; background:color-mix(in srgb,var(--true-color-purple,#6b3fd6) 4%,var(--background-color-default,#fff)); }
#details[data-mode="build"] .build-card h3 { margin:0 0 4px; font-size:14px; }
#details[data-mode="build"] code { display:block; overflow-wrap:anywhere; font-size:11px; margin:6px 0; }
#details[data-mode="build"] .build-actions { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; }
#details[data-mode="build"] button { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:32px; padding:6px 10px; border-radius:6px; font:600 12px/18px var(--font-sans,system-ui); white-space:nowrap; }
#details[data-mode="build"] .code-edit { color:var(--true-color-blue,#007acc); border-color:currentColor; }
#details[data-mode="build"] .code-edit svg { width:16px; height:16px; flex:none; fill:currentColor; }
#details[data-mode="build"] textarea, #details[data-mode="build"] select { width:100%; min-width:0; box-sizing:border-box; padding:10px; border:1px solid var(--border-color-default,#ddd); border-radius:8px; color:var(--text-color-default,#222); background:var(--background-color-default,#fff); }
#details[data-mode="build"] textarea { height:110px; min-height:80px; resize:vertical; font:12px/1.5 var(--font-mono,monospace); }
#details[data-mode="build"] pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:300px; overflow:auto; font:12px/1.5 var(--font-mono,monospace); padding:10px; border:1px solid var(--border-color-default,#ddd); border-radius:8px; }
#details[data-mode="build"] .build-warning { border-left:3px solid var(--true-color-orange,#a66700); padding-left:10px; }
#details[data-mode="build"] .build-error { color:var(--true-color-red,#c43232); }
#details[data-mode="build"] .build-error:empty { display:none; }
#details[data-mode="build"] button[hidden] { display:none; }
`;

export function createBuildPanel({ container, root, request, isActive, onRun, onModel }) {
  const drafts = new Map();
  let artifacts = [];
  let loadVersion = 0;
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
    let node = parent.querySelector(".build-error");
    if (!node) node = element("p", "", parent, "build-error");
    node.textContent = message;
  }
  function renderArtifact(artifact) {
    const card = element("section", undefined, container, "build-card");
    card.dataset.artifact = artifact.id;
    element("h3", artifact.title, card);
    element("code", artifact.path, card);
    element("p", artifact.description, card);
    if (!artifact.available) {
      element("p", artifact.detail, card, "build-warning");
      return;
    }
    if (["tool", "contract", "policy"].includes(artifact.id)) {
      element("p", "Developer-owned enforcement. Review changes, test, and rebuild cloud images before deployment.", card, "build-warning");
    }
    const editor = element("textarea", undefined, card);
    editor.rows = 5;
    editor.setAttribute("aria-label", artifact.title + " source");
    editor.spellcheck = false;
    editor.value = drafts.get(artifact.id)?.content ?? artifact.content;
    function rememberDraft() {
      if (editor.value === artifact.content) drafts.delete(artifact.id);
      else drafts.set(artifact.id, {
        content: editor.value, baseSha: drafts.get(artifact.id)?.baseSha ?? artifact.sha,
      });
      discard.hidden = !drafts.has(artifact.id);
    }
    editor.addEventListener("input", rememberDraft);
    const actions = element("div", undefined, card, "build-actions");
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
    button(actions, "Review changes", () => {
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
        if (["tool", "contract", "policy"].includes(artifact.id)) element("p", "Developer enforcement change. Test before use and rebuild cloud images before deployment.", review, "build-warning");
        const save = button(review, "Save reviewed changes", async () => {
          if (editor.value !== reviewed) {
            error(card, "The draft changed. Review it again before saving.");
            return;
          }
          save.disabled = true;
          try {
            const updated = await request("/api/build-file", {
              method: "POST", body: JSON.stringify({ root, id: artifact.id, baseSha: drafts.get(artifact.id)?.baseSha ?? artifact.sha, content: reviewed }),
            });
            Object.assign(artifact, updated);
            drafts.delete(artifact.id);
            discard.hidden = true;
            review.replaceChildren();
            element("p", "Saved. Restart the app for runtime/code changes; rebuild cloud images before deployment.", review);
          } catch (cause) { error(card, cause.message); save.disabled = false; }
        });
    });
    if (drafts.has(artifact.id) && drafts.get(artifact.id).baseSha !== artifact.sha) error(card, "The saved file changed in Code or another editor. Your inline draft is preserved but cannot overwrite it.");
    const discard = button(actions, "Discard draft & reload", () => { drafts.delete(artifact.id); void show(); });
    discard.hidden = !drafts.has(artifact.id);
    button(actions, "Test with a document", onRun);
    if (artifact.id === "runtime") {
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
    container.replaceChildren();
    element("h2", "Build", container);
    element("p", "Edit in Code opens this worktree and the selected file. Compact inline editors are available for quick changes; review before saving.", container);
    element("p", "Instructions guide the model. Trusted tool code and operator-owned policy enforce the rules; the running model cannot change them.", container, "build-warning");
    const loading = element("p", "Loading app source...", container);
    try {
      const state = await request("/api/build-workspace?root=" + encodeURIComponent(root));
      if (!isActive() || version !== loadVersion) return;
      artifacts = state.artifacts;
      loading.remove();
      for (const artifact of artifacts) renderArtifact(artifact);
      element("p", "Test a message with an optional document in Run & manage.", container);
      button(container, "Run & manage", onRun);
    } catch (cause) { if (isActive() && version === loadVersion) { loading.remove(); error(container, cause.message); } }
  }
  window.addEventListener("focus", () => { if (isActive()) void show(); });
  return { show };
}
