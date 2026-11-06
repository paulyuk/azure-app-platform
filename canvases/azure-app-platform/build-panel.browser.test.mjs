import { installToolkitRoutes, withToolkitButtons } from "./toolkit-test-fixture.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_EXPLORER_CSS, BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { renderOcticon, VSCODE_ICON_MARKUP } from "./studio-icons.mjs";
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
      id: "tool", blockCategory: "sandbox", customizationArea: "tools", title: "Document validation entry point",
      path: "src/tools/document-validation/main.py", projectPath: "src/tools/document-validation",
      description: "Validate documents.", available: true,
      content: "def main(): pass\n", sha: "base",
    },
    {
      id: "contract", blockCategory: "sandbox", customizationArea: "tools", title: "Document validation contract",
      path: "src/tools/document-validation/contract.json", projectPath: "src/tools/document-validation",
      description: "Validation inputs and outputs.", available: true, content: '{"type":"object"}', sha: "base",
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
    {
      id: "source-file", customizationArea: "source", title: "Functions host configuration",
      path: "src/other/host.json", available: true, content: '{"version":"2.0"}', sha: "base",
    },
  ];
  let documentSupport = true;
  const requests = [];
  const html = `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style>
    <aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({ buttons: window.appPlatformButtons, helpIcon: ${JSON.stringify(renderOcticon("info"))}, vsCodeIconMarkup: ${JSON.stringify(VSCODE_ICON_MARKUP)},
      container: document.querySelector("#details"), root: "/app", isActive: () => true, syntax: buildSyntax,
      onRun: location.search.includes("no-section-handlers") ? undefined : () => { document.body.dataset.runRequested = "true"; },
      onModel: location.search.includes("no-section-handlers") ? undefined : () => { document.body.dataset.modelRequested = "true"; },
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
        await route.fulfill({ json: { artifacts, supportsDocuments: documentSupport } });
      } else {
        throw new Error(`Unexpected route ${path}`);
      }
    });
    await installToolkitRoutes(page);

    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.addStyleTag({ content: BUILD_EXPLORER_CSS });
    await page.locator(".build-workspace").waitFor();
    assert.equal(await page.locator(".build-heading,.build-help").count(), 0);

    const files = page.getByRole("navigation", { name: "Build files", exact: true });
    assert.deepEqual(await files.locator("summary").allTextContents(), ["Agents (1)", "Tools (2)", "Source (1)"]);
    assert.deepEqual(await files.locator("[data-file-choice]").allTextContents(),
      ["Document agent", "Document validationSandboxed", "Config", "Other"]);
    assert.equal(await files.locator('[data-file-choice="tool"] .build-sandbox-badge').textContent(), "Sandboxed");
    assert.equal(await files.locator('[data-file-choice="instructions"] .build-sandbox-badge').count(), 0);
    assert.equal(await files.locator('[aria-current="true"]').getAttribute("data-file-choice"), "instructions");
    assert.equal(await page.locator(".build-area-title").textContent(), "Document agent",
      "A single file uses its discovered parent name rather than its category");
    assert.equal(await page.locator(".build-area-description").count(), 0, "The right-pane heading has no subtitle");
    assert.equal(await page.locator(".build-area > summary").count(), 0);
    assert.equal(await page.locator(".build-explorer").count(), 1);
    assert.equal(await page.getByRole("separator", { name: "File list width", exact: true }).count(), 1);
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

    assert.equal(await page.getByRole("button", { name: "Test with a document", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Test with a document", exact: true }).click();
    assert.equal(await page.locator("body").getAttribute("data-run-requested"), "true");

    await files.locator('[data-file-choice="tool"]').click();
    assert.equal(await page.locator(".build-area-title").textContent(), "Document validationSandboxed",
      "A source-project path supplies the parent name when no display name is provided");
    const toolsArea = page.locator('.build-area[data-area-id="skills"]');
    assert.equal(await toolsArea.locator(".build-area-title .build-sandbox-badge").textContent(), "Sandboxed");
    assert.match(await toolsArea.locator(".build-sandbox-badge").getAttribute("title"), /verified separately/);
    assert.equal(await files.locator('[data-file-choice="tool"]').count(), 1,
      "The categorized list shows the source project name");
    assert.equal(await toolsArea.locator(".build-project-list").count(), 0);

    await files.locator('[data-file-choice="runtime"]').click();
    await page.getByRole("toolbar", { name: "File pages", exact: true })
      .getByRole("button", { name: "runtime.json", exact: true }).click();
    const runtimeArea = page.locator('.build-area[data-area-id="application"]');
    assert.equal(await runtimeArea.locator(".build-area-title").textContent(), "Config",
      "Files in a shared directory form one collection even without discovery metadata");
    assert.equal(await runtimeArea.locator(".build-area-description").count(), 0);
    const modelAction = runtimeArea.getByRole("button", { name: "Model connection", exact: true });
    await modelAction.click();
    assert.equal(await page.locator("body").getAttribute("data-model-requested"), "true");
    assert.ok(await runtimeArea.getByText(/Local subprocess simulation/).count() > 0,
      "Runtime remains informational");

    const disclosure = runtimeArea.locator('.build-file-source[data-preview-for="runtime"]');
    assert.equal(await disclosure.isVisible(), true);
    const preview = page.getByRole("region", { name: "Runtime & access source preview", exact: true });
    await preview.waitFor();
    const before = await preview.locator(".build-highlight").textContent();
    await preview.focus();
    await page.keyboard.insertText('{"agentRuntime":"changed"}');
    assert.equal(await preview.locator(".build-highlight").textContent(), before);
    assert.equal(requests.some(({ path }) => path === "/api/build-diff" || path === "/api/build-file"), false);
    assert.equal(requests.some(({ method }) => method !== "GET"), false);
    async function assertActionMatrix(sectionHandlers) {
      const base = ["Edit in VS Code", "Open with", "Adjust with AI"];
      for (const artifact of artifacts) {
        await page.setViewportSize({ width: 1000, height: 800 });
        await files.locator(`[data-file-choice="${artifact.id === "policy" ? "runtime" : artifact.id === "contract" ? "tool" : artifact.id}"]`).click();
        const row = page.locator(`.build-file[data-artifact="${artifact.id}"]`);
        if (await page.getByRole("toolbar", { name: "File pages", exact: true }).count()) {
          const filename = artifact.path.split("/").pop();
          const inline = page.getByRole("toolbar", { name: "File pages", exact: true })
            .getByRole("button", { name: filename, exact: true });
          if (await inline.isVisible()) await inline.click();
          else {
            await page.getByRole("button", { name: "More files", exact: true }).click();
            await page.getByRole("menu", { name: "More files", exact: true })
              .getByRole("menuitem", { name: filename, exact: true }).click();
          }
        }
        const contextual = !documentSupport || !sectionHandlers ? [] :
          artifact.id === "instructions" ? ["Test with a document"] :
            artifact.id === "runtime" ? ["Model connection"] : [];
        const expected = [...base, ...contextual];
        const direct = await row.locator(".build-file-actions").getByRole("button")
          .evaluateAll(controls => controls.map(control => control.getAttribute("aria-label")));
        assert.deepEqual(direct, expected, `${artifact.customizationArea} exposes only its supported file actions`);
        assert.equal(await row.locator('.build-warning .ct-message[data-intent="warning"]').count(), 0,
          "Unchanged source previews do not show static enforcement alarms");
        if (["tool", "contract", "policy"].includes(artifact.id)) {
          assert.equal(await row.locator(".build-warning").count(), 0);
          assert.doesNotMatch(await row.innerText(), /Developer-owned enforcement|rebuild cloud images/);
        }
        const filePicker = page.getByRole("button", { name: "More files", exact: true });
        if (await filePicker.isVisible()) {
          await filePicker.click();
          const menu = page.getByRole("menu", { name: "More files", exact: true });
          const inline = await page.getByRole("toolbar", { name: "File pages", exact: true }).getByRole("button").allTextContents();
          assert.deepEqual(await menu.getByRole("menuitem").allTextContents(),
            ["runtime.json", "document-policy.json"].filter(filename => !inline.includes(filename)),
            "The collection overflow lists only hidden files, not file actions");
          const selected = menu.locator('[aria-current="true"]');
          const filename = artifact.path.split("/").pop();
          assert.equal(await selected.count(), Number(!inline.includes(filename)));
          if (!inline.includes(filename)) assert.equal(await selected.textContent(), filename);
          await page.keyboard.press("Escape");
        }
        await page.setViewportSize({ width: 380, height: 800 });
        await row.getByRole("button", { name: "Open with", exact: true }).click();
        const openMenu = page.getByRole("menu", { name: "Open with", exact: true });
        assert.deepEqual(await openMenu.getByRole("menuitem").allTextContents(), ["Files", "VS Code"],
          `${artifact.customizationArea} split menu combines only the two existing file destinations`);
        await page.keyboard.press("Escape");
        const more = row.getByRole("button", { name: "More file actions", exact: true });
        assert.equal(await more.isVisible(), contextual.length > 0,
          "More is absent when the split button and AI action already expose all available actions");
        if (contextual.length) {
          await more.click();
          const menu = page.getByRole("menu", { name: "More file actions", exact: true });
          assert.deepEqual(await menu.getByRole("menuitem").allTextContents(), contextual,
            `${artifact.customizationArea} overflow includes only its hidden section action`);
          await page.keyboard.press("Escape");
        }
      }
    }
    await assertActionMatrix(true);
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto(`http://127.0.0.1:${server.address().port}/?no-section-handlers`);
    await page.addStyleTag({ content: BUILD_EXPLORER_CSS });
    await files.locator('[data-file-choice="instructions"]').waitFor();
    await assertActionMatrix(false);
    documentSupport = false;
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addStyleTag({ content: BUILD_EXPLORER_CSS });
    await files.locator('[data-file-choice="instructions"]').waitFor();
    await assertActionMatrix(true);
    await page.setViewportSize({ width: 1000, height: 800 });
    documentSupport = true;
    artifacts.find(artifact => artifact.id === "runtime").content = '{"agentRuntime":"copilot-sdk-sandbox"}';
    await page.getByRole("button", { name: "Refresh source", exact: true }).click();
    await files.locator('[data-file-choice="runtime"]').click();
    await page.getByRole("toolbar", { name: "File pages", exact: true })
      .getByRole("button", { name: "runtime.json", exact: true }).click();
    const runtime = page.locator('.build-file[data-artifact="runtime"]');
    await runtime.locator(".build-runtime-info").waitFor();
    assert.match(await runtime.innerText(), /Target: separate ACA sandboxes/);
    assert.equal(await runtime.locator(".build-warning").count(), 0,
      "A configured Sandbox target is neutral information, not an enforcement alarm");
    assert.doesNotMatch(await runtime.innerText(), /not proof of deployment or isolation/);
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
    const panel = (${createBuildPanel.toString()})({ buttons: window.appPlatformButtons, helpIcon: ${JSON.stringify(renderOcticon("info"))}, vsCodeIconMarkup: ${JSON.stringify(VSCODE_ICON_MARKUP)},
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
          diagnostics: [{ path: "azure-app.yaml", message: "Agent path was not found." }],
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
    assert.match(await page.locator(".build-empty").innerText(), /Build only shows recognized decision points/);
    assert.match(await page.locator("#details").innerText(), /Building blocks/i);
    assert.equal(await page.locator(".build-source-preview,textarea,[contenteditable=true]").count(), 0);
    assert.equal(await page.locator(".build-discovery,[data-editor-select]").count(), 0);
    assert.equal(await page.locator('[data-artifact="missing"],[data-artifact="unknown"]').count(), 0);
    assert.equal(await page.getByText("azure-app.yaml: Agent path was not found.", { exact: true }).count(), 1);
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
