export const SETTINGS_CSS = `
  .studio-settings-toggle { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; min-height:32px; padding:6px; border:0; border-radius:6px; background:transparent; color:var(--studio-muted); }
  .studio-settings-toggle:hover { background:var(--studio-panel); color:var(--studio-ink); }
  .studio-settings-toggle svg { width:18px; height:18px; fill:currentColor; stroke:none; }
  .studio-settings { box-sizing:border-box; position:fixed; inset:0; margin:0; width:100%; height:100dvh; max-width:none; max-height:none; padding:0; border:0; border-radius:0; color:var(--studio-ink); background:var(--studio-raised); font:13px/1.5 var(--font-sans, system-ui, sans-serif); overflow:hidden; }
  .studio-settings[open] { display:flex; flex-direction:column; }
  .studio-settings::backdrop { background:rgb(0 0 0 / .4); }
  .studio-settings-heading { flex:none; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 20px; border-bottom:1px solid var(--studio-line); background:var(--studio-raised); }
  .studio-settings h2 { margin:0; font-size:18px; color:var(--studio-ink); }
  .studio-settings-close { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; min-height:32px; padding:4px; border:0; background:transparent; color:var(--studio-muted); border-radius:6px; }
  .studio-settings-close:hover { background:var(--studio-panel); }
  .studio-settings-layout { display:grid; grid-template-columns:184px minmax(0, 1fr); min-height:0; flex:1; }
  .studio-settings-navigation { display:flex; flex-direction:column; gap:6px; min-width:0; overflow:auto; padding:20px 12px; border-right:1px solid var(--studio-line); background:var(--studio-panel); }
  .studio-settings .studio-settings-scope { margin:0 0 8px; font-size:11px; font-weight:600; }
  .studio-settings .studio-settings-app-name { margin:18px 0 6px; padding-top:16px; border-top:1px solid var(--studio-line); }
  .studio-settings .studio-settings-navigation button { width:100%; justify-content:flex-start; text-align:left; height:auto; min-height:36px; border-color:transparent; background:transparent; font-weight:400; }
  .studio-settings .studio-settings-navigation button[aria-current="page"] { color:var(--studio-ink); background:var(--studio-raised); border-color:var(--studio-line); box-shadow:inset 3px 0 var(--studio-accent); font-weight:600; }
  .studio-settings-compact-navigation { display:none !important; }
  .studio-settings-content { overflow:auto; overscroll-behavior:contain; min-width:0; min-height:0; padding:24px; scrollbar-gutter:stable; }
  .studio-settings-section { max-width:680px; margin:0 auto; min-width:0; }
  .studio-settings-section[hidden] { display:none !important; }
  .studio-settings-section > h3 { margin:0 0 20px; font-size:18px; }
  .studio-settings label, .studio-settings .studio-field { display:grid; gap:6px; min-width:0; color:var(--studio-ink); font-size:12px; font-weight:600; }
  .studio-settings select { box-sizing:border-box; width:100%; min-width:0; max-width:100%; min-height:34px; padding:6px 10px; border:1px solid var(--studio-line); border-radius:6px; color:var(--studio-ink); background:var(--studio-raised); font:13px/1.5 system-ui; }
  .studio-settings p { color:var(--studio-muted); font-size:12px; line-height:1.5; margin:8px 0; overflow-wrap:anywhere; }
  .studio-settings .studio-editor-preference { margin-top:16px; }
  .studio-settings-section > [data-settings-body] { display:grid; gap:14px; min-width:0; }
  .studio-settings-section [data-settings-body] h3 { font-size:14px; margin:0; color:var(--studio-ink); }
  .studio-settings .gateway-fields { display:grid; gap:14px; min-width:0; }
  .studio-settings .field-group { display:grid; gap:8px; min-width:0; }
  .studio-settings .field-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .studio-settings .actions { display:flex; flex-wrap:wrap; gap:8px; margin:0; }
  .studio-settings button:not(.studio-settings-close, .ct-button, .ct-combobox) { width:fit-content; max-width:100%; min-height:32px; padding:6px 10px; border:1px solid var(--studio-line); border-radius:6px; background:var(--studio-raised); color:var(--studio-ink); font:600 12px/1.4 system-ui; white-space:normal; cursor:pointer; }
  .studio-settings button:hover:not(:disabled) { border-color:var(--studio-accent); }
  .studio-settings button.primary { background:var(--studio-accent); border-color:var(--studio-accent); color:var(--studio-on-accent); }
  .studio-settings button.danger, .studio-settings .error { color:var(--studio-danger); }
  .studio-settings button.danger { border-color:var(--studio-danger); }
  .studio-settings button:disabled { opacity:.6; cursor:not-allowed; }
  .studio-settings :is(button, select, summary):focus-visible { outline:2px solid var(--studio-focus); outline-offset:2px; }
  .studio-settings .studio-settings-error:empty { display:none; }
  .studio-settings [data-settings-section="danger"] > h3 { color:var(--studio-danger); }
  @media (max-width:480px), (max-height:480px) {
    .studio-settings-heading { padding:10px 16px; }
    .studio-settings-layout { grid-template-columns:minmax(0, 1fr); grid-template-rows:auto minmax(0, 1fr); }
    .studio-settings-navigation { display:none; }
    .studio-settings .studio-settings-compact-navigation { display:grid !important; padding:12px 16px; border-bottom:1px solid var(--studio-line); background:var(--studio-panel); }
    .studio-settings-content { padding:20px 16px; }
  }
`;

