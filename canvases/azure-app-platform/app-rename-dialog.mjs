export function showAppRenameDialog({ root, name, request, buttons, returnFocus = document.activeElement }) {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "app-rename-dialog";
    buttons.replace(dialog, '<form><h2 id="app-rename-title">Rename app</h2>' +
      '<p id="app-rename-description">Changes the display name only. The folder, Git names, and Azure resources stay unchanged.</p>' +
      '<div data-rename-field></div>' +
      '<p role="alert" class="app-rename-error"></p><div class="app-rename-actions">' +
      '<button type="button" data-studio-button="secondary" data-rename-cancel>Cancel</button>' +
      '<button type="submit" data-studio-button="primary" data-rename-save>Save</button></div></form>');
    dialog.setAttribute("aria-labelledby", "app-rename-title");
    dialog.setAttribute("aria-describedby", "app-rename-description");
    const style = document.createElement("style");
    style.textContent = `
      .app-rename-dialog { box-sizing:border-box; position:fixed; inset:0; margin:auto; width:min(420px, calc(100vw - 32px)); max-height:calc(100dvh - 32px); overflow:auto; padding:20px; border:1px solid var(--studio-line); border-radius:var(--studio-dialog-radius, 8px); background:var(--studio-raised); color:var(--studio-ink); font:13px/1.5 var(--font-sans, system-ui, sans-serif); }
      .app-rename-dialog::backdrop { background:rgb(0 0 0 / .4); }
      .app-rename-dialog h2 { margin:0 0 12px; font-size:18px; }
      .app-rename-dialog p { color:var(--studio-muted); overflow-wrap:anywhere; }
      .app-rename-dialog .app-rename-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
      .app-rename-dialog .app-rename-error { color:var(--studio-danger); }
      .app-rename-dialog .app-rename-error:empty { display:none; }
    `;
    dialog.append(style);
    document.body.append(dialog);
    const input = buttons.field({
      kind: "TextInput", label: "App name", "aria-label": "App name",
      defaultValue: name, maxLength: 80, required: true, autoComplete: "off",
    });
    buttons.append(dialog.querySelector("[data-rename-field]"), input);
    const cancel = dialog.querySelector("[data-rename-cancel]");
    const save = dialog.querySelector("[data-rename-save]");
    const error = dialog.querySelector('[role="alert"]');
    let busy = false, result = null;
    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
    dialog.addEventListener("keydown", event => {
      if (event.key === "Escape") event.stopPropagation();
      if (event.key !== "Tab") return;
      const targets = [input, cancel, save].filter(target => !target.disabled);
      if (!targets.length) { event.preventDefault(); return; }
      event.preventDefault();
      const index = targets.indexOf(document.activeElement);
      targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus();
    });
    dialog.addEventListener("close", () => {
      buttons.clear(dialog);
      dialog.remove();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      resolve(result);
    }, { once: true });
    dialog.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault();
      if (busy) return;
      const nextName = input.value.trim();
      if (!nextName) { error.textContent = "App name is required."; input.focus(); return; }
      busy = true;
      buttons.update(input, { disabled: true });
      buttons.update(cancel, { disabled: true });
      buttons.update(save, { disabled: true, children: "Saving..." });
      error.textContent = "";
      try {
        const renamed = await request("/api/rename-app", {
          method: "POST", body: JSON.stringify({ root, name: nextName }),
        });
        if (typeof renamed?.name !== "string" || !renamed.name.trim()) {
          throw new Error("Canvas returned an invalid app name.");
        }
        result = renamed.name;
        dialog.close();
      } catch (cause) {
        error.textContent = "Could not rename app: " + cause.message;
        busy = false;
        buttons.update(input, { disabled: false });
        buttons.update(cancel, { disabled: false });
        buttons.update(save, { disabled: false, children: "Save" });
        input.focus();
      }
    });
    dialog.showModal();
    input.focus();
    input.select();
  });
}
