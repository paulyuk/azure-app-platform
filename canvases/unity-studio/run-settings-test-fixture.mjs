import { createServer } from "node:http";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";
import { serveStudioAsset } from "./studio-assets.mjs";
import { getTierDefinition } from "./tier-definitions.mjs";

export async function createRunSettingsFixture({ preview = false } = {}) {
  const graph = {
    root: "/fixture/dealer", generatedAt: new Date().toISOString(),
    nodes: [
      { id: "web", tierId: "web", name: "Dealer web", projectPath: "src/web" },
      { id: "agent", tierId: "agent", name: "Deal finder", projectPath: "src/agent" },
      { id: "inventory", tierId: "skills", name: "Inventory search", projectPath: "src/skills/inventory" },
    ].map((node) => ({ ...node, kind: "project", badges: [], evidence: [] })),
    edges: [], summary: { projectNodes: 3, operationNodes: 0, edges: 0 },
  };
  const gateway = { name: "dealer-gateway", resourceGroup: "demo-rg", subscriptionId: "demo-sub", model: "gpt-5-mini" };
  const editors = [
    { id: "vscode", label: "VS Code" },
    { id: "vscode-insiders", label: "VS Code Insiders" },
    { id: "cursor", label: "Cursor" },
    { id: "windsurf", label: "Windsurf" },
    { id: "zed", label: "Zed" },
    { id: "sublime", label: "Sublime Text" },
  ];
  const state = {
    app: "running", operation: null, error: "", theme: "light", configured: true, gatewayAvailable: true,
    outputError: false, preferenceError: false, deleteError: false, documentInput: false,
    health: "Healthy", editorId: "vscode", commands: [],
    lines: ["[agent] Connected to inventory_search", "[web] Ready on http://localhost:3000"],
  };
  const mutations = [];
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, "http://127.0.0.1").pathname;
      if (await serveStudioAsset(request, response, path)) return;
      if (path === "/") {
        response.setHeader("Content-Type", "text/html");
        response.end('<h1>UI preview</h1><p>No app files or cloud resources were changed.</p><a href="/app-map">Return to preview</a>');
        return;
      }
      if (path === "/app-map" || path === "/preview") {
        let html = renderInteractiveAppMapHtml(graph, { apiToken: "fixture", appName: "Dealer · UI preview", theme: state.theme });
        if (preview) html = html.replace("</body>", `<script>
          renderManagePanel();
          document.querySelector("#workspace-status-footer > :last-child").textContent = "UI preview · simulated actions only";
        </script></body>`);
        response.setHeader("Content-Type", "text/html");
        response.end(html);
        return;
      }
      if (request.headers["x-unity-studio-token"] !== "fixture") {
        response.writeHead(401).end("Fixture token required");
        return;
      }
      let input = "";
      for await (const chunk of request) input += chunk;
      const body = input ? JSON.parse(input) : null;
      if (request.method === "POST") mutations.push({ path, body });
      let result;
      if (path === "/api/editor-settings") {
        if (body) state.editorId = body.editorId;
        result = { editorId: state.editorId, editors };
      } else if (path === "/api/preferences") {
        if (state.preferenceError) throw new Error("Could not save appearance.");
        if (body) state.theme = body.theme;
        result = { theme: state.theme };
      } else if (path === "/api/app-status") result = {
        state: state.app, operation: state.operation, error: state.error, foreignEntrypoints: [],
        entrypoints: [
          { name: "web", port: 3000 }, { name: "agent", port: 8088 }, { name: "inventory", port: 7071 },
        ].map((item) => {
          const expected = item.name === "web" || state.configured;
          const ready = expected && state.app === "running";
          return { ...item, expected, ready,
            healthStatus: ready ? state.health : "Offline", url: "http://localhost:" + item.port };
        }),
      };
      else if (path === "/api/local-readiness") result = {
        ready: true, gatewayConfigured: state.configured, model: state.configured ? gateway.model : null,
        activeGateway: state.configured ? gateway : null, mode: state.configured ? "full" : "preview",
        ...(state.documentInput ? { agentRuntime: "local", documentInput: { extensions: [".txt", ".md"], maxBytes: 65536 } } : {}),
      };
      else if (path === "/api/build-workspace") result = { artifacts: [] };
      else if (path === "/api/app-output") {
        if (state.outputError) throw new Error("Runtime output is unavailable.");
        result = { lines: state.lines, commands: state.commands };
      } else if (path === "/api/agent-invoke") {
        result = { response: { output_text: "I found three vehicles within your budget. The inventory tool returned available options; tell me which body style you prefer." },
          summary: { text: "I found three vehicles within your budget.\n\nThe inventory tool returned available options. Tell me which body style you prefer.",
            tools: [{ name: "inventory_search", status: "Call reported" }] } };
        state.commands.push({ id: String(state.commands.length), kind: "http", label: "Invoke agent",
          command: "POST http://localhost:8088/responses", status: "succeeded", startedAt: Date.now(), durationMs: 160, note: "HTTP 200" });
      } else if (path === "/api/app-command") {
        state.operation = body.operation;
        state.app = { "run-local": "running", "stop-local": "stopped", "provision-cloud": "provisioning", "deploy-cloud": "deploying" }[body.operation];
        if (preview && ["provision-cloud", "deploy-cloud"].includes(body.operation)) {
          setTimeout(() => { state.app = "stopped"; }, 3200).unref();
        }
        result = { outcome: "command-started" };
      } else if (path === "/api/gateway-options") result = {
        subscriptions: [{ id: "demo-sub", name: "Demo subscription" }], subscription: { id: "demo-sub" },
        gateways: state.gatewayAvailable ? [gateway] : [], suggested: state.gatewayAvailable ? gateway : null, active: state.configured ? gateway : null,
        models: state.gatewayAvailable ? [{ id: gateway.model, label: gateway.model }] : [],
      };
      else if (path === "/api/active-gateway") { state.configured = true; result = { active: gateway, configuration: { state: "ready" } }; }
      else if (path === "/api/tier-action") {
        const tier = getTierDefinition(body.tierId);
        if (!tier) throw new Error("Unknown preview capability: " + body.tierId);
        const repository = graph.nodes.filter((node) => node.tierId === tier.id)
          .map((node) => ({ ...node, source: "repository" }));
        const azure = tier.id === "gateway" && state.gatewayAvailable ? [{ ...gateway, source: "azure" }] : [];
        const candidateCount = repository.length + azure.length;
        result = candidateCount
          ? { outcome: "candidates-discovered", tier: { ...tier, candidateCount, candidates: { repository, azure } }, diagnostics: [] }
          : { outcome: "scaffold-available", tier, scaffold: tier.scaffold, diagnostics: [] };
      } else if (path === "/api/capability-request") {
        response.statusCode = 501;
        result = { error: "This UI preview cannot start implementation work. Open Unity Studio to make real changes." };
      }
      else if (path === "/api/ports/pick") result = { settings: {} };
      else if (path === "/api/ports/review-stop") result = { reviewId: "fixture-ports", targets: [{ pid: 1234, command: "preview process", ports: [3000] }] };
      else if (path === "/api/ports/stop") result = { stopped: [1234] };
      else if (path === "/api/delete-app") {
        if (state.deleteError) throw new Error("Local worktree could not be deleted.");
        result = { outcome: "deleted" };
      } else if (path === "/api/open-source-canvas") {
        const files = {
          "src/web": "src/web/src/app/page.tsx",
          "src/agent": "src/agent/main.py",
          "src/skills/inventory": "src/skills/inventory/function_app.py",
        };
        if (!files[body.projectPath]) throw new Error("Choose a known preview source project.");
        result = { path: files[body.projectPath], canvas: { canvasId: "editor" } };
      } else if (path === "/api/open-entrypoint" || path === "/api/open-source") result = { outcome: "opened" };
      else if (path === "/api/app-logs") result = {
        root: graph.root, scope: { serviceId: null, label: "All services", groupedByService: true, description: "Simulated local service logs." },
        catalog: [{ id: "agent", label: "Deal finder", kind: "component", componentId: "agent", tierId: "agent", projectPath: "src/agent", aliases: [] }],
        services: [{ id: "agent", label: "Deal finder", kind: "component", componentId: "agent", tierId: "agent", projectPath: "src/agent", aliases: [],
          availability: "available", reason: "", streams: [{ stream: "stdout", label: "Agent stdout", available: true, reason: "", lines: state.lines, cursor: null, reset: false, notice: "" }] }],
        clipping: { clipped: false, services: { included: 1, total: 1, limit: 24 }, catalog: { included: 1, total: 1, limit: 80 },
          lines: { included: state.lines.length, limit: 1200 }, bytes: { included: 100, limit: 262144 }, notices: [] },
      };
      else {
        response.statusCode = 404;
        result = { error: "Not available in this UI fixture: " + path };
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`, state, mutations,
    close: () => new Promise((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