export function createEditorPreference({ select, errorDisplay, globalError, dialog, initialSettings, request, onChange }) {
  function validate(settings) {
    if (!Array.isArray(settings?.editors) || !settings.editors.length
      || settings.editors.some((editor) => typeof editor?.id !== "string" || typeof editor.label !== "string")
      || new Set(settings.editors.map((editor) => editor.id)).size !== settings.editors.length
      || !settings.editors.some((editor) => editor.id === settings.editorId)) {
      throw new Error("Studio returned an invalid editor preference.");
    }
    return settings;
  }
  let confirmed = validate(initialSettings);
  let current = confirmed;
  let busy = false;
  function report(message) {
    errorDisplay.textContent = message;
    globalError.textContent = dialog.open ? "" : message;
  }
  function render(notify = true) {
    select.replaceChildren();
    for (const editor of current.editors) {
      const option = document.createElement("option");
      option.value = editor.id;
      option.textContent = editor.label;
      select.append(option);
    }
    select.value = current.editorId;
    select.disabled = busy;
    if (notify) onChange({ settings: current, busy });
  }
  const api = {
    async refresh({ silentNetworkError = false } = {}) {
      if (busy || window.__appPlatformSubmitting) return;
      busy = true;
      report("");
      render();
      try {
        current = confirmed = validate(await request("/api/editor-settings"));
      } catch (error) {
        current = confirmed;
        const isTransientFetchAbort = silentNetworkError
          && (error?.name === "AbortError" || /Load failed|Failed to fetch|NetworkError/i.test(String(error?.message || "")));
        if (!window.__appPlatformSubmitting && !isTransientFetchAbort) {
          report("Could not load editor preference: " + error.message);
        }
      } finally {
        busy = false;
        render();
      }
    },
    async save(editorId) {
      if (busy) {
        const error = "Wait for the current editor preference request to finish.";
        report(error);
        return { ok: false, error };
      }
      if (!confirmed.editors.some((editor) => editor.id === editorId)) {
        const error = "Choose a supported external editor.";
        report(error);
        return { ok: false, error };
      }
      if (editorId === confirmed.editorId) return { ok: true, settings: confirmed };
      busy = true;
      current = { ...confirmed, editorId };
      report("");
      render();
      try {
        current = confirmed = validate(await request("/api/editor-settings", {
          method: "POST", body: JSON.stringify({ editorId }),
        }));
        return { ok: true, settings: confirmed };
      } catch (cause) {
        current = confirmed;
        const error = "Could not save editor preference: " + cause.message;
        report(error);
        return { ok: false, error };
      } finally {
        busy = false;
        render();
      }
    },
  };
  select.addEventListener("change", () => { void api.save(select.value); });
  render(false);
  return api;
}

