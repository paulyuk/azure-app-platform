import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";
import { installStudioAssetRoutes, selectWorkspace } from "./workspace-navigation-test-helpers.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Log text remains inside its line with one scrolling surface in ${name}`, {
    skip: !engine || !existsSync(engine.executablePath()) ? "Install Playwright Chromium and WebKit for log geometry coverage." : false,
  }, async () => {
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 1120, height: 900 } });
      const graph = { root: "/fixture", nodes: [], edges: [], unresolved: [], diagnostics: [], summary: {} };
      const catalog = ["deal-doc", "inventory-search"].map((label) => ({
        id: label, label, kind: "component", componentId: label, tierId: "skills",
        projectPath: `src/skills/${label}`, aliases: [],
      }));
      const lines = [
        `local.settings.json found in root directory (/workspace/apps/${"nested-project/".repeat(10)}src/skills/deal-doc).`,
        "Resolving worker runtime to 'python'.",
        "Found Python version 3.13.3 (python3).",
        "",
        "Azure Functions Core Tools",
        "Core Tools Version:       4.3.0+abcdef0123456789 (64-bit)",
        "Function Runtime Version: 4.1042.0.25374",
        "[2026-09-16T20:46:02.279Z] MCP server endpoint: http://localhost:7074/runtime/webhooks/mcp",
      ];
      const services = catalog.map((service) => ({
        ...service, availability: "available", reason: "",
        streams: [{ stream: "stdout", label: `${service.label} stdout`, available: true, reason: "", notice: "", lines: [...lines, ...lines, ...lines] }],
      }));
      await page.route("http://logs-layout.test/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/") return route.fulfill({ contentType: "text/html", body: renderInteractiveAppMapHtml(graph, { apiToken: "fixture", theme: "light" }) });
        const responses = {
          "/api/build-workspace": { artifacts: [] },
          "/api/app-status": { state: "stopped", recovered: false, foreignEntrypoints: [], entrypoints: [] },
          "/api/local-readiness": { ready: false, gatewayConfigured: false },
          "/api/app-output": { lines: [], commands: [] },
          "/api/app-logs": { scope: { serviceId: null, serviceIds: [], groupedByService: true, description: "Original source order." }, catalog, services, clipping: { clipped: false, notices: [] } },
        };
        if (responses[path]) return route.fulfill({ json: responses[path] });
        if (path.startsWith("/assets/")) return route.fulfill({ status: 204 });
        throw new Error(`Unexpected log layout request: ${path}`);
      });
      await installStudioAssetRoutes(page);
      await page.goto("http://logs-layout.test/");
      await selectWorkspace(page, "map-app");
      await page.locator("#logs-app").click();
      await page.locator(".app-logs-output").first().waitFor();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.addStyleTag({ content: "::-webkit-scrollbar { width:16px; height:16px; }" });
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => { document.documentElement.dataset.studioTheme = value; }, theme);
        for (const width of [1120, 900, 620, 380, 1120, 380]) {
          await page.setViewportSize({ width, height: 900 });
          const geometry = await page.locator(".app-logs-content").evaluate((viewer) => ({
            outerOverflow: document.querySelector("#details").scrollHeight > document.querySelector("#details").clientHeight + 1,
            pageOverflow: document.querySelector("#details").scrollWidth > document.querySelector("#details").clientWidth + 1,
            scrolls: viewer.scrollHeight > viewer.clientHeight,
            rows: [...viewer.querySelectorAll(".app-logs-entry")].map((row) => {
              const text = row.querySelector(".app-logs-output");
              const range = document.createRange();
              range.selectNodeContents(text);
              const fragments = [...range.getClientRects()].filter((rect) => rect.width);
              const bounds = row.getBoundingClientRect();
              return {
                text: text.textContent, top: bounds.top, bottom: bounds.bottom,
                textBottom: Math.max(bounds.top, ...fragments.map((rect) => rect.bottom)),
                textTop: Math.min(bounds.bottom, ...fragments.map((rect) => rect.top)),
                nextTop: row.nextElementSibling?.getBoundingClientRect().top,
              };
            }),
          }));
          assert.equal(geometry.outerOverflow, false, `${name} ${width}px page must not also scroll`);
          assert.equal(geometry.pageOverflow, false, `${name} ${width}px filters must fit beside Guide`);
          assert.equal(geometry.scrolls, true);
          for (const row of geometry.rows) {
            assert.ok(row.textTop >= row.top - 1 && row.textBottom <= row.bottom + 1,
              `${name} ${theme} ${width}px text exceeds its line: ${JSON.stringify(row)}`);
            if (row.nextTop != null) assert.ok(row.nextTop >= row.textBottom - 1);
          }
          assert.deepEqual(geometry.rows.slice(0, lines.length).map((row) => row.text), lines);
        }
      }
    } finally {
      await browser.close();
    }
  });
}
