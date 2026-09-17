import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { DEFAULT_EDITOR_SETTINGS, EDITOR_CHOICES } from "./editor-settings.mjs";
import { EMPTY_TEMPLATE } from "./source-catalog.mjs";
import { renderStudioHtml } from "./studio-ui.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("App review saves a supported editor without launching it or losing input, and rolls back failed preferences", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  let editorSettings = DEFAULT_EDITOR_SETTINGS;
  let failPreference = false;
  let releaseSave, receivedSave;
  const saveGate = new Promise((resolve) => { releaseSave = resolve; });
  const saveRequest = new Promise((resolve) => { receivedSave = resolve; });
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(renderStudioHtml("editor-fixture", "fixture", { editorSettings }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    page.setDefaultTimeout(5000);
    const errors = [], creations = [], mutations = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === "POST") mutations.push(path);
      assert.equal(request.headers()["x-unity-studio-token"], "fixture");
      let body;
      if (path === "/api/preferences") body = { theme: "light" };
      else if (path === "/api/sources") body = { roots: [], apps: [], templates: [EMPTY_TEMPLATE] };
      else if (path === "/api/editor-settings") {
        receivedSave();
        await saveGate;
        if (failPreference) {
          await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Could not persist editor."}' });
          return;
        }
        editorSettings = { ...editorSettings, editorId: request.postDataJSON().editorId };
        body = editorSettings;
      } else if (path === "/api/workspace-request") {
        creations.push(request.postDataJSON());
        body = { outcome: "workspace-created", worktreePath: "/tmp/created-app" };
      } else throw new Error("Unexpected route " + path);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.route("**/app-map?**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Created workspace</h1>" }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const reviewApp = async () => {
      await page.goto(base);
      await page.locator("#new-app").click();
      await page.locator('input[name="template"]').waitFor();
      await page.locator("#app-name").fill("claims-app");
      await page.locator("#purpose").fill("Review claims safely.");
      await page.locator("#next").click();
      await page.locator("#agent-instructions").fill("Use verified tool results.");
      await page.locator("#next").click();
      await page.locator("#preferred-editor").waitFor();
    };
    await reviewApp();
    const picker = page.getByRole("combobox", { name: "Code editor", exact: true });
    assert.deepEqual(await picker.locator("option").allTextContents(), EDITOR_CHOICES.map((editor) => editor.label));
    await page.locator("#open-editor").uncheck();
    await picker.selectOption("cursor");
    await saveRequest;
    assert.equal(await page.locator("#next").isDisabled(), true);
    assert.equal(await picker.isDisabled(), true);
    assert.deepEqual(creations, []);
    releaseSave();
    await page.waitForFunction(() => !document.querySelector("#preferred-editor").disabled);
    assert.match(await page.locator("#open-editor-label").textContent(), /Cursor/);
    assert.equal(await page.locator("#open-editor").isChecked(), false);
    failPreference = true;
    await picker.selectOption("windsurf");
    await page.waitForFunction(() => document.querySelector("#preferred-editor").value === "cursor");
    assert.match(await page.locator("#status").textContent(), /Could not persist editor/);
    assert.equal(await page.locator("#next").isEnabled(), true);
    await page.locator("#back").click();
    assert.equal(await page.locator("#agent-instructions").inputValue(), "Use verified tool results.");
    await page.locator("#next").click();
    assert.equal(await picker.inputValue(), "cursor");
    assert.equal(await page.locator("#open-editor").isChecked(), false);
    assert.deepEqual(mutations, ["/api/editor-settings", "/api/editor-settings"]);
    await page.locator("#next").click();
    await page.waitForURL("**/app-map?**");
    assert.equal(creations.length, 1);
    assert.equal(creations[0].editorId, "cursor");
    assert.equal(creations[0].openInEditor, false);
    assert.equal("openInVsCode" in creations[0], false);
    assert.equal(creations[0].templateInputs.agentInstructions, "Use verified tool results.");
    await reviewApp();
    assert.equal(await picker.inputValue(), "cursor");
    assert.deepEqual(errors, []);
  } finally {
    releaseSave();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
