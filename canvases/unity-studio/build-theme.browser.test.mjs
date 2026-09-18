import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";
import { renderThemeStyles } from "./studio-theme.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

function luminance(color) {
  const unitChannels = color.startsWith("color(");
  const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map((value) => {
    const channel = Number(value) / (unitChannels ? 1 : 255);
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("Build navigation and read-only preview remain legible in light, dark, compact and forced-color layouts", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.setContent(`<!doctype html><html data-studio-theme="light"><style>
      ${renderThemeStyles()} ${BUILD_PANEL_CSS}
      body { margin:0; background:var(--bg); color:var(--text); }
      #details { height:100vh; }
    </style><div id="details" data-mode="build"></div><script>
      ${BUILD_SYNTAX_SCRIPT}
      const panel = (${createBuildPanel.toString()})({
        container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
        onRun() {}, onModel() {},
        request: async () => ({ artifacts: [
          { id: "agent", customizationArea: "behavior", title: "Agent instructions", path: "src/agent/main.py", available: true, sha: "base", content: 'def main():\\n    return "hello"\\n' },
          { id: "prompt", customizationArea: "behavior", title: "Prompt", path: "src/agent/prompts/system.md", available: true, sha: "base", content: "# Instructions" },
          { id: "runtime", customizationArea: "runtime", title: "Runtime", path: "config/runtime.json", available: true, sha: "base", content: '{"agentRuntime":"local"}' },
          { id: "policy", customizationArea: "policies", title: "Policy", path: "config/policy.json", available: true, sha: "base", content: '{"maxBytes":4096}' }
        ], editorSettings: { editorId: "vscode", editors: [{ id: "vscode", label: "VS Code" }] } })
      });
      panel.show();
    </script></html>`);
    const preview = page.getByRole("region", { name: "Agent instructions source preview", exact: true });
    const explorer = page.getByRole("navigation", { name: "Key files" });
    await preview.waitFor();
    const collectContrast = (locator) => locator.evaluateAll((elements) => {
      const values = [];
      for (const element of elements) {
        if (!element.getClientRects().length) continue;
        let parent = element;
        let background = "rgba(0, 0, 0, 0)";
        while (parent && background === "rgba(0, 0, 0, 0)") {
          background = getComputedStyle(parent).backgroundColor;
          parent = parent.parentElement;
        }
        values.push({ label: element.className || element.tagName, color: getComputedStyle(element).color, background });
      }
      return values;
    });
    const assertContrast = async (locator, context) => {
      const colors = await collectContrast(locator);
      assert.ok(colors.length >= 4, `${context} exposes contrast samples`);
      for (const { label, color, background } of colors) {
        const values = [luminance(color), luminance(background)].sort((a, b) => b - a);
        const ratio = (values[0] + 0.05) / (values[1] + 0.05);
        assert.ok(ratio >= 4.5, `${context} ${label}: ${ratio.toFixed(2)}:1 (${color} on ${background})`);
      }
    };

    for (const width of [1000, 420]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForFunction((compact) =>
        document.querySelector(".build-workspace")?.dataset.compact === String(compact), width < 600);
      const toggle = page.locator("[data-build-files-toggle]");
      if (!await explorer.isVisible()) await toggle.click();
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => { document.documentElement.dataset.studioTheme = value; }, theme);
        assert.equal(await explorer.evaluate((element) => getComputedStyle(element).backgroundColor),
          theme === "light" ? "rgb(240, 243, 248)" : "rgb(32, 35, 43)");
        await assertContrast(explorer.locator(
          "h3, summary, .build-file-button, .build-file-name, .build-file-location, .build-files-toggle"),
        `${theme} navigation at ${width}px`);
        if (width < 600) await toggle.click();
        await assertContrast(page.locator(
          ".build-file h3, .build-file code, .build-language, .build-line-numbers, .build-highlight, " +
          "[data-editor-launch-primary], [data-editor-launch], .build-editor-picker"),
        `${theme} preview at ${width}px`);
        assert.ok(await page.locator("#details").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
        assert.ok(await page.locator(".build-editor").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
        assert.equal(await page.locator("textarea,[contenteditable=true]").count(), 0);
        if (width < 600) await toggle.click();
      }
      await toggle.click();
      assert.equal(Math.round((await page.locator(".build-explorer-reopen").boundingBox()).width), 40);
      assert.equal(await toggle.locator('[data-icon="customize"]').count(), 1);
      await toggle.click();
    }

    await page.setViewportSize({ width: 1000, height: 800 });
    await page.waitForFunction(() => document.querySelector(".build-workspace")?.dataset.compact === "false");
    await page.emulateMedia({ forcedColors: "active" });
    const splitter = page.getByRole("separator", { name: "Resize key files" });
    assert.equal(await splitter.isVisible(), true);
    assert.notEqual(await splitter.evaluate((element) =>
      getComputedStyle(element, "::before").backgroundColor), "rgba(0, 0, 0, 0)");
    assert.equal(await preview.isVisible(), true);
    assert.notEqual(await preview.locator(".build-highlight").evaluate((element) =>
      getComputedStyle(element).color), "rgba(0, 0, 0, 0)");
    await preview.focus();
    assert.equal(await preview.evaluate((element) => element === document.activeElement), true);
    const launch = page.locator("[data-editor-launch]");
    await launch.focus();
    assert.equal(await launch.evaluate((element) => element === document.activeElement), true);
    await page.emulateMedia({ forcedColors: "none" });
  } finally {
    await browser.close();
  }
});
