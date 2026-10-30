import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";
import { installStudioAssetRoutes } from "./workspace-navigation-test-helpers.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Build preview scrollbars stay inside file containers when resized in ${name}`, {
    skip: !engine || !existsSync(engine.executablePath())
      ? "Install src/web Playwright dependencies and chromium/webkit browsers for scrollbar coverage." : false,
  }, async () => {
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
      const content = [`# ${"x".repeat(84)}`, ...Array.from({ length: 13 }, (_, index) => `line ${index}`)].join("\n");
      const artifacts = ["first", "second"].map((id) => ({
        id, customizationArea: "behavior", title: id, path: `src/agent/${id}.py`,
        projectPath: "src/agent", projectName: "Agent", available: true, content,
      }));
      const graph = {
        root: "/fixture", nodes: [], edges: [], unresolved: [], diagnostics: [],
        summary: { projectNodes: 0, operationNodes: 0, edges: 0, unresolved: 0 },
      };
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("http://build-layout.test/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/") return route.fulfill({
          contentType: "text/html",
          body: renderInteractiveAppMapHtml(graph, { apiToken: "fixture", theme: "light" }),
        });
        const responses = {
          "/api/build-workspace": { artifacts },
          "/api/app-status": { state: "stopped", recovered: false, foreignEntrypoints: [], entrypoints: [] },
          "/api/local-readiness": { ready: false, gatewayConfigured: false },
          "/api/app-output": { lines: [], commands: [] },
        };
        if (responses[path]) return route.fulfill({ json: responses[path] });
        if (path.startsWith("/assets/")) return route.fulfill({ status: 204 });
        throw new Error("Unexpected preview-layout request: " + path);
      });
      await page.addInitScript(() => localStorage.setItem("unity-workspace:/fixture:guide-collapsed", "true"));
      await installStudioAssetRoutes(page);
      await page.goto("http://build-layout.test/");
      await page.locator(".build-source-preview").first().waitFor();
      await page.addStyleTag({ content: `
        ::-webkit-scrollbar { width:16px; height:16px; }
        ::-webkit-scrollbar-thumb { background:#888; }
      ` });
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => { document.documentElement.dataset.studioTheme = value; }, theme);
        for (const width of [1000, 380, 620, 1000, 380]) {
          await page.setViewportSize({ width, height: 900 });
          const geometry = await page.locator(".build-file").evaluateAll((files) => files.map((file) => {
            const preview = file.querySelector(".build-source-preview");
            const disclosure = file.querySelector(".build-source-disclosure");
            const source = preview.getBoundingClientRect(), bounds = file.getBoundingClientRect();
            const style = getComputedStyle(file);
            return {
              bottomInset: bounds.bottom - source.bottom,
              expectedInset: parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth),
              disclosureOverflow: source.bottom - disclosure.getBoundingClientRect().bottom,
              horizontalScrollbar: preview.offsetHeight - preview.clientHeight - 2,
              horizontalOverflow: preview.scrollWidth > preview.clientWidth,
              contained: source.left >= bounds.left && source.right <= bounds.right,
            };
          }));
          assert.equal(geometry.length, 2);
          for (const item of geometry) {
            assert.ok(item.bottomInset >= item.expectedInset - 0.5,
              `${name} ${theme} ${width}px must preserve bottom padding: ${JSON.stringify(item)}`);
            assert.ok(item.disclosureOverflow <= 0.5 && item.contained);
            if (width === 380) {
              assert.ok(item.horizontalScrollbar >= 12, "Exercise classic scrollbars, not an overlay-only proxy");
              assert.equal(item.horizontalOverflow, true);
            }
          }
          assert.ok(await page.locator("#details").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
        }
      }
      const disclosure = page.locator(".build-source-disclosure").first();
      await disclosure.locator(":scope > summary").press("Enter");
      assert.equal(await disclosure.locator(".build-source-preview").isVisible(), false);
      await disclosure.locator(":scope > summary").press("Enter");
      assert.equal(await disclosure.locator(".build-source-preview").isVisible(), true);
      assert.equal(await disclosure.locator(".build-highlight").textContent(), content);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
