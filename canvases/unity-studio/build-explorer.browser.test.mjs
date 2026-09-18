import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("Build groups curated files and preserves navigation state through resize and re-entry", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifacts = [
    { id: "agent", customizationArea: "behavior", path: "src/agent/main.py", title: "Agent behavior" },
    { id: "inventory", customizationArea: "tools", path: "src/skills/inventory/main.py", title: "Inventory tool" },
    { id: "pricing", customizationArea: "tools", path: "src/skills/pricing/main.py", title: "Pricing tool" },
    { id: "config", customizationArea: "runtime", path: "config/settings.json", title: "App settings" },
    { id: "policy", customizationArea: "policies", path: "config/policy.json", title: "Policy" },
    ...Array.from({ length: 20 }, (_, index) => ({
      id: `extra-${index}`, path: `src/skills/extra/long-component-file-name-${index}.py`, title: `Extra tool ${index}`,
    })),
  ].map((item) => ({
    ...item, available: true, editable: true, description: item.title,
    content: `${item.title}\n${Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join("\n")}`, sha: "base",
  }));
  artifacts.push(
    { id: "missing", customizationArea: "policies", path: "config/missing.json", title: "Missing policy", available: false, detail: "File is missing." },
    { id: "unknown", customizationArea: "advanced", path: "config/advanced.json", title: "Advanced", available: true, content: "{}" },
  );
  let workspaceReads = 0;
  const html = `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style>
    <aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    window.panelActive = true;
    window.buildPanel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture", isActive: () => window.panelActive, syntax: buildSyntax,
      onRun() {}, onModel() {},
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
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") {
        workspaceReads++;
        await route.fulfill({ json: { artifacts } });
      } else {
        throw new Error(`Unexpected route ${path}`);
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const explorer = page.getByRole("navigation", { name: "Key files" });
    const file = (id) => page.locator(`[data-file-id="${id}"]`);
    const tools = explorer.locator('[data-area-id="tools"]');
    const toolsSummary = tools.locator("summary");
    const toggle = page.locator("[data-build-files-toggle]");
    const rail = page.locator(".build-explorer-reopen");
    const splitter = page.getByRole("separator", { name: "Resize key files" });
    const preview = () => page.locator(".build-source-preview");
    await preview().waitFor();

    assert.equal(await explorer.getByRole("heading", { name: "Key files", exact: true }).count(), 1);
    assert.deepEqual(await explorer.locator("[data-area-id]").evaluateAll((items) =>
      items.map((item) => item.dataset.areaId)), ["behavior", "tools", "runtime", "policies"]);
    assert.deepEqual(await explorer.locator("summary").allTextContents(),
      ["Agent behavior", "Tools & contracts", "Runtime", "Policies & limits"]);
    assert.equal(await explorer.locator("details").count(), 4);
    assert.equal(await explorer.locator("[data-file-id]").count(), 5, "Only curated files appear in Key files");
    assert.deepEqual(await tools.locator("[data-file-id]").evaluateAll((items) =>
      items.map((item) => item.dataset.fileId)), ["inventory", "pricing"]);
    assert.equal(await file("inventory").locator(".build-file-name").textContent(), "main.py");
    assert.equal(await file("pricing").locator(".build-file-name").textContent(), "main.py");
    assert.notEqual(await file("inventory").locator(".build-file-location").textContent(),
      await file("pricing").locator(".build-file-location").textContent());
    assert.equal(await page.locator("textarea,[contenteditable=true]").count(), 0);
    assert.equal(await page.locator('[data-artifact="missing"],[data-artifact="unknown"]').count(), 0);

    await file("inventory").focus();
    await file("inventory").press("Tab");
    assert.equal(await file("pricing").evaluate((element) => element === document.activeElement), true);
    await file("pricing").press("Enter");
    const pricingPreview = page.getByRole("region", { name: "Pricing tool source preview", exact: true });
    await pricingPreview.waitFor();
    assert.equal(await file("pricing").getAttribute("aria-current"), "true");
    assert.equal(await explorer.locator('[aria-current="true"]').count(), 1);
    assert.ok((await explorer.boundingBox()).x + (await explorer.boundingBox()).width <= (await preview().boundingBox()).x);

    await toolsSummary.click();
    assert.equal(await tools.evaluate((group) => group.open), false);
    assert.equal(await file("pricing").isVisible(), false);
    assert.equal(await file("agent").isVisible(), true);
    assert.ok((await toolsSummary.boundingBox()).height >= 32);
    await toolsSummary.press("Tab");
    assert.equal(await explorer.locator('[data-area-id="runtime"] summary').evaluate(
      (element) => element === document.activeElement), true);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await pricingPreview.waitFor();
    assert.equal(await tools.evaluate((group) => group.open), false);
    assert.equal(await file("pricing").getAttribute("aria-current"), "true");
    await page.evaluate(() => {
      window.panelActive = false;
      window.buildPanel.hide();
      window.panelActive = true;
      window.buildPanel.show();
    });
    await pricingPreview.waitFor();
    assert.equal(await tools.evaluate((group) => group.open), false, "Section collapse persists across Build re-entry");
    assert.equal(await file("pricing").getAttribute("aria-current"), "true");

    assert.equal(await toggle.getAttribute("aria-label"), "Hide key files");
    assert.equal(await toggle.locator('svg[aria-hidden="true"]').count(), 1);
    assert.equal(await splitter.getAttribute("aria-orientation"), "vertical");
    assert.equal(await splitter.getAttribute("title"), "Drag to resize navigation. Arrow keys also adjust the width.");
    assert.equal(await splitter.evaluate((element) => getComputedStyle(element).cursor), "col-resize");
    assert.notEqual(await splitter.evaluate((element) => getComputedStyle(element, "::after").backgroundColor), "rgba(0, 0, 0, 0)");

    const originalWidth = (await explorer.boundingBox()).width;
    let divider = await splitter.boundingBox();
    await page.mouse.move(divider.x + divider.width / 2, divider.y + 100);
    await page.mouse.down();
    await page.mouse.move(divider.x + 150, divider.y + 100);
    await page.mouse.up();
    const pointerWidth = (await explorer.boundingBox()).width;
    assert.ok(pointerWidth > originalWidth);
    await splitter.focus();
    await splitter.press("Home");
    assert.equal(await splitter.getAttribute("aria-valuenow"), await splitter.getAttribute("aria-valuemin"));
    await splitter.press("ArrowLeft");
    assert.equal(await splitter.getAttribute("aria-valuenow"), await splitter.getAttribute("aria-valuemin"));
    await splitter.press("End");
    assert.equal(await splitter.getAttribute("aria-valuenow"), await splitter.getAttribute("aria-valuemax"));
    await splitter.press("ArrowRight");
    assert.equal(await splitter.getAttribute("aria-valuenow"), await splitter.getAttribute("aria-valuemax"));

    await toggle.click();
    assert.equal(await explorer.isVisible(), false);
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await toggle.getAttribute("aria-label"), "Show key files");
    const railBounds = await rail.boundingBox();
    const workspaceBounds = await page.locator(".build-workspace").boundingBox();
    const editorBounds = await page.locator(".build-editor").boundingBox();
    assert.equal(Math.round(railBounds.width), 40);
    assert.equal(railBounds.x, workspaceBounds.x);
    assert.equal(railBounds.y, workspaceBounds.y);
    assert.equal(railBounds.height, workspaceBounds.height);
    assert.equal(editorBounds.x, railBounds.x + railBounds.width);
    assert.equal(await splitter.isVisible(), false);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await pricingPreview.waitFor();
    assert.equal(await explorer.isVisible(), false, "Collapsed Key files state persists through refresh");
    await toggle.click();
    assert.equal(await toolsSummary.evaluate((element) => element === document.activeElement), true,
      "Reopening navigation focuses the collapsed group containing the selected file");

    await page.locator("#details").evaluate((element) => { element.style.width = "460px"; });
    await page.waitForFunction(() => document.querySelector(".build-workspace")?.dataset.compact === "true");
    assert.equal(await explorer.isVisible(), false);
    assert.equal(Math.round((await rail.boundingBox()).width), 40);
    assert.equal(await preview().isVisible(), true);
    await toggle.press("Enter");
    assert.equal(await explorer.isVisible(), true);
    assert.equal(await preview().isVisible(), false);
    assert.equal(await toolsSummary.evaluate((element) => element === document.activeElement), true);
    await toolsSummary.press("Enter");
    assert.equal(await tools.evaluate((group) => group.open), true);
    await file("config").press("Enter");
    const configPreview = page.getByRole("region", { name: "App settings source preview", exact: true });
    await configPreview.waitFor();
    assert.equal(await explorer.isVisible(), false);
    assert.equal(await file("config").getAttribute("aria-current"), "true");
    assert.equal(await page.locator(".build-file h3").evaluate((element) => element === document.activeElement), true);
    for (const width of [320, 460, 800]) {
      await page.locator("#details").evaluate((element, value) => { element.style.width = value + "px"; }, width);
      await page.waitForFunction((value) =>
        document.querySelector(".build-workspace")?.dataset.compact === String(value < 600), width);
      assert.ok(await page.locator("#details").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
      assert.ok(await page.locator(".build-editor").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
    }
    assert.ok(workspaceReads >= 3);
    assert.equal(await page.locator(".build-file-status,.build-area-status").count(), 0, "No unsaved status badges remain");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
