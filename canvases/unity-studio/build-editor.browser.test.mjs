import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

const editors = [
  { id: "vscode", label: "VS Code" },
  { id: "cursor", label: "Cursor" },
  { id: "zed", label: "Zed" },
];

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("Build hands the selected source to native Files once and does not steal selection", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifacts = [
    {
      id: "agent", title: "Agent source", path: "src/agent/main.py", description: "Agent implementation.",
      customizationArea: "behavior", available: true, editable: true, content: "print('agent')\n", sha: "base",
    },
    {
      id: "tool", title: "Inventory tool", path: "src/skills/inventory/main.py", description: "Inventory implementation.",
      customizationArea: "tools", available: true, editable: true, content: "print('tool')\n", sha: "base",
    },
  ];
  const filesRequests = [];
  let gate = { release: deferred(), completed: deferred() };
  let failOpen = false;
  const html = `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style>
    <aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
      editorSettings: ${JSON.stringify({ editorId: "vscode", editors })},
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
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") {
        await route.fulfill({ json: { artifacts, editorSettings: { editorId: "vscode", editors } } });
      } else if (path === "/api/open-build-file-canvas") {
        const input = route.request().postDataJSON();
        filesRequests.push(input);
        await gate.release.promise;
        if (failOpen) await route.fulfill({ status: 500, json: { error: "Files could not be opened." } });
        else await route.fulfill({ json: {
          path: artifacts.find((artifact) => artifact.id === input.id).path,
          canvas: { canvasId: "editor", instanceId: `build-file-${input.id}`, scope: "repo" },
        } });
        gate.completed.resolve();
      } else {
        throw new Error(`Unexpected route ${path}`);
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const primary = page.getByRole("button", { name: "Edit in Files", exact: true });
    await primary.waitFor();
    await primary.click();
    await page.locator(".build-edit-files").click({ force: true });
    await page.waitForFunction(() => document.querySelector(".build-edit-files")?.disabled);
    assert.equal(filesRequests.length, 1, "Duplicate clicks are suppressed while Files is opening");
    assert.deepEqual(filesRequests[0], { root: "/fixture", id: "agent" });
    assert.equal(Object.hasOwn(filesRequests[0], "content"), false);
    assert.equal(Object.hasOwn(filesRequests[0], "baseSha"), false);

    await page.locator('[data-file-id="tool"]').click();
    const toolPreview = page.getByRole("region", { name: "Inventory tool source preview", exact: true });
    await toolPreview.waitFor();
    gate.release.resolve();
    await gate.completed.promise;
    assert.equal(await page.locator('[data-file-id="tool"]').getAttribute("aria-current"), "true");
    assert.equal(await toolPreview.isVisible(), true);

    gate = { release: deferred(), completed: deferred() };
    failOpen = true;
    await primary.click();
    gate.release.resolve();
    await gate.completed.promise;
    await page.getByRole("alert").filter({ hasText: "Files could not be opened." }).waitFor();
    assert.equal(await primary.isEnabled(), true);
    assert.deepEqual(filesRequests.at(-1), { root: "/fixture", id: "tool" });

    gate = { release: deferred(), completed: deferred() };
    failOpen = false;
    await primary.click();
    gate.release.resolve();
    await gate.completed.promise;
    assert.equal(filesRequests.length, 3);
    assert.equal(await page.locator("textarea,[contenteditable=true]").count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    gate.release.resolve();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Build retains the external editor split control and persists its preference", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifact = {
    id: "agent", title: "Agent source", path: "src/agent/main.py", description: "Agent implementation.",
    customizationArea: "behavior", available: true, editable: true, content: "print('original')\n", sha: "base",
  };
  let editorSettings = { editorId: "vscode", editors };
  let settingsFailure = "";
  let openFailure = "";
  const settingsWrites = [];
  const opened = [];
  const html = `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style>
    <aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
      editorSettings: ${JSON.stringify({ editorId: "vscode", editors })},
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
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") {
        await route.fulfill({ json: { artifacts: [artifact], editorSettings } });
      } else if (path === "/api/editor-settings") {
        const input = route.request().postDataJSON();
        settingsWrites.push(input);
        if (settingsFailure) await route.fulfill({ status: 500, json: { error: settingsFailure } });
        else {
          editorSettings = { editorId: input.editorId, editors };
          await route.fulfill({ json: editorSettings });
        }
      } else if (path === "/api/open-build-file") {
        opened.push(route.request().postDataJSON());
        if (openFailure) await route.fulfill({ status: 400, json: { error: openFailure } });
        else await route.fulfill({ json: { outcome: "opened-in-editor", editorId: editorSettings.editorId, editorLabel: "Cursor" } });
      } else {
        throw new Error(`Unexpected route ${path}`);
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const preview = page.getByRole("region", { name: "Agent source source preview", exact: true });
    const launch = page.locator("[data-editor-launch]");
    const select = page.getByRole("combobox", { name: "Supported editor" });
    await preview.waitFor();
    assert.equal(await launch.getAttribute("aria-label"), "Open in VS Code");
    assert.equal(await select.inputValue(), "vscode");
    assert.ok((await launch.boundingBox()).width > 0);
    assert.equal((await select.boundingBox()).width, 28);
    await launch.focus();
    await page.keyboard.press("Tab");
    assert.equal(await select.evaluate((element) => element === document.activeElement), true);

    const preferenceResponse = page.waitForResponse((response) => response.url().endsWith("/api/editor-settings"));
    await select.selectOption("cursor");
    await preferenceResponse;
    assert.deepEqual(settingsWrites[0], { editorId: "cursor" });
    assert.equal(await launch.getAttribute("aria-label"), "Open in Cursor");
    assert.equal(await preview.locator(".build-highlight").textContent(), artifact.content);

    await launch.click();
    assert.deepEqual(opened[0], { root: "/fixture", id: "agent" });
    openFailure = "Cursor is unavailable.";
    await launch.click();
    await page.getByRole("alert").filter({ hasText: "Cursor is unavailable." }).waitFor();
    assert.equal(await launch.isEnabled(), true);

    settingsFailure = "Zed could not be saved.";
    await select.selectOption("zed");
    await page.getByRole("alert").filter({ hasText: /Zed could not be saved|Could not save editor preference/ }).waitFor();
    assert.equal(await select.inputValue(), "cursor");
    assert.equal(await launch.getAttribute("aria-label"), "Open in Cursor");
    assert.equal(await preview.locator(".build-highlight").textContent(), artifact.content);
    assert.equal(await page.locator("textarea,[contenteditable=true]").count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
