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
  const tierOptions = PLATFORM_TIERS.map((tier) => `
    <label class="tier-option">
      <input type="checkbox" name="tierIds" value="${escapeHtml(tier.id)}">
      <span><strong>${escapeHtml(tier.name)}</strong><small>${escapeHtml(tier.role)}</small></span>
    </label>`).join("");

  const tierCards = PLATFORM_TIERS.map((tier) => `
    <article class="card" data-tier-card="${escapeHtml(tier.id)}">
      <div class="card-heading">
        <div>
          <div class="tier-label">${escapeHtml(tier.name)}</div>
          <h3>${escapeHtml(tier.role)}</h3>
        </div>
        <span class="state state--checking" data-state="${escapeHtml(tier.id)}">Scanning</span>
      </div>
      <p>${escapeHtml(tier.jobToBeDone)}</p>
      <div class="tier-body" data-tier-body="${escapeHtml(tier.id)}">
        <p class="empty">Scanning the current worktree for source projects and configuration.</p>
      </div>
      <div class="card-actions" data-tier-actions="${escapeHtml(tier.id)}"></div>
      <details>
        <summary>Contract and production path</summary>
        <p><strong>Expected interfaces:</strong> ${tier.expectedInterfaces.map(escapeHtml).join(", ")}</p>
        <p>${escapeHtml(tier.scaffold.summary)}</p>
        <ol>${tier.scaffold.nextActions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ol>
      </details>
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
        font-size: 14px;
        line-height: 1.45;
      }
      header, main, footer { max-width: 1120px; margin-inline: auto; }
      header { margin-bottom: 24px; }
      h1 { margin: 0 0 8px; font-size: 28px; }
      h2 { margin: 0 0 6px; font-size: 20px; }
      h3 { margin: 2px 0 0; font-size: 15px; }
      p { color: var(--text-color-muted, #59636e); }
      .eyebrow, .tier-label { color: var(--true-color-blue, #0969da); font-weight: 650; }
      .tier-label { font-size: 12px; }
      .toolbar, .card-actions, .candidate-actions, .form-actions, .summary-strip { display: flex; flex-wrap: wrap; gap: 8px; }
      .toolbar { margin: 16px 0 10px; }
      button {
        min-height: 36px;
        border: 1px solid var(--border-color-default, #d1d9e0);
        border-radius: 6px;
        padding: 7px 11px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      button.primary { background: var(--true-color-blue, #0969da); border-color: var(--true-color-blue, #0969da); color: var(--color-white, #fff); }
      button:focus-visible, input:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 2px solid var(--color-focus-outline, #0969da); outline-offset: 2px; }
      button:disabled { cursor: wait; opacity: 0.65; }
      #status { min-height: 20px; }
      .summary-strip { margin: 16px 0; }
      .summary-item { border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 8px; padding: 9px 12px; min-width: 130px; }
      .summary-item strong { display: block; font-size: 18px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(315px, 1fr)); gap: 14px; }
      .card { border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 10px; padding: 16px; min-width: 0; }
      .card-heading { display: flex; align-items: start; justify-content: space-between; gap: 10px; }
      .state { border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 650; white-space: nowrap; }
      .state--observed { background: #dafbe1; color: #116329; }
      .state--available { background: var(--true-color-blue-muted, #ddf4ff); color: #0550ae; }
      .state--missing, .state--checking { background: #fff8c5; color: #633c01; }
      .tier-body { display: grid; gap: 8px; margin: 12px 0; }
      .candidate { border-left: 3px solid var(--border-color-default, #d1d9e0); padding: 3px 0 3px 10px; min-width: 0; }
      .candidate-heading { display: flex; justify-content: space-between; gap: 8px; }
      .candidate code { display: block; overflow-wrap: anywhere; color: var(--text-color-muted, #59636e); margin: 3px 0; }
      .badge, .meta { color: var(--text-color-muted, #59636e); font-size: 11px; }
      .empty { margin: 0; font-size: 12px; }
      details { margin-top: 12px; }
      details > summary { cursor: pointer; font-weight: 600; }
      details ol, details ul { margin-block: 7px; padding-left: 20px; }
      .create-panel { margin-top: 28px; border-top: 1px solid var(--border-color-default, #d1d9e0); padding-top: 18px; }
      .create-box { border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 10px; padding: 14px; }
      .create-box > summary { font-size: 16px; }
      .form-grid { display: grid; grid-template-columns: minmax(180px, 1fr) 2fr; gap: 12px; margin-top: 14px; }
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
      .tier-option { display: flex; gap: 8px; align-items: start; padding: 8px; border-radius: 7px; background: var(--true-color-blue-muted, #ddf4ff); }
      .tier-option span { display: flex; flex-direction: column; }
      .tier-option small { color: var(--text-color-muted, #59636e); font-size: 11px; }
      .panel { margin-top: 24px; border-top: 1px solid var(--border-color-default, #d1d9e0); padding-top: 16px; }
      pre { max-height: 360px; overflow: auto; padding: 12px; border-radius: 8px; background: var(--true-color-blue-muted, #ddf4ff); font-family: var(--font-mono, monospace); font-size: 12px; white-space: pre-wrap; }
      footer { margin-top: 24px; color: var(--text-color-muted, #59636e); font-family: var(--font-mono, monospace); font-size: 12px; }
      @media (max-width: 680px) { .form-grid { grid-template-columns: 1fr; } body { padding: 16px; } }
    </style>
  </head>
  <body>
    <header>
      <div class="eyebrow">Unity app workspace</div>
      <h1>Unity Studio</h1>
      <p>See the source projects and Azure resources that implement this app, then build, improve, bind, or inspect each capability.</p>
      <div class="toolbar">
        <button id="refresh" class="primary" type="button">Refresh app inventory</button>
        <button id="refresh-azure" type="button">Include Azure resources</button>
        <button id="trace" type="button">Trace app flow</button>
      </div>
      <p id="status" role="status" aria-live="polite">Inspecting the current worktree.</p>
    </header>
    <main>
      <section aria-labelledby="inventory-heading">
        <h2 id="inventory-heading">Current app inventory</h2>
        <p>Implemented means a source project or configuration was detected in this worktree. Resource available means Azure has an option that is not yet wired into the app.</p>
        <div class="summary-strip" id="inventory-summary" aria-label="Capability summary"></div>
        <div class="grid">${tierCards}</div>
      </section>

      <section class="panel" aria-labelledby="map-heading">
        <h2 id="map-heading">App Map</h2>
        <pre id="app-map">Trace the app to see source-derived links between implemented tiers.</pre>
      </section>

      <section class="create-panel" aria-label="New app">
        <details class="create-box">
          <summary>Create another Unity app in a new worktree</summary>
          <p>Use this only when you want a separate app. To change the current app, use its capability cards above.</p>
          <form id="workspace-form">
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
        </details>
      </section>
    </main>
    <footer>Instance: ${escapeHtml(instanceId)} · Not added means no matching implementation was found in this worktree.</footer>
    <script>
      const status = document.getElementById("status");
      const form = document.getElementById("workspace-form");
      const apiToken = ${JSON.stringify(apiToken)};
      let inventory;

      function escape(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function setBusy(busy, message) {
        document.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
        status.textContent = message;
      }

      async function request(path, options) {
        const requestOptions = { ...(options || {}) };
        requestOptions.headers = { ...(requestOptions.headers || {}), "X-Unity-Studio-Token": apiToken };
        if (requestOptions.method === "POST" && !requestOptions.headers["Content-Type"]) {
          requestOptions.headers["Content-Type"] = "application/json";
        }
        const response = await fetch(path, requestOptions);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Request failed.");
        return payload;
      }

      function sourceMatchesHtml(implementation) {
        const items = implementation.matchedFiles.map((item) =>
          "<li><code>" + escape(item.path || item.detail) + (item.line ? ":" + item.line : "") +
          "</code> " + escape(item.detail) + "</li>").join("");
        return "<details><summary>Matched files (" + implementation.matchedFiles.length +
          ")</summary><ul>" + items + "</ul></details>";
      }

      function implementationHtml(implementation) {
        const identity = implementation.kind === "source-project" ? implementation.projectPath : implementation.resourceId;
        return '<div class="candidate">' +
          '<div class="candidate-heading"><strong>' + escape(implementation.title) + '</strong>' +
          '<span class="badge">' + (implementation.kind === "source-project" ? "source project" : "Azure resource") + '</span></div>' +
          '<code>' + escape(identity) + '</code>' +
          (implementation.subtitle ? '<div class="meta">' + escape(implementation.subtitle) + '</div>' : '') +
          sourceMatchesHtml(implementation) + '</div>';
      }

      function actionButton(label, attributes, primary = false) {
        return '<button type="button"' + (primary ? ' class="primary"' : '') + ' ' + attributes + '>' + label + '</button>';
      }

      function renderInventory(payload) {
        inventory = payload;
        let observed = 0;
        let available = 0;
        payload.inventory.forEach((tier) => {
          const repositories = tier.implementations.filter((item) => item.kind === "source-project");
          const resources = tier.implementations.filter((item) => item.kind === "azure-resource");
          if (repositories.length) observed += 1;
          else if (resources.length) available += 1;

          const state = document.querySelector('[data-state="' + tier.id + '"]');
          state.className = "state";
          if (repositories.length) {
            state.classList.add("state--observed");
            state.textContent = "Implemented";
          } else if (resources.length) {
            state.classList.add("state--available");
            state.textContent = "Resource available";
          } else {
            state.classList.add("state--missing");
            state.textContent = "Not added";
          }

          const body = document.querySelector('[data-tier-body="' + tier.id + '"]');
          body.innerHTML = tier.implementations.length
            ? tier.implementations.map(implementationHtml).join("")
            : '<p class="empty">No source project or configured resource was found. The contract below is the build path for this tier.</p>';

          const actions = [];
          const primaryRepo = repositories[0];
          const primaryResource = resources[0];
          actions.push(actionButton(
            repositories.length ? "Improve capability" : "Build capability",
            'data-build-tier="' + escape(tier.id) + '" data-intent="' + (repositories.length ? "improve" : "add") + '"' +
              (primaryRepo ? ' data-path="' + escape(primaryRepo.projectPath) + '"' : '') +
              (primaryResource ? ' data-resource="' + escape(primaryResource.resourceId) + '"' : ''),
            true
          ));
          if (primaryRepo) {
            actions.push(actionButton("Open source in VS Code", 'data-vscode data-path="' + escape(primaryRepo.projectPath) + '"'));
          }
          if (${JSON.stringify(PLATFORM_TIERS.reduce((result, tier) => ({ ...result, [tier.id]: tier.preferredCanvases.length > 0 }), {}))}[tier.id]) {
            actions.push(actionButton("Open specialist studio", 'data-open-studio="' + escape(tier.id) + '"'));
          }
          document.querySelector('[data-tier-actions="' + tier.id + '"]').innerHTML = actions.join("");
        });
        const missing = payload.inventory.length - observed;
        document.getElementById("inventory-summary").innerHTML =
          '<div class="summary-item"><strong>' + observed + '/9</strong>tiers implemented</div>' +
          '<div class="summary-item"><strong>' + missing + '</strong>tiers to build</div>' +
          '<div class="summary-item"><strong>' + available + '</strong>Azure-only options</div>' +
          '<div class="summary-item"><strong>' + payload.repository.scannedFiles + '</strong>files scanned</div>';
        wireInventoryActions();
      }

      function wireInventoryActions() {
        document.querySelectorAll("[data-build-tier]").forEach((button) => {
          button.addEventListener("click", async () => {
            setBusy(true, (button.dataset.intent === "improve" ? "Requesting capability improvement…" : "Requesting capability build…"));
            try {
              await request("/api/capability-request", {
                method: "POST",
                body: JSON.stringify({
                  tierId: button.dataset.buildTier,
                  intent: button.dataset.intent,
                  sourceProjectPath: button.dataset.path || undefined,
                  azureResourceId: button.dataset.resource || undefined
                })
              });
              status.textContent = "Capability work requested in this app session.";
            } catch (error) {
              status.textContent = error.message;
            } finally {
              setBusy(false, status.textContent);
            }
          });
        });
        document.querySelectorAll("[data-vscode]").forEach((button) => {
          button.addEventListener("click", async () => {
            setBusy(true, "Opening source in VS Code…");
            try {
              await request("/api/open-vscode", { method: "POST", body: JSON.stringify({ root: button.dataset.path }) });
              status.textContent = "Opened capability source in VS Code.";
            } catch (error) {
              status.textContent = error.message;
            } finally {
              setBusy(false, status.textContent);
            }
          });
        });
        document.querySelectorAll("[data-open-studio]").forEach((button) => {
          button.addEventListener("click", async () => {
            setBusy(true, "Opening specialist studio…");
            try {
              const payload = await request("/api/tier-action", {
                method: "POST",
                body: JSON.stringify({ tierId: button.dataset.openStudio, includeAzure: false })
              });
              status.textContent = payload.outcome === "canvas-opened"
                ? "Opened the specialist studio."
                : "No specialist studio is registered for this session.";
            } catch (error) {
              status.textContent = error.message;
            } finally {
              setBusy(false, status.textContent);
            }
          });
        });
      }

      async function discover(includeAzure) {
        setBusy(true, includeAzure ? "Refreshing app and Azure inventory…" : "Refreshing current app inventory…");
        try {
          const payload = await request("/api/discovery?azure=" + includeAzure);
          renderInventory(payload);
          status.textContent = "Current app inventory refreshed from source projects and configuration.";
        } catch (error) {
          status.textContent = error.message;
        } finally {
          setBusy(false, status.textContent);
        }
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const tierIds = Array.from(document.querySelectorAll('input[name="tierIds"]:checked')).map((input) => input.value);
        setBusy(true, "Requesting a separate Unity app worktree…");
        try {
          await request("/api/workspace-request", {
            method: "POST",
            body: JSON.stringify({
              mode: "create",
              appName: document.getElementById("app-name").value,
              purpose: document.getElementById("app-purpose").value,
              tierIds,
              openInVsCode: document.getElementById("open-vscode").checked
            })
          });
          status.textContent = "New app workspace requested.";
        } catch (error) {
          status.textContent = error.message;
        } finally {
          setBusy(false, status.textContent);
        }
      });

      document.getElementById("refresh").addEventListener("click", () => discover(false));
      document.getElementById("refresh-azure").addEventListener("click", () => discover(true));
      document.getElementById("trace").addEventListener("click", async () => {
        setBusy(true, "Tracing source relationships…");
        try {
          const payload = await request("/api/app-map", { method: "POST" });
          document.getElementById("app-map").textContent = JSON.stringify(payload, null, 2);
          status.textContent = "App flow derived from matched source files.";
        } catch (error) {
          status.textContent = error.message;
        } finally {
          setBusy(false, status.textContent);
        }
      });

      discover(false);
    </script>
  </body>
</html>`;
}
