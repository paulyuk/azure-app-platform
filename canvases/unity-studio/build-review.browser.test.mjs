import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
const browserOptions = { skip: !chromium && "Install src/web dependencies to run browser coverage." };

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function withPanel(routeWorkspace, action) {
  const html = `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style>
    <aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    window.panelActive = true;
    window.buildPanel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture",
      isActive: () => window.panelActive, syntax: buildSyntax, onRun() {}, onModel() {},
      request: async (path, options) => {
        const response = await fetch(path, options);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      }
    });
    window.buildPanel.show();
    </script>`;
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") await routeWorkspace(route);
      else throw new Error(`Unexpected route ${path}`);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator(".build-source-preview").waitFor();
    await action(page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

function artifacts(content) {
  return [
    {
      id: "agent", title: "Agent instructions", path: "src/agent/prompts/system.md",
      customizationArea: "behavior", available: true, content, sha: "base",
    },
    {
      id: "tool", title: "Inventory tool", path: "src/skills/inventory/main.py",
      customizationArea: "tools", available: true, content: "def inventory():\n    return []\n", sha: "tool-base",
    },
  ];
}

test("Build refreshes saved source without losing selection, collapse or scroll state", browserOptions, async () => {
  let source = Array.from({ length: 100 }, (_, index) => `original line ${index + 1}`).join("\n");
  let reads = 0;
  await withPanel(async (route) => {
    reads++;
    await route.fulfill({ json: { artifacts: artifacts(source) } });
  }, async (page) => {
    const preview = page.getByRole("region", { name: "Agent instructions source preview", exact: true });
    const highlight = preview.locator(".build-highlight");
    const tools = page.locator('[data-area-id="tools"]');
    const toolsSummary = tools.locator("summary");
    const explorer = page.getByRole("navigation", { name: "Key files" });
    await toolsSummary.click();
    assert.equal(await tools.evaluate((element) => element.open), false);
    await preview.evaluate((element) => {
      element.scrollTop = 240;
      element.scrollLeft = 12;
      element.dataset.identityProbe = "same-preview";
    });
    await explorer.evaluate((element) => { element.scrollTop = 22; });
    const before = await preview.evaluate((element) => [element.scrollTop, element.scrollLeft]);
    const navBefore = await explorer.evaluate((element) => element.scrollTop);

    await page.getByRole("button", { name: "Refresh preview", exact: true }).click();
    await page.waitForFunction((count) => window.performance.getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/api/build-workspace")).length >= count, reads);
    assert.equal(await preview.getAttribute("data-identity-probe"), "same-preview",
      "An unchanged refresh retains the preview DOM");
    assert.deepEqual(await preview.evaluate((element) => [element.scrollTop, element.scrollLeft]), before);
    assert.equal(await tools.evaluate((element) => element.open), false);
    assert.equal(await page.locator('[data-file-id="agent"]').getAttribute("aria-current"), "true");

    source = Array.from({ length: 100 }, (_, index) => `externally saved line ${index + 1}`).join("\n");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(() =>
      document.querySelector(".build-highlight")?.textContent.startsWith("externally saved line 1"));
    assert.equal(await highlight.textContent(), source);
    assert.equal(await tools.evaluate((element) => element.open), false);
    assert.equal(await page.locator('[data-file-id="agent"]').getAttribute("aria-current"), "true");
    assert.deepEqual(await preview.evaluate((element) => [element.scrollTop, element.scrollLeft]), before);
    assert.equal(await explorer.evaluate((element) => element.scrollTop), navBefore);

    source = source.replace("externally saved line 1", "visible refresh line 1");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() =>
      document.querySelector(".build-highlight")?.textContent.startsWith("visible refresh line 1"));
    assert.equal(await page.locator('[data-file-id="agent"]').getAttribute("aria-current"), "true");

    source = source.replace("visible refresh line 1", "workspace re-entry line 1");
    await page.evaluate(() => {
      window.panelActive = false;
      window.buildPanel.hide();
      window.panelActive = true;
      window.buildPanel.show();
    });
    await page.waitForFunction(() =>
      document.querySelector(".build-highlight")?.textContent.startsWith("workspace re-entry line 1"));
    assert.equal(await tools.evaluate((element) => element.open), false);
    assert.equal(await page.locator('[data-file-id="agent"]').getAttribute("aria-current"), "true");
    assert.equal(await page.locator("textarea,[contenteditable=true]").count(), 0);
  });
});

test("Build ignores stale refreshes after selection changes or while hidden and recovers on retry", browserOptions, async () => {
  let source = "initial agent source\n";
  let gate;
  let failNext = false;
  let reads = 0;
  await withPanel(async (route) => {
    reads++;
    if (failNext) {
      failNext = false;
      await route.fulfill({ status: 503, json: { error: "Preview refresh failed." } });
      return;
    }
    if (gate) {
      const current = gate;
      current.started.resolve();
      const response = await current.reply.promise;
      await route.fulfill({ json: response });
      current.completed.resolve();
      return;
    }
    await route.fulfill({ json: { artifacts: artifacts(source) } });
  }, async (page) => {
    const refresh = page.getByRole("button", { name: "Refresh preview", exact: true });
    gate = { started: deferred(), reply: deferred(), completed: deferred() };
    await refresh.click();
    await gate.started.promise;
    await page.locator('[data-file-id="tool"]').click();
    const toolPreview = page.getByRole("region", { name: "Inventory tool source preview", exact: true });
    await toolPreview.waitFor();
    gate.reply.resolve({ artifacts: artifacts("stale agent response\n") });
    await gate.completed.promise;
    assert.equal(await page.locator('[data-file-id="tool"]').getAttribute("aria-current"), "true");
    assert.equal(await toolPreview.isVisible(), true, "A completed refresh must not steal file selection");

    gate = { started: deferred(), reply: deferred(), completed: deferred() };
    await refresh.click();
    await gate.started.promise;
    await page.evaluate(() => { window.panelActive = false; window.buildPanel.hide(); });
    const hiddenMarkup = await page.locator("#details").innerHTML();
    gate.reply.resolve({ artifacts: artifacts("hidden stale response\n") });
    await gate.completed.promise;
    assert.equal(await page.locator("#details").innerHTML(), hiddenMarkup,
      "A stale response does not repaint the hidden panel");

    source = "fresh source after re-entry\n";
    gate = undefined;
    await page.evaluate(() => { window.panelActive = true; window.buildPanel.show(); });
    await toolPreview.waitFor();
    assert.equal(await page.locator('[data-file-id="tool"]').getAttribute("aria-current"), "true");
    assert.equal(await page.locator(".build-highlight").textContent(), artifacts(source)[1].content);

    failNext = true;
    await refresh.click();
    await page.getByRole("alert").filter({ hasText: "Preview refresh failed." }).waitFor();
    assert.equal(await refresh.isEnabled(), true);
    source = "successful retry source\n";
    await page.locator('[data-file-id="agent"]').click();
    await refresh.click();
    await page.waitForFunction(() =>
      document.querySelector(".build-highlight")?.textContent === "successful retry source\n");
    assert.ok(reads >= 5);
  });
});
