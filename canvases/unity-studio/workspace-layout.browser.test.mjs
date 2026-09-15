import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("Build, Run and Map own the workspace independently of the collapsible Guide", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const graph = {
    root: "/tmp/workspace-layout-fixture", generatedAt: new Date().toISOString(),
    nodes: [{ id: "agent", kind: "project", tierId: "agent", name: "Loan agent", projectPath: "src/agent", evidence: [], badges: [] }],
    edges: [], summary: { projectNodes: 1, operationNodes: 0, edges: 0 },
  };
  const html = renderInteractiveAppMapHtml(graph, { apiToken: "fixture" });
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end(html); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  let appState = "stopped";
  const errors = [];
  const mutations = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() !== "GET") mutations.push(path);
      let body;
      if (path === "/api/build-workspace") body = { artifacts: [{
        id: "instructions", title: "Agent instructions", path: "src/agent/prompts/system.md",
        description: "Loan agent behavior.", available: true, editable: true, content: "Explain applications.", sha: "fixture",
      }] };
      else if (path === "/api/app-status") body = {
        state: appState, foreignEntrypoints: [],
        entrypoints: [{ name: "agent", port: 8091, ready: appState === "running", healthStatus: "Healthy", url: "http://localhost:8091" }],
      };
      else if (path === "/api/local-readiness") body = {
        ready: true, gatewayConfigured: true, model: "model", activeGateway: { name: "gateway" },
        documentInput: { extensions: [".txt", ".md"], maxBytes: 65536 },
      };
      else if (path === "/api/gateway-options") body = { subscriptions: [], gateways: [], models: [] };
      else if (path === "/api/app-output") body = { lines: ["Ready"], commands: [] };
      else throw new Error("Unexpected route " + path);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    const url = `http://127.0.0.1:${server.address().port}/app-map`;
    await page.goto(url);
    const editor = page.getByRole("textbox", { name: "Agent instructions source", exact: true });
    await editor.waitFor();
    assert.deepEqual(await page.locator(".header-actions > button").allTextContents(), ["Build", "Run & manage", "Map", "Guide"]);
    const collapse = page.getByRole("button", { name: "Collapse Guide", exact: true });
    assert.equal(await collapse.textContent(), "");
    assert.equal(await collapse.locator('svg[aria-hidden="true"]').count(), 1);
    assert.equal(await page.locator("#action-center .guide-chevron").evaluate((el) => getComputedStyle(el).transform), "none");
    assert.equal(await page.locator("body").getAttribute("data-workspace"), "build");
    assert.equal(await page.locator("#graph-shell").isVisible(), false);
    assert.equal(await page.locator(".map-view-bar").isVisible(), false);
    const expanded = await page.locator("#workspace").boundingBox();
    const rail = await page.locator("#guide-rail").boundingBox();
    assert.ok(expanded.width >= 1440 - 300);
    assert.ok(Math.abs(expanded.x + expanded.width - rail.x) < 1);
    assert.ok(rail.width <= 280);
    assert.ok(Math.abs((await page.locator("#details").boundingBox()).width - expanded.width) < 1);

    await editor.fill("Unsaved loan agent instructions.");
    await page.locator("#collapse-guide").click();
    assert.equal(await page.locator("#action-center").getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator("#action-center").getAttribute("title"), "Expand Guide");
    assert.equal(await page.locator("#action-center .guide-chevron").evaluate((el) => getComputedStyle(el).transform), "matrix(-1, 0, 0, 1, 0, 0)");
    assert.equal(await page.locator("#action-center").evaluate((el) => el === document.activeElement), true);
    assert.ok((await page.locator("#details").boundingBox()).width >= 1439);
    assert.equal(await editor.inputValue(), "Unsaved loan agent instructions.");
    await page.locator("#action-center").click();
    assert.equal(await page.locator("#action-center").getAttribute("title"), "Collapse Guide");
    assert.equal(await editor.inputValue(), "Unsaved loan agent instructions.");

    await editor.focus();
    appState = "running";
    await page.locator("#guide-content .journey-stage.running").waitFor();
    assert.equal(await editor.inputValue(), "Unsaved loan agent instructions.");
    assert.equal(await editor.evaluate((el) => el === window.document.activeElement), true);
    assert.equal(await page.locator("#build-app").getAttribute("aria-pressed"), "true");

    await page.locator("#manage-app").click();
    const message = page.getByRole("textbox", { name: "Agent message", exact: true });
    const document = page.getByRole("textbox", { name: "Document text", exact: true });
    await message.fill("Explain my application.");
    await document.fill("Synthetic loan application.");
    await page.locator("#action-center").click();
    assert.equal(await message.inputValue(), "Explain my application.");
    assert.equal(await page.locator("#manage-app").getAttribute("aria-pressed"), "true");
    assert.ok((await page.locator("#details").boundingBox()).width >= 1439);

    for (const width of [380, 620, 780, 1000, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ["build", "manage", "map"]) {
        await page.locator(mode === "manage" ? "#manage-app" : `#${mode}-app`).click();
        const content = page.locator(mode === "map" ? "#graph-shell" : "#details");
        const bounds = await content.boundingBox();
        assert.ok(bounds.width >= width - 1, `${mode} must use full width at ${width}px: ${JSON.stringify({
          bounds, workspace: await page.locator("#workspace").boundingBox(),
          guideHidden: await page.locator("#guide-rail").getAttribute("hidden"),
          mode: await page.locator("body").getAttribute("data-workspace"),
        })}`);
        assert.ok((await content.boundingBox()).height > 500, `${mode} must fill the available height`);
        assert.ok(await content.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${mode} overflows at ${width}px`);
      }
      assert.ok(await page.locator("header").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      assert.ok(await page.locator(".map-view-bar").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    }
    await page.locator("#build-app").click();
    await editor.waitFor();
    assert.equal(await editor.inputValue(), "Unsaved loan agent instructions.");
    await page.locator("#manage-app").click();
    assert.equal(await message.inputValue(), "Explain my application.");
    assert.equal(await document.inputValue(), "Synthetic loan application.");

    await page.locator("#map-app").click();
    await page.locator("#implementation-view").click();
    await page.locator('[data-node-id="agent"]').press("Enter");
    assert.equal(await page.locator("#details h2").textContent(), "Loan agent");
    assert.equal(await page.locator("#map-app").getAttribute("aria-pressed"), "true");
    await page.locator("#action-center").click();
    assert.equal(await page.locator("#details h2").textContent(), "Loan agent");
    await page.locator("#collapse-guide").click();
    assert.equal(await page.locator("#details h2").textContent(), "Loan agent");
    await page.locator(".panel-back").click();
    assert.equal(await page.locator("#details").isVisible(), false);
    assert.ok((await page.locator("#graph-shell").boundingBox()).width >= 1439);
    await page.locator(".map-tools > summary").click();
    assert.equal(await page.locator("#map-app").getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".map-tools").evaluate((el) => el.open), false);

    await page.reload();
    await editor.waitFor();
    assert.equal(await page.locator("#guide-rail").isVisible(), false);
    assert.equal(await page.locator("#action-center").getAttribute("aria-expanded"), "false");
    await page.setViewportSize({ width: 380, height: 1000 });
    await page.locator("#action-center").click();
    assert.ok(await page.locator("#collapse-guide").isVisible());
    assert.ok((await page.locator("#guide-rail").boundingBox()).width <= 280);
    await page.locator("#collapse-guide").click();
    assert.ok((await page.locator("#details").boundingBox()).width >= 379);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await editor.waitFor();
    assert.equal(await page.locator("#guide-rail").isVisible(), false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#guide-rail").waitFor({ state: "visible" });
    assert.equal(await page.locator("#guide-rail").isVisible(), true);
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
