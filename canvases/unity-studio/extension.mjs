import { createServer } from "node:http";
import { createCanvas, CanvasError, joinSession } from "@github/copilot-sdk/extension";

import { resolveDiscoveryRoot } from "./discovery.mjs";
import {
  PLATFORM_TIERS,
  activateTier,
  discoverUnityPlatform,
  getPlatformOverview,
  runDoctor,
  traceUnityApp,
} from "./studio-commands.mjs";

const servers = new Map();
let session;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderHtml(instanceId) {
  const tierCards = PLATFORM_TIERS.map((tier) => `
    <article class="card" data-tier-card="${escapeHtml(tier.id)}">
      <div class="card-heading">
        <h2>${escapeHtml(tier.name)}</h2>
        <span class="count" data-count="${escapeHtml(tier.id)}">Not scanned</span>
      </div>
      <p class="role">${escapeHtml(tier.role)}</p>
      <p>${escapeHtml(tier.jobToBeDone)}</p>
      <button type="button" data-activate-tier="${escapeHtml(tier.id)}">Open or inspect</button>
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
      header, main { max-width: 1080px; }
      header { margin-bottom: 24px; }
      h1 {
        margin: 0 0 8px;
        font-size: var(--text-title-large, 26px);
        line-height: var(--leading-title-large, 32px);
      }
      h2 { margin: 0; font-size: 16px; }
      h3 { margin: 28px 0 8px; }
      p { color: var(--text-color-muted, #59636e); }
      .eyebrow, .role { color: var(--true-color-blue, #0969da); font-weight: 600; }
      .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
      .card { border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 10px; padding: 16px; }
      .card-heading { display: flex; align-items: start; justify-content: space-between; gap: 10px; }
      .count, small { color: var(--text-color-muted, #59636e); font-size: 12px; }
      button {
        border: 1px solid var(--border-color-default, #d1d9e0);
        border-radius: 6px;
        padding: 7px 10px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      button.primary { background: var(--true-color-blue, #0969da); border-color: var(--true-color-blue, #0969da); color: var(--color-white, #fff); }
      button:focus { outline: 2px solid var(--color-focus-outline, #0969da); }
      button:disabled { cursor: wait; opacity: 0.65; }
      #status { min-height: 20px; }
      .panel { margin-top: 20px; border-top: 1px solid var(--border-color-default, #d1d9e0); padding-top: 4px; }
      pre {
        max-height: 360px;
        overflow: auto;
        padding: 12px;
        border-radius: 8px;
        background: var(--true-color-blue-muted, #ddf4ff);
        color: var(--text-color-default, #1f2328);
        font-family: var(--font-mono, monospace);
        font-size: 12px;
        white-space: pre-wrap;
      }
      footer { margin-top: 24px; color: var(--text-color-muted, #59636e); font-family: var(--font-mono, monospace); font-size: 12px; }
    </style>
  </head>
  <body>
    <header>
      <div class="eyebrow">Unity pattern inspector</div>
      <h1>Unity Studio</h1>
      <p>Discover real implementations and Azure resources for the nine Unity tiers, open registered tier studios, and trace an application's evidence-backed flow.</p>
      <div class="toolbar">
        <button id="discover" class="primary" type="button">Discover repo + Azure</button>
        <button id="discover-repo" type="button">Discover repo only</button>
        <button id="trace" type="button">Trace app</button>
      </div>
      <p id="status" role="status">No discovery has run yet.</p>
    </header>
    <main>
      <section aria-labelledby="platform-heading">
        <h2 id="platform-heading">Platform capability map</h2>
        <div class="grid">${tierCards}</div>
      </section>
      <section class="panel" aria-labelledby="result-heading">
        <h3 id="result-heading">Evidence</h3>
        <pre id="result">Run discovery or tracing to inspect source-backed results.</pre>
      </section>
    </main>
    <footer>Instance: ${escapeHtml(instanceId)} · Results are derived at runtime; no tier status is hardcoded.</footer>
    <script>
      const status = document.getElementById("status");
      const result = document.getElementById("result");
      const buttons = Array.from(document.querySelectorAll("button"));

      function setBusy(busy, message) {
        buttons.forEach((button) => { button.disabled = busy; });
        status.textContent = message;
      }

      async function request(path, options) {
        const response = await fetch(path, options);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Request failed.");
        }
        return payload;
      }

      function renderDiscovery(payload) {
        payload.tiers.forEach((tier) => {
          const count = document.querySelector('[data-count="' + tier.id + '"]');
          count.textContent = tier.candidateCount === 0
            ? "Scaffold available"
            : tier.candidateCount + " candidate" + (tier.candidateCount === 1 ? "" : "s");
        });
        result.textContent = JSON.stringify({
          repository: payload.repository,
          azure: payload.azure,
          tiers: payload.tiers.map((tier) => ({
            id: tier.id,
            candidates: tier.candidates,
            scaffoldAvailable: tier.scaffoldAvailable
          })),
          diagnostics: payload.diagnostics
        }, null, 2);
      }

      async function discover(includeAzure) {
        setBusy(true, includeAzure ? "Discovering repository and active Azure subscription…" : "Discovering repository…");
        try {
          const payload = await request("/api/discovery?azure=" + includeAzure);
          renderDiscovery(payload);
          status.textContent = "Discovery completed from runtime evidence.";
        } catch (error) {
          status.textContent = error.message;
        } finally {
          setBusy(false, status.textContent);
        }
      }

      document.getElementById("discover").addEventListener("click", () => discover(true));
      document.getElementById("discover-repo").addEventListener("click", () => discover(false));
      document.getElementById("trace").addEventListener("click", async () => {
        setBusy(true, "Tracing source relationships…");
        try {
          const payload = await request("/api/app-map", { method: "POST" });
          result.textContent = JSON.stringify(payload, null, 2);
          status.textContent = "App Map derived from source evidence.";
        } catch (error) {
          status.textContent = error.message;
        } finally {
          setBusy(false, status.textContent);
        }
      });

      document.querySelectorAll("[data-activate-tier]").forEach((button) => {
        button.addEventListener("click", async () => {
          const tierId = button.dataset.activateTier;
          setBusy(true, "Activating " + tierId + "…");
          try {
            const payload = await request("/api/tier-action", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tierId })
            });
            result.textContent = JSON.stringify(payload, null, 2);
            status.textContent = payload.outcome === "canvas-opened"
              ? "Opened the registered tier studio."
              : payload.outcome === "candidates-discovered"
                ? "Found eligible tier candidates."
                : "No candidate found; a scaffold recipe is available.";
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

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      throw new Error("Request body exceeds 64 KiB.");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleRequest(request, response, instanceId, workspaceRoot) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  try {
    if (request.method === "GET" && url.pathname === "/api/overview") {
      sendJson(response, 200, getPlatformOverview());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/discovery") {
      const includeAzure = url.searchParams.get("azure") !== "false";
      sendJson(response, 200, await discoverUnityPlatform({ root: workspaceRoot, includeAzure }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/app-map") {
      sendJson(response, 200, await traceUnityApp({ root: workspaceRoot }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/tier-action") {
      const input = await readJsonBody(request);
      sendJson(response, 200, await activateTier({
        tierId: input.tierId,
        root: workspaceRoot,
        includeAzure: input.includeAzure !== false,
        session,
      }));
      return;
    }
    if (request.method !== "GET" || url.pathname !== "/") {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(renderHtml(instanceId));
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function startServer(instanceId, workspaceRoot) {
  const server = createServer((request, response) => {
    void handleRequest(request, response, instanceId, workspaceRoot);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}/`, workspaceRoot };
}

