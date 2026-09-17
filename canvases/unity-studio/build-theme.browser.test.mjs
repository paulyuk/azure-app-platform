import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_REVIEW_SCRIPT } from "./build-review-editor.mjs";
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

test("Build explorer and editable review follow Studio themes inside an oppositely themed host", {
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
      ${BUILD_REVIEW_SCRIPT}
      const panel = (${createBuildPanel.toString()})({
        container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
        createReviewEditor: createBuildReview,
        onRun() {}, onModel() {}, onStructure() {},
        request: async (path) => path === "/api/build-diff" ? ({
          baseSha: "base", additions: 1, deletions: 1, hunks: [{
            oldStart: 1, oldCount: 2, newStart: 1, newCount: 2, lines: [
              { kind: "context", oldLine: 1, newLine: 1, text: "def main():" },
              { kind: "removed", oldLine: 2, newLine: null, text: '    return "hello"' },
              { kind: "added", oldLine: null, newLine: 2, text: '    return "changed changed changed changed changed changed changed changed changed changed changed changed"' }
            ]
          }]
        }) : ({ artifacts: [
          { id: "agent", title: "Agent instructions", path: "src/agent/main.py", available: true, sha: "base", content: 'def main():\\n    return "hello"' },
          { id: "prompt", title: "Prompt", path: "src/agent/prompts/system.md", available: true, sha: "base", content: "# Instructions" },
          { id: "missing", title: "Configuration", path: "config/app.json", available: false, detail: "File is missing." }
        ] })
      });
      panel.show();
    </script></html>`);
    await page.locator(".build-source-editor textarea").fill(
      'def main():\n    return "changed changed changed changed changed changed changed changed changed changed changed changed"');
    await page.getByRole("button", { name: "Review changes" }).click();
    const review = page.getByRole("region", { name: "Unified source changes" });
    await review.waitFor();
    assert.equal(await review.locator('.cm-content[contenteditable="true"][aria-label="Agent instructions draft review"]').count(), 1);
    assert.equal(await review.locator(".cm-changedLine").count(), 1);
    assert.equal(await review.locator(".cm-deletedChunk .cm-deletedLine").count(), 1);
    assert.ok(await review.locator(".cm-changedText").count() > 0);
    assert.ok(await review.locator(".cm-deletedText").count() > 0);
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
        values.push({ label: element.className, color: getComputedStyle(element).color, background });
        if (element.matches("input")) {
          const placeholder = getComputedStyle(element, "::placeholder");
          values.push({ label: "Filter placeholder", color: placeholder.color, background, opacity: placeholder.opacity });
        }
      }
      return values;
    });
    const assertContrast = async (locator, context) => {
      const colors = await collectContrast(locator);
      assert.ok(colors.length >= 4, `${context} exposes contrast samples`);
      for (const { label, color, background, opacity } of colors) {
        if (opacity !== undefined) assert.equal(opacity, "1");
        const values = [luminance(color), luminance(background)].sort((a, b) => b - a);
        const ratio = (values[0] + 0.05) / (values[1] + 0.05);
        assert.ok(ratio >= 4.5, `${context} ${label}: ${ratio.toFixed(2)}:1 (${color} on ${background})`);
      }
    };
    for (const width of [1000, 420]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForFunction((compact) => document.querySelector(".build-workspace")?.dataset.compact === String(compact), width < 600);
      const explorer = page.getByRole("navigation", { name: "Discovered files" });
      const toggle = page.locator("[data-build-files-toggle]");
      if (!await explorer.isVisible()) await toggle.click();
      let lightReviewBackgrounds;
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
        await assertContrast(explorer.locator(
          "h3, .build-file-count, .build-folder > summary, .build-file-button, .build-file-status, .build-files-toggle, .build-filter input"),
        `${theme} file tree at ${width}px`);

        if (width < 600) {
          await toggle.click();
          await review.locator(".cm-changedLine").first().waitFor({ state: "visible" });
          await review.locator(".cm-deletedChunk").first().waitFor({ state: "visible" });
        }
        const launch = page.locator(".code-edit");
        const picker = page.locator(".build-editor-picker");
        if (await launch.isVisible()) {
          await page.mouse.move(0, 0);
          const normal = await launch.evaluate((element) => getComputedStyle(element).backgroundColor);
          await launch.hover();
          const hovered = await launch.evaluate((element) => getComputedStyle(element).backgroundColor);
          assert.notEqual(hovered, normal);
          await picker.hover();
          assert.equal(await picker.evaluate((element) => getComputedStyle(element).backgroundColor), hovered);
        }
        const reviewBackgrounds = await review.locator(".cm-deletedChunk, .cm-changedLine").evaluateAll(
          (elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
        assert.notEqual(reviewBackgrounds[0], reviewBackgrounds[1]);
        if (theme === "light" && !lightReviewBackgrounds) lightReviewBackgrounds = reviewBackgrounds;
        else if (theme === "dark") assert.notDeepEqual(reviewBackgrounds, lightReviewBackgrounds);
        else assert.deepEqual(reviewBackgrounds, lightReviewBackgrounds);
        const characterBackgrounds = [
          await review.locator(".cm-deletedText").first().evaluate((element) => getComputedStyle(element).backgroundColor),
          await review.locator(".cm-changedText").first().evaluate((element) => getComputedStyle(element).backgroundColor),
        ];
        assert.notEqual(characterBackgrounds[0], characterBackgrounds[1]);
        await assertContrast(page.locator(
          ".build-editor-picker, .code-edit, .cm-content .cm-line, .cm-deletedChunk .cm-deletedLine, " +
          ".cm-changedText, .cm-deletedText, .build-review-original-gutter .cm-gutterElement, " +
          ".cm-lineNumbers .cm-gutterElement, .build-review-change-gutter .cm-gutterElement, .build-review-summary span"),
        `${theme} editable review at ${width}px`);

        if (width < 600) {
          await toggle.click();
          await explorer.waitFor({ state: "visible" });
        }
        await toggle.click();
        assert.equal(await page.locator(".build-explorer-reopen").evaluate((element) => getComputedStyle(element).backgroundColor),
          theme === "light" ? "rgb(240, 243, 248)" : "rgb(32, 35, 43)", `${theme} collapsed files rail at ${width}px`);
        assert.equal(await toggle.locator('[data-icon="file"]').count(), 1);
        await toggle.click();
      }
      if (width === 420) {
        await toggle.click();
        await review.locator(".cm-changedLine").first().waitFor({ state: "visible" });
        const scroller = review.locator(".cm-scroller");
        assert.ok(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth));
        assert.ok(await page.locator("#details").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
        assert.ok(await page.locator(".build-editor").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
        await toggle.click();
        await explorer.waitFor({ state: "visible" });
      }
    }
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.waitForFunction(() => document.querySelector(".build-workspace")?.dataset.compact === "false");
    await page.emulateMedia({ forcedColors: "active" });
    const splitter = page.getByRole("separator", { name: "Resize discovered files" });
    assert.equal(await splitter.isVisible(), true);
    assert.notEqual(await splitter.evaluate((element) => getComputedStyle(element, "::before").backgroundColor), "rgba(0, 0, 0, 0)");
    assert.equal(await page.getByRole("combobox", { name: "Supported editor" }).isVisible(), true);
    await page.getByRole("combobox", { name: "Supported editor" }).focus();
    assert.equal(await page.locator(".build-editor-picker").evaluate((element) => getComputedStyle(element).outlineStyle), "solid");
    const forcedMarkers = await review.locator(".build-review-change-gutter .cm-gutterElement").evaluateAll((elements) =>
      elements.filter((element) => element.getBoundingClientRect().height > 0
        && ["+", "-"].includes(element.textContent.trim())).map((element) => ({
        marker: element.textContent.trim(),
        color: getComputedStyle(element).color,
        visibility: getComputedStyle(element).visibility,
      })));
    assert.deepEqual(new Set(forcedMarkers.map(({ marker }) => marker)), new Set(["+", "-"]));
    for (const marker of forcedMarkers) {
      assert.notEqual(marker.color, "rgba(0, 0, 0, 0)");
      assert.equal(marker.visibility, "visible");
    }
    await page.emulateMedia({ forcedColors: "none" });
  } finally {
    await browser.close();
  }
});
