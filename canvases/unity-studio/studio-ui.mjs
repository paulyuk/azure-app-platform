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
  const capabilities = PLATFORM_TIERS.map((tier) => ({
    id: tier.id,
    name: tier.name,
    role: tier.role,
  }));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Unity Studio</title>
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px 18px 48px;
        background: var(--background-color-default, #fff);
        color: var(--text-color-default, #1f2328);
        font: 14px/1.5 var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      }
      main { width: min(100%, 680px); margin: 0 auto; }
      h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.2; }
      h2 { margin: 0 0 8px; font-size: 21px; }
      h3 { margin: 0; font-size: 15px; }
      p { margin: 6px 0 16px; color: var(--text-color-muted, #59636e); }
      code { overflow-wrap: anywhere; font: 12px var(--font-mono, monospace); }
      button, input, textarea, select { font: inherit; }
      button {
        min-height: 40px;
        border: 1px solid var(--border-color-default, #d1d9e0);
        border-radius: 7px;
        padding: 8px 13px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      button.primary { background: var(--true-color-blue, #0969da); border-color: var(--true-color-blue, #0969da); color: var(--color-white, #fff); }
      button.link { border-color: transparent; padding-inline: 4px; color: var(--true-color-blue, #0969da); }
      button:disabled { opacity: .6; cursor: wait; }
      button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
        outline: 2px solid var(--color-focus-outline, #0969da);
        outline-offset: 2px;
      }
      .eyebrow { color: var(--true-color-blue, #0969da); font-weight: 650; margin-bottom: 5px; }
      .journeys { display: grid; gap: 12px; margin-top: 24px; }
      .journey {
        width: 100%;
        min-height: 112px;
        padding: 18px;
        text-align: left;
        display: block;
        background: var(--background-color-default, #fff);
      }
      .journey strong { display: block; margin-bottom: 5px; font-size: 17px; }
      .journey span { color: var(--text-color-muted, #59636e); }
      .step { color: var(--text-color-muted, #59636e); font-size: 12px; margin-bottom: 8px; }
      .field { display: grid; gap: 5px; margin: 15px 0; font-weight: 600; }
      input[type="text"], textarea, select {
        width: 100%;
        border: 1px solid var(--border-color-default, #d1d9e0);
        border-radius: 7px;
        padding: 9px 10px;
        background: var(--background-color-default, #fff);
        color: inherit;
      }
      textarea { min-height: 84px; resize: vertical; }
      .choice-list, .capability-list, .mapping-list, .review-list { display: grid; gap: 9px; margin: 16px 0; }
      .choice, .capability, .mapping, .review-row {
        border: 1px solid var(--border-color-default, #d1d9e0);
        border-radius: 8px;
        padding: 12px;
      }
      .app-row { display: flex; align-items: center; gap: 10px; }
      .app-row > [data-existing-app] { flex: 1; min-width: 0; text-align: left; }
      .icon-button { flex: 0 0 auto; min-height: 32px; padding: 6px; }
      .icon-button svg { display: block; width: 16px; height: 16px; fill: currentColor; }
      .icon-button.danger { color: var(--fgColor-danger, #cf222e); }
      .confirm-backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 18px; background: rgb(0 0 0 / 45%); z-index: 10; }
      .confirm-dialog { width: min(100%, 440px); padding: 20px; border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 10px; background: var(--background-color-default, #fff); box-shadow: 0 8px 30px rgb(0 0 0 / 25%); }
      .confirm-dialog h2 { margin-top: 0; }
      .confirm-dialog .actions { margin-top: 18px; }
      .confirm-dialog .danger { color: var(--fgColor-danger, #cf222e); border-color: currentColor; }
      .terminal { margin-top: 16px; border: 1px solid #202a3b; border-radius: 8px; overflow: hidden; background: #0b1120; }
      .terminal-head { padding: 7px 10px; border-bottom: 1px solid #202a3b; color: #a9b5ca; font: 600 11px ui-monospace, monospace; }
      .terminal pre { margin: 0; min-height: 96px; max-height: 260px; overflow: auto; padding: 10px; color: #dbe5f7; font: 12px/1.5 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
      .lifecycle-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .lifecycle-actions button { flex: 1 1 180px; }
      .choice label, .capability label { display: flex; gap: 9px; align-items: start; }
      .choice small, .capability small, .mapping small { display: block; color: var(--text-color-muted, #59636e); }
      .template { display: grid; grid-template-columns: auto 1fr; gap: 9px; }
      .template-meta { color: var(--text-color-muted, #59636e); font-size: 12px; }
      .badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
      .badge { border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 999px; padding: 2px 7px; font-size: 11px; }
      .badge.foundry, .badge.hosted-agent, .badge.hosted-skill { background: #ddf4ff; border-color: #54aeff; color: #0550ae; }
      .badge.http, .badge.embr { background: #cffafe; border-color: #22d3ee; color: #155e75; }
      .badge.mcp, .badge.connector { background: #f3e8ff; border-color: #c084fc; color: #6b21a8; }
      .badge.docker, .badge.sandbox, .badge.durable { background: #e0e7ff; border-color: #818cf8; color: #3730a3; }
      .badge.data, .badge.gateway { background: #f1f5f9; border-color: #94a3b8; color: #334155; }
      .actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 24px; }
      .actions-right { display: flex; gap: 8px; margin-left: auto; }
      .topbar { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
      .topbar button { min-height: 32px; padding: 3px 8px; }
      .topbar h1 { margin: 0; }
      .notice, .error {
        border-radius: 7px;
        padding: 10px 12px;
        margin: 14px 0;
        background: var(--true-color-blue-muted, #ddf4ff);
      }
      .error { background: #ffebe9; color: #82071e; }
      .mapping-heading { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
      .mapping select { margin-top: 8px; }
      .source-option { display: block; }
      .local-path { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 16px; }
      .summary { display: grid; gap: 14px; }
      .summary section { border-bottom: 1px solid var(--border-color-default, #d1d9e0); padding-bottom: 12px; }
      .summary section:last-child { border: 0; }
      #status { min-height: 22px; margin-top: 16px; color: var(--text-color-muted, #59636e); }
      @media (max-width: 480px) {
        body { padding-inline: 14px; }
        .actions { align-items: stretch; flex-direction: column-reverse; }
        .actions-right, .actions button { width: 100%; }
        .actions-right { flex-direction: column-reverse; }
        .local-path { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <div id="app"></div>
      <div id="status" role="status" aria-live="polite"></div>
    </main>
    <script>
      const apiToken = ${JSON.stringify(apiToken)};
      const capabilities = ${JSON.stringify(capabilities)};
      const app = document.getElementById("app");
      const status = document.getElementById("status");
      const DEALER_SAMPLE_PURPOSE = "Help car dealers search inventory, evaluate deals, and send offers to buyers.";
      let sources = null;
      let azureInventory = null;
      let outputTimer = null;
      const draft = {
        journey: null,
        step: 0,
        appName: "",
        purpose: "",
        starterKind: "template",
        templateRootId: "",
        templateInputs: {
          hostedSkillName: "starter-skill",
          agentInstructions: ""
        },
        tierIds: [],
        sourceBindings: {},
        azureBindings: {},
        openInVsCode: true
      };

      function escape(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      async function request(path, options) {
        const requestOptions = { ...(options || {}) };
        requestOptions.headers = { ...(requestOptions.headers || {}), "X-Unity-Studio-Token": apiToken };
        if (requestOptions.method === "POST") {
          requestOptions.headers["Content-Type"] = "application/json";
        }
        const response = await fetch(path, requestOptions);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Request failed.");
        return payload;
      }

      function setBusy(busy, message = "") {
        app.querySelectorAll("button, input, textarea, select").forEach((control) => {
          control.disabled = busy;
        });
        status.textContent = message;
      }

      function error(message) {
        status.textContent = message;
        status.className = "error";
      }

      function clearStatus(message = "") {
        status.className = "";
        status.textContent = message;
      }

      function applyTemplateDefaults(template) {
        if (template?.kind !== "sample") return;
        if (!draft.appName) {
          draft.appName = "Dealer-sample-" + crypto.randomUUID().slice(0, 8);
        }
        if (!draft.purpose) {
          draft.purpose = DEALER_SAMPLE_PURPOSE;
        }
      }

      function actions({ back, nextLabel, next, nextDisabled = false }) {
        return '<div class="actions">' +
          (back ? '<button type="button" class="link" id="back">Back</button>' : '<span></span>') +
          '<div class="actions-right"><button type="button" class="primary" id="next"' +
          (nextDisabled ? " disabled" : "") + '>' + escape(nextLabel) + '</button></div></div>';
      }

      function topBack(label = "Back") {
        return '<div class="topbar"><button type="button" class="link" id="top-back" aria-label="' +
          escape(label) + '">&#8592; ' + escape(label) + '</button></div>';
      }

      function wireTopBack(back) {
        document.getElementById("top-back")?.addEventListener("click", back);
      }

      function badgeClass(badge) {
        const normalized = badge.toLowerCase();
        if (normalized.includes("foundry")) return "foundry";
        if (normalized.includes("hostedagent")) return "hosted-agent";
        if (normalized.includes("hostedskill")) return "hosted-skill";
        if (normalized === "http") return "http";
        if (normalized === "embr") return "embr";
        if (normalized.includes("mcp")) return "mcp";
        if (normalized.includes("connector")) return "connector";
        if (normalized.includes("docker")) return "docker";
        if (normalized.includes("sandbox")) return "sandbox";
        if (normalized.includes("durable")) return "durable";
        if (normalized.includes("direct data")) return "data";
        if (normalized.includes("gateway")) return "gateway";
        return "";
      }

      function askDeleteConfirmation(appName) {
        return new Promise((resolve) => {
          const dialog = document.createElement("div");
          dialog.className = "confirm-backdrop";
          dialog.innerHTML = '<section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-title">' +
            '<h2 id="confirm-delete-title">Delete ' + escape(appName) + '?</h2>' +
            '<p><strong>Are you sure?</strong> This permanently removes the app Git worktree and its local files. This cannot be undone.</p>' +
            '<p>No Azure resources, repositories, or cloud deployments will be deleted.</p>' +
            '<div class="actions"><button type="button" id="cancel-delete">No, keep app</button>' +
            '<div class="actions-right"><button type="button" class="danger" id="confirm-delete">Yes, delete worktree</button></div></div></section>';
          document.body.append(dialog);
          const close = (confirmed) => {
            dialog.remove();
            resolve(confirmed);
          };
          dialog.querySelector("#cancel-delete").addEventListener("click", () => close(false));
          dialog.querySelector("#confirm-delete").addEventListener("click", () => close(true));
          dialog.querySelector("#cancel-delete").focus();
        });
      }

      async function deleteApp(root, appName) {
        if (!await askDeleteConfirmation(appName)) return;
        setBusy(true, "Deleting app worktree…");
        try {
          await request("/api/delete-app", {
            method: "POST",
            body: JSON.stringify({ root, confirmed: true })
          });
          sources = null;
          await loadSources();
          renderExistingApps();
          clearStatus("App worktree deleted. Azure resources were not changed.");
        } catch (cause) {
          error(cause.message);
          setBusy(false, status.textContent);
        }
      }

      function wireActions({ back, next }) {
        document.getElementById("back")?.addEventListener("click", back);
        document.getElementById("next")?.addEventListener("click", next);
      }

      function renderLanding() {
        draft.journey = null;
        clearStatus();
        app.innerHTML = '<div class="eyebrow">Unity Studio</div>' +
          '<h1>Unity apps</h1>' +
          '<p>Create, assemble, or reopen an app. Unity Studio will guide the rest.</p>' +
          '<div class="journeys">' +
          '<button type="button" class="journey" id="new-app"><strong>Create from template</strong>' +
          '<span>Start with an editable empty template or a complete sample that is ready to run.</span></button>' +
          '<button type="button" class="journey" id="assemble-app"><strong>Assemble from existing components</strong>' +
          '<span>Choose code from worktrees, repositories, or folders, then map Azure resources.</span></button>' +
          '<button type="button" class="journey" id="open-app"><strong>Open existing</strong>' +
          '<span>Return to a previously created app worktree and inspect its live inventory.</span></button>' +
          '</div>';
        document.getElementById("new-app").addEventListener("click", async () => {
          draft.journey = "new";
          draft.starterKind = "template";
          draft.step = 1;
          renderDetails();
          try {
            await loadSources();
            if (!draft.templateRootId) {
              draft.templateRootId = sources.templates[0]?.id || "";
            }
            applyTemplateDefaults(sources.templates.find((item) => item.id === draft.templateRootId));
            renderDetails();
          } catch (cause) {
            error(cause.message);
          }
        });
        document.getElementById("assemble-app").addEventListener("click", () => {
          draft.journey = "assemble";
          draft.starterKind = "assembly";
          draft.step = 1;
          renderDetails();
        });
        document.getElementById("open-app").addEventListener("click", async () => {
          try {
            await loadSources();
            renderExistingApps();
          } catch (cause) {
            error(cause.message);
          }
        });
      }

      function renderExistingApps() {
        const apps = sources?.apps || [];
        app.innerHTML = topBack("Back to start") + '<div class="step">Existing apps</div><h1>Open a Unity app</h1>' +
          '<p>Apps persist as repository and worktree pairs. Select one to rediscover its components.</p>' +
          (apps.length ? '<div class="choice-list">' + apps.map((item) =>
            '<div class="choice source-option app-row"><button type="button" class="link" data-existing-app="' + escape(item.path) + '">' +
            '<strong>' + escape(item.name) + '</strong><small>' + item.capabilityIds.length +
            ' discovered tier(s)</small></button><button type="button" class="icon-button danger" data-delete-existing-app="' +
            escape(item.path) + '" aria-label="Delete ' + escape(item.name) + '" title="Delete app">' +
            '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 1.5h6l.6 1.5H14v1H2V3h2.4L5 1.5Zm-2 4h10l-.6 9H3.6l-.6-9Zm3 1v6h1V6.5H6Zm3 0v6h1V6.5H9Z"/></svg></button></div>').join("") +
            '</div>' : '<div class="notice">No existing runnable Unity apps were found in the current Git worktrees.</div>') +
          '';
        wireTopBack(renderLanding);
        document.querySelectorAll("[data-existing-app]").forEach((button) => button.addEventListener("click", async () => {
          setBusy(true, "Rediscovering app components…");
          try {
            const root = button.dataset.existingApp;
            const inventory = await request("/api/discovery?azure=false&root=" + encodeURIComponent(root));
            draft.appName = button.querySelector("strong").textContent;
            draft.purpose = "Existing Unity app";
            renderInventory({ worktreePath: root, specialistCanvases: [] }, inventory, null);
          } catch (cause) {
            error(cause.message);
          } finally {
            setBusy(false, status.textContent);
          }
        }));
        document.querySelectorAll("[data-delete-existing-app]").forEach((button) => button.addEventListener("click", async (event) => {
          event.stopPropagation();
          const appRow = button.closest(".choice");
          const appName = appRow?.querySelector("strong")?.textContent || "this app";
          await deleteApp(button.dataset.deleteExistingApp, appName);
        }));
      }

      function captureDetails() {
        draft.appName = document.getElementById("app-name").value.trim();
        draft.purpose = document.getElementById("purpose").value.trim();
        if (draft.journey === "new") {
          draft.templateRootId = document.querySelector('input[name="template"]:checked')?.value || "";
        }
      }

      function templateHtml() {
        if (!sources) {
          return '<div class="notice">Loading available templates…</div>';
        }
        if (sources.templates.length === 0) {
          return '<div class="notice">No hydrateable samples were found in the available worktrees.</div>';
        }
        return '<div class="choice-list">' + sources.templates.map((template) =>
          '<label class="choice template"><input type="radio" name="template" value="' + escape(template.id) + '"' +
          (draft.templateRootId === template.id ? " checked" : "") + '><span><strong>' + escape(template.name) +
          '</strong><span class="template-meta">' + escape(template.description) +
          (template.dirty ? " · local changes excluded" : "") + '</span><small>' +
          template.capabilityIds.map((id) => capabilities.find((item) => item.id === id)?.name || id).join(", ") +
          (template.startup
            ? '<br><code>' + escape(template.startup.start) + '</code> · <code>' + escape(template.startup.stop) + '</code>'
            : '') +
          (template.kind === "empty" ? '<br>One empty Hosted Skill · editable domain config and agent prompt' : '') +
          (template.preservesDomain ? '<br>Preserves the finished dealer domain; app name labels the workspace.' : '') +
          '</small></span></label>').join("") + '</div>';
      }

      async function loadSources() {
        if (sources) return;
        setBusy(true, "Finding source projects in Git worktrees…");
        try {
          sources = await request("/api/sources");
          clearStatus();
        } finally {
          setBusy(false, status.textContent);
        }
      }

      function renderDetails() {
        clearStatus();
        const isNew = draft.journey === "new";
        app.innerHTML = topBack("Back to start") + '<div class="step">Step 1 of ' + (isNew ? "3" : "4") + '</div>' +
          '<h1>' + (isNew ? "Build a new app" : "Assemble existing pieces") + '</h1>' +
          (isNew ? '<h2>Choose a template</h2><p>Start with the editable Empty Unity app or the complete Dealer sample.</p><div id="templates">' + templateHtml() + '</div>' : '') +
          '<label class="field">App name<input id="app-name" type="text" maxlength="80" value="' +
          escape(draft.appName) + '" placeholder="claims-assistant"></label>' +
          '<label class="field">What should this app do?<textarea id="purpose" maxlength="500" placeholder="Describe the outcome for its users.">' +
          escape(draft.purpose) + '</textarea></label>' +
          (!isNew ? '<div class="notice">Next, you will add capabilities and explicitly choose a source project for each one.</div>' : '') +
          actions({ back: true, nextLabel: isNew ? "Continue" : "Choose pieces" });
        document.getElementById("back").addEventListener("click", renderLanding);
        wireTopBack(renderLanding);
        document.querySelectorAll('input[name="template"]').forEach((input) => {
          input.addEventListener("change", () => {
            draft.templateRootId = input.value;
            const template = sources.templates.find((item) => item.id === input.value);
            applyTemplateDefaults(template);
            draft.tierIds = [...template.capabilityIds];
            document.getElementById("app-name").value = draft.appName;
            document.getElementById("purpose").value = draft.purpose;
          });
        });
        document.getElementById("next").addEventListener("click", async () => {
          captureDetails();
          if (!draft.appName || !draft.purpose) {
            error("Enter an app name and purpose.");
            return;
          }
          if (isNew) {
            try {
              await loadSources();
            } catch (cause) {
              error(cause.message);
              return;
            }
            if (!draft.templateRootId) {
              error("Choose a template or sample.");
              return;
            }
            const template = sources.templates.find((item) => item.id === draft.templateRootId);
            draft.tierIds = [...template.capabilityIds];
          }
          if (!isNew) {
            try {
              await loadSources();
            } catch (cause) {
              error(cause.message);
              return;
            }
          }
          draft.step = 2;
          if (isNew) {
            const template = sources.templates.find((item) => item.id === draft.templateRootId);
            template.kind === "sample" ? renderReview() : renderCapabilities();
          } else {
            renderPieces();
          }
        });
      }

      function renderCapabilities() {
        clearStatus();
        app.innerHTML = topBack("Back") + '<div class="step">Step 2 of 3</div><h1>Customize the empty template</h1>' +
          '<p>The template starts with one intentionally empty Hosted Skill. Define its seam without asking Unity Studio to guess your tools.</p>' +
          '<label class="field">Agent instructions<textarea id="agent-instructions" maxlength="2000" placeholder="Explain how the agent should help, without inventing tool results.">' +
          escape(draft.templateInputs.agentInstructions || ('Help users accomplish: ' + draft.purpose)) + '</textarea></label>' +
          '<label class="field">Empty Hosted Skill name<input id="skill-name" type="text" maxlength="40" value="' +
          escape(draft.templateInputs.hostedSkillName) + '" placeholder="starter-skill"></label>' +
          '<h2>Included now</h2><p>Keep the first template predictable. Add other capabilities from Unity Studio after creation.</p>' +
          '<div class="capability-list">' + draft.tierIds.map((tierId) => {
            const tier = capabilities.find((item) => item.id === tierId);
            return '<div class="capability"><strong>' + escape(tier.name) +
              '</strong><small>' + escape(tier.role) + '</small></div>';
          }).join("") + '</div>' +
          actions({ back: true, nextLabel: "Review app" });
        wireActions({
          back: renderDetails,
          next: () => {
            draft.templateInputs.agentInstructions = document.getElementById("agent-instructions").value.trim();
            draft.templateInputs.hostedSkillName = document.getElementById("skill-name").value.trim();
            if (!draft.templateInputs.agentInstructions || !/^[a-z][a-z0-9-]{0,39}$/.test(draft.templateInputs.hostedSkillName)) {
              error("Enter agent instructions and a lowercase Hosted Skill name using letters, numbers, or hyphens.");
              return;
            }
            draft.step = 3;
            renderReview();
          }
        });
        wireTopBack(renderDetails);
      }

      function availableForTier(tierId) {
        return (sources?.roots ?? []).flatMap((root) =>
          root.implementations
            .filter((implementation) => implementation.tierId === tierId)
            .map((implementation) => ({ root, implementation })));
      }

      function renderPieces() {
        clearStatus();
        const unused = capabilities.filter((tier) => !draft.tierIds.includes(tier.id));
        app.innerHTML = topBack("Back") + '<div class="step">Step 2 of 4</div><h1>Choose pieces</h1>' +
          '<p>Add a capability, then choose the source project that should implement it.</p>' +
          '<div class="mapping-list">' + draft.tierIds.map((tierId) => {
            const tier = capabilities.find((item) => item.id === tierId);
            const options = availableForTier(tierId);
            const selected = draft.sourceBindings[tierId] || "";
            return '<div class="mapping"><div class="mapping-heading"><div><h3>' + escape(tier.name) +
              '</h3><small>' + escape(tier.role) + '</small></div><button type="button" class="link" data-remove="' +
              tierId + '">Remove</button></div><select data-source-tier="' + tierId + '">' +
              '<option value="">Choose source project…</option>' + options.map(({ root, implementation }) =>
                '<option value="' + implementation.id + '"' + (selected === implementation.id ? " selected" : "") + '>' +
                escape(root.name + " · " + (root.branch || "detached") + " · " + root.path + " · " + implementation.projectPath +
                  (root.dirty ? " · Modified" : " · Clean")) + '</option>').join("") +
              '</select>' + (options.length === 0 ? '<small>No matching project found. Add a local folder below.</small>' : '') +
              '</div>';
          }).join("") + '</div>' +
          (unused.length
            ? '<label class="field">Add capability<select id="add-tier"><option value="">Choose capability…</option>' +
              unused.map((tier) => '<option value="' + tier.id + '">' + escape(tier.name) + '</option>').join("") +
              '</select></label>'
            : "") +
          '<div class="local-path"><input id="local-path" type="text" placeholder="/path/to/repository-or-folder">' +
          '<button type="button" id="add-path">Add local path</button></div>' +
          actions({ back: true, nextLabel: "Continue to Azure resources" });
        document.getElementById("add-tier")?.addEventListener("change", (event) => {
          if (event.target.value) {
            draft.tierIds.push(event.target.value);
            renderPieces();
          }
        });
        document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => {
          draft.tierIds = draft.tierIds.filter((id) => id !== button.dataset.remove);
          delete draft.sourceBindings[button.dataset.remove];
          renderPieces();
        }));
        document.querySelectorAll("[data-source-tier]").forEach((select) => select.addEventListener("change", () => {
          draft.sourceBindings[select.dataset.sourceTier] = select.value;
        }));
        document.getElementById("add-path").addEventListener("click", async () => {
          const path = document.getElementById("local-path").value.trim();
          if (!path) {
            error("Enter a local repository or folder path.");
            return;
          }
          setBusy(true, "Scanning the selected folder…");
          try {
            sources = await request("/api/sources", { method: "POST", body: JSON.stringify({ path }) });
            clearStatus("Local folder added.");
            renderPieces();
          } catch (cause) {
            error(cause.message);
          } finally {
            setBusy(false, status.textContent);
          }
        });
        wireActions({
          back: renderDetails,
          next: async () => {
            if (draft.tierIds.length === 0) {
              error("Add at least one capability.");
              return;
            }
            const missing = draft.tierIds.find((tierId) => !draft.sourceBindings[tierId]);
            if (missing) {
              error("Choose a source project for " + capabilities.find((item) => item.id === missing).name + ".");
              return;
            }
            setBusy(true, "Loading compatible Azure resources…");
            try {
              azureInventory = await request("/api/discovery?azure=true");
              draft.step = 3;
              renderAzure();
            } catch (cause) {
              azureInventory = null;
              draft.step = 3;
              renderAzure(cause.message);
            }
          }
        });
        wireTopBack(renderDetails);
      }

      function azureForTier(tierId) {
        return azureInventory?.inventory
          ?.find((tier) => tier.id === tierId)
          ?.implementations.filter((item) => item.kind === "azure-resource") ?? [];
      }

      function renderAzure(warning = "") {
        clearStatus();
        app.innerHTML = topBack("Back") + '<div class="step">Step 3 of 4</div><h1>Map Azure resources <small>(optional)</small></h1>' +
          '<p>These mappings are references only. Unity Studio will not read keys, deploy, or change resources.</p>' +
          (warning ? '<div class="notice">' + escape(warning) + ' You can continue without Azure mappings.</div>' : "") +
          '<div class="mapping-list">' + draft.tierIds.map((tierId) => {
            const tier = capabilities.find((item) => item.id === tierId);
            const resources = azureForTier(tierId);
            return '<div class="mapping"><h3>' + escape(tier.name) + '</h3><select data-azure-tier="' + tierId + '">' +
              '<option value="">No resource mapped</option>' + resources.map((resource) =>
                '<option value="' + escape(resource.resourceId) + '"' +
                (draft.azureBindings[tierId] === resource.resourceId ? " selected" : "") + '>' +
                escape(resource.title + " · " + resource.subtitle) + '</option>').join("") + '</select></div>';
          }).join("") + '</div>' +
          actions({ back: true, nextLabel: "Review app" });
        document.querySelectorAll("[data-azure-tier]").forEach((select) => select.addEventListener("change", () => {
          draft.azureBindings[select.dataset.azureTier] = select.value;
        }));
        wireActions({
          back: renderPieces,
          next: () => {
            draft.step = 4;
            renderReview();
          }
        });
        wireTopBack(renderPieces);
      }

      function capabilityReview(tierId) {
        const tier = capabilities.find((item) => item.id === tierId);
        const sourceId = draft.journey === "assemble" ? draft.sourceBindings[tierId] : null;
        const selected = sourceId
          ? sources.roots.flatMap((root) => root.implementations.map((implementation) => ({ root, implementation })))
              .find((item) => item.implementation.id === sourceId)
          : null;
        return '<div class="review-row"><strong>' + escape(tier.name) + '</strong><small>' +
          escape(selected ? selected.root.name + " · " + selected.implementation.projectPath :
            (sources.templates.find((item) => item.id === draft.templateRootId)?.kind === "sample"
              ? "Included in the complete runnable sample"
              : (tierId === "skills" ? "One empty Hosted Skill" : "Editable template implementation"))) +
          (draft.azureBindings[tierId] ? "<br>Azure resource mapped" : "") + '</small></div>';
      }

      function renderReview() {
        clearStatus();
        const selectedTemplate = sources?.templates.find((item) => item.id === draft.templateRootId);
        const total = draft.journey === "new" ? (selectedTemplate?.kind === "sample" ? 2 : 3) : 4;
        const starter = draft.journey === "assemble"
          ? "Assembled from selected source projects"
          : selectedTemplate?.name;
        app.innerHTML = topBack("Back") + '<div class="step">Step ' + total + ' of ' + total + '</div><h1>Review app</h1>' +
          '<div class="summary"><section><h3>App</h3><p><strong>' + escape(draft.appName) + '</strong><br>' +
          escape(draft.purpose) + '</p></section><section><h3>Starter</h3><p>' + escape(starter) +
          '</p></section><section><h3>Capabilities</h3><div class="review-list">' +
          draft.tierIds.map(capabilityReview).join("") + '</div></section><section><h3>Workspace</h3>' +
          '<p>New isolated Git worktree. Selected sources are copied or hydrated; source locations are never modified.</p>' +
          '<label><input id="open-vscode" type="checkbox"' + (draft.openInVsCode ? " checked" : "") +
          '> Open the new worktree in VS Code</label></section></div>' +
          '<div class="notice">No Azure resources will be created or changed.</div>' +
          actions({ back: true, nextLabel: draft.journey === "assemble" ? "Create assembled app" :
            (selectedTemplate?.kind === "sample" ? "Create runnable sample" : "Create empty app") });
        wireActions({
          back: draft.journey === "assemble" ? renderAzure :
            (selectedTemplate?.kind === "sample" ? renderDetails : renderCapabilities),
          next: submit
        });
        wireTopBack(draft.journey === "assemble" ? renderAzure :
          (selectedTemplate?.kind === "sample" ? renderDetails : renderCapabilities));
      }

      function renderInventory(result, inventory, appMap) {
         if (outputTimer) {
           clearInterval(outputTimer);
           outputTimer = null;
         }
        const tiers = inventory?.inventory || [];
        const implemented = tiers.filter((tier) => tier.implementations.length > 0).length;
        const graphSummary = appMap
          ? appMap.nodes.length + " nodes · " + appMap.edges.length + " edges"
          : "Not traced yet";
        app.innerHTML = topBack("Existing apps") + '<div class="eyebrow">App workspace</div><h1>' + escape(draft.appName) +
          ' inventory</h1><p>' + escape(draft.purpose) + '</p><div class="summary">' +
          '<section><h3>Workspace</h3><code>' + escape(result.worktreePath || "Unavailable") +
          '</code><p>' + implemented + ' of ' + tiers.length + ' tiers have discovered implementations.</p>' +
          '<div class="badges" id="local-status"><span class="badge">Local app: checking</span></div>' +
          '<div class="badges" id="entrypoints"></div>' +
          '<div id="local-guidance"></div>' +
          '<section class="gateway-card"><h3>AI Gateway <small>(optional)</small></h3>' +
          '<p>Select an existing gateway, or create/manage one before running an AI-backed app.</p>' +
          '<div id="gateway-binding"></div><button type="button" id="configure-gateway">Create / Manage</button></section>' +
          '<div class="lifecycle-actions">' +
          '<button type="button" id="local-action" data-app-command="run-local">Run locally</button>' +
          '<button type="button" data-app-command="provision-cloud">Provision with azd</button>' +
          '<button type="button" data-app-command="deploy-cloud">Deploy with azd up</button></div>' +
          '<div class="terminal"><div class="terminal-head"><span>Local terminal</span></div><pre id="local-output">Waiting for local app output.</pre></div></section>' +
          '<section><h3>App Map</h3><p>' + escape(graphSummary) +
          '</p><button type="button" id="trace-app">Trace App Map</button></section>' +
          '<section><h3>Specialist canvases</h3><p>' +
          escape((result.specialistCanvases || []).join(", ") || "None registered") +
          '</p></section><section><h3>Components by tier</h3><div class="mapping-list">' +
          tiers.map((tier) => '<div class="mapping"><div class="mapping-heading"><h3>' + escape(tier.name) +
            '</h3><button type="button" class="link" data-tier-action="' + escape(tier.id) + '">Deep dive</button></div>' +
            '<small>' + escape(tier.role || "") + '</small><p><strong>' +
            escape(tier.implementationState === "referenced-not-provisioned"
              ? "Referenced by source; not provisioned"
              : tier.implementationState === "missing" ? "Not discovered" : "Observed") +
            '</strong><br>' +
            (tier.implementations.length > 0
              ? escape(tier.implementations.length + " discovered implementation(s)") +
                tier.implementations.map((item) =>
                  '<br><strong>' + escape(item.title) + '</strong> · ' + escape(item.kind) +
                  (item.badges?.length ? '<div class="badges">' + item.badges.map((badge) =>
                    '<span class="badge ' + badgeClass(badge) + '">' + escape(badge) + '</span>').join("") + '</div>' : '') +
                  '<br><code>' + escape(item.subtitle || item.projectPath || item.resourceId || "") + '</code>' +
                  (item.matchedFiles?.length
                    ? '<br><small>Source files: ' + escape(item.matchedFiles.map((evidence) =>
                      evidence.path + ":" + evidence.line).join(" · ")) + '</small>'
                    : '') +
                  (item.kind === "source-project"
                    ? '<br><button type="button" data-open-source="' + escape(item.projectPath) + '">Open source</button>'
                    : '')).join("")
              : 'No implementation discovered yet · scaffold available') +
            '</p></div>').join("") + '</div></section></div>' +
          '<button type="button" id="delete-app">Delete app</button>';
         wireTopBack(async () => {
          if (!sources) await loadSources();
          renderExistingApps();
         });
        document.querySelectorAll("[data-open-source]").forEach((button) => button.addEventListener("click", async () => {
          setBusy(true, "Opening component source in VS Code…");
          try {
            await request("/api/open-vscode", {
              method: "POST",
              body: JSON.stringify({ root: result.worktreePath + "/" + button.dataset.openSource })
            });
            clearStatus("Source opened in VS Code.");
          } catch (cause) {
            error(cause.message);
          } finally {
            setBusy(false, status.textContent);
          }
        }));
        async function refreshLocalStatus() {
          try {
            const state = await request("/api/app-status?root=" + encodeURIComponent(result.worktreePath));
            const running = state.state === "running";
            const stopping = state.state === "stopping";
            document.getElementById("local-status").innerHTML =
              '<span class="badge ' + (running ? "http" : "") + '">Local app: ' + escape(state.state || "stopped") + '</span>';
             document.getElementById("entrypoints").innerHTML = (state.entrypoints || []).map((entrypoint) =>
              '<span class="badge ' + (entrypoint.ready ? "http" : "") + '">' +
              escape(entrypoint.name) + ': ' + (entrypoint.ready ? "HTTP ready" : "offline") + '</span>').join("");
             const readiness = await request("/api/local-readiness?root=" + encodeURIComponent(result.worktreePath));
             document.getElementById("local-guidance").innerHTML = readiness.ready ? "" :
              '<p><strong>Local setup needed:</strong> ' + escape(readiness.guidance) + '</p>';
             const manageGateway = document.getElementById("configure-gateway");
             if (manageGateway) manageGateway.onclick = async () => {
              setBusy(true, "Opening AI Gateway Studio…");
              try {
                await request("/api/tier-action", {
                  method: "POST",
                  body: JSON.stringify({ tierId: "gateway", root: result.worktreePath, includeAzure: true })
                });
               clearStatus("AI Gateway Studio opened for gateway and model selection.");
              } catch (cause) {
                error(cause.message);
              } finally {
                setBusy(false, status.textContent);
              }
             };
            const localAction = document.getElementById("local-action");
            localAction.dataset.appCommand = running ? "stop-local" : "run-local";
            localAction.textContent = stopping ? "Stopping local app…" : (running ? "Stop local app" : "Run locally");
            localAction.disabled = stopping;
          } catch (cause) {
            error(cause.message);
          }
         }
          async function refreshLocalOutput() {
            try {
              const output = await request("/api/app-output?root=" + encodeURIComponent(result.worktreePath));
              const terminal = document.getElementById("local-output");
              const text = output.lines.join("\\n") || "Waiting for local app output.";
              if (terminal && terminal.textContent !== text) {
                terminal.textContent = text;
                terminal.scrollTop = terminal.scrollHeight;
              }
            } catch (cause) {
              error(cause.message);
            }
          }
          async function loadGatewayOptions() {
            try {
              const gatewayOptions = await request("/api/gateway-options?root=" + encodeURIComponent(result.worktreePath));
              async function configureActiveGateway() {
                setBusy(true, "Configuring app from active gateway…");
                try {
                  await request("/api/app-command", {
                    method: "POST",
                    body: JSON.stringify({ operation: "configure-gateway", root: result.worktreePath })
                  });
                  clearStatus("Gateway selected. Configuring app settings in the embedded terminal…");
                } catch (cause) {
                  error("Gateway configuration failed: " + cause.message);
                } finally {
                  setBusy(false);
                }
              }
              document.getElementById("gateway-binding").innerHTML =
                '<label class="field">Active AI Gateway<select id="active-gateway">' +
                '<option value="">Choose a gateway</option>' +
                gatewayOptions.gateways.map((gateway) =>
                  '<option value="' + escape(gateway.name) + '"' +
                  (gatewayOptions.active?.name === gateway.name ? " selected" : "") + '>' +
                  escape(gateway.name + (gateway.resourceGroup ? " · " + gateway.resourceGroup : "")) +
                  '</option>').join("") + '</select></label>';
             if (gatewayOptions.active) {
                  document.getElementById("gateway-binding").innerHTML +=
                    '<button type="button" data-app-command="configure-active-gateway">Configure app from active gateway</button>';
                 document.querySelector('[data-app-command="configure-active-gateway"]').addEventListener("click", async () => {
                   await configureActiveGateway();
                 });
                 const readiness = await request("/api/local-readiness?root=" + encodeURIComponent(result.worktreePath));
                 if (!readiness.ready) {
                   await configureActiveGateway();
                 }
             }
              document.getElementById("active-gateway")?.addEventListener("change", async (event) => {
                if (!event.target.value) return;
                try {
                  await request("/api/active-gateway", {
                    method: "POST",
                    body: JSON.stringify({ root: result.worktreePath, name: event.target.value })
                  });
                  await loadGatewayOptions();
                } catch (cause) {
                  error(cause.message);
                }
              });
            } catch (cause) {
              document.getElementById("gateway-binding").innerHTML =
                '<p>AI Gateway discovery unavailable: ' + escape(cause.message) + '</p>';
            }
          }
        document.querySelectorAll("[data-app-command]").forEach((button) => button.addEventListener("click", async () => {
          setBusy(true, "Starting " + button.textContent + "…");
          try {
            if (button.dataset.appCommand === "configure-active-gateway") {
              const commandResult = await request("/api/app-command", {
                method: "POST",
                body: JSON.stringify({ operation: "configure-gateway", root: result.worktreePath })
              });
              clearStatus(commandResult.command + " started (PID " + commandResult.pid + ").");
              return;
            }
            if (button.dataset.appCommand === "run-local") {
              const readiness = await request("/api/local-readiness?root=" + encodeURIComponent(result.worktreePath));
              if (!readiness.ready) {
                await request("/api/tier-action", {
                  method: "POST",
                  body: JSON.stringify({ tierId: "gateway", root: result.worktreePath, includeAzure: true })
                });
                clearStatus("Local startup needs a gateway and model. AI Gateway Studio opened for setup.");
                return;
              }
            }
            const commandResult = await request("/api/app-command", {
              method: "POST",
              body: JSON.stringify({ operation: button.dataset.appCommand, root: result.worktreePath })
            });
            clearStatus(commandResult.command + " started (PID " + commandResult.pid + ").");
            await refreshLocalStatus();
          } catch (cause) {
            error(cause.message);
          } finally {
            setBusy(false, status.textContent);
          }
        }));
        void refreshLocalStatus();
        void refreshLocalOutput();
        void loadGatewayOptions();
        outputTimer = setInterval(() => {
          void refreshLocalStatus();
          void refreshLocalOutput();
        }, 1000);
        document.querySelectorAll("[data-tier-action]").forEach((button) => button.addEventListener("click", async () => {
          setBusy(true, "Opening the tier studio…");
          try {
            const action = await request("/api/tier-action", {
              method: "POST",
              body: JSON.stringify({ tierId: button.dataset.tierAction, root: result.worktreePath, includeAzure: true })
            });
            if (action.outcome === "candidates-discovered") {
              clearStatus("Tier evidence is ready in the response.");
            } else {
              clearStatus("No implementation found; scaffold guidance is ready.");
            }
          } catch (cause) {
            error(cause.message);
          } finally {
            setBusy(false, status.textContent);
          }
        }));
        document.getElementById("trace-app").addEventListener("click", async () => {
          setBusy(true, "Tracing source call graph…");
          try {
            const traced = await request("/api/app-map", {
              method: "POST",
              body: JSON.stringify({ root: result.worktreePath })
            });
            renderInventory(result, inventory, traced);
          } catch (cause) {
            error(cause.message);
          } finally {
            setBusy(false, status.textContent);
          }
        });
        document.getElementById("delete-app").addEventListener("click", async () => {
          await deleteApp(result.worktreePath, draft.appName);
        });
      }

      async function submit() {
        draft.openInVsCode = document.getElementById("open-vscode").checked;
        const sourceBindings = draft.journey === "assemble"
          ? draft.tierIds.map((tierId) => ({
              tierId,
              sourceIds: [draft.sourceBindings[tierId]],
              azureResourceIds: draft.azureBindings[tierId] ? [draft.azureBindings[tierId]] : []
            }))
          : [];
        setBusy(true, "Creating workspace…");
        try {
          const result = await request("/api/workspace-request", {
            method: "POST",
            body: JSON.stringify({
              journey: draft.journey,
              starterKind: draft.journey === "assemble" ? "assembly" : draft.starterKind,
              appName: draft.appName,
              purpose: draft.purpose,
              tierIds: draft.tierIds,
              templateRootId: draft.templateRootId || undefined,
              templateInputs: draft.templateInputs,
              sourceBindings,
              openInVsCode: draft.openInVsCode
            })
          });
          const sessionStatus = result.sessionRegistration === "created"
            ? "A new child session was registered."
            : "This host cannot register child sessions, so the worktree was created directly.";
          const inventory = await request("/api/discovery?azure=false&root=" +
            encodeURIComponent(result.worktreePath));
          renderInventory(result, inventory, null);
          clearStatus(sessionStatus);
        } catch (cause) {
          error(cause.message);
          setBusy(false, status.textContent);
        }
      }

      renderLanding();
    </script>
  </body>
</html>`;
}
