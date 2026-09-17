import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { buildDiffFixture } from "./build-diff-test-fixture.mjs";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_REVIEW_SCRIPT } from "./build-review-editor.mjs";
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
    ${BUILD_REVIEW_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
      createReviewEditor: createBuildReview,
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
      } else if (path === "/api/build-diff") {
        const input = route.request().postDataJSON();
        const artifact = artifacts.find((item) => item.id === input.id);
        await route.fulfill({ json: buildDiffFixture({
          baseSha: input.baseSha, before: artifact.content, after: input.content,
        }) });
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
    const rail = page.locator(".build-explorer-reopen");
    const splitter = page.getByRole("separator", { name: "Resize discovered files" });
    const assertFilesRail = async () => {
      const railBounds = await rail.boundingBox();
      const workspaceBounds = await page.locator(".build-workspace").boundingBox();
      const editorBounds = await page.locator(".build-editor").boundingBox();
      assert.equal(railBounds.width, 40);
      assert.equal(railBounds.x, workspaceBounds.x);
      assert.equal(railBounds.y, workspaceBounds.y);
      assert.equal(railBounds.height, workspaceBounds.height);
      assert.equal(editorBounds.x, railBounds.x + railBounds.width);
      assert.equal(editorBounds.y, railBounds.y);
      assert.equal(editorBounds.width + railBounds.width, workspaceBounds.width);
      assert.equal(await rail.locator('[data-icon="file"]').count(), 1);
      assert.equal(await splitter.isVisible(), false);
    };
    await editor.waitFor();
    assert.equal(await editor.inputValue(), "Source for agent");
    assert.equal(await page.getByRole("textbox").count(), 1);
    assert.equal(await page.locator(".build-file-count").textContent(), "36 files");
    assert.ok((await explorer.boundingBox()).x + (await explorer.boundingBox()).width <= (await editor.boundingBox()).x);
    assert.ok((await editor.boundingBox()).height >= 400);
    assert.ok(await explorer.evaluate((el) => el.scrollHeight > el.clientHeight));
    assert.equal(await toggle.getAttribute("aria-label"), "Hide files");
    assert.equal(await toggle.getAttribute("title"), "Hide files");
    assert.equal(await toggle.textContent(), "");
    assert.equal(await toggle.locator('svg[aria-hidden="true"]').count(), 1);
    assert.equal((await toggle.boundingBox()).width, 28);
    assert.ok((await toggle.boundingBox()).x < (await editor.boundingBox()).x);
    const header = await page.locator(".build-explorer-header").boundingBox();
    const headerPadding = await page.locator(".build-explorer-header").evaluate((element) => parseFloat(getComputedStyle(element).paddingRight));
    const collapse = await toggle.boundingBox();
    assert.ok(Math.abs(collapse.x + collapse.width - (header.x + header.width - headerPadding)) < 1);
    assert.equal(await page.locator(".build-header [data-build-files-toggle]").count(), 0);
    assert.equal(await splitter.getAttribute("aria-orientation"), "vertical");
    assert.equal(await splitter.getAttribute("title"), "Drag to resize files. Arrow keys also adjust the width.");
    assert.equal(await splitter.evaluate((element) => getComputedStyle(element).cursor), "col-resize");
    assert.notEqual(await splitter.evaluate((element) => getComputedStyle(element, "::after").backgroundColor), "rgba(0, 0, 0, 0)");
    const assertCenteredGrip = async () => {
      const centers = await splitter.evaluate((element) => ["::before", "::after"].map((pseudo) => {
        const style = getComputedStyle(element, pseudo);
        return parseFloat(style.left) + parseFloat(style.width) / 2 + new DOMMatrixReadOnly(style.transform).m41;
      }));
      assert.ok(Math.abs(centers[0] - centers[1]) < 0.1, "The divider and grip share the same center");
      assert.ok(Math.abs(centers[0] - (await splitter.boundingBox()).width / 2) < 0.1);
    };
    await assertCenteredGrip();
    await splitter.hover();
    await assertCenteredGrip();

    const originalSource = await editor.inputValue();
    let divider = await splitter.boundingBox();
    await page.mouse.move(divider.x + divider.width / 2, divider.y + 120);
    await page.mouse.down();
    await page.mouse.move(divider.x + 190, divider.y + 120);
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector(".build-explorer").getBoundingClientRect().width > 380);
    const preferredWidth = (await explorer.boundingBox()).width;
    assert.ok(preferredWidth <= 460 && preferredWidth >= 380);
    assert.equal(await editor.inputValue(), originalSource);
    await page.locator("#details").evaluate((el) => { el.style.width = "700px"; });
    await page.waitForFunction(() => document.querySelector(".build-explorer").getBoundingClientRect().width <= 373);
    assert.ok(Number(await splitter.getAttribute("aria-valuenow")) <= Number(await splitter.getAttribute("aria-valuemax")));
    await page.locator("#details").evaluate((el) => { el.style.width = "1200px"; });
    await page.waitForFunction((width) => Math.abs(document.querySelector(".build-explorer").getBoundingClientRect().width - width) < 2, preferredWidth);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await editor.waitFor();
    assert.ok(Math.abs((await explorer.boundingBox()).width - preferredWidth) < 2);
    assert.equal(await editor.inputValue(), originalSource);

    await splitter.focus();
    await assertCenteredGrip();
    await splitter.press("Home");
    assert.equal(await splitter.getAttribute("aria-valuenow"), await splitter.getAttribute("aria-valuemin"));
    await splitter.press("ArrowLeft");
    assert.equal(await splitter.getAttribute("aria-valuenow"), await splitter.getAttribute("aria-valuemin"));
    await splitter.press("End");
    assert.equal(await splitter.getAttribute("aria-valuenow"), await splitter.getAttribute("aria-valuemax"));
    await splitter.press("ArrowRight");
    assert.equal(await splitter.getAttribute("aria-valuenow"), await splitter.getAttribute("aria-valuemax"));
    divider = await splitter.boundingBox();
    await splitter.dispatchEvent("pointerdown", {
      pointerId: 91, pointerType: "mouse", button: 0, clientX: divider.x, clientY: divider.y + 20,
    });
    assert.equal(await page.locator(".build-workspace").getAttribute("data-resizing"), "true");
    await splitter.dispatchEvent("pointercancel", {
      pointerId: 91, pointerType: "mouse", button: 0, clientX: divider.x, clientY: divider.y + 20,
    });
    assert.equal(await page.locator(".build-workspace").getAttribute("data-resizing"), null);

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
    assert.equal(await toggle.getAttribute("aria-label"), "Show files");
    assert.equal(await toggle.getAttribute("title"), "Show files");
    assert.equal(await toggle.textContent(), "");
    await assertFilesRail();
    assert.equal(await page.locator("[data-build-files-toggle]").count(), 1);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await editor.waitFor();
    assert.equal(await explorer.isVisible(), false);
    assert.equal(await toggle.isVisible(), true);
    await assertFilesRail();
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
      if (width < 600) {
        await assertFilesRail();
        const sourceBox = await page.locator(".build-source-editor").boundingBox();
        const gutterBox = await page.locator(".build-line-numbers").boundingBox();
        const collapsedEditor = await editor.boundingBox();
        assert.ok(gutterBox.x + gutterBox.width <= collapsedEditor.x + 1);
        assert.ok(collapsedEditor.x + collapsedEditor.width <= sourceBox.x + sourceBox.width + 1);
        assert.ok(collapsedEditor.width >= sourceBox.width - gutterBox.width - 3);
        assert.ok(Math.abs(gutterBox.width + collapsedEditor.width - sourceBox.width) <= 3);
      }
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
