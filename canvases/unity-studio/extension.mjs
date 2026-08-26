import { createServer } from "node:http";
import { createCanvas, joinSession } from "@github/copilot-sdk/extension";
import {
  DEMO_STEPS,
  PLATFORM_TIERS,
  getDemoStatus,
  getPlatformOverview,
  getTierCanvasGuidance,
  runDoctor,
} from "./studio-commands.mjs";

const servers = new Map();

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
    <article class="card">
      <div class="card-heading">
        <h2>${escapeHtml(tier.name)}</h2>
        <span class="status">${escapeHtml(tier.status)}</span>
      </div>
      <p>${escapeHtml(tier.unityAnswer)}</p>
      ${
        tier.canvas
          ? `<button type="button" data-canvas="${escapeHtml(tier.canvas)}">Copy ${escapeHtml(tier.canvas)} launch prompt</button>`
          : '<span class="hub-only">Managed from this hub</span>'
      }
    </article>`).join("");

  const demoFlow = DEMO_STEPS.map((step, index) => `
    <li>
      <span class="step-number">${index + 1}</span>
      <div><strong>${escapeHtml(step.name)}</strong><small>${escapeHtml(step.status)}</small></div>
    </li>`).join("");

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
      header { max-width: 920px; margin-bottom: 24px; }
      h1 {
        margin: 0 0 8px;
        font-size: var(--text-title-large, 26px);
        line-height: var(--leading-title-large, 32px);
      }
      h2 { margin: 0; font-size: 16px; }
      p { color: var(--text-color-muted, #59636e); }
      .eyebrow { color: var(--true-color-blue, #0969da); font-weight: 600; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
      .card { border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 10px; padding: 16px; }
      .card-heading { display: flex; align-items: start; justify-content: space-between; gap: 10px; }
      .status, .hub-only, small { color: var(--text-color-muted, #59636e); font-size: 12px; }
      button {
        border: 1px solid var(--border-color-default, #d1d9e0);
        border-radius: 6px;
        padding: 6px 9px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      button:focus { outline: 2px solid var(--color-focus-outline, #0969da); }
      .demo { margin-top: 28px; }
      ol { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; list-style: none; }
      li { display: flex; align-items: center; gap: 8px; min-width: 145px; padding: 10px; border-radius: 8px; background: var(--true-color-blue-muted, #ddf4ff); }
      li div { display: flex; flex-direction: column; }
      .step-number { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--true-color-blue, #0969da); color: var(--color-white, #fff); }
      #message { min-height: 20px; color: var(--text-color-muted, #59636e); }
      footer { margin-top: 24px; color: var(--text-color-muted, #59636e); font-family: var(--font-mono, monospace); font-size: 12px; }
    </style>
  </head>
  <body>
    <header>
      <div class="eyebrow">Cloud Foundation builder experience</div>
      <h1>Unity Studio</h1>
      <p>The hub for the nine-tier Unity car-buying POC. Use dedicated studios for deep gateway, skills, and SRE work without leaving the Copilot canvas workflow.</p>
    </header>
    <main>
      <section aria-labelledby="platform-heading">
        <h2 id="platform-heading">Platform capability map</h2>
        <div class="grid">${tierCards}</div>
        <p id="message" role="status"></p>
      </section>
      <section class="demo" aria-labelledby="demo-heading">
        <h2 id="demo-heading">Demo #1 narrative status</h2>
        <ol>${demoFlow}</ol>
      </section>
    </main>
    <footer>Instance: ${escapeHtml(instanceId)} · POC status is simulated until backing services are connected.</footer>
    <script>
      document.querySelectorAll("[data-canvas]").forEach((button) => {
        button.addEventListener("click", async () => {
          const canvasId = button.dataset.canvas;
          const prompt = "Open the " + canvasId + " canvas.";
          try { await navigator.clipboard.writeText(prompt); } catch {}
          document.getElementById("message").textContent =
            'Launch prompt copied: "' + prompt + '" Ask Copilot to open it with instanceId "' + canvasId + '".';
        });
      });
    </script>
  </body>
</html>`;
}

async function startServer(instanceId) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/overview") {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify(getPlatformOverview()));
      return;
    }
    if (url.pathname === "/api/demo-status") {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify(getDemoStatus()));
      return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(renderHtml(instanceId));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}/` };
}

const canvas = createCanvas({
  id: "unity-studio",
  displayName: "Unity Studio",
  description: "Explore the nine-tier Unity platform, Demo #1 car-buying flow, readiness, and dedicated Cloud Foundation studios.",
  inputSchema: {
    type: "object",
    properties: {
      view: { type: "string", enum: ["overview", "demo"] },
    },
    additionalProperties: false,
  },
  actions: [
    {
      name: "get_platform_overview",
      description: "Return the nine-tier Unity capability map with Unity's answer and current POC status.",
      inputSchema: { type: "object", additionalProperties: false },
      handler: async () => getPlatformOverview(),
    },
    {
      name: "get_demo_status",
      description: "Return simulated status for each step in the Demo #1 car-buying narrative.",
      inputSchema: { type: "object", additionalProperties: false },
      handler: async () => getDemoStatus(),
    },
    {
      name: "open_tier_canvas",
      description: "Return the stable canvas ID and launch guidance for a Unity platform tier.",
      inputSchema: {
        type: "object",
        properties: {
          tierId: {
            type: "string",
            enum: ["web", "agent", "gateway", "skills", "sandbox", "connectors", "workflows", "sre", "data"],
          },
        },
        required: ["tierId"],
        additionalProperties: false,
      },
      handler: async (ctx) => getTierCanvasGuidance(ctx.input.tierId),
    },
    {
      name: "run_doctor",
      description: "Run best-effort, non-blocking local readiness checks for azd, Azure CLI, and Azure sign-in.",
      inputSchema: {
        type: "object",
        properties: {
          includeAzureProbe: { type: "boolean", default: true },
        },
        additionalProperties: false,
      },
      handler: async (ctx) => runDoctor(ctx.input),
    },
  ],
  open: async ({ instanceId }) => {
    let entry = servers.get(instanceId);
    if (!entry) {
      entry = await startServer(instanceId);
      servers.set(instanceId, entry);
    }
    return {
      title: "Unity Studio",
      status: "POC scaffold",
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

const session = await joinSession({ canvases: [canvas] });