export function createStudioSettings({ dialog, trigger, onOpen, onClear = () => {} }) {
  let app;
  let returnFocus;
  let selected = "preferences";
  const sections = new Map();
  const content = dialog.querySelector("[data-settings-app]");
  const navigation = dialog.querySelector("[data-settings-app-navigation]");
  const picker = dialog.querySelector("[data-settings-navigation]");
  const scroller = dialog.querySelector(".studio-settings-content");
  const preferences = dialog.querySelector('[data-settings-section="preferences"]');
  const generalButton = dialog.querySelector('[data-settings-target="preferences"]');
  sections.set("preferences", { element: preferences, button: generalButton });

  function render(section) {
    const entry = sections.get(section);
    if (!entry?.body || !app) return;
    const active = document.activeElement;
    const focused = entry.body.contains(active);
    const label = active?.getAttribute("aria-label");
    const text = active?.textContent;
    onClear(entry.body);
    entry.body.replaceChildren();
    app.renderSection(section, entry.body);
    entry.dirty = false;
    entry.loaded = true;
    if (focused) {
      const replacement = [...entry.body.querySelectorAll("button, select, input")]
        .find((node) => !node.disabled && (label ? node.getAttribute("aria-label") === label : node.textContent === text));
      (replacement || (picker.getClientRects().length ? picker : entry.button)).focus({ preventScroll: true });
    }
  }

  function select(section) {
    const target = sections.has(section) ? section : "preferences";
    const previous = sections.get(selected);
    if (previous) previous.scrollTop = scroller.scrollTop;
    selected = target;
    picker.value = target;
    for (const [id, entry] of sections) {
      entry.element.hidden = id !== target;
      if (id === target) entry.button.setAttribute("aria-current", "page");
      else entry.button.removeAttribute("aria-current");
    }
    const entry = sections.get(target);
    if (entry.body && (!entry.loaded || entry.dirty)) render(target);
    scroller.scrollTop = entry.scrollTop || 0;
  }

  const api = {
    configureApp(value) {
      app = value;
      onClear(content);
      onClear(navigation);
      content.replaceChildren();
      navigation.replaceChildren();
      sections.clear();
      sections.set("preferences", { element: preferences, button: generalButton });
      for (const group of [...picker.querySelectorAll("optgroup")]) group.remove();
      if (!app) { select("preferences"); return; }
      const name = document.createElement("p");
      name.className = "studio-settings-app-name";
      name.textContent = "This app · " + app.name;
      navigation.append(name);
      const options = document.createElement("optgroup");
      options.label = "This app · " + app.name;
      picker.append(options);
      for (const [id, title] of [
        ["general", "General"],
        ["connection", "AI Gateway & Sandbox"],
        ["prereqs", "Prerequisites & CLI tools"],
        ["ports", "Local ports"],
        ["danger", "Danger zone"],
      ]) {
        const element = document.createElement("section");
        element.className = "studio-settings-section";
        element.dataset.settingsSection = id;
        const heading = document.createElement("h3");
        heading.id = "studio-settings-" + id;
        heading.textContent = title;
        element.setAttribute("aria-labelledby", heading.id);
        const scope = document.createElement("p");
        scope.className = "studio-settings-scope";
        scope.textContent = id === "prereqs" ? "This device · Requirements for " + app.name : "This app · " + app.name;
        const body = document.createElement("div");
        body.dataset.settingsBody = "";
        element.append(scope, heading, body);
        const button = window.appPlatformButtons.create({
          appearance: "subtle", children: title, "data-settings-target": id,
          onClick: () => select(id),
        });
        window.appPlatformButtons.append(navigation, button);
        const option = document.createElement("option");
        option.value = id;
        option.textContent = title;
        options.append(option);
        sections.set(id, { element, body, button });
        content.append(element);
      }
      select("preferences");
    },
    setAppName(name) {
      if (!app) return;
      app.name = name;
      navigation.querySelector(".studio-settings-app-name").textContent = "This app · " + name;
      picker.querySelector("optgroup").label = "This app · " + name;
      for (const entry of sections.values()) {
        const scope = entry.element.querySelector(".studio-settings-scope");
        if (entry.body && scope) {
          scope.textContent = entry.element.dataset.settingsSection === "prereqs"
            ? "This device · Requirements for " + name : "This app · " + name;
        }
      }
      api.refreshApp();
    },
    open(section = "preferences") {
      if (!dialog.open) {
        returnFocus = document.activeElement;
        dialog.showModal();
        onOpen?.();
      }
      select(section);
      if (!dialog.contains(document.activeElement) || !document.activeElement.checkVisibility()) {
        (picker.checkVisibility() ? picker : sections.get(selected).button).focus({ preventScroll: true });
      }
    },
    close() { dialog.close(); },
    isOpen(section) {
      return dialog.open && (!section || selected === section);
    },
    refreshApp() {
      if (!dialog.open) return;
      for (const entry of sections.values()) if (entry.body) entry.dirty = true;
      render(selected);
    },
  };
  generalButton.addEventListener("click", () => select("preferences"));
  picker.addEventListener("change", () => select(picker.value));
  trigger.addEventListener("click", () => api.open());
  dialog.querySelector("[data-settings-close]").addEventListener("click", () => api.close());
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    for (const entry of sections.values()) {
      if (!entry.body) continue;
      onClear(entry.body);
      entry.body.replaceChildren();
      entry.loaded = false;
      entry.scrollTop = 0;
    }
    const target = returnFocus?.isConnected && !returnFocus.disabled && returnFocus.getClientRects().length
      ? returnFocus : document.querySelector("dialog[open] [autofocus]") || trigger;
    target.focus({ preventScroll: true });
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") event.stopPropagation();
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button, input, select, textarea, summary, a[href], [tabindex]")]
      .filter((node) => !node.disabled && node.tabIndex >= 0 && node.checkVisibility());
    if (!focusable.length || event.altKey || event.ctrlKey || event.metaKey) return;
    // Include buttons even when WebKit's system keyboard preference skips them.
    event.preventDefault();
    const index = focusable.indexOf(document.activeElement);
    const next = index < 0 ? (event.shiftKey ? focusable.length - 1 : 0)
      : (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
    focusable[next].focus();
  });
  return api;
}
