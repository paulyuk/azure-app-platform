import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";
import { selectWorkspace } from "./workspace-navigation-test-helpers.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Command panel docks and resizes without covering the workspace in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture({ preview: true });
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      for (const theme of ["light", "dark"]) {
        fixture.state.theme = theme;
        await page.goto(fixture.origin + "/app-map");
        await page.waitForFunction(() => window.appPlatformReady);
        await page.addStyleTag({ content: "::-webkit-scrollbar{width:16px;height:16px}" });
        await page.locator("#run-diagnostics-toggle").click();
        await page.locator("#run-panel-output").waitFor();
        const divider = page.getByRole("separator", { name: "Resize Diagnostics", exact: true });
        for (const width of [1440, 1100, 1099, 620, 380, 320]) {
          await page.setViewportSize({ width, height: 900 });
          const side = width >= 1100;
          await page.waitForFunction(side =>
            document.querySelector(".run-diagnostics-resizer").getAttribute("aria-orientation") === (side ? "vertical" : "horizontal"), side);
          const main = await page.locator("#app-workspace-main").boundingBox();
          const panel = await page.locator("#workspace-diagnostics").boundingBox();
          assert.ok(main.width > 0 && main.height > 100);
          assert.ok(panel.width > 0 && panel.height > 100);
          if (side) {
            assert.ok(panel.x >= main.x + main.width - 1);
            assert.ok(Math.abs(panel.y - main.y) < 1);
            assert.ok(Math.abs(panel.height - main.height) < 1);
          } else {
            assert.ok(panel.y >= main.y + main.height - 1);
            assert.ok(Math.abs(panel.width - main.width) < 1);
          }
          assert.ok(panel.x + panel.width <= width + 1 && panel.y + panel.height <= 901);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          const tabs = page.getByRole("tablist", { name: "Run details", exact: true });
          assert.deepEqual(await tabs.getByRole("tab").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label"))),
            ["Output", "Services", "Environment", "Operations"]);
          assert.ok((await tabs.boundingBox()).height <= 38);
          assert.equal(await tabs.locator(".run-tab-summary:visible, .studio-tab-icon:visible").count(), 0);
          assert.equal(await tabs.evaluate(node => {
            const selected = getComputedStyle(node.querySelector('[aria-selected="true"]'));
            const other = getComputedStyle(node.querySelector('[aria-selected="false"]'));
            return selected.borderBottomColor !== other.borderBottomColor;
          }), true, "The compact tabs still identify the active panel");
          const size = Number(await divider.getAttribute("aria-valuenow"));
          await divider.focus();
          await divider.press(side ? "ArrowLeft" : "ArrowUp");
          assert.equal(Number(await divider.getAttribute("aria-valuenow")), size + 24);
          await divider.press(side ? "ArrowRight" : "ArrowDown");
          assert.equal(Number(await divider.getAttribute("aria-valuenow")), size);
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await divider.waitFor();
        const handle = await divider.boundingBox();
        const initial = Number(await divider.getAttribute("aria-valuenow"));
        await page.mouse.move(handle.x + 4, handle.y + handle.height / 2);
        await page.mouse.down();
        await page.mouse.move(handle.x - 44, handle.y + handle.height / 2);
        await page.mouse.up();
        assert.equal(Number(await divider.getAttribute("aria-valuenow")), initial + 48);
        await page.setViewportSize({ width: 620, height: 900 });
        await page.waitForFunction(() => document.querySelector(".run-diagnostics-resizer").getAttribute("aria-orientation") === "horizontal");
        const bottomHandle = await divider.boundingBox();
        const bottomSize = Number(await divider.getAttribute("aria-valuenow"));
        await page.mouse.move(bottomHandle.x + bottomHandle.width / 2, bottomHandle.y + 4);
        await page.mouse.down();
        await page.mouse.move(bottomHandle.x + bottomHandle.width / 2, bottomHandle.y - 44);
        await page.mouse.up();
        assert.equal(Number(await divider.getAttribute("aria-valuenow")), bottomSize + 48);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForFunction(() => document.querySelector(".run-diagnostics-resizer").getAttribute("aria-orientation") === "vertical");
        assert.equal(Number(await divider.getAttribute("aria-valuenow")), initial + 48, "The side width survives a bottom-dock resize");
        for (const destination of ["build-workspace", "connect-workspace", "map-app", "deploy-workspace", "manage-app"]) {
          await selectWorkspace(page, destination);
          assert.equal(await page.locator("#workspace-diagnostics").getAttribute("data-diagnostics"), "open");
          const main = await page.locator("#app-workspace-main").boundingBox();
          const panel = await page.locator("#workspace-diagnostics").boundingBox();
          assert.ok(panel.x >= main.x + main.width - 1);
        }
        await divider.focus();
        await divider.press("Escape");
        assert.equal(await page.locator("#run-diagnostics-toggle").getAttribute("aria-expanded"), "false");
        assert.equal(await page.locator("#run-diagnostics-toggle").evaluate(node => node === document.activeElement), true);
        assert.ok((await page.locator("#app-workspace-main").boundingBox()).width >= 1439);
        fixture.state.outputError = true;
        await page.locator("#run-diagnostics-toggle").click();
        await page.locator("#run-tab-output .run-tab-summary[data-attention='true']").waitFor();
        fixture.state.outputError = false;
        await page.waitForFunction(() => document.querySelector("#run-tab-output .run-tab-summary").dataset.attention === "false");
        await page.locator("#run-diagnostics-toggle").click();
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(fixture.mutations, []);
    } finally {
      await browser.close();
      await fixture.close();
    }
  });
}
