import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";
import { installStudioAssetRoutes, selectWorkspace } from "./workspace-navigation-test-helpers.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("workflow internals expand separately, preserve evidence, and collapse back to the component overview", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const node = (id, tierId, kind = "project", projectPath = "custom/" + id) => ({
    id, tierId, kind, projectPath, name: id, badges: [],
    evidence: [{ path: projectPath + "/function_app.py", line: 12 }],
  });
  const names = [
    "LoanApprovalOrchestrator", "PostTeamsAdaptiveCard", "ApproveLoan", "DeclineLoan",
    "EscalateLoan", "StartLoanApproval", "SubmitLoanApprovalDecision",
  ];
  const edge = (from, to, kind = "contains") => ({
    id: from + ":" + to, from, to, kind, confidence: "high",
    evidence: [{ path: "custom/approval/function_app.py", line: 18 }],
  });
  const graph = {
    root: "/tmp/workflow-group-fixture", generatedAt: new Date().toISOString(),
    nodes: [
      node("agent", "agent"), node("prequal", "sandbox"), node("approval", "workflows", "project", "custom/approval"),
      ...names.map((name) => node(name, "workflows", "operation", "custom/approval")),
      node("LoanApprovalDecision", "connectors", "event", "custom/approval"),
    ],
    edges: [
      ...names.map((name) => edge("approval", name)),
      edge(names[0], names[1], "activity-call"), edge(names[0], "LoanApprovalDecision", "wait-for-event"),
    ],
    summary: { projectNodes: 3, operationNodes: 7, edges: 9 },
  };
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(renderInteractiveAppMapHtml(graph, { apiToken: "fixture" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      assert.equal(route.request().method(), "GET");
      const path = new URL(route.request().url()).pathname;
      const responses = {
        "/api/build-workspace": { artifacts: [] }, "/api/app-status": { state: "stopped", entrypoints: [] },
        "/api/local-readiness": { ready: false }, "/api/app-output": { lines: [], commands: [] },
      };
      assert.ok(path in responses, "Unexpected route " + path);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(responses[path]) });
    });
    await installStudioAssetRoutes(page);
    await page.goto(`http://127.0.0.1:${server.address().port}/app-map`);
    await selectWorkspace(page, "map-app");
    await page.locator(".map-tools > summary").click();
    await page.getByRole("checkbox", { name: "Show other resources (2)", exact: true }).check();
    await page.keyboard.press("Escape");
    const visibleIds = () => page.locator(".node:not(.hidden)").evaluateAll((nodes) => nodes.map((node) => node.dataset.nodeId));
    assert.deepEqual(await visibleIds(), ["agent", "prequal", "approval"]);
    assert.equal(await page.locator(".edge:not(.hidden)").count(), 0);
    const overview = await page.locator("#viewport").getAttribute("transform");
    const expand = page.locator('#nodes [data-operation-toggle="approval"]');
    assert.equal(await expand.getAttribute("aria-expanded"), "false");
    assert.equal(await expand.textContent(), "Show 8 internal items");
    const controls = await page.evaluate(() => {
      const items = document.querySelector('#nodes [data-operation-toggle="approval"] rect').getBBox();
      const logs = document.querySelector('#nodes [aria-label="Service logs for approval"] rect').getBBox();
      return { itemRight: items.x + items.width, logsLeft: logs.x };
    });
    assert.ok(controls.itemRight + 4 <= controls.logsLeft, "Workflow and Logs controls must not overlap");
    await expand.press("Enter");
    assert.equal((await visibleIds()).length, graph.nodes.length);
    const region = page.locator('[data-operation-region="approval"]');
    assert.equal(await region.count(), 1);
    assert.equal(await region.getAttribute("aria-label"), "Internal items for approval");
    assert.equal(await page.locator(".edge:not(.hidden)").count(), 2, "Containment arrows are replaced by grouping");
    assert.equal(await page.locator(".edge.internal-edge:not(.hidden) text").first().isVisible(), false);
    const positions = await page.locator(".node:not(.hidden)").evaluateAll((nodes) =>
      nodes.map((node) => {
        const matrix = node.transform.baseVal.consolidate().matrix;
        const title = node.querySelector(".node-title").getBBox();
        const card = node.querySelector("rect").getBBox();
        return { id: node.dataset.nodeId, x: matrix.e, y: matrix.f, titleRight: title.x + title.width, width: card.width };
      }));
    const internals = positions.filter((item) => names.includes(item.id) || item.id === "LoanApprovalDecision");
    assert.equal(new Set(internals.map((item) => item.x)).size, 2);
    for (const item of internals) {
      assert.ok(item.titleRight <= item.width - 12, item.id + " title must fit inside its card");
      for (const other of internals.filter((candidate) => candidate !== item)) {
        if (item.x === other.x) assert.ok(Math.abs(item.y - other.y) >= 168, "Rows retain space for calls between cards");
        if (item.y === other.y) assert.ok(Math.abs(item.x - other.x) >= item.width + 80, "Columns retain a clear connection gutter");
      }
    }
    await page.locator('[data-node-id="SubmitLoanApprovalDecision"]').press("Enter");
    assert.equal(await page.locator("#details h2").textContent(), "SubmitLoanApprovalDecision");
    assert.match(await page.locator("#details").innerText(), /custom\/approval\/function_app\.py:12/);
    assert.equal(await page.locator("#details").evaluate((el) => el.scrollTop), 0);
    await page.getByRole("button", { name: "Close details", exact: true }).click();
    await region.getByRole("button", { name: "Collapse internal items for approval", exact: true }).press("Space");
    assert.deepEqual(await visibleIds(), ["agent", "prequal", "approval"]);
    assert.equal(await page.locator("#viewport").getAttribute("transform"), overview);
    assert.equal(await expand.evaluate((el) => el === document.activeElement), true);
    await page.locator(".map-tools > summary").click();
    await page.locator("#search").fill("SubmitLoanApprovalDecision");
    assert.deepEqual(await visibleIds(), ["approval"], "Search keeps the owner of a collapsed matching operation findable");
    await page.locator("#search").fill("");
    await page.keyboard.press("Escape");
    graph.edges.push(edge("agent", names[0], "tool-call"), edge("agent", names[5], "tool-call"));
    await page.reload();
    await selectWorkspace(page, "map-app");
    await page.locator("#entry-filter").evaluate((el) => { el.value = "agent"; el.dispatchEvent(new Event("change")); });
    assert.ok((await visibleIds()).includes("approval"), "Filtering by request entry preserves an operation's workflow owner");
    assert.equal(await page.locator(".edge:not(.hidden)").count(), 1, "Collapsed boundary calls share one visible connection");
    const boundary = page.locator(".edge:not(.hidden)").first();
    assert.match(await boundary.locator("text").textContent(), /\(2\)$/);
    await boundary.press("Enter");
    assert.match(await page.locator("#details").innerText(), /Grouped connections \(2\)/);
    assert.match(await page.locator("#details").innerText(), /StartLoanApproval/);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
