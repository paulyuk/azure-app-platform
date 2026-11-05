import { installToolkitRoutes, withToolkitButtons } from "./toolkit-test-fixture.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { renderOcticon, VSCODE_ICON_MARKUP } from "./studio-icons.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";
import { renderThemeStyles } from "./studio-theme.mjs";
import { getStudioPresentation, renderPresentationStyles } from "./studio-presentation.mjs";

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

for (const presentationProfile of ["standalone", "github-app"]) {
test(`Build guide and lighter code remain legible in light, dark, compact and forced-color layouts (${presentationProfile})`, {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await installToolkitRoutes(page);
    const presentation = getStudioPresentation(presentationProfile);
    await page.setContent(withToolkitButtons(`<!doctype html><html class="${presentation.className}" data-studio-theme="light">
      ${presentation.stylesheet ? `<link rel="stylesheet" href="http://toolkit-fixture.test${presentation.stylesheet}">` : ""}
      <style>
      ${renderThemeStyles(presentationProfile)} ${renderPresentationStyles(presentationProfile)} ${BUILD_PANEL_CSS}
      body { margin:0; background:var(--studio-bg); color:var(--studio-ink); }
      #details { height:100vh; }
    </style><div id="details" data-mode="build"></div><script>
      ${BUILD_SYNTAX_SCRIPT}
      const panel = (${createBuildPanel.toString()})({ buttons: window.appPlatformButtons, helpIcon: ${JSON.stringify(renderOcticon("info"))}, vsCodeIconMarkup: ${JSON.stringify(VSCODE_ICON_MARKUP)},
        container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
        onRun() {}, onModel() {},
        request: async () => ({ artifacts: [
          { id: "agent", customizationArea: "behavior", title: "Agent instructions", path: "src/agent/main.py",
            projectPath: "src/agent", projectName: "Agent", available: true, sha: "base",
            content: 'def main():\\n    return "hello"\\n' },
          { id: "prompt", customizationArea: "behavior", title: "Prompt", path: "src/helper/prompts/system.md",
            projectPath: "src/helper", projectName: "Helper", available: true, sha: "base", content: "# Instructions" },
          { id: "runtime", customizationArea: "runtime", title: "Runtime", path: "config/runtime.json",
            available: true, sha: "base", content: '{"agentRuntime":"local"}' },
          { id: "policy", customizationArea: "policies", title: "Policy", path: "config/policy.json",
            available: true, sha: "base", content: '{"maxBytes":4096}' }
        ], editorSettings: { editorId: "vscode", editors: [{ id: "vscode", label: "VS Code" }] } })
      });
      panel.show();
    </script></html>`));
    const row = page.locator('.build-file[data-artifact="agent"]');
    await row.waitFor();
    const preview = page.getByRole("region", { name: "Agent instructions source preview", exact: true });
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

    for (const width of [1000, 620, 380]) {
      await page.setViewportSize({ width, height: 800 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => { document.documentElement.dataset.studioTheme = value; }, theme);
        await assertContrast(page.locator(
          ".build-area-title, .build-file-heading h4, .build-source-path, " +
          ".build-preview-badge, .build-help-button"),
        `${theme} guide at ${width}px`);
        await assertContrast(page.locator(
          ".build-line-numbers, .build-highlight, .build-highlight .token, [data-file-open] > button"),
        `${theme} preview at ${width}px`);
        const surfaces = await row.evaluate(element => ({
          source: getComputedStyle(element.querySelector(".build-source-preview")).backgroundColor,
          gutter: getComputedStyle(element.querySelector(".build-line-numbers")).backgroundColor,
          header: getComputedStyle(element.querySelector(".build-file-header")).backgroundColor,
        }));
        assert.ok(luminance(surfaces.source) > luminance(surfaces.header),
          `${presentationProfile} ${theme} code is lighter than its file header: ${JSON.stringify(surfaces)}`);
        assert.equal(surfaces.gutter, surfaces.source, "Line numbers share the lighter code background");
        assert.ok(await page.locator("#details").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
        assert.ok(await page.locator(".build-workspace").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
        assert.ok(await row.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
        const sections = await page.locator(".build-file").evaluateAll((elements) => elements.map((element) => {
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          const source = element.querySelector(".build-source-preview");
          const sourceBounds = source.getBoundingClientRect();
          return {
            top: bounds.top, bottom: bounds.bottom,
            borderless: ["Top", "Right", "Bottom", "Left"].every((side) =>
              parseFloat(style["border" + side + "Width"]) === 0),
            padding: parseFloat(style.paddingInlineStart),
            rounded: parseFloat(style.borderTopLeftRadius) > 0,
            distinctSurface: style.backgroundColor !== getComputedStyle(source).backgroundColor,
            containsSource: sourceBounds.left >= bounds.left && sourceBounds.right <= bounds.right &&
              sourceBounds.top > bounds.top && sourceBounds.bottom <= bounds.bottom + 1,
          };
        }));
        assert.equal(sections.length, 1);
        for (const section of sections) {
          assert.ok(section.borderless && !section.rounded, `${theme} file section has no card container at ${width}px`);
          assert.ok(section.padding === 0 && section.containsSource,
            `${theme} file section uses the available preview width at ${width}px`);
        }
        assert.equal(await page.locator("textarea,[contenteditable=true]").count(), 0);
      }
    }

    await page.setViewportSize({ width: 1000, height: 800 });
    await page.emulateMedia({ forcedColors: "active" });
    assert.equal(await page.getByRole("separator", { name: /Resize key files/i }).count(), 0);
    assert.equal(await preview.isVisible(), true);
    assert.equal(await page.locator(".build-preview-badge").isVisible(), true);
    assert.notEqual(await preview.locator(".build-highlight").evaluate((element) =>
      getComputedStyle(element).color), "rgba(0, 0, 0, 0)");
    await preview.focus();
    assert.equal(await preview.evaluate((element) => element === document.activeElement), true);
    const launch = row.locator('[data-editor-launch][data-artifact-id="agent"]');
    await launch.focus();
    assert.equal(await launch.evaluate((element) => element === document.activeElement), true);
    await page.emulateMedia({ forcedColors: "none" });
  } finally {
    await browser.close();
  }
});
}
