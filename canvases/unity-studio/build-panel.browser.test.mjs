import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("Build is read-only, exposes document and model actions, and never calls write or diff APIs", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifacts = [
    {
      id: "instructions", customizationArea: "behavior", title: "Agent instructions",
      path: "src/agent/prompts/system.md", description: "Agent behavior.", available: true,
      editable: true, content: "Use the document tool.", sha: "base",
    },
    {
      id: "tool", customizationArea: "tools", title: "Document validation tool",
      path: "src/tools/document-validation/main.py", description: "Validate documents.", available: true,
      editable: true, content: "def main(): pass\n", sha: "base",
    },
    {
      id: "runtime", customizationArea: "runtime", title: "Runtime & access",
      path: "config/runtime.json", description: "Runtime information.", available: true,
      editable: true, content: '{"agentRuntime":"local","other":"preserve"}', sha: "base",
    },
    {
      id: "policy", customizationArea: "policies", title: "Enforcement policy",
      path: "config/document-policy.json", description: "Document limits.", available: true,
      editable: true, content: '{"maxBytes":4096}', sha: "base",
    },
  ];
  const requests = [];
  const html = `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style>
    <aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
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
    response.end(html);
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
      } else if (path === "/api/open-build-file-canvas") {
        const input = route.request().postDataJSON();
        await route.fulfill({ json: {
          path: artifacts.find((artifact) => artifact.id === input.id).path,
          canvas: { canvasId: "editor", instanceId: `build-file-${input.id}`, scope: "repo" },
        } });
      } else {
        throw new Error(`Unexpected route ${path}`);
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const preview = page.getByRole("region", { name: "Agent instructions source preview", exact: true });
    await preview.waitFor();
    assert.equal(await page.locator(".build-card,.build-header").count(), 0);
    assert.equal(await page.locator("textarea,[contenteditable=true],.cm-editor").count(), 0);
    assert.equal(await page.getByRole("textbox").count(), 0);
    assert.equal(await page.getByRole("button", { name: /review changes|save reviewed changes|discard draft/i }).count(), 0);
    assert.equal(await page.getByRole("combobox", { name: "Agent runtime" }).count(), 0);
    assert.equal(await page.locator(".build-diff,.build-review-summary").count(), 0);
    await page.getByRole("button", { name: "Test with a document", exact: true }).click();
    assert.equal(await page.locator("body").getAttribute("data-run-requested"), "true");
    await page.locator('[data-file-id="runtime"]').click();
    const runtimePreview = page.getByRole("region", { name: "Runtime & access source preview", exact: true });
    await runtimePreview.waitFor();
    const modelAction = page.getByRole("button", { name: "Model connection", exact: true });
    await modelAction.click();
    assert.equal(await page.locator("body").getAttribute("data-model-requested"), "true");
    assert.ok(await page.locator(".build-warning").getByText(/Local subprocess simulation/).count() > 0,
      "Runtime remains informational");

    const before = await runtimePreview.locator(".build-highlight").textContent();
    await runtimePreview.focus();
    await page.keyboard.insertText('{"agentRuntime":"changed"}');
    assert.equal(await runtimePreview.locator(".build-highlight").textContent(), before);
    assert.equal(requests.some(({ path }) => path === "/api/build-diff" || path === "/api/build-file"), false);
    assert.equal(requests.some(({ method }) => method !== "GET"), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Build provides clear empty and discovery-error fallbacks with retry and workspace launch", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  let mode = "empty";
  let reads = 0;
  const openedWorkspaces = [];
  const html = `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style>
    <aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
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
    response.end(html);
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
          available: true, content: "print('ready')\n",
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
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText(/No supported customization points were found/).waitFor();
    assert.match(await page.locator("#details").innerText(), /Files|general implementation/i);
    assert.equal(await page.locator(".build-source-preview,textarea,[contenteditable=true]").count(), 0);
    assert.equal(await page.locator('[data-artifact="missing"],[data-artifact="unknown"]').count(), 0);
    assert.equal(await page.getByText("unity.app.yaml: Agent path was not found.", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "Open in VS Code", exact: true }).click();
    assert.deepEqual(openedWorkspaces, [{ root: "/app" }]);

    mode = "error";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByRole("alert").filter({ hasText: "Source discovery unavailable." }).waitFor();
    const retry = page.getByRole("button", { name: "Refresh preview", exact: true });
    await retry.waitFor();
    mode = "ready";
    await retry.click();
    await page.getByRole("region", { name: "Agent source source preview", exact: true }).waitFor();
    assert.ok(reads >= 3);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
