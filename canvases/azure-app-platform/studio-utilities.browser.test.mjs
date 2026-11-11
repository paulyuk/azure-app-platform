import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";
import { renderStudioHtml } from "./studio-ui.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Shared header utilities preserve navigation and focus in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/utilities-home", route => route.fulfill({
        contentType: "text/html", body: renderStudioHtml("utilities-home", "fixture", { theme: fixture.state.theme }),
      }));
      await page.route("**/api/sources", route => route.fulfill({ json: { roots: [], apps: [], templates: [] } }));
      await page.context().route("https://github.com/**", route => route.fulfill({
        contentType: "text/html", body: "<h1>Fictional documentation destination</h1>",
      }));
      for (const path of ["/utilities-home", "/app-map"]) {
        for (const width of [380, 920]) {
          for (const theme of ["light", "dark"]) {
            fixture.state.theme = theme;
            await page.setViewportSize({ width, height: 900 });
            await page.goto(fixture.origin + path);
            await page.waitForFunction(() => window.appPlatformReady);
            await page.addStyleTag({ content: "::-webkit-scrollbar{width:16px;height:16px}" });
            const trigger = page.getByRole("button", { name: "More options", exact: true });
            const menu = page.getByRole("menu", { name: "More options", exact: true });
            const docs = menu.getByRole("menuitem", { name: "Docs", exact: true });
            const settings = menu.getByRole("menuitem", { name: "Settings", exact: true });
            assert.equal(await page.locator(".studio-theme-control button:visible").count(), 1);
            assert.equal(await menu.count(), 0, "Docs and Settings are only exposed when the menu opens");
            assert.equal(await trigger.getAttribute("title"), "More options");
            assert.equal(await trigger.locator('svg[data-octicon="kebab-horizontal"]').count(), 1);
            if (path === "/utilities-home") {
              await page.getByRole("button", { name: "App home", exact: true }).focus();
              await page.keyboard.press("Tab");
              assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
            }
            await trigger.focus();
            await page.keyboard.press("Enter");
            await docs.waitFor();
            assert.deepEqual(await menu.getByRole("menuitem").allTextContents(), ["Docs", "Settings"]);
            await page.waitForFunction(() => document.activeElement?.textContent === "Docs");
            const box = await menu.boundingBox();
            assert.ok(box.x >= 0 && box.x + box.width <= width, "The end-aligned menu stays inside the canvas");
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            await page.keyboard.press("ArrowDown");
            assert.equal(await settings.evaluate(node => node === document.activeElement), true);
            await page.keyboard.press("Enter");
            const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
            await dialog.waitFor();
            assert.equal(await menu.count(), 0, "Opening Settings dismisses the overflow");
            assert.equal(await dialog.getByRole("combobox", { name: "Appearance", exact: true }).inputValue(), theme);
            assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
            await page.keyboard.press("Escape");
            await dialog.waitFor({ state: "hidden" });
            await page.waitForFunction(() => document.activeElement?.matches("[data-studio-utilities-toggle]"));
            await page.keyboard.press("Enter");
            await docs.waitFor();
            await page.keyboard.press("Escape");
            await menu.waitFor({ state: "hidden" });
            assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
            await trigger.click();
            await docs.waitFor();
            await page.mouse.click(12, 880);
            await menu.waitFor({ state: "hidden" });
            await page.locator(path === "/app-map" ? "#app-title" : ".simple-home-introduction h1")
              .evaluate(node => { node.tabIndex = -1; node.focus(); });
            await trigger.click();
            await settings.click();
            await dialog.waitFor();
            await dialog.getByRole("button", { name: "Close settings", exact: true }).click();
            await dialog.waitFor({ state: "hidden" });
            await page.waitForFunction(() => document.activeElement?.matches("[data-studio-utilities-toggle]"));
            await trigger.click();
            await docs.waitFor();
            const popupReady = page.waitForEvent("popup");
            await docs.focus();
            await page.keyboard.press("Enter");
            const popup = await popupReady;
            await popup.getByRole("heading", { name: "Fictional documentation destination" }).waitFor();
            assert.equal(popup.url(), "https://github.com/coreai-microsoft/azure-app-platform/tree/main/canvases/azure-app-platform#readme");
            assert.equal(await popup.evaluate(() => window.opener), null);
            await popup.close();
            await menu.waitFor({ state: "hidden" });
            assert.equal(await page.getByRole("dialog", { name: "Settings", exact: true }).isVisible(), false);
            await trigger.click();
            await settings.click();
            await dialog.waitFor();
            assert.equal(await page.evaluate(async selector => {
              const dialog = document.querySelector(".studio-settings");
              const closed = new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
              window.appPlatformSettings.close();
              const target = document.querySelector(selector);
              target.tabIndex = -1;
              target.focus();
              await closed;
              return document.activeElement === target;
            }, path === "/app-map" ? "#app-title" : ".simple-home-introduction h1"), true,
            "The queued close event must not steal focus after the user moves to another control");
          }
        }
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(fixture.mutations, [], "Inspecting utilities must not modify app configuration or runtime");
      await page.unrouteAll({ behavior: "wait" });
    } finally {
      await browser.close();
      await fixture.close();
    }
  });
}
