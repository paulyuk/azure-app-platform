import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { DEFAULT_EDITOR_SETTINGS, EDITOR_CHOICES } from "./editor-settings.mjs";
import { EMPTY_TEMPLATE } from "./source-catalog.mjs";
import { renderStudioHtml } from "./studio-ui.mjs";
import { serveStudioAsset } from "./studio-assets.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("Settings and app review share one race-safe external editor preference", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  let editorSettings = DEFAULT_EDITOR_SETTINGS;
  let failPreference = false;
  let readGate;
  const requests = [];
  const server = createServer((request, response) => {
    void (async () => {
      if (await serveStudioAsset(request, response, new URL(request.url, "http://localhost").pathname)) return;
      response.setHeader("Content-Type", "text/html");
      response.end(renderStudioHtml("editor-fixture", "fixture", { editorSettings }));
    })().catch(cause => { response.writeHead(500); response.end(cause.message); });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    page.setDefaultTimeout(5000);
    const errors = [], creations = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      requests.push({ path, method: request.method(), body: request.postDataJSON() });
      assert.equal(request.headers()["x-unity-studio-token"], "fixture");
      let body;
      if (path === "/api/preferences") body = { theme: "light" };
      else if (path === "/api/sources") body = { roots: [], apps: [], templates: [EMPTY_TEMPLATE] };
      else if (path === "/api/editor-settings") {
        if (request.method() === "GET") {
          if (readGate) {
            const current = readGate;
            current.started.resolve();
            await current.reply.promise;
            body = current.settings;
            current.completed.resolve();
          } else body = editorSettings;
        } else if (failPreference) {
          await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Could not persist editor."}' });
          return;
        } else {
          editorSettings = { ...editorSettings, editorId: request.postDataJSON().editorId };
          body = editorSettings;
        }
      } else if (path === "/api/workspace-request") {
        creations.push(request.postDataJSON());
        body = { outcome: "workspace-created", worktreePath: "/workspace/created-app" };
      } else throw new Error("Unexpected route " + path);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.route("**/app-map?**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<h1>Created workspace</h1>" }));
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

    await page.goto(base);
    const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    const settingsPicker = settings.getByRole("combobox", { name: "Preferred external editor" });
    assert.equal(requests.filter(({ path }) => path === "/api/editor-settings").length, 0);
    await settingsButton.click();
    await settingsPicker.waitFor();
    assert.deepEqual(await settingsPicker.locator("option").allTextContents(),
      EDITOR_CHOICES.map((editor) => editor.label));
    assert.equal(await settingsPicker.inputValue(), "vscode");
    assert.deepEqual(requests.filter(({ path }) => path === "/api/editor-settings")
      .map(({ method }) => method), ["GET"]);

    await settingsPicker.selectOption("cursor");
    await page.waitForFunction(() =>
      document.querySelector('[aria-label="Preferred external editor"]')?.value === "cursor");
    assert.equal(requests.filter(({ path, method }) =>
      path === "/api/editor-settings" && method === "POST").length, 1);
    await page.getByRole("button", { name: "Close settings" }).click();

    await reviewApp();
    const reviewPicker = page.getByRole("combobox", { name: "Code editor", exact: true });
    assert.equal(await reviewPicker.inputValue(), "cursor");
    await page.locator("#open-editor").uncheck();
    await reviewPicker.selectOption("zed");
    await page.locator("#status").filter({ hasText: "Code editor preference saved." }).waitFor();
    assert.equal(await reviewPicker.inputValue(), "zed",
      "Changing the app-review picker persists the selected editor");
    assert.match(await page.locator("#open-editor-label").textContent(), /Zed/);
    assert.equal(await page.locator("#open-editor").isChecked(), false);

    await settingsButton.click();
    assert.equal(await settingsPicker.inputValue(), "zed");
    failPreference = true;
    await settingsPicker.selectOption("windsurf");
    await settings.getByRole("alert").filter({ hasText: /Could not persist editor/ }).waitFor();
    assert.equal(await settingsPicker.inputValue(), "zed");
    await page.getByRole("button", { name: "Close settings" }).click();
    assert.equal(await reviewPicker.inputValue(), "zed");

    readGate = {
      started: deferred(), reply: deferred(), completed: deferred(),
      settings: { ...editorSettings, editorId: "cursor" },
    };
    await settingsButton.click();
    await readGate.started.promise;
    failPreference = false;
    const postsBeforeBusyRead = requests.filter(({ path, method }) =>
      path === "/api/editor-settings" && method === "POST").length;
    assert.equal(await settingsPicker.isDisabled(), true);
    assert.equal(await reviewPicker.isDisabled(), true);
    assert.equal(requests.filter(({ path, method }) =>
      path === "/api/editor-settings" && method === "POST").length, postsBeforeBusyRead);
    readGate.reply.resolve();
    await readGate.completed.promise;
    readGate = undefined;
    await settingsPicker.waitFor({ state: "visible" });
    await page.waitForFunction(() =>
      [...document.querySelectorAll("#preferred-editor")].every((control) => !control.disabled));
    await reviewPicker.selectOption("sublime");
    await page.waitForFunction(() => document.querySelector("#preferred-editor")?.value === "sublime");
    assert.equal(await settingsPicker.inputValue(), "sublime",
      "A stale Settings GET cannot overwrite the newer review save");
    await page.getByRole("button", { name: "Close settings" }).click();

    await page.locator("#back").click();
    assert.equal(await page.locator("#agent-instructions").inputValue(), "Use verified tool results.");
    await page.locator("#next").click();
    assert.equal(await reviewPicker.inputValue(), "sublime");
    assert.equal(await page.locator("#open-editor").isChecked(), false);
    await page.locator("#next").click();
    await page.waitForURL("**/app-map?**");
    assert.equal(creations.length, 1);
    assert.equal(creations[0].editorId, "sublime");
    assert.equal(creations[0].openInEditor, false);
    assert.equal(creations[0].templateInputs.agentInstructions, "Use verified tool results.");
    assert.deepEqual(errors, []);
  } finally {
    readGate?.reply.resolve();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
