import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";
import { installStudioAssetRoutes, openWorkspaceNavigation } from "./workspace-navigation-test-helpers.mjs";
import { BUILD_BLOCK_TEMPLATES } from "./build-blocks.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine, presentationProfile] of [
  ["Chromium", chromium, "standalone"], ["Chromium", chromium, "github-app"],
  ["WebKit", webkit, "standalone"], ["WebKit", webkit, "github-app"],
]) {
  test(`Build preview scrollbars stay inside file containers when resized in ${name} (${presentationProfile})`, {
    skip: !engine || !existsSync(engine.executablePath())
      ? "Install src/web Playwright dependencies and chromium/webkit browsers for scrollbar coverage." : false,
  }, async () => {
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
      const content = [`# ${"x".repeat(84)}`, ...Array.from({ length: 13 }, (_, index) => `line ${index}`)].join("\n");
      const artifacts = ["first", "second"].map((id) => ({
        id, customizationArea: "behavior", title: id, path: `src/agent/${id}.py`,
        projectPath: `src/agent/${id}`, projectName: "Agent", available: true, content,
      })).concat(Array.from({ length: 28 }, (_, index) => ({
        id: "tool-" + index, customizationArea: "tools", title: "Tool " + index,
        path: `src/skills/tool-${index}/function_app.py`, available: true, content,
      })), [
        { id: "reflow-code", customizationArea: "tools", title: "Reflow implementation",
          path: "src/skills/reflow/function_app.py", projectPath: "src/skills/reflow", projectName: "Reflow",
          available: true, content: "# " + "x".repeat(400) },
        { id: "reflow-config", customizationArea: "runtime", title: "Reflow configuration",
          path: "src/skills/reflow/agents.config.yaml", projectPath: "src/skills/reflow", projectName: "Reflow",
          available: true, content: "name: reflow\n" },
        { id: "deal-implementation", customizationArea: "tools", title: "Deal doc implementation",
          path: "src/skills/deal-doc/function_app.py", projectPath: "src/skills/deal-doc", projectName: "Deal doc",
          available: true, content: '"""Multiline\nDeal documentation"""\n# ' + "long_line ".repeat(45) + "\n" +
            Array.from({ length: 100 }, (_, index) => `print("Deal ${index}")`).join("\n") },
        { id: "deal-config", customizationArea: "runtime", title: "Deal doc configuration",
          path: "src/skills/deal-doc/agents.config.yaml", projectPath: "src/skills/deal-doc", projectName: "Deal doc",
          available: true, content: "name: deal-doc\nversion: 1\n" },
      ]);
      const graph = {
        root: "/fixture", nodes: [], edges: [], unresolved: [], diagnostics: [],
        summary: { projectNodes: 0, operationNodes: 0, edges: 0, unresolved: 0 },
      };
      const errors = [];
      const handoffs = [];
      let documentLoads = 0;
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("http://build-layout.test/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/") {
          documentLoads++;
          return route.fulfill({
            contentType: "text/html",
            body: renderInteractiveAppMapHtml(graph, { apiToken: "fixture", theme: "light", presentationProfile })
              .replace("</head>", `<style>
                ::-webkit-scrollbar { width:16px; height:16px; }
                ::-webkit-scrollbar-thumb { background:#888; }
              </style></head>`),
          });
        }
        if (path === "/api/build-block") {
          artifacts.push({ ...artifacts[0], id: "new-block", path: "src/skills/lookup/function_app.py",
            projectPath: "src/skills/lookup", customizationArea: "tools" });
          return route.fulfill({ json: { artifactId: "new-block", projectPath: "src/skills/lookup", paths: ["src/skills/lookup/function_app.py"] } });
        }
        if (path === "/api/open-build-file") {
          handoffs.push(route.request().postDataJSON());
          return route.fulfill({ json: { editorLabel: "VS Code", outcome: "requested" } });
        }
        const responses = {
          "/api/build-workspace": { artifacts },
          "/api/build-templates": { templates: BUILD_BLOCK_TEMPLATES },
          "/api/app-status": { state: "stopped", recovered: false, foreignEntrypoints: [], entrypoints: [] },
          "/api/local-readiness": { ready: false, gatewayConfigured: false },
          "/api/app-output": { lines: [], commands: [] },
          "/api/gateway-options": { subscriptions: [], gateways: [], models: [], active: null },
          "/api/preferences": { theme: "light" },
          "/api/editor-settings": { editorId: "vscode", editors: [{ id: "vscode", label: "VS Code" }] },
        };
        if (responses[path]) return route.fulfill({ json: responses[path] });
        if (path.startsWith("/assets/")) return route.fulfill({ status: 204 });
        throw new Error("Unexpected preview-layout request: " + path);
      });
      await page.addInitScript(() => localStorage.setItem("unity-workspace:/fixture:guide-collapsed", "true"));
      await installStudioAssetRoutes(page);
      await page.goto("http://build-layout.test/");
      await page.locator("#build-workspace").click();
      await page.locator(".build-source-preview").first().waitFor();
      const filesToggle = page.getByRole("button", { name: "Files", exact: true });
      async function chooseFile(id) {
        const artifact = artifacts.find(item => item.id === id);
        const path = artifact.projectPath ?? artifact.path.split("/").slice(0, -1).join("/");
        const choice = page.locator(`[data-collection-path="${path}"]`);
        if (!await choice.isVisible() && await filesToggle.isVisible()) await filesToggle.click();
        await choice.click();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const pages = page.getByRole("toolbar", { name: "File pages", exact: true, includeHidden: true });
        if (await pages.count()) {
          const filename = artifact.path.split("/").pop();
          const inline = pages.getByRole("button", { name: filename, exact: true });
          if (await inline.isVisible()) await inline.click();
          else {
            await page.getByRole("button", { name: "More files", exact: true }).click();
            await page.getByRole("menu", { name: "More files", exact: true })
              .getByRole("menuitem", { name: filename, exact: true }).click();
          }
        }
      }
      const divider = page.getByRole("separator", { name: "File list width", exact: true });
      assert.equal(await divider.getAttribute("aria-orientation"), "vertical");
      assert.equal(await divider.getAttribute("aria-controls"), "build-file-list");
      const railWidth = () => page.locator(".build-explorer").evaluate(element => element.getBoundingClientRect().width);
      await divider.press("Home");
      assert.ok(Math.abs(await railWidth() - 96) <= 1, "Home reaches the minimum file-list width");
      await divider.dispatchEvent("keydown", { key: "ArrowRight", altKey: true });
      assert.ok(Math.abs(await railWidth() - 96) <= 1, "Modified browser shortcuts are not consumed by resizing");
      await divider.press("ArrowRight");
      assert.ok(Math.abs(await railWidth() - 112) <= 1, "Arrow keys resize by 16px");
      await divider.press("Shift+ArrowRight");
      assert.ok(Math.abs(await railWidth() - 152) <= 1, "Shift accelerates keyboard resizing to 40px");
      await divider.press("ArrowLeft");
      assert.ok(Math.abs(await railWidth() - 136) <= 1);
      await divider.press("End");
      assert.ok(Math.abs(await railWidth() - 420) <= 1, "End reaches the bounded maximum width");
      assert.equal(await page.locator('.build-actions[aria-label="File actions"]').evaluate(element =>
        getComputedStyle(element).flexDirection), "row",
      "File actions stay in a compact horizontal toolbar inside a narrow source pane");
      await page.locator(".build-source-preview").evaluate(element => {
        window.retainedBuildPreview = element;
        element.scrollLeft = 32;
      });
      const handle = await divider.boundingBox();
      const dragX = handle.x + handle.width / 2, dragY = handle.y + 100;
      await page.mouse.move(dragX, dragY);
      await page.mouse.down();
      await page.mouse.move(dragX - 140, dragY, { steps: 5 });
      await page.mouse.up();
      assert.ok(Math.abs(await railWidth() - 280) <= 1, "Dragging the divider changes the file-list width");
      assert.equal(await divider.getAttribute("data-dragging"), null, "Pointer release ends the resize");
      assert.ok(await page.locator(".build-source-preview").evaluate(element =>
        element === window.retainedBuildPreview && element.scrollLeft === 32),
      "Resizing preserves the source node and its scroll position");
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => { document.documentElement.dataset.studioTheme = value; }, theme);
        for (const width of [1000, 320, 380, 480, 620, 1000, 380]) {
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const compact = await filesToggle.isVisible();
          await page.locator(".build-source-preview").scrollIntoViewIfNeeded();
          const geometry = await page.locator(".build-file").evaluateAll((files) => files.map((file) => {
            const preview = file.querySelector(".build-source-preview");
            const disclosure = file.querySelector(".build-file-source");
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
          assert.equal(geometry.length, 1);
          for (const item of geometry) {
            assert.ok(item.bottomInset >= item.expectedInset - 0.5,
              `${name} ${theme} ${width}px must preserve bottom padding: ${JSON.stringify(item)}`);
            assert.ok(item.disclosureOverflow <= 0.5 && item.contained);
            if (width === 380) {
              assert.ok(item.horizontalScrollbar >= 12, "Exercise classic scrollbars, not an overlay-only proxy: " + JSON.stringify(item));
              assert.equal(item.horizontalOverflow, true);
            }
          }
          assert.ok(await page.locator("#customize-content").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
          const readonly = page.locator(".build-preview-badge");
          assert.equal(await readonly.textContent(), "Preview");
          assert.equal(await readonly.isVisible(), true);
          const cues = await page.locator(".build-content").evaluate(pane => {
            const bounds = pane.getBoundingClientRect();
            const header = pane.querySelector(".build-file-header");
            const badge = pane.querySelector(".build-preview-badge");
            const style = getComputedStyle(pane);
            const available = pane.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            const badgeBounds = badge.getBoundingClientRect();
            return {
              available,
              badgeContained: badgeBounds.left >= bounds.left && badgeBounds.right <= bounds.right &&
                badgeBounds.top >= header.getBoundingClientRect().top &&
                badgeBounds.bottom <= header.getBoundingClientRect().bottom + 1,
              redundantHeaders: pane.querySelectorAll(".build-preview-help,.build-preview-title,.build-preview-toolbar").length,
              direction: getComputedStyle(pane.querySelector('.build-actions[aria-label="File actions"]')).flexDirection,
              iconOnlyEditor: pane.querySelector("[data-file-open] button")?.textContent.trim() === "" &&
                pane.querySelector("[data-file-open] button")?.getAttribute("data-appearance") === "secondary",
              secondaryVisible: [...pane.querySelectorAll("[data-file-secondary]")].some(control => getComputedStyle(control).display !== "none"),
              overflow: pane.scrollWidth - pane.clientWidth,
            };
          });
          assert.ok(cues.badgeContained && cues.overflow <= 1,
            `${name} ${theme} ${width}px keeps the read-only label inside its pane: ${JSON.stringify(cues)}`);
          assert.equal(cues.redundantHeaders, 0, "Code follows its file header without repeated preview guidance");
          assert.equal(cues.direction, "row", "The file toolbar does not become a stack of full-width buttons");
          assert.equal(cues.iconOnlyEditor, true,
            "The secondary editor action stays icon-only, including in compact panes");
          assert.equal(cues.secondaryVisible, false, "Generic source has no document-only secondary actions");
          assert.equal(await page.getByRole("button", { name: "More file actions", exact: true }).isVisible(),
            false, "Generic source needs no redundant More menu alongside the split button");
          if (compact) {
            assert.equal(await page.locator(".build-explorer").isVisible(), false);
            assert.equal(await divider.isVisible(), false, "Compact source is not squeezed by a hidden divider");
            assert.ok(await page.locator(".build-content").evaluate(pane =>
              pane.getBoundingClientRect().width >= pane.closest(".build-browser").clientWidth - 1),
            "Compact source uses the full browser width instead of sharing it with a tiny file list");
          } else assert.ok(await railWidth() >= 95, "Wide panes retain a usable resizable file list");
          assert.ok(await page.locator("#workspace-runtime-bar").evaluate(bar => bar.scrollWidth <= bar.clientWidth + 1),
            "The runtime header wraps its actions rather than clipping in a narrow canvas");
          assert.ok((await page.locator(".build-content").boundingBox()).width >= 119,
            "The divider cannot squeeze the source pane below its minimum width");
          const gutters = await page.locator(".build-content").evaluate(element => {
            const pane = element.getBoundingClientRect();
            const source = element.querySelector(".build-source-preview").getBoundingClientRect();
            const card = element.querySelector(".build-file-source");
            const frame = card.getBoundingClientRect();
            const style = getComputedStyle(card);
            const header = element.querySelector(".build-file-header").getBoundingClientRect();
            return { left: frame.left - pane.left, right: element.clientWidth - frame.width,
              expected: parseFloat(style.marginLeft), border: parseFloat(style.borderLeftWidth),
              radius: parseFloat(style.borderTopLeftRadius), cursor: style.cursor,
              codeInset: source.left - frame.left,
              headerLeft: header.left - pane.left, headerWidth: header.width - element.clientWidth };
          });
          assert.ok(Math.abs(gutters.left - gutters.expected) <= 1 &&
            Math.abs(gutters.right - 2 * gutters.expected) <= 1 && Math.abs(gutters.codeInset - 1) <= 1 &&
            Math.abs(gutters.headerLeft) <= 1 && Math.abs(gutters.headerWidth) <= 1,
          "File header fills the pane while the preview is evenly inset: " + JSON.stringify(gutters));
          assert.equal(gutters.border, 1);
          assert.equal(gutters.radius, 8);
          assert.equal(gutters.cursor, "default");
          if (compact) await filesToggle.click();
          const fixedHeader = await page.locator(".build-explorer-header").boundingBox();
          const list = page.locator(".build-explorer-body");
          await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
          assert.ok(await list.evaluate(element => element.scrollTop > 100), "Exercise a genuinely overflowing file list");
          const scrolledHeader = await page.locator(".build-explorer-header").boundingBox();
          assert.ok(Math.abs(fixedHeader.y - scrolledHeader.y) <= 1, "The file-list header stays pinned while files scroll");
          assert.ok(await page.getByRole("button", { name: "+ Add building block", exact: true }).evaluate(element => {
            const box = element.getBoundingClientRect();
            return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("button") === element;
          }), "Add stays visible and unobscured after scrolling");
          assert.equal(await page.getByRole("searchbox", { name: "Filter files", exact: true }).isVisible(), true);
          await list.evaluate(element => { element.scrollTop = 0; });
          if (compact) {
            assert.ok(await railWidth() >= 240, "The compact file browser has room for filenames and filtering");
            await page.getByRole("searchbox", { name: "Filter files", exact: true }).press("Escape");
            assert.equal(await filesToggle.getAttribute("aria-expanded"), "false");
            assert.equal(await filesToggle.evaluate(button => button === document.activeElement), true);
          }
          if (width >= 620) {
            const fill = await page.locator(".build-source-preview").evaluate((element) => ({
              bottom: element.getBoundingClientRect().bottom,
              expectedInset: parseFloat(getComputedStyle(element.parentElement).marginBottom) +
                parseFloat(getComputedStyle(element.parentElement).borderBottomWidth),
              workspaceBottom: document.querySelector("#customize-content").getBoundingClientRect().bottom,
              height: element.getBoundingClientRect().height,
              railBottom: document.querySelector(".build-explorer").getBoundingClientRect().bottom,
            }));
            assert.ok(Math.abs(fill.workspaceBottom - fill.bottom - fill.expectedInset) <= 1,
              "Code preview fills the workspace height inside its inset frame: " + JSON.stringify(fill));
            assert.ok(Math.abs(fill.railBottom - fill.workspaceBottom) <= 1, "File list fills the workspace height");
            assert.ok(fill.height > 200, "Preview is not capped to the source content height");
          }
        }
      }
      await filesToggle.click();
      const compactFilter = page.getByRole("searchbox", { name: "Filter files", exact: true });
      await compactFilter.fill("second");
      await compactFilter.press("Escape");
      assert.equal(await compactFilter.inputValue(), "", "Escape clears the filter before closing the file browser");
      assert.equal(await filesToggle.getAttribute("aria-expanded"), "true");
      await compactFilter.press("Escape");
      assert.equal(await filesToggle.getAttribute("aria-expanded"), "false");
      assert.ok(await page.locator(".build-source-preview").evaluate(source => source === window.retainedBuildPreview),
        "Opening and closing compact navigation never remounts the source");
      await filesToggle.click();
      await page.locator('[data-file-choice="first"]').press("ArrowDown");
      assert.equal(await filesToggle.getAttribute("aria-expanded"), "true",
        "Arrow-key browsing does not close the file list");
      await page.locator('[data-file-choice="second"]').press("Enter");
      assert.equal(await filesToggle.getAttribute("aria-expanded"), "false",
        "Activating a file returns to full-width source");
      assert.equal(await filesToggle.evaluate(button => button === document.activeElement), true);
      await chooseFile("first");
      await page.setViewportSize({ width: 1000, height: 900 });
      await page.getByRole("button", { name: "Adjust with AI", exact: true }).click();
      const ai = page.locator(".build-ai-form");
      await ai.getByRole("textbox", { name: "What should change?", exact: true }).fill("Keep this draft while resizing.");
      await ai.locator("textarea").evaluate(input => { window.compactDraft = input; });
      await page.locator("#app-customize").evaluate(pane => { pane.style.width = "380px"; });
      await filesToggle.waitFor();
      assert.equal(page.viewportSize().width, 1000, "Exercise a narrow embedded canvas inside a wide desktop");
      assert.equal(await divider.isVisible(), false, "The compact layout follows the canvas width, not the viewport");
      assert.equal(await page.locator(".build-workspace").evaluate(workspace =>
        parseFloat(getComputedStyle(workspace).paddingInlineStart)), presentationProfile === "github-app" ? 16 : 12,
      "Compact gutters follow the embedded canvas width in both presentations");
      await filesToggle.click();
      assert.equal(await ai.isVisible(), false);
      await filesToggle.click();
      assert.ok(await ai.locator("textarea").evaluate(input => input === window.compactDraft &&
        input.value === "Keep this draft while resizing."), "File navigation preserves the actual AI draft control");
      await page.locator("#app-customize").evaluate(pane => { pane.style.removeProperty("width"); });
      for (const width of [1000, 620, 380]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForFunction(() => document.querySelector(".build-content").getBoundingClientRect().width >= 119);
        await ai.locator("textarea").scrollIntoViewIfNeeded();
        const spacing = await ai.evaluate(form => {
          const field = form.querySelector(".studio-field-mount").getBoundingClientRect();
          const actions = form.querySelector(".build-actions").getBoundingClientRect();
          const source = form.closest(".build-file").querySelector(".build-file-source");
          const pane = form.closest(".build-content");
          const input = form.querySelector("textarea").getBoundingClientRect();
          const bounds = pane.getBoundingClientRect();
          return {
            previewGap: field.top - source.getBoundingClientRect().bottom - parseFloat(getComputedStyle(source).marginBottom),
            actionsGap: actions.top - field.bottom,
            focusGutters: input.left - bounds.left >= 4 && bounds.right - input.right >= 4,
            contained: pane.scrollWidth <= pane.clientWidth + 1,
          };
        });
        assert.ok(Math.abs(spacing.previewGap - 16) <= 1,
          `${name} ${width}px AI form adds one normal spacing step after the preview frame: ${JSON.stringify(spacing)}`);
        assert.ok(Math.abs(spacing.actionsGap - 16) <= 1,
          "Form actions do not accumulate extra margins: " + JSON.stringify(spacing));
        assert.ok(spacing.focusGutters && spacing.contained,
          `${name} ${width}px keeps form focus and actions inside the pane: ${JSON.stringify(spacing)}`);
        assert.equal(await ai.locator("textarea").inputValue(), "Keep this draft while resizing.");
      }
      await ai.getByRole("button", { name: "Cancel", exact: true }).click();
      const more = page.getByRole("button", { name: "Open with", exact: true });
      await more.press("ArrowDown");
      const menu = page.getByRole("menu", { name: "Open with", exact: true });
      await menu.waitFor();
      assert.equal(await menu.getByRole("menuitem", { name: "Files", exact: true }).isVisible(), true);
      assert.equal(await menu.getByRole("menuitem", { name: "VS Code", exact: true }).isVisible(), true);
      const menuBounds = await menu.boundingBox();
      assert.ok(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= 380,
        "Overflow menus remain inside the compact viewport");
      await page.keyboard.press("Escape");
      assert.equal(await more.evaluate(element => element === document.activeElement), true, "Escape restores menu-trigger focus");
      await page.getByRole("button", { name: "Adjust with AI", exact: true }).click();
      await page.waitForFunction(() => document.activeElement?.matches(".build-ai-form textarea"));
      await ai.getByRole("button", { name: "Cancel", exact: true }).click();
      await more.click();
      await chooseFile("second");
      assert.equal(await page.getByRole("menu").count(), 0, "Changing files tears down an open toolkit menu");
      await chooseFile("first");
      const disclosure = page.locator(".build-file-source").first();
      assert.equal(await disclosure.locator("summary,details").count(), 0);
      assert.equal(await disclosure.locator(".build-source-preview").isVisible(), true);
      assert.equal(await disclosure.locator(".build-highlight").textContent(), content);
      assert.ok(await disclosure.locator(".build-source-preview").getAttribute("aria-description").then(text => text.startsWith("Read-only")));
      assert.equal(await disclosure.locator("textarea,input,[contenteditable=true]").count(), 0);
      const selected = await disclosure.locator(".build-highlight").evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const text = selection.toString();
        selection.removeAllRanges();
        return { text, selectable: getComputedStyle(element).userSelect !== "none" };
      });
      assert.equal(selected.text, content);
      assert.equal(selected.selectable, true, "Read-only source remains selectable for copying");
      await page.setViewportSize({ width: 1000, height: 480 });
      const singleHeader = await page.locator(".build-content").evaluate(pane => {
        const source = pane.querySelector(".build-source-preview");
        source.scrollTop = source.scrollHeight;
        pane.scrollTop = pane.scrollHeight;
        const title = pane.querySelector(".build-area-header").getBoundingClientRect();
        const header = pane.querySelector(".build-file-header").getBoundingClientRect();
        const path = pane.querySelector(".build-source-path").getBoundingClientRect();
        return { sourceScroll: source.scrollTop, outerScroll: pane.scrollTop,
          titleTop: title.top, paneTop: pane.getBoundingClientRect().top,
          headerTop: header.top, titleBottom: title.bottom,
          pathExposed: pane.querySelector(".build-file-header").contains(
            document.elementFromPoint(path.left + 4, path.top + path.height / 2)) };
      });
      assert.ok(singleHeader.sourceScroll > 0 &&
        Math.abs(singleHeader.titleTop - singleHeader.paneTop) <= 1 &&
        Math.abs(singleHeader.headerTop - singleHeader.titleBottom) <= 1 && singleHeader.pathExposed,
      "Single-file title and actions remain pinned with no gap between them while scrolling: " + JSON.stringify(singleHeader));
      await page.setViewportSize({ width: 1000, height: 900 });
      await page.locator('[data-file-choice="deal-implementation"]').click();
      const block = page.locator(".build-block-files");
      await block.waitFor();
      const stackView = page.getByRole("button", { name: "Stack view", exact: true });
      const filePages = page.getByRole("toolbar", { name: "File pages", exact: true, includeHidden: true });
      const filePicker = page.getByRole("button", { name: "More files", exact: true });
      const fileMenu = page.getByRole("menu", { name: "More files", exact: true });
      const implementation = block.locator('[data-artifact="deal-implementation"]');
      const config = block.locator('[data-artifact="deal-config"]');
      assert.equal(await stackView.getAttribute("aria-pressed"), "true", "Every block defaults to Stack view");
      assert.equal(await block.locator(".build-file:visible").count(), 2);
      assert.equal(await filePages.isVisible(), true, "Filename choices are available by default");
      assert.equal(await page.getByRole("toolbar", { name: "Document layout", exact: true }).count(), 0);
      assert.ok((await stackView.boundingBox()).x < (await filePages.boundingBox()).x,
        "The stack button precedes the filename choices");
      assert.equal(await filePages.locator('[aria-pressed="true"]').count(), 0);
      await stackView.click();
      await page.setViewportSize({ width: 380, height: 900 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await filePicker.isVisible(), true, JSON.stringify(await page.locator(".build-block-controls").evaluate(controls => ({
        width: controls.clientWidth,
        overflow: controls.hasAttribute("data-file-overflow"),
        strip: controls.querySelector(".build-file-measure > *").getBoundingClientRect().width,
        items: [...controls.querySelector(".build-file-measure").querySelectorAll("button")].map(node => node.getBoundingClientRect().width),
      }))));
      await filePicker.press("ArrowDown");
      await fileMenu.waitFor();
      assert.deepEqual(await fileMenu.getByRole("menuitem").allTextContents(),
        ["agents.config.yaml"], "Overflow contains only the filename that does not fit");
      assert.equal(await fileMenu.locator('[aria-current="true"]').count(), 0);
      await fileMenu.getByRole("menuitem", { name: "agents.config.yaml", exact: true }).click();
      assert.equal(await config.isVisible(), true);
      assert.equal(await implementation.isVisible(), false, "The file menu selects a page");
      assert.equal(await stackView.getAttribute("aria-pressed"), "false");
      await filePicker.click();
      assert.equal(await fileMenu.locator('[aria-current="true"]').textContent(), "agents.config.yaml",
        "The file menu marks the current file after selection");
      await page.keyboard.press("Escape");
      await filePages.getByRole("button", { name: "function_app.py", exact: true }).click();
      assert.equal(await implementation.isVisible(), true);
      assert.equal(handoffs.length, 0, "Selecting files never opens an external editor");
      await stackView.click();
      assert.equal(await block.locator(".build-file").count(), 2, "All files in the block appear together, including files in another category");
      assert.equal(await page.locator(".build-area-title").textContent(), "Deal doc");
      assert.equal(await page.locator(".build-area-header > p").count(), 0,
        "Multi-file headers show only the parent name, without a count or category subtitle");
      assert.equal(await implementation.locator(".build-highlight").textContent(), artifacts.at(-2).content);
      assert.equal(await config.locator(".build-highlight").textContent(), artifacts.at(-1).content);
      const fileRowModes = new Set();
      const fileRowSizes = [];
      for (const width of [1600, 1000, 620, 380, 320, 1600]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForFunction(() => document.querySelector(".build-content").getBoundingClientRect().width >= 119);
        await page.locator(".build-content").evaluate(pane => { pane.scrollTop = 0; });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const toolbar = await page.locator(".build-block-header").evaluate(header => {
          const title = header.querySelector(".build-area-title").getBoundingClientRect();
          const layout = header.querySelector('[aria-label="Stack view"]').getBoundingClientRect();
          const filenames = header.querySelector(".build-page-switch");
          const pages = filenames.getBoundingClientRect();
          const lastFile = [...filenames.querySelectorAll("button")].at(-1)?.getBoundingClientRect();
          const more = header.querySelector("[data-file-picker]").getBoundingClientRect();
          const hasOverflow = header.querySelector(".build-block-controls").hasAttribute("data-file-overflow");
          const add = header.querySelector('[aria-label="Add building block"]').getBoundingClientRect();
          const bounds = header.getBoundingClientRect();
          const overflows = filenames.scrollWidth > filenames.clientWidth + 1;
          const rightEdge = bounds.right - parseFloat(getComputedStyle(header).paddingRight);
          const firstFile = header.parentElement.querySelector(".build-file:not([hidden])").getBoundingClientRect();
          return {
            hasOverflow, overflows, filenameWidth: filenames.clientWidth, contentWidth: filenames.scrollWidth,
            positions: { stack: layout.toJSON(), pages: pages.toJSON(), last: lastFile?.toJSON(), add: add.toJSON() },
            checks: {
              stackBelowHeading: layout.top >= title.bottom,
              stackBeforeFiles: layout.right <= (lastFile ? pages.left : more.left),
              filenamesBeforeActions: !lastFile || lastFile.right <= (hasOverflow ? more.left : add.left),
              plusAfterOverflow: !hasOverflow || (more.right <= add.left && Math.abs(add.top - more.top) <= 1),
              noHorizontalScroll: !overflows && filenames.scrollLeft === 0,
              fullFilenames: [...filenames.querySelectorAll("button")].every(button =>
                button.getBoundingClientRect().right <= pages.right + 1 && button.scrollWidth <= button.clientWidth + 1),
              contained: add.right <= rightEdge + 1 && header.scrollWidth <= header.clientWidth + 1,
              noLeadingGap: Math.abs(firstFile.top - bounds.bottom) <= 1,
              actionPlacement: lastFile
                ? (hasOverflow ? more.left : add.left) - lastFile.right >= 0 &&
                  (hasOverflow ? more.left : add.left) - lastFile.right <= 12
                : more.left >= layout.right && more.left - layout.right <= 12,
            },
          };
        });
        fileRowModes.add(toolbar.hasOverflow);
        fileRowSizes.push({ width, ...toolbar });
        assert.ok(Object.values(toolbar.checks).every(Boolean),
          `${name} ${width}px keeps Stack, filenames, overflow and plus on one bounded row: ${JSON.stringify(toolbar)}`);
        assert.equal(await filePicker.isVisible(), toolbar.hasOverflow, "Only hidden filenames expose the overflow trigger");
        const inlineFiles = await filePages.getByRole("button").allTextContents();
        if (toolbar.hasOverflow) {
          await filePicker.press("ArrowDown");
          await fileMenu.waitFor();
          assert.deepEqual(await fileMenu.getByRole("menuitem").allTextContents(),
            ["function_app.py", "agents.config.yaml"].slice(inlineFiles.length),
            "Inline files and overflow files partition the collection without duplicates");
          const selectedBounds = await fileMenu.boundingBox();
          assert.ok(selectedBounds.x >= 0 && selectedBounds.x + selectedBounds.width <= width,
            "The file picker stays inside the viewport");
          await page.keyboard.press("Escape");
          assert.ok(await filePicker.evaluate(button => button === document.activeElement), "Escape returns to the overflow trigger");
        } else assert.equal(inlineFiles.length, 2, "Growing the pane restores every inline filename");
        const sizes = await block.locator(".build-source-preview").evaluateAll(previews => previews.map(preview => ({
          height: preview.getBoundingClientRect().height,
          maxHeight: getComputedStyle(preview).maxHeight,
          contained: preview.scrollWidth <= preview.clientWidth + 1 && preview.clientWidth > 0,
          overflow: getComputedStyle(preview).overflow,
        })));
        assert.ok(sizes.every(size => size.height > 0 && size.height <= 240.5 && size.maxHeight === "240px" &&
          size.contained && size.overflow === "clip"),
          `Every ${width}px block preview has its own bounded height: ${JSON.stringify(sizes)}`);
        const expand = implementation.getByRole("button", { name: "Show full file", exact: true });
        assert.equal(await implementation.locator(".build-source-preview").getAttribute("data-clipped"), "");
        assert.ok(await implementation.locator(".build-source-preview").evaluate(source =>
          getComputedStyle(source, "::after").backgroundImage.includes("linear-gradient")),
        "Only clipped code receives a lower fade");
        assert.ok(await implementation.locator(".build-file-source").evaluate(body =>
          getComputedStyle(body).boxShadow !== "none" && parseFloat(getComputedStyle(body).borderBottomWidth) > 0),
        "Stacked files have a distinct lower edge without another heading");
        assert.equal(await config.locator(".build-source-preview").getAttribute("data-clipped"), null,
          "A short, complete file must not imply that more code is hidden");
        assert.equal(await config.locator(".build-preview-expand").isVisible(), false,
          "Complete files do not show an unnecessary expansion action");
        assert.equal(await expand.getAttribute("aria-expanded"), "false");
        await expand.press("Enter");
        const collapse = implementation.getByRole("button", { name: "Show less", exact: true });
        assert.equal(await collapse.getAttribute("aria-expanded"), "true");
        assert.equal(await config.locator(".build-preview-expand button").getAttribute("aria-expanded"), "false",
          "Expanding one file does not expand its siblings");
        const expanded = await implementation.locator(".build-source-preview").evaluate(preview => {
          preview.scrollTop = 90;
          preview.scrollLeft = 30;
          return {
            height: preview.getBoundingClientRect().height, scrollHeight: preview.scrollHeight,
            clientHeight: preview.clientHeight, scrollTop: preview.scrollTop, scrollLeft: preview.scrollLeft,
            contained: preview.scrollWidth <= preview.clientWidth + 1,
          };
        });
        assert.ok(expanded.height > 240 && Math.abs(expanded.scrollHeight - expanded.clientHeight) <= 1 &&
          expanded.scrollTop === 0 && expanded.scrollLeft === 0 && expanded.contained,
        "Expanded files use their full height and never create an internal scrollbar: " + JSON.stringify(expanded));
        assert.equal(await implementation.locator(".build-source-preview").getAttribute("data-clipped"), null,
          "Expanding a file removes the continuation fade");
        assert.equal(await implementation.locator(".build-highlight").textContent(), artifacts.at(-2).content,
          "Wrapping preserves exact source, including multiline highlighted tokens");
        const copied = await implementation.locator(".build-highlight").evaluate(highlight => {
          const selection = window.getSelection(), range = document.createRange();
          range.selectNodeContents(highlight);
          selection.removeAllRanges();
          selection.addRange(range);
          const text = selection.toString();
          selection.removeAllRanges();
          return text;
        });
        assert.ok(copied === artifacts.at(-2).content || copied === artifacts.at(-2).content + "\n",
          "Copying preserves source without line numbers (WebKit may append a terminal line break)");
        assert.ok(await implementation.locator(".build-highlight .token").count() > 0);
        assert.equal(await collapse.getAttribute("aria-controls"), await implementation.locator(".build-source-preview").getAttribute("id"));
        await implementation.locator(".build-code-line").last().scrollIntoViewIfNeeded();
        assert.ok(await implementation.locator(".build-code-line").last().evaluate(line => {
          const pane = line.closest(".build-content"), bounds = line.getBoundingClientRect();
          return pane.scrollTop > 0 && bounds.top >= pane.getBoundingClientRect().top - 1 &&
            bounds.bottom <= pane.getBoundingClientRect().bottom + 1;
        }), "The last source line is reachable using the surrounding pane's scrollbar");
        await collapse.press("Space");
        assert.ok(await page.locator(".build-content").evaluate(pane => pane.scrollWidth <= pane.clientWidth + 1));
      }
      assert.deepEqual([...fileRowModes].sort(), [false, true],
        "Exercise both natural-width and overflowing file rows: " + JSON.stringify(fileRowSizes));
      await page.setViewportSize({ width: 1600, height: 900 });
      await implementation.getByRole("button", { name: "Adjust with AI", exact: true }).click();
      await implementation.locator("textarea").fill("Preserve this deal doc draft.");
      await implementation.locator(".build-source-preview").evaluate(preview => {
        window.retainedBlockPreview = preview;
        preview.scrollTop = 90;
      });
      await chooseFile("deal-config");
      await stackView.click();
      assert.equal(await implementation.locator("textarea").inputValue(), "Preserve this deal doc draft.");
      assert.ok(await implementation.locator(".build-source-preview").evaluate(preview =>
        preview === window.retainedBlockPreview && preview.scrollTop === 0), "Sibling selection preserves non-scrolling source nodes");
      assert.equal(await page.locator('[data-file-choice="deal-implementation"]').getAttribute("aria-current"), "true");
      assert.equal(await filePages.getByRole("button", {
        name: "agents.config.yaml", exact: true, includeHidden: true,
      }).getAttribute("aria-pressed"), "false", "Stack mode does not mark an individual page as active");
      await config.getByRole("button", { name: "Edit in VS Code", exact: true }).focus();
      await page.getByRole("searchbox", { name: "Filter files", exact: true }).fill("deal-config-no-match");
      assert.equal(await block.locator(".build-file").count(), 2, "File filtering does not remove a sibling preview");
      await page.getByRole("searchbox", { name: "Filter files", exact: true }).press("Escape");
      await implementation.getByRole("button", { name: "Cancel", exact: true }).click();
      await chooseFile("deal-implementation");
      await stackView.click();
      assert.ok(await block.locator(".build-file-header").evaluateAll(elements => elements.every(header => {
        const pane = header.closest(".build-content").getBoundingClientRect();
        const bounds = header.getBoundingClientRect();
        return bounds.top >= pane.top - 1 && bounds.bottom <= pane.bottom + 1;
      })), "Both block file headers fit together at the desktop height");
      await page.getByRole("button", { name: "Refresh source", exact: true }).click();
      assert.ok(await implementation.locator(".build-source-preview").evaluate(preview => preview === window.retainedBlockPreview),
        "An unchanged source refresh preserves the entire block");
      await implementation.getByRole("button", { name: "Show full file", exact: true }).click();
      await page.locator('[data-file-choice="first"]').click();
      await page.locator('[data-file-choice="deal-implementation"]').click();
      assert.equal(await implementation.getByRole("button", { name: "Show less", exact: true }).getAttribute("aria-expanded"), "true",
        "Expansion survives navigating away and returning to the block");
      await implementation.getByRole("button", { name: "Show less", exact: true }).click();
      assert.equal(await stackView.getAttribute("aria-pressed"), "true", "The chosen Stack view survives navigation");
      assert.equal(await filePages.isVisible(), true, "Filename controls remain visible in Stack view");
      assert.equal(await stackView.locator('svg[aria-hidden="true"]').count(), 1);
      await stackView.focus();
      await stackView.press("Space");
      assert.equal(await stackView.getAttribute("aria-pressed"), "false");
      assert.equal(await block.locator("[data-clipped]").count(), 0, "Page view never looks truncated");
      assert.equal(await implementation.isVisible(), true);
      assert.equal(await config.isVisible(), false, "Page view displays just the selected file");
      assert.equal(await implementation.getByRole("button", { name: "Show full file", exact: true }).isVisible(), false,
        "Page view always displays the complete source");
      await filePages.getByRole("button", { name: "function_app.py", exact: true }).click();
      assert.equal(await stackView.getAttribute("aria-pressed"), "false", "Reselecting a filename stays in Page view");
      for (const width of [1000, 620, 380]) {
        await page.setViewportSize({ width, height: 900 });
        // Let WebKit update sticky-header hit testing after the resize and scroll.
        await block.evaluate(files => {
          files.scrollTop = files.scrollHeight;
          return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        const geometry = await block.evaluate(files => {
          const pane = files.closest(".build-content"), header = pane.querySelector(".build-block-header");
          const source = files.querySelector(".build-file:not([hidden]) .build-source-preview");
          const fileHeader = files.querySelector(".build-file:not([hidden]) .build-file-header");
          const action = fileHeader.querySelector("[data-file-open] > button").getBoundingClientRect();
          return {
            available: files.clientHeight, scroll: files.scrollTop,
            bottom: files.getBoundingClientRect().bottom, paneBottom: pane.getBoundingClientRect().bottom,
            headerTop: header.getBoundingClientRect().top, paneTop: pane.getBoundingClientRect().top,
            fileHeaderTop: fileHeader.getBoundingClientRect().top, filesTop: files.getBoundingClientRect().top,
            actionExposed: fileHeader.contains(document.elementFromPoint(action.x + action.width / 2, action.y + action.height / 2)),
            outerOverflow: pane.scrollWidth > pane.clientWidth + 1,
            sourceClipped: source.scrollHeight > source.clientHeight + 1,
            sourceWidth: source.scrollWidth > source.clientWidth + 1,
            widths: { pane: [pane.clientWidth, pane.scrollWidth], files: [files.clientWidth, files.scrollWidth],
              source: [source.clientWidth, source.scrollWidth] },
          };
        });
        assert.ok(geometry.available > 150 && geometry.scroll > 0 && !geometry.outerOverflow &&
          !geometry.sourceClipped && !geometry.sourceWidth &&
          Math.abs(geometry.bottom - geometry.paneBottom) <= 1 &&
          Math.abs(geometry.headerTop - geometry.paneTop) <= 1 &&
          Math.abs(geometry.fileHeaderTop - geometry.filesTop) <= 1 && geometry.actionExposed,
        `Page view fills the ${width}px pane below its sticky header without clipping source: ${JSON.stringify(geometry)}`);
        assert.ok(await filePages.isVisible() || await filePicker.isVisible(),
          "Every filename remains reachable inline or through overflow");
      }
      await implementation.getByRole("button", { name: "Edit in VS Code", exact: true }).click();
      await implementation.locator(".build-handoff-feedback [role=status]").waitFor();
      assert.ok(await block.evaluate(files => files.scrollTop > 100),
        "Opening a file from the pinned Page toolbar does not return to the start");
      await page.setViewportSize({ width: 1600, height: 900 });
      await implementation.getByRole("button", { name: "Adjust with AI", exact: true }).click();
      await implementation.locator("textarea").fill("Keep my page-view draft.");
      const pageSource = await implementation.locator(".build-source-preview").evaluate(source => {
        window.retainedPageSource = source;
        const files = source.closest(".build-block-files");
        files.scrollTop = 80;
        return files.scrollTop;
      });
      const configPage = filePages.getByRole("button", { name: "agents.config.yaml", exact: true });
      await configPage.click();
      assert.equal(await implementation.isVisible(), false);
      assert.equal(await config.isVisible(), true);
      assert.equal(await page.locator('[data-file-choice="deal-implementation"]').getAttribute("aria-current"), "true");
      assert.equal(await configPage.getAttribute("aria-controls"), await config.getAttribute("id"));
      assert.ok(await config.evaluate(row => row.getBoundingClientRect().height >= row.closest(".build-block-files").clientHeight - 1),
        "Short files still fill the available page height");
      await configPage.focus();
      await configPage.press("ArrowLeft");
      const implementationPage = filePages.getByRole("button", { name: "function_app.py", exact: true });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "function_app.py", undefined, { timeout: 3000 });
      await implementationPage.press("Space");
      assert.equal(await block.evaluate(files => files.scrollTop), pageSource, "Each page retains its own scroll position");
      assert.equal(await implementation.locator("textarea").inputValue(), "Keep my page-view draft.");
      assert.ok(await implementation.locator(".build-source-preview").evaluate(source => source === window.retainedPageSource));
      await configPage.click();
      assert.equal(await configPage.getAttribute("aria-pressed"), "true", "File choices remain on the right");
      await page.getByRole("button", { name: "Refresh source", exact: true }).click();
      assert.equal(await stackView.getAttribute("aria-pressed"), "false", "Source refresh preserves the selected layout");
      for (const width of [1000, 380]) {
        await page.setViewportSize({ width, height: 900 });
        artifacts[0].content += "\n";
        await page.locator(".build-workspace").evaluate(workspace => { window.beforeRefreshWorkspace = workspace; });
        await page.getByRole("button", { name: "Refresh source", exact: true }).focus();
        await page.getByRole("button", { name: "Refresh source", exact: true }).press("Space");
        await page.waitForFunction(() => document.querySelector(".build-workspace") !== window.beforeRefreshWorkspace);
        assert.ok(await page.getByRole("button", { name: "Refresh source", exact: true }).evaluate(button =>
          button === document.activeElement && button.checkVisibility()),
        `Changed source restores focus to the visible Refresh control at ${width}px`);
      }
      await page.locator("[data-files-toggle]").click();
      assert.equal(await page.getByRole("button", { name: "Refresh source", exact: true }).count(), 1,
        "Opening compact Files exposes only the explorer Refresh control");
      assert.equal(await page.getByRole("button", { name: "+ Add building block", exact: true }).count(), 1,
        "Opening compact Files exposes only the explorer Add control");
      await page.locator("[data-files-toggle]").click();
      await page.setViewportSize({ width: 1000, height: 900 });
      await page.locator('[data-file-choice="first"]').click();
      assert.equal(await stackView.count(), 0, "Single files have no layout switch");
      await page.locator('[data-file-choice="deal-implementation"]').click();
      assert.equal(await stackView.getAttribute("aria-pressed"), "false", "Returning to the block preserves Page view");
      assert.equal(await configPage.getAttribute("aria-pressed"), "true", "Returning to a collection restores its selected file");
      assert.equal(await page.locator('.build-explorer [aria-current="true"]').count(), 1);
      await stackView.click();
      assert.equal(await block.locator(".build-file:visible").count(), 2);
      assert.equal(await filePages.isVisible(), true);
      await implementation.getByRole("button", { name: "Adjust with AI", exact: true }).click();
      assert.equal(await implementation.locator("textarea").inputValue(), "Keep my page-view draft.");
      await implementation.getByRole("button", { name: "Cancel", exact: true }).click();
      await implementation.getByRole("button", { name: "Show full file", exact: true }).click();
      for (const width of [1000, 620, 380]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const pinned = await implementation.evaluate(row => {
          const pane = row.closest(".build-content");
          pane.scrollTop = 400;
          const context = pane.querySelector(".build-area-header").getBoundingClientRect();
          const header = row.querySelector(".build-file-header");
          const action = header.querySelector("[data-file-open] > button").getBoundingClientRect();
          return { scroll: pane.scrollTop, contextTop: context.top, paneTop: pane.getBoundingClientRect().top,
            contextBottom: context.bottom, fileTop: header.getBoundingClientRect().top,
            actionExposed: header.contains(document.elementFromPoint(action.x + action.width / 2, action.y + action.height / 2)) };
        });
        assert.ok(pinned.scroll === 400 && Math.abs(pinned.contextTop - pinned.paneTop) <= 1 &&
          Math.abs(pinned.fileTop - pinned.contextBottom) <= 1 && pinned.actionExposed,
        `Stack keeps each file's actions below the responsive context header at ${width}px: ${JSON.stringify(pinned)}`);
      }
      await page.setViewportSize({ width: 380, height: 900 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await filePicker.click();
      await fileMenu.getByRole("menuitem", { name: "agents.config.yaml", exact: true }).click();
      assert.equal(await stackView.getAttribute("aria-pressed"), "false", "Overflow filenames switch from Stack to Page view");
      assert.equal(await block.locator(".build-file:visible").count(), 1);
      assert.ok(await config.locator(".build-file-header").evaluate(header => {
        const bounds = header.getBoundingClientRect();
        const pane = header.closest(".build-content").getBoundingClientRect();
        return bounds.top >= pane.top && bounds.bottom <= pane.bottom;
      }), "Selecting a filename reveals its page and actions");
      await implementationPage.click();
      await block.evaluate(files => { files.scrollTop = 80; });
      await implementationPage.press("Enter");
      assert.equal(await block.evaluate(files => files.scrollTop), 80,
        "Reselecting the active page preserves its scroll");
      await page.locator(".build-content").evaluate(pane => { pane.scrollTop = 400; });
      await filePicker.click();
      await fileMenu.getByRole("menuitem", { name: "agents.config.yaml", exact: true }).click();
      await page.locator(".build-content").evaluate(pane => { pane.scrollTop = 0; });
      await filePicker.click();
      await fileMenu.getByRole("menuitem", { name: "agents.config.yaml", exact: true }).click();
      assert.ok(await config.locator(".build-file-header").evaluate(header => {
        const bounds = header.getBoundingClientRect();
        const pane = header.closest(".build-content").getBoundingClientRect();
        return bounds.top >= pane.top && bounds.bottom <= pane.bottom;
      }), "Reselecting an overflow filename keeps its page visible");
      await page.setViewportSize({ width: 1000, height: 900 });
      await stackView.click();
      await implementation.getByRole("button", { name: "Show less", exact: true }).click();
      await config.getByRole("button", { name: "Edit in VS Code", exact: true }).click();
      await config.locator(".build-handoff-feedback [role=status]").waitFor();
      assert.deepEqual(handoffs, [{ root: "/fixture", id: "deal-implementation" }, { root: "/fixture", id: "deal-config" }],
        "Each sibling toolbar opens its own file; the file picker never launches an editor");
      await chooseFile("reflow-code");
      await stackView.click();
      assert.equal(await stackView.getAttribute("aria-pressed"), "true", "Another block also starts in Stack view");
      const reflow = page.locator('[data-artifact="reflow-code"]');
      const reflowGeometry = await reflow.locator(".build-source-preview").evaluate(source => ({
        width: source.clientWidth, height: source.clientHeight, scroll: source.scrollHeight,
        textHeight: source.querySelector(".build-highlight").getBoundingClientRect().height,
      }));
      assert.equal(await reflow.locator(".build-preview-expand").isVisible(), false,
        "A file that fits at desktop width needs no continuation control: " + JSON.stringify(reflowGeometry));
      await page.setViewportSize({ width: 380, height: 900 });
      await reflow.locator(".build-source-preview[data-clipped]").waitFor();
      assert.equal(await reflow.getByRole("button", { name: "Show full file", exact: true }).isVisible(), true,
        "Wrapping past the height limit reveals the fade and expansion action");
      await page.setViewportSize({ width: 1000, height: 900 });
      await page.waitForFunction(() => {
        const row = document.querySelector('[data-artifact="reflow-code"]');
        return !row.querySelector(".build-source-preview").hasAttribute("data-clipped") &&
          row.querySelector(".build-preview-expand").hidden;
      });
      const validationFiles = ["main.py", "contract.json", "Dockerfile", "egress-policy.md"];
      artifacts.push(...validationFiles.map((filename, index) => ({
        id: "validation-" + index, customizationArea: "tools", title: filename,
        path: "src/tools/document-validation/" + filename,
        projectPath: "src/tools/document-validation", projectName: "Document validation",
        available: true, content: "# Document validation\n",
      })));
      await page.getByRole("button", { name: "Refresh source", exact: true }).click();
      await chooseFile("validation-0");
      await page.setViewportSize({ width: 480, height: 900 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const validationInline = await filePages.getByRole("button").allTextContents();
      assert.ok(validationInline.length >= 2 && validationInline.length < validationFiles.length);
      assert.deepEqual(validationInline, validationFiles.slice(0, validationInline.length));
      assert.equal(validationInline.includes("egress-policy.md"), false,
        "The reported Document validation layout excludes the entire egress filename, not just its clipped suffix");
      await filePicker.click();
      assert.deepEqual(await fileMenu.getByRole("menuitem").allTextContents(), validationFiles.slice(validationInline.length));
      await fileMenu.getByRole("menuitem", { name: "egress-policy.md", exact: true }).click();
      assert.equal(await filePages.getByRole("button", { name: "egress-policy.md", exact: true }).count(), 0,
        "Selecting Egress does not put a clipped selected filename back into the row");
      assert.ok(await page.locator(".build-block-controls").evaluate(controls =>
        controls.scrollWidth <= controls.clientWidth + 1), "The reported filename row has no horizontal scrolling");
      const validationActions = await page.locator(".build-block-controls").evaluate(controls => {
        const strip = controls.querySelector(".build-page-switch").getBoundingClientRect();
        const more = controls.querySelector("[data-file-picker]").getBoundingClientRect();
        const add = controls.querySelector('[aria-label="Add building block"]').getBoundingClientRect();
        const bounds = controls.getBoundingClientRect();
        const naturalWidth = Math.ceil(add.right - bounds.left);
        return { gap: more.left - strip.right, spare: bounds.right - add.right, naturalWidth };
      });
      assert.ok(validationActions.gap >= 0 && validationActions.gap <= 12 && validationActions.spare >= 0,
        "Overflow controls stay after the visible filenames rather than jumping to the far right: " + JSON.stringify(validationActions));
      await page.locator(".build-block-controls").evaluate((controls, width) => {
        controls.style.width = width + "px";
      }, validationActions.naturalWidth);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.ok(await page.locator(".build-block-controls").evaluate(controls => {
        const add = controls.querySelector('[aria-label="Add building block"]').getBoundingClientRect();
        return Math.abs(add.right - controls.getBoundingClientRect().right) <= 1;
      }), "The plus reaches the right boundary when the visible row fills it, without horizontal scrolling");
      await page.locator(".build-block-controls").evaluate(controls => { controls.style.removeProperty("width"); });
      await page.setViewportSize({ width: 1000, height: 900 });
      const longFiles = ["first", "second"].map((part, index) => ({
        id: "long-" + part, customizationArea: "tools", title: "Long " + part,
        path: "src/long/" + part + "-".repeat(90) + ".py",
        projectPath: "src/long", projectName: "Long filenames",
        available: true, content: "value = " + index + "\n",
      }));
      artifacts.push(...longFiles);
      await page.getByRole("button", { name: "Refresh source", exact: true }).click();
      await chooseFile("long-first");
      await page.setViewportSize({ width: 380, height: 900 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await filePages.isVisible(), false, "When no whole filename fits, only the menu and plus remain");
      assert.equal(await filePages.getByRole("button", { includeHidden: true }).count(), 0);
      await filePicker.press("ArrowDown");
      assert.deepEqual(await fileMenu.getByRole("menuitem").allTextContents(),
        longFiles.map(file => file.path.split("/").pop()), "Long filenames stay fully accessible in the menu");
      await fileMenu.getByRole("menuitem").nth(1).click();
      assert.equal(await stackView.getAttribute("aria-pressed"), "false");
      assert.equal(await page.locator('.build-file[data-artifact="long-second"]').isVisible(), true);
      assert.equal(await page.locator('.build-file[data-artifact="long-first"]').isVisible(), false);
      assert.ok(await page.locator(".build-block-controls").evaluate(controls =>
        controls.scrollWidth <= controls.clientWidth + 1), "Even very long filenames never create horizontal scrolling");
      await page.setViewportSize({ width: 1000, height: 900 });
      await page.locator('[data-collection-path="src/skills/deal-doc"]').click();
      await page.locator(".build-explorer-body").evaluate(element => { element.scrollTop = element.scrollHeight; });
      await page.getByRole("button", { name: "Add building block", exact: true }).click();
      await page.getByRole("textbox", { name: "Block name", exact: true }).fill("lookup");
      const retainedWidth = await railWidth();
      await page.getByRole("button", { name: "Create from template", exact: true }).click();
      await page.locator('.build-file[data-artifact="new-block"]').waitFor();
      assert.ok(Math.abs(await railWidth() - retainedWidth) <= 1,
        "Creating a block retains the chosen split across a workspace rebuild");
      assert.equal(await page.locator(".build-explorer").getByRole("button", { name: "Open App Map", exact: true }).count(), 0,
        "Build's file navigation does not contain an App Map shortcut");
      await openWorkspaceNavigation(page);
      await page.getByRole("navigation", { name: "App workspaces", exact: true })
        .getByRole("button", { name: "Observe", exact: true }).click();
      await page.waitForFunction(() => window.appPlatformReady && document.body.dataset.workspace === "map");
      assert.equal(documentLoads, 2, "Opening Observe after template creation must load a fresh App Map graph");
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
