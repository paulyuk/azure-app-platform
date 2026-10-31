import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { OCTICONS } from "./studio-icons.mjs";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";
import { selectWorkspace } from "./workspace-navigation-test-helpers.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let engines = {};
try { engines = requireWeb("playwright"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const name of ["chromium", "webkit"]) {
  const engine = engines[name];
  test(`official Studio icons remain visible, accessible and contained in ${name}`, {
    skip: !engine || !existsSync(engine.executablePath()) ? "Install src/web dependencies and Playwright browsers." : false,
  }, async () => {
    const fixture = await createRunSettingsFixture();
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(fixture.origin + "/app-map");
      await page.locator('.build-help-button svg[data-octicon="info"]').waitFor();
      await selectWorkspace(page, "map-app");
      await page.locator(".node-visual > svg").first().waitFor();
      await page.addStyleTag({ content: "::-webkit-scrollbar { width:16px; height:16px; }" });
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => { document.documentElement.dataset.studioTheme = value; }, theme);
        for (const width of [1440, 620, 380]) {
          await page.setViewportSize({ width, height: 900 });
          const glyphs = await page.locator("svg[data-octicon]").evaluateAll((icons) => icons
            .filter((icon) => icon.getBoundingClientRect().width > 0)
            .map((icon) => ({
              name: icon.dataset.octicon,
              path: icon.innerHTML,
              hidden: icon.getAttribute("aria-hidden"),
              focusable: icon.getAttribute("focusable"),
              fill: getComputedStyle(icon).fill,
              stroke: getComputedStyle(icon).stroke,
              width: icon.getBoundingClientRect().width,
              height: icon.getBoundingClientRect().height,
            })));
          assert.ok(glyphs.length >= 15, `${name} ${theme} ${width}px must exercise real controls and map glyphs`);
          for (const icon of glyphs) {
            assert.equal(icon.path, OCTICONS[icon.name].path);
            assert.equal(icon.hidden, "true");
            assert.equal(icon.focusable, "false");
            assert.notEqual(icon.fill, "none");
            assert.equal(icon.stroke, "none");
            assert.ok(icon.width > 0 && icon.height > 0);
          }
          const overflow = await page.locator(".flow-add, .flow-connect").evaluateAll((controls) => controls.map((control) => {
            const bounds = control.querySelector("rect").getBBox();
            return [...control.querySelectorAll("text, svg")].every((item) => {
              const box = item.getBBox();
              const x = item.tagName === "svg" ? Number(item.getAttribute("x")) : box.x;
              const right = item.tagName === "svg" ? x + Number(item.getAttribute("width")) : box.x + box.width;
              return x >= bounds.x && right <= bounds.x + bounds.width;
            });
          }));
          assert.ok(overflow.every(Boolean), "Map action icons/text must fit their controls");
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          if (width === 620 && process.env.UNITY_ICON_SCREENSHOT_DIR) {
            await page.screenshot({ path: join(process.env.UNITY_ICON_SCREENSHOT_DIR, `unity-octicons-${name}-${theme}.png`) });
          }
        }
      }
      const toggle = page.getByRole("button", { name: /(?:Expand|Collapse) Guide/, exact: true });
      if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
      assert.equal(await toggle.locator("svg").getAttribute("data-octicon"), "sidebar-collapse");
      await toggle.click();
      assert.equal(await toggle.locator("svg").getAttribute("data-octicon"), "sidebar-expand");
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      const close = page.getByRole("button", { name: "Close settings", exact: true });
      assert.equal(await close.locator("svg").getAttribute("data-octicon"), "x");
      await close.press("Enter");
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await fixture.close();
    }
  });
}
