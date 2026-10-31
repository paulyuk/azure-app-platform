import { installToolkitRoutes, withToolkitButtons } from "./toolkit-test-fixture.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { renderOcticon } from "./studio-icons.mjs";
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
    window.buildPanel = (${createBuildPanel.toString()})({ buttons: window.unityStudioButtons, helpIcon: ${JSON.stringify(renderOcticon("info"))},
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
    response.end(withToolkitButtons(html));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") await routeWorkspace(route);
      else throw new Error(`Unexpected route ${path}`);
    });
    await installToolkitRoutes(page);

    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('.build-file[data-artifact="agent"]').waitFor();
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
      projectPath: "src/agent", projectName: "Deal agent",
      customizationArea: "behavior", available: true, content, sha: "base",
    },
    {
      id: "tool", title: "Inventory entry point", path: "src/skills/inventory/main.py",
      projectPath: "src/skills/inventory", projectName: "Inventory search",
      customizationArea: "tools", available: true, content: "def inventory():\n    return []\n", sha: "tool-base",
    },
  ];
}

test("Build refresh preserves area, preview, scroll, selection, and keyboard focus state", browserOptions, async () => {
  let source = Array.from({ length: 100 }, (_, index) => `original line ${index + 1}`).join("\n");
  let reads = 0;
  await withPanel(async (route) => {
    reads++;
    await route.fulfill({ json: { artifacts: artifacts(source) } });
  }, async (page) => {
    const tools = page.locator('.build-area[data-area-id="tools"]');
    const row = page.locator('.build-file[data-artifact="agent"]');
    const disclosure = row.locator('.build-source-disclosure[data-preview-for="agent"]');
    const preview = row.locator(".build-source-preview");
    const highlight = preview.locator(".build-highlight");
    await preview.waitFor();
    assert.equal(await preview.getAttribute("aria-label"), "Agent instructions source preview");
    const tabs = page.getByRole("tablist", { name: "App customization areas", exact: true });

    await preview.evaluate((element) => {
      element.scrollTop = 240;
      element.scrollLeft = 12;
      element.dataset.identityProbe = "same-preview";
      const walker = document.createTreeWalker(element.querySelector(".build-highlight"), NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, Math.min(8, text.length));
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    const before = await preview.evaluate((element) => [element.scrollTop, element.scrollLeft]);
    const selectedBefore = await page.evaluate(() => getSelection().toString());
    assert.ok(selectedBefore.length > 0);

    const unchangedResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/build-workspace");
    await page.getByRole("button", { name: "Refresh source", exact: true }).click();
    await unchangedResponse;
    assert.equal(await preview.getAttribute("data-identity-probe"), "same-preview",
      "An unchanged refresh retains the preview DOM");
    assert.deepEqual(await preview.evaluate((element) => [element.scrollTop, element.scrollLeft]), before);
    assert.equal(await page.evaluate(() => getSelection().toString()), selectedBefore);
    assert.equal(await tabs.getByRole("tab", { name: "Behavior", exact: true }).getAttribute("aria-selected"), "true");
    assert.equal(await disclosure.evaluate((element) => element.open), true);

    await disclosure.locator(":scope > summary").click();
    assert.equal(await disclosure.evaluate((element) => element.open), false);
    const collapsedResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/build-workspace");
    await page.getByRole("button", { name: "Refresh source", exact: true }).click();
    await collapsedResponse;
    assert.equal(await disclosure.evaluate((element) => element.open), false,
      "An explicit collapsed state survives refresh");
    await disclosure.locator(":scope > summary").click();
    await preview.waitFor();

    await tabs.getByRole("tab", { name: "Tools", exact: true }).click();
    assert.equal(await tools.isVisible(), true);
    const launch = page.locator('[data-editor-launch][data-artifact-id="tool"]');
    await launch.focus();
    source = Array.from({ length: 100 }, (_, index) => `externally saved line ${index + 1}`).join("\n");
    const changedResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/build-workspace");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await changedResponse;
    assert.equal(await tabs.getByRole("tab", { name: "Tools", exact: true }).getAttribute("aria-selected"), "true");
    assert.equal(await launch.evaluate((element) => element === document.activeElement), true,
      "Changed refresh restores focus to the same artifact action");
    await tabs.getByRole("tab", { name: "Behavior", exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('.build-file[data-artifact="agent"] .build-highlight')
        ?.textContent.startsWith("externally saved line 1"));
    await page.waitForFunction(([top, left]) => {
      const source = document.querySelector('.build-file[data-artifact="agent"] .build-source-preview');
      return source?.scrollTop === top && source?.scrollLeft === left;
    }, before);
    assert.equal(await highlight.textContent(), source);
    assert.deepEqual(await preview.evaluate((element) => [element.scrollTop, element.scrollLeft]), before);
    assert.equal(await disclosure.evaluate((element) => element.open), true);

    source = source.replace("externally saved line 1", "visible refresh line 1");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() =>
      document.querySelector('.build-file[data-artifact="agent"] .build-highlight')
        ?.textContent.startsWith("visible refresh line 1"));

    source = source.replace("visible refresh line 1", "workspace re-entry line 1");
    await page.evaluate(() => {
      window.panelActive = false;
      window.buildPanel.hide();
      window.panelActive = true;
      window.buildPanel.show();
    });
    await page.waitForFunction(() =>
      document.querySelector('.build-file[data-artifact="agent"] .build-highlight')
        ?.textContent.startsWith("workspace re-entry line 1"));
    assert.equal(await disclosure.evaluate((element) => element.open), true);
    assert.equal(await tabs.getByRole("tab", { name: "Behavior", exact: true }).getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("textarea,[contenteditable=true]").count(), 0);
    assert.ok(reads >= 4);
  });
});

test("Build ignores stale refreshes while interaction changes or the workspace is hidden and recovers on retry", browserOptions, async () => {
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
    const refresh = page.getByRole("button", { name: "Refresh source", exact: true });
    const agentDisclosure = page.locator(
      '.build-file[data-artifact="agent"] .build-source-disclosure[data-preview-for="agent"]');
    const agentPreview = page.getByRole("region", { name: "Agent instructions source preview", exact: true });
    await agentPreview.waitFor();

    gate = { started: deferred(), reply: deferred(), completed: deferred() };
    await refresh.click();
    await gate.started.promise;
    await page.getByRole("tab", { name: "Tools", exact: true }).click();
    const toolDisclosure = page.locator(
      '.build-file[data-artifact="tool"] .build-source-disclosure[data-preview-for="tool"]');
    const toolPreview = page.getByRole("region", { name: "Inventory entry point source preview", exact: true });
    await toolPreview.waitFor();
    gate.reply.resolve({ artifacts: artifacts("stale agent response\n") });
    await gate.completed.promise;
    assert.equal(await toolDisclosure.evaluate((element) => element.open), true);
    assert.equal(await toolPreview.isVisible(), true, "A completed refresh must not undo newer disclosure state");

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
    assert.equal(await toolDisclosure.evaluate((element) => element.open), true);
    assert.equal(await toolPreview.locator(".build-highlight").textContent(), artifacts(source)[1].content);

    failNext = true;
    await refresh.click();
    await page.getByRole("alert").filter({ hasText: "Preview refresh failed." }).waitFor();
    assert.equal(await refresh.isEnabled(), true);
    source = "successful retry source\n";
    await page.getByRole("tab", { name: "Behavior", exact: true }).click();
    await refresh.click();
    await page.waitForFunction(() =>
      document.querySelector('.build-file[data-artifact="agent"] .build-highlight')
        ?.textContent === "successful retry source\n");
    assert.ok(reads >= 5);
  });
});
