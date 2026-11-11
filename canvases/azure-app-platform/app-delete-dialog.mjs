export function showAppDeleteDialog({ root, name, request, buttons, onPending = () => {}, returnFocus = document.activeElement }) {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "app-delete-dialog";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "app-delete-title");
    dialog.setAttribute("aria-describedby", "app-delete-path app-delete-warning app-delete-cloud");
    dialog.tabIndex = -1;
    buttons.replace(dialog, '<form><h2 id="app-delete-title"></h2><p id="app-delete-path"></p>' +
      '<p id="app-delete-warning">This permanently removes the local Git worktree, all its files, and its Canvas-created branch. ' +
      'Uncommitted changes and untracked files will be permanently lost (git worktree remove --force). This cannot be undone.</p>' +
      '<p id="app-delete-cloud">No Azure resources, repositories, or cloud deployments will be deleted.</p>' +
      '<p role="status" data-delete-status></p><div class="app-delete-actions">' +
      '<button type="button" tabindex="0" data-studio-button="secondary" id="cancel-delete">No, keep app</button>' +
      '<button type="submit" tabindex="0" class="danger" id="confirm-delete">Yes, delete worktree</button></div></form>');
    dialog.querySelector("h2").textContent = "Delete " + name + "?";
    dialog.querySelector("#app-delete-path").textContent = root;
    const style = document.createElement("style");
    style.textContent = `
      .app-delete-dialog { box-sizing:border-box; position:fixed; inset:0; margin:auto; width:min(440px, calc(100vw - 32px)); max-height:calc(100dvh - 32px); overflow:auto; padding:20px; border:1px solid var(--studio-line); border-radius:var(--studio-dialog-radius, 8px); background:var(--studio-raised); color:var(--studio-ink); font:13px/1.5 var(--font-sans, system-ui, sans-serif); }
      .app-delete-dialog::backdrop { background:rgb(0 0 0 / .4); }
      .app-delete-dialog h2 { margin:0 0 12px; font-size:18px; overflow-wrap:anywhere; }
      .app-delete-dialog p { color:var(--studio-muted); overflow-wrap:anywhere; }
      .app-delete-dialog #app-delete-path { color:var(--studio-ink); font-family:var(--font-mono, monospace); }
      .app-delete-dialog .app-delete-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; margin-top:16px; }
      .app-delete-dialog .danger { padding:6px 10px; border:1px solid var(--studio-danger); border-radius:6px; background:var(--studio-raised); color:var(--studio-danger); font:inherit; cursor:pointer; }
      .app-delete-dialog .danger:disabled { opacity:.6; cursor:not-allowed; }
      .app-delete-dialog .danger:focus-visible { outline:2px solid var(--studio-focus); outline-offset:2px; }
      .app-delete-dialog [data-delete-status]:empty { display:none; }
    `;
    dialog.append(style);
    document.body.append(dialog);
    const cancel = dialog.querySelector("#cancel-delete");
    const confirm = dialog.querySelector("#confirm-delete");
    let pending = false, result = null;
    cancel.addEventListener("click", () => { if (!pending) dialog.close(); });
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      if (!pending) dialog.close();
    });
    dialog.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!pending) dialog.close();
      }
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const targets = [cancel, confirm].filter(target => !target.disabled);
      if (!targets.length) { dialog.focus(); return; }
      const index = targets.indexOf(document.activeElement);
      const next = index < 0 ? (event.shiftKey ? targets.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
      targets[next].focus();
    });
    dialog.addEventListener("close", () => {
      buttons.clear(dialog);
      dialog.remove();
      if (returnFocus?.isConnected && !returnFocus.disabled) returnFocus.focus({ preventScroll: true });
      resolve(result);
    }, { once: true });
    dialog.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault();
      if (pending) return;
      pending = true;
      dialog.setAttribute("aria-busy", "true");
      buttons.setDisabled(cancel, true);
      buttons.setDisabled(confirm, true);
      dialog.querySelector("[data-delete-status]").textContent = "Deleting local worktree. This operation cannot be cancelled.";
      dialog.focus();
      try {
        onPending();
        result = await request("/api/delete-app", {
          method: "POST", body: JSON.stringify({ root, confirmed: true }),
        });
        if (!["complete", "partial", "failed"].includes(result?.outcome)
          || result.worktreeRemoved !== (result.outcome !== "failed")
          || (result.worktreeRemoved && typeof result.message !== "string")
          || (result.outcome === "failed" && typeof result.error !== "string")) {
          throw new Error("Canvas returned an invalid deletion result. Refresh the app list before taking further action.");
        }
      } catch (cause) {
        result = { outcome: "failed", worktreeRemoved: false, error: cause.message };
      }
      dialog.close();
    });
    dialog.showModal();
    cancel.focus();
  });
}
