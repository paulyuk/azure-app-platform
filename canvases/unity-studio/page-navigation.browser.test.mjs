import { installToolkitRoutes } from "./toolkit-test-fixture.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";
import { DEFAULT_EDITOR_SETTINGS } from "./editor-settings.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("Primary pages use grouped navigation distinct from runtime actions across themes and widths", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [], mutations = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const graph = {
      root: "/fixture", nodes: [], edges: [], unresolved: [], diagnostics: [],
      summary: { projectNodes: 0, operationNodes: 0, edges: 0, unresolved: 0 },
    };
    await page.route("http://page-navigation.test/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") mutations.push(path);
      if (path === "/") return route.fulfill({
        contentType: "text/html", body: renderInteractiveAppMapHtml(graph, { apiToken: "fixture", theme: "light" }),
      });
      const responses = {
        "/api/build-workspace": { artifacts: [] },
        "/api/app-status": { state: "stopped", recovered: false, foreignEntrypoints: [], entrypoints: [] },
        "/api/local-readiness": { ready: false, gatewayConfigured: false },
        "/api/app-output": { lines: [], commands: [] },
        "/api/editor-settings": DEFAULT_EDITOR_SETTINGS,
      };
      if (responses[path]) return route.fulfill({ json: responses[path] });
      if (path.startsWith("/assets/")) return route.fulfill({ status: 204 });
      throw new Error("Unexpected page-navigation request: " + path);
    });
    await installToolkitRoutes(page);

    await page.goto("http://page-navigation.test/");
    const navigation = page.getByRole("group", { name: "App workspaces", exact: true });
    await navigation.waitFor();
    assert.equal(await navigation.locator("button").count(), 3);
    for (const width of [1120, 800, 620, 380]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => { document.documentElement.dataset.studioTheme = value; }, theme);
        for (const [label, id] of [["Build", "build-app"], ["Run & Debug", "manage-app"], ["Observe", "map-app"]]) {
          const button = navigation.getByRole("button", { name: label, exact: true });
          await button.click();
          await page.mouse.move(0, 899);
          assert.equal(await button.getAttribute("aria-pressed"), "true");
          assert.equal(await navigation.locator('[aria-pressed="true"]').count(), 1);
          assert.equal(await page.locator("#workspace-shell").getAttribute("aria-labelledby"), id);
          const styles = await navigation.locator("button").evaluateAll((buttons) => buttons.map((element) => {
            const style = getComputedStyle(element), bounds = element.getBoundingClientRect();
            return {
              selected: element.getAttribute("aria-pressed") === "true",
              borderTop: style.borderTopWidth, borderLeft: style.borderLeftWidth, borderRight: style.borderRightWidth,
              radius: style.borderTopLeftRadius, background: style.backgroundColor,
              border: style.borderBottomColor,
              visible: bounds.left >= 0 && bounds.right <= innerWidth && bounds.height >= 32,
            };
          }));
          for (const style of styles) {
            assert.equal(style.borderTop, "1px");
            assert.equal(style.borderLeft, "1px");
            assert.equal(style.borderRight, "1px");
            assert.equal(style.radius, "6px");
            assert.equal(style.background === "rgba(0, 0, 0, 0)", !style.selected);
            assert.equal(style.visible, true);
            assert.equal(style.border === "rgba(0, 0, 0, 0)", !style.selected);
          }
        }
        const layout = await page.evaluate(() => {
          const navigation = document.querySelector(".header-actions"), action = document.querySelector("#header-runtime-action");
          const navBounds = navigation.getBoundingClientRect(), actionBounds = action.getBoundingClientRect();
          return {
            separate: !navigation.contains(action),
            actionBorder: parseFloat(getComputedStyle(action).borderTopWidth),
            actionRadius: parseFloat(getComputedStyle(action).borderTopLeftRadius),
            belowAction: navBounds.top >= actionBounds.bottom,
            framed: ["Top", "Right", "Bottom", "Left"].every((side) =>
              getComputedStyle(navigation)["border" + side + "Width"] === "1px"),
            rounded: parseFloat(getComputedStyle(navigation).borderTopLeftRadius) >= 6,
            background: getComputedStyle(navigation).backgroundColor,
            headerFits: document.querySelector("header").scrollWidth <= innerWidth,
          };
        });
        assert.equal(layout.separate, true);
        assert.ok(layout.actionBorder >= 1 && layout.actionRadius > 0);
        assert.equal(layout.headerFits, true);
        assert.ok(layout.framed && layout.rounded);
        assert.notEqual(layout.background, "rgba(0, 0, 0, 0)");
        if (width <= 960) assert.equal(layout.belowAction, true);
      }
    }
    await navigation.getByRole("button", { name: "Build", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await navigation.getByRole("button", { name: "Run & Debug", exact: true }).evaluate((element) =>
      element === document.activeElement && getComputedStyle(element).outlineStyle === "solid"), true);
    await page.keyboard.press("Enter");
    assert.equal(await navigation.getByRole("button", { name: "Run & Debug", exact: true }).getAttribute("aria-pressed"), "true");
    assert.deepEqual(errors, []);
    assert.deepEqual(mutations, []);
  } finally {
    await browser.close();
  }
});