function canvasError(error) {
  if (error instanceof CanvasError) {
    return error;
  }
  return new CanvasError(error?.code ?? "unity-studio-error", error instanceof Error ? error.message : String(error));
}

async function actionRoot(ctx) {
  const workspaceRoot = ctx.session?.workingDirectory ?? process.cwd();
  return resolveDiscoveryRoot(ctx.input?.root, workspaceRoot);
}

const rootInputProperties = {
  root: {
    type: "string",
    description: "Workspace-relative application root. It must stay within the current workspace.",
  },
};

const canvas = createCanvas({
  id: "unity-studio",
  displayName: "Unity Studio",
  description: "Discover Unity-pattern tier implementations and Azure resources, open tier studios, and trace an app map from source.",
  inputSchema: {
    type: "object",
    properties: {
      view: { type: "string", enum: ["overview", "app-map"] },
    },
    additionalProperties: false,
  },
  actions: [
    {
      name: "get_platform_overview",
      description: "Return the generic nine-tier Unity role and job-to-be-done map.",
      inputSchema: { type: "object", additionalProperties: false },
      handler: async () => getPlatformOverview(),
    },
    {
      name: "discover_platform",
      description: "Scan the current repository and, optionally, the active Azure CLI subscription for eligible tier candidates.",
      inputSchema: {
        type: "object",
        properties: {
          ...rootInputProperties,
          includeAzure: { type: "boolean", default: true },
        },
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          return await discoverUnityPlatform({
            root: await actionRoot(ctx),
            includeAzure: ctx.input?.includeAzure !== false,
          });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "activate_tier",
      description: "Directly open a registered dedicated studio for a tier, or discover candidates and return a scaffold recipe.",
      inputSchema: {
        type: "object",
        properties: {
          ...rootInputProperties,
          tierId: { type: "string", enum: PLATFORM_TIERS.map((tier) => tier.id) },
          includeAzure: { type: "boolean", default: true },
        },
        required: ["tierId"],
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          return await activateTier({
            tierId: ctx.input.tierId,
            root: await actionRoot(ctx),
            includeAzure: ctx.input?.includeAzure !== false,
            session,
          });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "trace_app",
      description: "Derive an evidence-backed application graph across Unity tiers from source files.",
      inputSchema: {
        type: "object",
        properties: rootInputProperties,
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          return await traceUnityApp({ root: await actionRoot(ctx) });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
    {
      name: "run_doctor",
      description: "Compatibility readiness action backed by real repository and optional Azure discovery.",
      inputSchema: {
        type: "object",
        properties: {
          ...rootInputProperties,
          includeAzureProbe: { type: "boolean", default: true },
        },
        additionalProperties: false,
      },
      handler: async (ctx) => {
        try {
          return await runDoctor({
            root: await actionRoot(ctx),
            includeAzureProbe: ctx.input?.includeAzureProbe !== false,
          });
        } catch (error) {
          throw canvasError(error);
        }
      },
    },
  ],
  open: async (ctx) => {
    const workspaceRoot = ctx.session?.workingDirectory ?? process.cwd();
    let entry = servers.get(ctx.instanceId);
    if (!entry || entry.workspaceRoot !== workspaceRoot) {
      if (entry) {
        await new Promise((resolve) => entry.server.close(resolve));
      }
      entry = await startServer(ctx.instanceId, workspaceRoot);
      servers.set(ctx.instanceId, entry);
    }
    return {
      title: "Unity Studio",
      status: "Discovery-backed",
      url: entry.url,
    };
  },
  onClose: async ({ instanceId }) => {
    const entry = servers.get(instanceId);
    if (entry) {
      servers.delete(instanceId);
      await new Promise((resolve) => entry.server.close(resolve));
    }
  },
});

session = await joinSession({ canvases: [canvas] });
