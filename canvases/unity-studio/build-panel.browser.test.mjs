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

test("Build is a focused read-only customization workspace with document and Runtime model actions", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifacts = [
    {
      id: "instructions", customizationArea: "behavior", title: "Agent instructions",
      path: "src/agent/prompts/system.md", projectPath: "src/agent", projectName: "Document agent",
      description: "Shape the agent's decisions and responses.", available: true,
      content: "Use the document tool.", sha: "base",
    },
    {
      id: "tool", customizationArea: "tools", title: "Document validation entry point",
      path: "src/tools/document-validation/main.py", projectPath: "src/tools/document-validation",
      projectName: "Document validation", description: "Validate documents.", available: true,
      content: "def main(): pass\n", sha: "base",
    },
    {
      id: "runtime", customizationArea: "runtime", title: "Runtime & access",
      path: "config/runtime.json", description: "Choose the model connection and runtime.", available: true,
      content: '{"agentRuntime":"local","other":"preserve"}', sha: "base",
    },
    {
      id: "policy", customizationArea: "policies", title: "Enforcement policy",
      path: "config/document-policy.json", description: "Set document limits.", available: true,
      content: '{"maxBytes":4096}', sha: "base",
    },
  ];
  const requests = [];
  const html = `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style>
    <aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({ buttons: window.unityStudioButtons, helpIcon: ${JSON.stringify(renderOcticon("info"))},
      container: document.querySelector("#details"), root: "/app", isActive: () => true, syntax: buildSyntax,
      onRun: () => { document.body.dataset.runRequested = "true"; },
      onModel: () => { document.body.dataset.modelRequested = "true"; },
      request: async (path, options) => {
        const response = await fetch(path, options);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      }
    });
    panel.show();
    </script>`;
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(withToolkitButtons(html));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push({ path, method: route.request().method(), body: route.request().postDataJSON() });
      if (path === "/api/build-workspace") {
        await route.fulfill({ json: { artifacts, supportsDocuments: true } });
      } else {
        throw new Error(`Unexpected route ${path}`);
      }
    });
    await installToolkitRoutes(page);

    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole("heading", { name: "Change your app", exact: true }).waitFor();

    const tabs = page.getByRole("tablist", { name: "App customization areas", exact: true });
    assert.deepEqual(await tabs.getByRole("tab").allTextContents(), ["Behavior", "Tools", "Runtime", "Policies"]);
    assert.deepEqual(await tabs.getByRole("tab").evaluateAll((items) => items.map((item) => ({
      selected: item.getAttribute("aria-selected"),
      tabIndex: item.tabIndex,
    }))), [
      { selected: "true", tabIndex: 0 },
      { selected: "false", tabIndex: -1 },
      { selected: "false", tabIndex: -1 },
      { selected: "false", tabIndex: -1 },
    ]);
    const areas = page.locator(".build-area[data-area-id]");
    assert.deepEqual(await areas.evaluateAll((items) => items.map((item) => ({
      id: item.dataset.areaId,
      hidden: item.hidden,
      role: item.getAttribute("role"),
    }))), [
      { id: "behavior", hidden: false, role: "tabpanel" },
      { id: "tools", hidden: true, role: "tabpanel" },
      { id: "runtime", hidden: true, role: "tabpanel" },
      { id: "policies", hidden: true, role: "tabpanel" },
    ]);
    assert.match(await page.locator('.build-area[data-area-id="behavior"]').innerText(), /Agent behavior.*respond/si);
    assert.equal(await page.locator(".build-area > summary").count(), 0);
    assert.equal(await page.locator(".build-explorer,.build-explorer-reopen,[role=separator]").count(), 0);
    const behaviorPreview = page.getByRole("region", { name: "Agent instructions source preview", exact: true });
    await behaviorPreview.waitFor();
    assert.equal(await page.locator(".build-source-preview").count(), 1,
      "The active project's previews open by default");
    assert.equal(await page.locator('.build-area[data-area-id="runtime"] .build-source-preview').count(), 0,
      "Inactive areas remain lazy");
    assert.equal(await page.locator("textarea,[contenteditable=true],.cm-editor").count(), 0);
    assert.equal(await page.getByRole("textbox").count(), 0);
    assert.equal(await page.getByRole("button", { name: /review changes|save reviewed changes|discard draft/i }).count(), 0);
    assert.equal(await page.locator(".build-diff,.build-review-summary").count(), 0);
    assert.equal(await page.locator(".build-discovery,[data-editor-select]").count(), 0);

    const help = page.getByRole("button", { name: "About Build", exact: true });
    const tooltip = page.getByRole("tooltip");
    assert.equal(await help.getAttribute("aria-describedby"), "build-help-tooltip");
    assert.equal(await tooltip.isHidden(), true);
    await help.hover();
    await tooltip.waitFor();
    assert.match(await tooltip.innerText(), /recognized customization points.*saved source.*external editor/si);
    await tooltip.hover();
    assert.equal(await tooltip.isVisible(), true, "Pointer can move into the tooltip");
    await page.mouse.move(900, 700);
    await tooltip.waitFor({ state: "hidden" });
    await help.focus();
    await tooltip.waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await tooltip.isHidden(), true);
    await help.click();
    assert.equal(await tooltip.isVisible(), true);
    await page.mouse.move(900, 700);
    assert.equal(await tooltip.isVisible(), true, "Click pins the tooltip");
    await page.getByRole("button", { name: "Refresh source", exact: true }).focus();
    await tooltip.waitFor({ state: "hidden" });
    await page.setViewportSize({ width: 380, height: 800 });
    await help.hover();
    const [tooltipBounds, detailsBounds] = await Promise.all([
      tooltip.boundingBox(), page.locator("#details").boundingBox(),
    ]);
    assert.ok(tooltipBounds.x >= detailsBounds.x
      && tooltipBounds.x + tooltipBounds.width <= detailsBounds.x + detailsBounds.width + 1,
    "The tooltip stays within compact Build bounds");
    await page.setViewportSize({ width: 1000, height: 800 });

    assert.equal(await page.getByRole("button", { name: "Test with a document", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Test with a document", exact: true }).click();
    assert.equal(await page.locator("body").getAttribute("data-run-requested"), "true");

    await tabs.getByRole("tab", { name: "Tools", exact: true }).click();
    const toolsArea = page.locator('.build-area[data-area-id="tools"]');
    assert.equal(await toolsArea.getByRole("heading", { name: "Document validation", exact: true }).count(), 1,
      "A single tool project still shows its name");
    assert.equal(await toolsArea.locator(".build-project-list").count(), 0);

    await tabs.getByRole("tab", { name: "Runtime", exact: true }).click();
    const runtimeArea = page.locator('.build-area[data-area-id="runtime"]');
    assert.equal(await runtimeArea.getByRole("heading", { name: "Runtime", exact: true }).count(), 1);
    assert.match(await runtimeArea.innerText(), /Model connections and ports live in Settings/);
    const modelAction = runtimeArea.getByRole("button", { name: "Model connection", exact: true });
    await modelAction.click();
    assert.equal(await page.locator("body").getAttribute("data-model-requested"), "true");
    assert.ok(await runtimeArea.getByText(/Local subprocess simulation/).count() > 0,
      "Runtime remains informational");

    const disclosure = runtimeArea.locator('.build-source-disclosure[data-preview-for="runtime"]');
    assert.equal(await disclosure.evaluate((element) => element.open), true);
    const preview = page.getByRole("region", { name: "Runtime & access source preview", exact: true });
    await preview.waitFor();
    const before = await preview.locator(".build-highlight").textContent();
    await preview.focus();
    await page.keyboard.insertText('{"agentRuntime":"changed"}');
    assert.equal(await preview.locator(".build-highlight").textContent(), before);
    assert.equal(requests.some(({ path }) => path === "/api/build-diff" || path === "/api/build-file"), false);
    assert.equal(requests.some(({ method }) => method !== "GET"), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Build provides explicit empty and discovery-error recovery with workspace access", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  let mode = "empty";
  let reads = 0;
  const openedWorkspaces = [];
  const html = `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style>
    <aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({ buttons: window.unityStudioButtons, helpIcon: ${JSON.stringify(renderOcticon("info"))},
      container: document.querySelector("#details"), root: "/app", isActive: () => true, syntax: buildSyntax,
      editorSettings: { editorId: "vscode", editors: [{ id: "vscode", label: "VS Code" }] },
      onRun() {}, onModel() {},
      request: async (path, options) => {
        const response = await fetch(path, options);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      }
    });
    panel.show();
    </script>`;
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(withToolkitButtons(html));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") {
        reads++;
        if (mode === "error") await route.fulfill({ status: 503, json: { error: "Source discovery unavailable." } });
        else if (mode === "ready") await route.fulfill({ json: { artifacts: [{
          id: "agent", customizationArea: "behavior", title: "Agent source", path: "src/agent/main.py",
          projectPath: "src/agent", projectName: "Agent", available: true, content: "print('ready')\n",
        }] } });
        else await route.fulfill({ json: {
          artifacts: [
            { id: "missing", customizationArea: "behavior", title: "Missing source", path: "src/missing.py", available: false, detail: "File is missing." },
            { id: "unknown", customizationArea: "advanced", title: "Advanced", path: "config/advanced.json", available: true, content: "{}" },
          ],
          diagnostics: [{ path: "unity.app.yaml", message: "Agent path was not found." }],
          editorSettings: { editorId: "vscode", editors: [{ id: "vscode", label: "VS Code" }] },
        } });
      } else if (path === "/api/open-editor") {
        openedWorkspaces.push(route.request().postDataJSON());
        await route.fulfill({ json: { outcome: "opened-in-editor", editorLabel: "VS Code" } });
      } else {
        throw new Error(`Unexpected route ${path}`);
      }
    });
    await installToolkitRoutes(page);

    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText(/No supported customization points were found/).waitFor();
    assert.match(await page.locator("#details").innerText(), /Files|general implementation/i);
    assert.equal(await page.locator(".build-source-preview,textarea,[contenteditable=true]").count(), 0);
    assert.equal(await page.locator(".build-discovery,[data-editor-select]").count(), 0);
    assert.equal(await page.locator('[data-artifact="missing"],[data-artifact="unknown"]').count(), 0);
    assert.equal(await page.getByText("unity.app.yaml: Agent path was not found.", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "Open in VS Code", exact: true }).click();
    assert.deepEqual(openedWorkspaces, [{ root: "/app" }]);

    mode = "error";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByRole("alert").filter({ hasText: "Source discovery unavailable." }).waitFor();
    const retry = page.getByRole("button", { name: "Refresh source", exact: true });
    assert.equal(await retry.count(), 1);
    mode = "ready";
    await retry.click();
    const row = page.locator('.build-file[data-artifact="agent"]');
    await row.waitFor();
    const preview = page.getByRole("region", { name: "Agent source source preview", exact: true });
    await preview.waitFor();
    assert.equal(await preview.locator(".build-highlight").textContent(), "print('ready')\n");
    assert.ok(reads >= 3);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
