import { PLATFORM_TIERS } from "./tier-definitions.mjs";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderStudioHtml(instanceId, apiToken = "") {
  const tierOptions = PLATFORM_TIERS.map((tier, index) => `
    <label class="tier-option">
      <input type="checkbox" name="tierIds" value="${escapeHtml(tier.id)}"${index < 4 ? " checked" : ""}>
      <span><strong>${escapeHtml(tier.name)}</strong><small>${escapeHtml(tier.role)}</small></span>
    </label>`).join("");

  const tierCards = PLATFORM_TIERS.map((tier) => `
    <article class="card" data-tier-card="${escapeHtml(tier.id)}">
      <div class="card-heading">
        <div>
          <h3>${escapeHtml(tier.name)}</h3>
          <p class="role">${escapeHtml(tier.role)}</p>
        </div>
        <span class="count" data-count="${escapeHtml(tier.id)}">Not scanned</span>
      </div>
      <p>${escapeHtml(tier.jobToBeDone)}</p>
      <div class="card-actions">
        <button type="button" data-add-tier="${escapeHtml(tier.id)}">Add capability</button>
        ${tier.preferredCanvases.length > 0
          ? `<button type="button" data-open-studio="${escapeHtml(tier.id)}">Open specialist studio</button>`
          : ""}
      </div>
      <div class="candidate-list" data-candidates="${escapeHtml(tier.id)}">
        <p class="empty">Run discovery to see eligible implementations and Azure resources.</p>
      </div>
    </article>`).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Unity Studio</title>
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        background: var(--background-color-default, #fff);
        color: var(--text-color-default, #1f2328);
        font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        font-size: var(--text-body-medium, 14px);
        line-height: var(--leading-body-medium, 20px);
      }
      header, main { max-width: 1120px; }
      header { margin-bottom: 20px; }
      h1 { margin: 0 0 8px; font-size: var(--text-title-large, 26px); line-height: var(--leading-title-large, 32px); }
      h2 { margin: 0 0 8px; font-size: 19px; }
      h3 { margin: 0; font-size: 16px; }
      p { color: var(--text-color-muted, #59636e); }
      .eyebrow, .role { color: var(--true-color-blue, #0969da); font-weight: 600; }
      .role { margin: 2px 0 0; font-size: 12px; }
      .toolbar, .card-actions, .candidate-actions, .form-actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .toolbar { margin: 16px 0; }
      button {
        border: 1px solid var(--border-color-default, #d1d9e0);
        border-radius: 6px;
        padding: 7px 10px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      button.primary { background: var(--true-color-blue, #0969da); border-color: var(--true-color-blue, #0969da); color: var(--color-white, #fff); }
      button:focus, input:focus, textarea:focus { outline: 2px solid var(--color-focus-outline, #0969da); outline-offset: 1px; }
      button:disabled { cursor: wait; opacity: 0.65; }
      #status { min-height: 20px; }
      .workspace {
        border: 1px solid var(--border-color-default, #d1d9e0);
        border-radius: 12px;
        padding: 18px;
        margin: 20px 0 28px;
        background: var(--true-color-blue-muted, #ddf4ff);
      }
      .form-grid { display: grid; grid-template-columns: minmax(180px, 1fr) 2fr; gap: 12px; }
      label.field { display: flex; flex-direction: column; gap: 5px; font-weight: 600; }
      input[type="text"], textarea {
        width: 100%;
        border: 1px solid var(--border-color-default, #d1d9e0);
        border-radius: 6px;
        padding: 8px;
        background: var(--background-color-default, #fff);
        color: var(--text-color-default, #1f2328);
        font: inherit;
      }
      textarea { min-height: 72px; resize: vertical; }
      .tier-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; margin: 14px 0; }
      .tier-option { display: flex; gap: 8px; align-items: start; padding: 8px; border-radius: 7px; background: var(--background-color-default, #fff); }
      .tier-option span { display: flex; flex-direction: column; }
      .tier-option small, .count, .meta { color: var(--text-color-muted, #59636e); font-size: 12px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 14px; }
      .card { border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 10px; padding: 16px; min-width: 0; }
      .card-heading { display: flex; align-items: start; justify-content: space-between; gap: 10px; }
      .candidate-list { display: grid; gap: 8px; margin-top: 14px; }
      .candidate {
        border: 1px solid var(--border-color-default, #d1d9e0);
        border-radius: 8px;
        padding: 10px;
        background: var(--background-color-default, #fff);
      }
      .candidate-title { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
      .badge { display: inline-block; border-radius: 999px; padding: 1px 7px; background: var(--true-color-blue-muted, #ddf4ff); font-size: 11px; white-space: nowrap; }
      .candidate code { display: block; overflow-wrap: anywhere; color: var(--text-color-muted, #59636e); margin: 4px 0 8px; }
      details { margin: 7px 0; }
      details ul { margin: 6px 0; padding-left: 20px; }
      .empty { margin: 0; font-size: 12px; }
      .panel { margin-top: 24px; border-top: 1px solid var(--border-color-default, #d1d9e0); padding-top: 16px; }
      pre { max-height: 360px; overflow: auto; padding: 12px; border-radius: 8px; background: var(--true-color-blue-muted, #ddf4ff); color: var(--text-color-default, #1f2328); font-family: var(--font-mono, monospace); font-size: 12px; white-space: pre-wrap; }
      footer { margin-top: 24px; color: var(--text-color-muted, #59636e); font-family: var(--font-mono, monospace); font-size: 12px; }
      @media (max-width: 680px) { .form-grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <header>
      <div class="eyebrow">Unity app workspace</div>
      <h1>Unity Studio</h1>
      <p>Create a Unity app in its own worktree, add pattern capabilities, and bind discovered repository or Azure candidates.</p>
      <div class="toolbar">
        <button id="discover" class="primary" type="button">Discover candidates</button>
        <button id="discover-repo" type="button">Repository only</button>
        <button id="trace" type="button">Trace current app</button>
      </div>
      <p id="status" role="status">Create an app or run discovery to get started.</p>
    </header>
    <main>
      <section class="workspace" id="workspace" aria-labelledby="workspace-heading">
        <h2 id="workspace-heading">Create or extend a Unity app</h2>
        <p>A new project session gets an isolated worktree and starts with the relevant Unity specialist canvases.</p>
        <form id="workspace-form">
          <input type="hidden" id="workspace-mode" value="create">
          <input type="hidden" id="candidate-path">
          <input type="hidden" id="azure-resource-id">
          <div class="form-grid">
            <label class="field">App name
              <input id="app-name" type="text" maxlength="80" required placeholder="claims-assistant">
            </label>
            <label class="field">What should this app do?
              <textarea id="app-purpose" maxlength="500" required placeholder="Help claims specialists review submissions and coordinate approvals."></textarea>
            </label>
          </div>
          <div class="tier-options">${tierOptions}</div>
          <div class="form-actions">
            <button class="primary" type="submit">Create app worktree</button>
            <label><input id="open-vscode" type="checkbox" checked> Open the new worktree in VS Code</label>
          </div>
        </form>
      </section>

      <section aria-labelledby="platform-heading">
        <h2 id="platform-heading">Capabilities and candidates</h2>
        <p>Each candidate is real evidence from this repository or the active Azure subscription.</p>
        <div class="grid">${tierCards}</div>
      </section>

      <section class="panel" aria-labelledby="map-heading">
        <h2 id="map-heading">App Map</h2>
        <pre id="app-map">Trace the current app to see its source-derived tier flow.</pre>
      </section>
    </main>
    <footer>Instance: ${escapeHtml(instanceId)} · Workspace creation is delegated to the app host so the new session and worktree appear in the project UI.</footer>
    <script>
      const status = document.getElementById("status");
      const buttons = Array.from(document.querySelectorAll("button"));
      const form = document.getElementById("workspace-form");
      const apiToken = ${JSON.stringify(apiToken)};

      function escape(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function setBusy(busy, message) {
        buttons.forEach((button) => { button.disabled = busy; });
        status.textContent = message;
      }

      async function request(path, options) {
        const requestOptions = { ...(options || {}) };
        requestOptions.headers = {
          ...(requestOptions.headers || {}),
          "X-Unity-Studio-Token": apiToken
        };
        if (requestOptions.method === "POST" && !requestOptions.headers["Content-Type"]) {
          requestOptions.headers["Content-Type"] = "application/json";
        }
        const response = await fetch(path, requestOptions);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Request failed.");
        return payload;
      }

      function evidenceHtml(candidate) {
        const items = candidate.evidence.map((item) =>
          "<li><code>" + escape(item.path || item.detail) + (item.line ? ":" + item.line : "") +
          "</code> " + escape(item.detail) + "</li>").join("");
        return "<details><summary>Evidence (" + candidate.evidence.length + ")</summary><ul>" + items + "</ul></details>";
      }

      function candidateHtml(tierId, candidate) {
        const identity = candidate.source === "repository" ? candidate.projectPath : candidate.resourceId;
        const actions = candidate.source === "repository"
          ? '<button type="button" data-worktree data-tier="' + escape(tierId) + '" data-path="' + escape(candidate.projectPath) + '" data-name="' + escape(candidate.title) + '">New worktree + VS Code</button>' +
            '<button type="button" data-vscode data-path="' + escape(candidate.projectPath) + '">Open current path</button>'
          : '<button type="button" data-bind-resource data-tier="' + escape(tierId) + '" data-resource="' + escape(candidate.resourceId) + '" data-name="' + escape(candidate.title) + '">Add to app</button>';
        return '<article class="candidate">' +
          '<div class="candidate-title"><strong>' + escape(candidate.title) + '</strong><span class="badge">' + escape(candidate.source) + ' · ' + escape(candidate.confidence) + '</span></div>' +
          '<code>' + escape(identity) + '</code>' +
          (candidate.subtitle ? '<div class="meta">' + escape(candidate.subtitle) + '</div>' : '') +
          evidenceHtml(candidate) +
          '<div class="candidate-actions">' + actions + '</div>' +
          '</article>';
      }

      function renderDiscovery(payload) {
        payload.catalog.forEach((tier) => {
          const count = document.querySelector('[data-count="' + tier.id + '"]');
          count.textContent = tier.candidates.length === 0
            ? "No candidate"
            : tier.candidates.length + " candidate" + (tier.candidates.length === 1 ? "" : "s");
          const list = document.querySelector('[data-candidates="' + tier.id + '"]');
          list.innerHTML = tier.candidates.length
            ? tier.candidates.map((candidate) => candidateHtml(tier.id, candidate)).join("")
            : '<p class="empty">Nothing eligible was observed. Use <strong>Add capability</strong> to scaffold it in an app worktree.</p>';
        });
        wireCandidateActions();
      }

      function selectOnlyTier(tierId) {
        document.querySelectorAll('input[name="tierIds"]').forEach((input) => {
          input.checked = input.value === tierId;
        });
      }

      function seedWorkspace({ mode = "create", tierId, candidatePath = "", azureResourceId = "", name = "" }) {
        document.getElementById("workspace-mode").value = mode;
        document.getElementById("candidate-path").value = candidatePath;
        document.getElementById("azure-resource-id").value = azureResourceId;
        if (name) document.getElementById("app-name").value = name;
        if (tierId) selectOnlyTier(tierId);
        form.querySelector('button[type="submit"]').textContent = mode === "extend" ? "Create capability worktree" : "Create app worktree";
        document.getElementById("workspace").scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("app-purpose").focus();
      }

      function wireCandidateActions() {
        document.querySelectorAll("[data-worktree]").forEach((button) => {
          button.addEventListener("click", () => seedWorkspace({
            mode: "extend",
            tierId: button.dataset.tier,
            candidatePath: button.dataset.path,
            name: button.dataset.name
          }));
        });
        document.querySelectorAll("[data-vscode]").forEach((button) => {
          button.addEventListener("click", async () => {
            setBusy(true, "Opening " + button.dataset.path + " in VS Code…");
            try {
              await request("/api/open-vscode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ root: button.dataset.path })
              });
              status.textContent = "Opened the discovered path in VS Code.";
            } catch (error) {
              status.textContent = error.message;
            } finally {
              setBusy(false, status.textContent);
            }
          });
        });
        document.querySelectorAll("[data-bind-resource]").forEach((button) => {
          button.addEventListener("click", () => seedWorkspace({
            tierId: button.dataset.tier,
            azureResourceId: button.dataset.resource,
            name: button.dataset.name
          }));
        });
      }

      async function discover(includeAzure) {
        setBusy(true, includeAzure ? "Discovering repository and Azure candidates…" : "Discovering repository candidates…");
        try {
          const payload = await request("/api/discovery?azure=" + includeAzure);
          renderDiscovery(payload);
          status.textContent = "Candidates are grouped under the capabilities they can fulfill.";
        } catch (error) {
          status.textContent = error.message;
        } finally {
          setBusy(false, status.textContent);
        }
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const tierIds = Array.from(document.querySelectorAll('input[name="tierIds"]:checked')).map((input) => input.value);
        setBusy(true, "Requesting a new Unity app worktree…");
        try {
          const payload = await request("/api/workspace-request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: document.getElementById("workspace-mode").value,
              appName: document.getElementById("app-name").value,
              purpose: document.getElementById("app-purpose").value,
              tierIds,
              candidatePath: document.getElementById("candidate-path").value || undefined,
              azureResourceId: document.getElementById("azure-resource-id").value || undefined,
              openInVsCode: document.getElementById("open-vscode").checked
            })
          });
          status.textContent = "Workspace request sent. Copilot is creating the child session and worktree.";
          setBusy(false, status.textContent);
          form.querySelector('button[type="submit"]').textContent = "Workspace requested";
          form.querySelector('button[type="submit"]').disabled = true;
        } catch (error) {
          status.textContent = error.message;
          setBusy(false, status.textContent);
        }
      });

      document.getElementById("discover").addEventListener("click", () => discover(true));
      document.getElementById("discover-repo").addEventListener("click", () => discover(false));
      document.getElementById("trace").addEventListener("click", async () => {
        setBusy(true, "Tracing source relationships…");
        try {
          const payload = await request("/api/app-map", { method: "POST" });
          document.getElementById("app-map").textContent = JSON.stringify(payload, null, 2);
          status.textContent = "App Map derived from source evidence.";
        } catch (error) {
          status.textContent = error.message;
        } finally {
          setBusy(false, status.textContent);
        }
      });
      document.querySelectorAll("[data-add-tier]").forEach((button) => {
        button.addEventListener("click", () => seedWorkspace({ tierId: button.dataset.addTier }));
      });
      document.querySelectorAll("[data-open-studio]").forEach((button) => {
        button.addEventListener("click", async () => {
          setBusy(true, "Opening the specialist studio…");
          try {
            const payload = await request("/api/tier-action", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tierId: button.dataset.openStudio, includeAzure: false })
            });
            status.textContent = payload.outcome === "canvas-opened"
              ? "Opened the registered specialist studio."
              : "No specialist studio is registered; use Add capability to continue in a worktree.";
          } catch (error) {
            status.textContent = error.message;
          } finally {
            setBusy(false, status.textContent);
          }
        });
      });
    </script>
  </body>
</html>`;
}
