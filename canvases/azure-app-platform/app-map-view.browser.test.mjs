import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";
import { installStudioAssetRoutes, selectWorkspace } from "./workspace-navigation-test-helpers.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("one App Map reveals other resources without changing request paths or Guide controls", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const node = (id, tierId, kind = "project") => ({
    id, tierId, kind, name: id, projectPath: `src/${id}`, evidence: [], badges: [],
  });
  const edge = (from, to, path = "src/agent/main.py") => ({
    id: `${from}:${to}`, from, to, kind: "tool-call", confidence: "high", evidence: [{ path, line: 1 }],
  });
  const graph = {
    root: "/tmp/unity-single-map", generatedAt: new Date().toISOString(),
    nodes: [
      node("web", "web"), node("agent", "agent"), node("skill", "skills"),
      node("other-web", "web"), node("other-agent", "agent"),
      node("spare", "sandbox"), node("spare-data", "data"),
      node("activity", "workflows", "operation"),
    ],
    edges: [
      edge("web", "agent"), edge("agent", "skill"),
      edge("other-web", "other-agent"), edge("spare", "spare-data", "docs/map.md"),
      edge("agent", "activity"),
    ],
    unresolved: [
      { from: "agent", reference: "ambiguous-agent", candidates: ["agent", "other-agent"], evidence: { path: "src/agent/main.py", line: 4 } },
      { from: "spare", reference: "missing-tool", candidates: [], evidence: { path: "src/spare/main.py", line: 9 } },
    ],
    summary: { projectNodes: 7, operationNodes: 1, edges: 5 },
  };
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(renderInteractiveAppMapHtml(graph, { apiToken: "fixture" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 640, height: 620 } });
    page.setDefaultTimeout(6000);
    const errors = [];
    const mutations = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      assert.equal(request.headers()["x-app-platform-token"], "fixture");
      if (request.method() !== "GET") mutations.push(new URL(request.url()).pathname);
      const path = new URL(request.url()).pathname;
      const responses = {
        "/api/build-workspace": { artifacts: [] },
        "/api/app-status": { state: "stopped", entrypoints: [] },
        "/api/local-readiness": { ready: false, guidance: "Fixture requires setup." },
        "/api/gateway-options": { subscriptions: [], gateways: [], models: [] },
        "/api/app-output": { lines: [], commands: [] },
        "/api/app-logs": {
          root: graph.root,
          scope: { serviceId: null, label: "All services", groupedByService: true, description: "No fixture logs." },
          catalog: [], services: [],
          clipping: {
            clipped: false, services: { included: 0, total: 0, limit: 24 },
            catalog: { included: 0, total: 0, limit: 80 },
            lines: { included: 0, limit: 1200 }, bytes: { included: 0, limit: 262144 }, notices: [],
          },
        },
      };
      assert.ok(path in responses, `Unexpected request ${path}`);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(responses[path]) });
    });
    const url = `http://127.0.0.1:${server.address().port}/app-map`;
    await installStudioAssetRoutes(page);
    await page.goto(url);
    await selectWorkspace(page, "map-app");
    const observeTabs = page.getByRole("tablist", { name: "Observe views", exact: true });
    assert.equal(await observeTabs.locator('.studio-tab-icon[aria-hidden="true"]').count(), 2);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => { document.documentElement.dataset.studioTheme = value; }, theme);
      for (const width of [380, 620, 1440]) {
        await page.setViewportSize({ width, height: 620 });
        const { bounds, shell } = await observeTabs.evaluate((element) => ({
          bounds: element.getBoundingClientRect().toJSON(),
          shell: document.querySelector("#workspace-shell").getBoundingClientRect().toJSON(),
        }));
        assert.ok(bounds.x >= shell.x && bounds.x + bounds.width <= shell.x + shell.width,
          JSON.stringify({ width, bounds, shell }));
        assert.ok(bounds.width > shell.width - 32);
        assert.equal(await observeTabs.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
        assert.equal(await observeTabs.getByRole("tab").evaluateAll((tabs) =>
          tabs.every((tab) => tab.getBoundingClientRect().height >= 48)), true);
        await page.mouse.move(0, 0);
        const treatment = await observeTabs.evaluate((el) => {
          const selected = getComputedStyle(el.querySelector('[aria-selected="true"]'));
          const other = getComputedStyle(el.querySelector('[aria-selected="false"]'));
          return {
            border: selected.borderBottomWidth,
            selectedFill: selected.backgroundColor,
            otherFill: other.backgroundColor,
            otherBorder: other.borderTopWidth,
            radius: other.borderTopLeftRadius,
            bottomRadius: other.borderBottomLeftRadius,
            cursor: other.cursor,
            labelWeight: Number(getComputedStyle(el.querySelector(".studio-tab-label")).fontWeight),
          };
        });
        assert.equal(treatment.border, "3px");
        assert.equal(treatment.otherBorder, "0px");
        assert.equal(treatment.radius, "6px");
        assert.equal(treatment.bottomRadius, "0px");
        assert.equal(treatment.cursor, "pointer");
        assert.equal(treatment.otherFill, "rgba(0, 0, 0, 0)");
        assert.notEqual(treatment.selectedFill, treatment.otherFill);
        assert.ok(treatment.labelWeight >= 700, `${theme} ${width}px Observe tab label`);
      }
    }
    await page.locator("#map-view").press("ArrowRight");
    assert.equal(await page.locator("#logs-app").evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.locator("#map-view").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("body").getAttribute("data-workspace"), "map");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.body.dataset.workspace === "logs");
    assert.equal(await page.locator("#logs-app").getAttribute("aria-selected"), "true");
    await page.locator("#logs-app").press("ArrowLeft");
    assert.equal(await page.locator("#map-view").evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.locator("#logs-app").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("body").getAttribute("data-workspace"), "logs");
    await page.keyboard.press("Space");
    await page.waitForFunction(() => document.body.dataset.workspace === "map");
    assert.equal(await page.locator("#map-view").getAttribute("aria-selected"), "true");
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await page.locator("#map-view").press("ArrowLeft");
    assert.equal(await page.locator("#logs-app").evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.locator("#map-view").getAttribute("aria-selected"), "true");
    await page.locator("#map-view").focus();
    await page.evaluate(() => { document.documentElement.dir = ""; });
    await page.setViewportSize({ width: 640, height: 620 });
    const openTools = async () => {
      if (!await page.locator(".map-tools").evaluate((el) => el.open)) await page.locator(".map-tools > summary").click();
    };
    const toggle = page.getByRole("checkbox", { name: "Show other resources (3)", exact: true });
    await openTools();
    assert.equal(await toggle.isChecked(), false);
    assert.equal(await page.getByRole("tab").count(), 2);
    assert.equal(await page.locator("#collapse-guide").count(), 0);
    const visibleIds = () => page.locator(".node:not(.hidden)").evaluateAll((nodes) => nodes.map((item) => item.dataset.nodeId));
    assert.deepEqual(await visibleIds(), ["web", "agent", "skill", "other-web", "other-agent"]);
    const position = await page.locator('[data-node-id="agent"]').getAttribute("transform");
    await openTools();
    await toggle.check();
    assert.equal((await visibleIds()).length, graph.nodes.length);
    assert.equal(await page.locator('[data-flow-group="other-resources"]').count(), 1);
    assert.equal(await page.locator('[data-node-id="agent"]').getAttribute("transform"), position);
    assert.equal(await page.locator('[data-edge-id="spare:spare-data"]').getAttribute("class"), "edge low");
    const positions = await page.locator(".node").evaluateAll((nodes) => nodes.map((item) => item.getAttribute("transform")));
    assert.equal(new Set(positions).size, graph.nodes.length);
    await page.locator('[data-node-id="activity"]').press("Enter");
    assert.equal(await page.locator("#details h2").textContent(), "activity");
    await toggle.uncheck();
    assert.equal(await page.locator("#details").isVisible(), false);
    assert.deepEqual(await page.locator('[data-edge-id="agent:activity"]').evaluate((el) => [...el.classList].sort()), ["edge", "hidden", "high"]);

    await openTools();
    await page.locator("#entry-filter").selectOption("web");
    assert.deepEqual(await visibleIds(), ["web", "agent", "skill"]);
    await page.keyboard.press("Escape");
    await openTools();
    await toggle.check();
    assert.deepEqual(await visibleIds(), ["web", "agent", "skill", "spare", "spare-data", "activity"]);
    await openTools();
    await page.locator("#search").fill("spare");
    assert.deepEqual(await visibleIds(), ["spare", "spare-data"]);
    await page.locator("#tier-filter").selectOption("data");
    assert.deepEqual(await visibleIds(), ["spare-data"]);
    await page.locator("#search").fill("");
    await page.locator("#tier-filter").selectOption("");
    await page.keyboard.press("Escape");
    await page.reload();
    await selectWorkspace(page, "map-app");
    await openTools();
    assert.equal(await toggle.isChecked(), true);
    assert.equal((await visibleIds()).length, graph.nodes.length);
    await toggle.uncheck();
    await page.keyboard.press("Escape");
    await openTools();
    await page.getByRole("button", { name: "Review source connections", exact: true }).click();
    assert.equal(await page.locator("#guide-content").isVisible(), false, "Compact Guide yields to the inspector");
    assert.equal(await page.locator("#guide-rail").isVisible(), false, "Closed Guide reserves no rail");
    assert.equal(await page.locator("#details h2").textContent(), "Connection review");
    assert.match(await page.locator("#details").innerText(), /Uncertain connections \(2\)/);
    assert.match(await page.locator("#details").innerText(), /Possible destinations: agent, other-agent/);
    await page.getByRole("button", { name: "Inspect spare", exact: true }).click();
    assert.equal(await page.locator("#details h2").textContent(), "spare");
    assert.ok((await visibleIds()).includes("spare"), "Review can reveal affected resources outside the main flow");
    await page.getByRole("button", { name: "Close details", exact: true }).click();
    for (const width of [380, 430, 640]) {
      await page.setViewportSize({ width, height: 620 });
      await openTools();
      assert.equal(await page.locator(".map-view-bar").count(), 0);
      const graphBounds = await page.locator("#graph-shell").boundingBox();
      const paletteBounds = await page.locator(".map-palette").boundingBox();
      const optionsBounds = await page.locator(".toolbar").boundingBox();
      assert.ok(paletteBounds.y > graphBounds.y);
      assert.ok(Math.abs(paletteBounds.y - graphBounds.y - 12) < 1);
      assert.ok(Math.abs(paletteBounds.x + paletteBounds.width - (graphBounds.x + graphBounds.width - 12)) < 1);
      assert.ok(paletteBounds.x + paletteBounds.width < graphBounds.x + graphBounds.width);
      assert.ok(optionsBounds.y + optionsBounds.height < graphBounds.y + graphBounds.height);
      assert.ok(optionsBounds.y >= graphBounds.y);
      assert.ok(optionsBounds.y > paletteBounds.y + paletteBounds.height);
      assert.ok(optionsBounds.x + optionsBounds.width <= graphBounds.x + graphBounds.width);
      assert.ok(await page.locator(".toolbar").evaluate((el) => el.scrollWidth <= el.clientWidth));
      assert.equal(await toggle.isVisible(), true);
      assert.equal(await page.getByRole("button", { name: "Add component to Reasoning", exact: true }).count(), 1);
      assert.equal(await page.getByRole("button", { name: "Connect Experience to Reasoning", exact: true }).count(), 1);
    }
    const camera = await page.locator("#viewport").getAttribute("transform");
    await page.locator(".toolbar").hover();
    await page.mouse.wheel(0, 120);
    assert.equal(await page.locator("#viewport").getAttribute("transform"), camera, "Scrolling options must not zoom the graph");
    await page.keyboard.press("Escape");
    await page.locator("#zoom-in").click();
    assert.notEqual(await page.locator("#viewport").getAttribute("transform"), camera);
    await page.locator("#action-center").click();
    assert.equal(await page.locator("#guide-rail").isVisible(), true);
    assert.equal(await page.locator("#action-center").getAttribute("aria-expanded"), "true");
    await page.locator("#action-center").click();
    assert.equal(await page.locator("#guide-content").isVisible(), false);
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
