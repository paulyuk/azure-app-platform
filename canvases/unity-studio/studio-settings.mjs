export const SETTINGS_CSS = `
  .studio-settings-toggle { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; min-height:32px; padding:6px; border:0; border-radius:6px; background:transparent; color:var(--studio-muted); }
  .studio-settings-toggle:hover { background:var(--studio-panel); color:var(--studio-ink); }
  .studio-settings-toggle svg { width:18px; height:18px; fill:currentColor; stroke:none; }
  .studio-settings { width:min(520px, calc(100vw - 24px)); max-width:none; max-height:calc(100dvh - 24px); padding:0; border:1px solid var(--studio-line); border-radius:12px; color:var(--studio-ink); background:var(--studio-raised); box-shadow:0 16px 48px rgb(0 0 0 / .24); font:13px/1.5 var(--font-sans, system-ui, sans-serif); overflow:auto; }
  .studio-settings::backdrop { background:rgb(0 0 0 / .4); }
  .studio-settings-heading { position:sticky; top:0; z-index:1; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 20px; border-bottom:1px solid var(--studio-line); background:var(--studio-raised); }
  .studio-settings h2 { margin:0; font-size:18px; color:var(--studio-ink); }
  .studio-settings-close { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; min-height:32px; padding:4px; border:0; background:transparent; color:var(--studio-muted); border-radius:6px; }
  .studio-settings-close:hover { background:var(--studio-panel); }
  .studio-settings-content { padding:16px 20px 20px; }
  .studio-settings label, .studio-settings .studio-field { display:grid; gap:6px; min-width:0; color:var(--studio-ink); font-size:12px; font-weight:600; }
  .studio-settings select { box-sizing:border-box; width:100%; min-width:0; max-width:100%; min-height:34px; padding:6px 10px; border:1px solid var(--studio-line); border-radius:6px; color:var(--studio-ink); background:var(--studio-raised); font:13px/1.5 system-ui; }
  .studio-settings p { color:var(--studio-muted); font-size:12px; line-height:1.5; margin:8px 0; overflow-wrap:anywhere; }
  .studio-settings-app-name { margin-top:20px !important; padding-top:16px; border-top:1px solid var(--studio-line); font-weight:600; color:var(--studio-ink) !important; }
  .studio-settings .studio-editor-preference { margin-top:16px; }
  .studio-settings-section { border-bottom:1px solid var(--studio-line); }
  .studio-settings-section > summary { display:list-item; padding:12px 0; cursor:pointer; font-size:13px; font-weight:600; }
  .studio-settings-section > div { display:grid; gap:14px; padding:0 0 16px; min-width:0; }
  .studio-settings-section h3 { font-size:14px; margin:0; color:var(--studio-ink); }
  .studio-settings .gateway-fields { display:grid; gap:14px; min-width:0; }
  .studio-settings .field-group { display:grid; gap:8px; min-width:0; }
  .studio-settings .field-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .studio-settings .actions { display:flex; flex-wrap:wrap; gap:8px; margin:0; }
  .studio-settings button:not(.studio-settings-close) { width:fit-content; max-width:100%; min-height:32px; padding:6px 10px; border:1px solid var(--studio-line); border-radius:6px; background:var(--studio-raised); color:var(--studio-ink); font:600 12px/1.4 system-ui; white-space:normal; cursor:pointer; }
  .studio-settings button:hover:not(:disabled) { border-color:var(--studio-accent); }
  .studio-settings button.primary { background:var(--studio-accent); border-color:var(--studio-accent); color:var(--studio-on-accent); }
  .studio-settings button.danger, .studio-settings .error { color:var(--studio-danger); }
  .studio-settings button.danger { border-color:var(--studio-danger); }
  .studio-settings button:disabled { opacity:.6; cursor:not-allowed; }
  .studio-settings :is(button, select, summary):focus-visible { outline:2px solid var(--studio-focus); outline-offset:2px; }
  .studio-settings .studio-settings-error:empty { display:none; }
  .studio-settings [data-settings-section="danger"] > summary { color:var(--studio-danger); }
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
      if (busy || window.__unityStudioSubmitting) return;
      busy = true;
      report("");
      render();
      try {
        current = confirmed = validate(await request("/api/editor-settings"));
      } catch (error) {
        current = confirmed;
        const isTransientFetchAbort = silentNetworkError
          && (error?.name === "AbortError" || /Load failed|Failed to fetch|NetworkError/i.test(String(error?.message || "")));
        if (!window.__unityStudioSubmitting && !isTransientFetchAbort) {
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
  const sections = new Map();
  const content = dialog.querySelector("[data-settings-app]");

  function render(section) {
    const entry = sections.get(section);
    if (!entry?.element.open || !app) return;
    const active = document.activeElement;
    const focused = entry.body.contains(active);
    const label = active?.getAttribute("aria-label");
    const text = active?.textContent;
    onClear(entry.body);
    entry.body.replaceChildren();
    app.renderSection(section, entry.body);
    if (focused) {
      const replacement = [...entry.body.querySelectorAll("button, select, input")]
        .find((node) => !node.disabled && (label ? node.getAttribute("aria-label") === label : node.textContent === text));
      (replacement || entry.summary).focus({ preventScroll: true });
    }
  }

  const api = {
    configureApp(value) {
      app = value;
      onClear(content);
      content.replaceChildren();
      sections.clear();
      if (!app) return;
      const name = document.createElement("p");
      name.className = "studio-settings-app-name";
      name.textContent = "This app · " + app.name;
      content.append(name);
      for (const [id, title] of [
        ["connection", "AI Gateway & Sandbox"],
        ["prereqs", "Prerequisites & CLI tools"],
        ["ports", "Local ports"],
        ["danger", "Danger zone"],
      ]) {
        const element = document.createElement("details");
        element.className = "studio-settings-section";
        element.dataset.settingsSection = id;
        const summary = document.createElement("summary");
        summary.textContent = title;
        const body = document.createElement("div");
        element.append(summary, body);
        sections.set(id, { element, body, summary });
        element.addEventListener("toggle", () => {
          if (!element.open) { onClear(body); body.replaceChildren(); }
          else if (dialog.open && !body.childElementCount) render(id);
        });
        content.append(element);
      }
    },
    open(section = "preferences") {
      const target = section === "preferences" && sections.has("connection")
        ? "connection"
        : section;
      if (!dialog.open) {
        returnFocus = document.activeElement;
        dialog.showModal();
        onOpen?.();
        if (section === "preferences" && sections.has("prereqs")) {
          sections.get("prereqs").element.open = true;
        }
        for (const id of sections.keys()) {
          if (id !== target) render(id);
        }
      }
      const entry = sections.get(target);
      if (entry) {
        entry.element.open = true;
        render(target);
        entry.summary.focus();
        entry.summary.scrollIntoView({ block: "nearest" });
      }
    },
    close() { dialog.close(); },
    isOpen(section) {
      return dialog.open && (!section || Boolean(sections.get(section)?.element.open));
    },
    refreshApp() {
      if (!dialog.open) return;
      for (const id of sections.keys()) render(id);
    },
  };
  trigger.addEventListener("click", () => api.open());
  dialog.querySelector("[data-settings-close]").addEventListener("click", () => api.close());
  dialog.addEventListener("close", () => {
    for (const entry of sections.values()) { onClear(entry.body); entry.body.replaceChildren(); }
    (returnFocus?.isConnected ? returnFocus : trigger).focus({ preventScroll: true });
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") event.stopPropagation();
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button, input, select, textarea, summary, a[href], [tabindex]")]
      .filter((node) => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  return api;
}
