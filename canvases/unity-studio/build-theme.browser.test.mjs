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
  const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map((value) => {
    const channel = Number(value) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("Build explorer follows the Studio theme and preserves text contrast inside an oppositely themed host", {
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
        onRun() {}, onModel() {}, onStructure() {},
        request: async () => ({ artifacts: [
          { id: "agent", title: "Agent instructions", path: "src/agent/main.py", available: true, sha: "base", content: 'def main():\\n    return "hello"' },
          { id: "prompt", title: "Prompt", path: "src/agent/prompts/system.md", available: true, sha: "base", content: "# Instructions" },
          { id: "missing", title: "Configuration", path: "config/app.json", available: false, detail: "File is missing." }
        ] })
      });
      panel.show();
    </script></html>`);
    await page.locator(".build-source-editor textarea").fill('# comment\ndef main():\n    return "changed"');
    for (const width of [1000, 420]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForFunction((compact) => document.querySelector(".build-workspace")?.dataset.compact === String(compact), width < 600);
      const explorer = page.getByRole("navigation", { name: "Discovered files" });
      if (!await explorer.isVisible()) await page.locator("[data-build-files-toggle]").click();
      for (const theme of ["light", "dark", "light"]) {
        await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light" });
        await page.evaluate((value) => {
          document.documentElement.dataset.studioTheme = value;
          for (const element of [document.documentElement, document.body]) {
            element.style.setProperty("--background-color-muted", value === "light" ? "#161d23" : "#ffffff");
          }
        }, theme);
        assert.equal(await explorer.evaluate((el) => getComputedStyle(el).backgroundColor),
          theme === "light" ? "rgb(240, 243, 248)" : "rgb(32, 35, 43)", `${theme} explorer at ${width}px`);
        const colors = await page.locator(".build-explorer h3, .build-file-count, .build-folder > summary, .build-file-button, .build-file-status, .build-filter input, .build-highlight .token").evaluateAll((elements) => {
          const values = [];
          for (const element of elements) {
            if (!element.getClientRects().length) continue;
            let parent = element;
            let background = "rgba(0, 0, 0, 0)";
            while (parent && background === "rgba(0, 0, 0, 0)") {
              background = getComputedStyle(parent).backgroundColor;
              parent = parent.parentElement;
            }
            values.push({ label: element.className, color: getComputedStyle(element).color, background });
            if (element.matches("input")) {
              const placeholder = getComputedStyle(element, "::placeholder");
              values.push({ label: "Filter placeholder", color: placeholder.color, background, opacity: placeholder.opacity });
            }
          }
          return values;
        });
        assert.ok(colors.length >= 8);
        for (const { label, color, background, opacity } of colors) {
          if (opacity !== undefined) assert.equal(opacity, "1");
          const values = [luminance(color), luminance(background)].sort((a, b) => b - a);
          const ratio = (values[0] + 0.05) / (values[1] + 0.05);
          assert.ok(ratio >= 4.5, `${theme} ${label} at ${width}px: ${ratio.toFixed(2)}:1 (${color} on ${background})`);
        }
      }
    }
  } finally {
    await browser.close();
  }
});
