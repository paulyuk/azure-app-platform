import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("Build file explorer filters folders, preserves selection and offscreen saves, and adapts to pane width", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifacts = [
    { id: "agent", path: "src/agent/main.py", title: "Agent behavior" },
    { id: "inventory", path: "src/skills/inventory/main.py", title: "Inventory tool" },
    { id: "pricing", path: "src/skills/pricing/main.py", title: "Pricing tool" },
    { id: "config", path: "config/settings.json", title: "App settings" },
    { id: "manifest", path: "unity.app.yaml", title: "App inventory" },
    ...Array.from({ length: 30 }, (_, index) => ({
      id: `extra-${index}`, path: `src/skills/extra/long-component-file-name-${index}.py`, title: `Extra tool ${index}`,
    })),
  ].map((item) => ({ ...item, available: true, editable: true, description: item.title, content: `Source for ${item.id}`, sha: "base" }));
  artifacts.push({ id: "missing", path: "config/missing.json", title: "Missing configuration", available: false, detail: "File is missing. Restore it in Code." });
  let pendingReply, releaseSave, saveStarted;
  const writes = [];
  let workspaceReads = 0;
  const html = `<!doctype html><style>
    body { margin:0; } #details { height:100vh; }
    ${BUILD_PANEL_CSS}
    </style><aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
      onRun() {}, onModel() {}, onStructure() {},
      request: async (path, options) => {
        const response = await fetch(path, options);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      }
    });
    panel.show();
    </script>`;
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end(html); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") {
        workspaceReads++;
        await route.fulfill({ json: { artifacts, supportsDocuments: false } });
      } else if (path === "/api/build-file") {
        const input = route.request().postDataJSON();
        writes.push(input);
        saveStarted?.();
        const failure = await pendingReply;
        if (failure) await route.fulfill({ status: 409, json: { error: failure } });
        else {
          const artifact = artifacts.find((item) => item.id === input.id);
          Object.assign(artifact, { content: input.content, sha: `saved-${writes.length}` });
          await route.fulfill({ json: artifact });
        }
      } else throw new Error("Unexpected route " + path);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const editor = page.locator(".build-editor textarea");
    const explorer = page.getByRole("navigation", { name: "Discovered files" });
    const filter = page.getByRole("searchbox", { name: "Filter discovered files" });
    const file = (id) => page.locator(`[data-file-id="${id}"]`);
    const toggle = page.locator("[data-build-files-toggle]");
    await editor.waitFor();
    assert.equal(await editor.inputValue(), "Source for agent");
    assert.equal(await page.getByRole("textbox").count(), 1);
    assert.equal(await page.locator(".build-file-count").textContent(), "36 files");
    assert.ok((await explorer.boundingBox()).x + (await explorer.boundingBox()).width <= (await editor.boundingBox()).x);
    assert.ok((await editor.boundingBox()).height >= 400);
    assert.ok(await explorer.evaluate((el) => el.scrollHeight > el.clientHeight));

    const src = page.locator(".build-folder > summary").filter({ hasText: /^src$/ });
    await src.press("Enter");
    assert.equal(await file("agent").isVisible(), false);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await editor.waitFor();
    assert.equal(await file("agent").isVisible(), false);
    await src.press("Enter");
    await filter.fill("PRICING");
    assert.equal(await explorer.locator("[data-file-id]").count(), 1);
    assert.equal(await file("pricing").isVisible(), true);
    assert.equal(await page.locator(".build-file-count").textContent(), "1 of 36 files");
    await file("pricing").press("Enter");
    await editor.fill("Unsaved pricing changes.");
    assert.match(await file("pricing").getAttribute("aria-label"), /Unsaved/);
    await filter.fill("no-such-file");
    await explorer.getByText("No files match this filter.").waitFor();
    assert.equal(await editor.inputValue(), "Unsaved pricing changes.");
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    assert.equal(await filter.inputValue(), "");
    await file("config").click();
    await editor.fill("Unsaved settings.");
    await file("pricing").click();
    assert.equal(await editor.inputValue(), "Unsaved pricing changes.");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await editor.waitFor();
    assert.equal(await file("pricing").getAttribute("aria-current"), "true");
    assert.equal(await editor.inputValue(), "Unsaved pricing changes.");

    for (const failure of [null, "The saved file changed. Reload before saving."]) {
      await editor.fill(failure ? "A conflicting pricing draft." : "Reviewed pricing changes.");
      await page.getByRole("button", { name: "Review changes", exact: true }).click();
      const started = new Promise((resolve) => { saveStarted = resolve; });
      pendingReply = new Promise((resolve) => { releaseSave = resolve; });
      await page.getByRole("button", { name: "Save reviewed changes" }).click();
      await started;
      assert.match(await file("pricing").getAttribute("aria-label"), /Saving/);
      await file("config").click();
      assert.equal(await editor.inputValue(), "Unsaved settings.");
      const reads = workspaceReads;
      const response = page.waitForResponse((response) => response.url().endsWith("/api/build-file"));
      releaseSave(failure);
      await response;
      await page.waitForFunction(() => !document.querySelector('[data-file-id="pricing"]')?.getAttribute("aria-label").includes("Saving"));
      assert.equal(workspaceReads, reads, "Completing an offscreen save must not reload or steal the current editor");
      assert.equal(await file("config").getAttribute("aria-current"), "true");
      assert.equal(await editor.inputValue(), "Unsaved settings.");
      await file("pricing").click();
      if (failure) {
        await page.getByRole("alert").filter({ hasText: failure }).waitFor();
        assert.equal(await editor.inputValue(), "A conflicting pricing draft.");
        assert.match(await file("pricing").getAttribute("aria-label"), /Save failed/);
      } else {
        await page.getByText(/Saved\. Restart/).waitFor();
        assert.equal(await editor.inputValue(), "Reviewed pricing changes.");
        assert.equal(await file("pricing").getAttribute("aria-label"), "src/skills/pricing/main.py");
      }
    }
    assert.equal(writes.length, 2);
    assert.equal(writes[1].baseSha, "saved-1");
    await toggle.click();
    assert.equal(await explorer.isVisible(), false);
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await toggle.click();
    assert.equal(await filter.evaluate((el) => el === document.activeElement), true);

    // The Guide can narrow the pane without changing the browser viewport.
    await page.locator("#details").evaluate((el) => { el.style.width = "460px"; });
    await page.waitForFunction(() => document.querySelector(".build-workspace")?.dataset.compact === "true");
    assert.equal(await explorer.isVisible(), false);
    assert.equal(await editor.isVisible(), true);
    await toggle.press("Enter");
    assert.equal(await explorer.isVisible(), true);
    assert.equal(await editor.isVisible(), false);
    assert.equal(await filter.evaluate((el) => el === document.activeElement), true);
    await file("config").press("Enter");
    assert.equal(await editor.isVisible(), true);
    assert.equal(await explorer.isVisible(), false);
    assert.equal(await editor.inputValue(), "Unsaved settings.");
    assert.equal(await editor.evaluate((el) => el === document.activeElement), true);
    for (const width of [320, 460, 800]) {
      await page.locator("#details").evaluate((el, value) => { el.style.width = value + "px"; }, width);
      await page.waitForFunction((value) => document.querySelector(".build-workspace")?.dataset.compact === String(value < 600), width);
      assert.ok(await page.locator("#details").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      assert.ok(await page.locator(".build-editor").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      if (width < 600) assert.ok((await editor.boundingBox()).width >= width - 40);
    }
    await file("missing").click();
    await page.getByText("File is missing. Restore it in Code.", { exact: true }).waitFor();
    assert.equal(await editor.count(), 0);
    assert.match(await file("missing").getAttribute("aria-label"), /Unavailable/);
    artifacts.splice(artifacts.findIndex((item) => item.id === "missing"), 1);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await editor.waitFor();
    assert.equal(await file("agent").getAttribute("aria-current"), "true");
    await file("config").click();
    assert.equal(await editor.inputValue(), "Unsaved settings.");
    assert.deepEqual(errors, []);
  } finally {
    releaseSave?.();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
