import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { buildDiffFixture } from "./build-diff-test-fixture.mjs";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";
import { renderThemeStyles } from "./studio-theme.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("Build highlights editable source with aligned scrolling, native input, themes and explicit fallback", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifacts = [
    { id: "python", customizationArea: "behavior", title: "Agent implementation", path: "src/main.py", content: '# greeting\ndef hello():\n\treturn "résumé\u00a0value"\n' },
    { id: "json", customizationArea: "runtime", title: "App configuration", path: "config/app.json", content: '{"name":"hello","enabled":true}' },
    { id: "plain", customizationArea: "policies", title: "Custom source", path: "notes.custom", content: '<script>window.injected = true;</script><img src=x onerror="window.injected=true">' },
  ].map((artifact) => ({ ...artifact, available: true, editable: true, sha: "base" }));
  const writes = [];
  const html = `<!doctype html><html data-studio-theme="light"><style>
    body { margin:0; } #details { height:100vh; }
    ${renderThemeStyles()} ${BUILD_PANEL_CSS}
    </style><aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
      onRun() {}, onModel() {},
      request: async (path, options) => (await fetch(path, options)).json()
    });
    panel.show();
    </script></html>`;
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end(html); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") await route.fulfill({ json: { artifacts } });
      else if (path === "/api/build-diff") {
        const input = route.request().postDataJSON();
        const artifact = artifacts.find((item) => item.id === input.id);
        await route.fulfill({ json: buildDiffFixture({
          baseSha: input.baseSha, before: artifact.content, after: input.content,
        }) });
      }
      else if (path === "/api/build-file") {
        const input = route.request().postDataJSON();
        writes.push(input);
        const artifact = artifacts.find((item) => item.id === input.id);
        Object.assign(artifact, { content: input.content, sha: "saved" });
        await route.fulfill({ json: artifact });
      } else throw new Error("Unexpected route " + path);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const editor = page.locator(".build-source-editor textarea");
    const sourceEditor = page.locator(".build-source-editor");
    const lineNumbers = page.locator(".build-line-numbers");
    const highlight = page.locator(".build-highlight");
    const waitForHighlight = () => page.waitForFunction(() => {
      const source = document.querySelector(".build-source-editor textarea")?.value;
      return source !== undefined && document.querySelector(".build-highlight")?.textContent === source + (source.endsWith("\n") ? " " : "");
    });
    const waitForLineCount = (count) => page.waitForFunction((expected) =>
      document.querySelector(".build-line-numbers")?.textContent.split("\n").length === expected, count);
    await editor.waitFor();
    await waitForHighlight();
    await waitForLineCount(4);
    assert.equal(await page.locator(".build-language").textContent(), "Python");
    assert.deepEqual(await highlight.locator(".keyword").allTextContents(), ["def", "return"]);
    assert.equal(await editor.inputValue(), artifacts[0].content);
    assert.equal(await highlight.getAttribute("aria-hidden"), "true");
    assert.equal(await lineNumbers.getAttribute("aria-hidden"), "true");
    assert.equal(await lineNumbers.evaluate((element) => element.tagName), "PRE");
    assert.equal(await lineNumbers.textContent(), "1\n2\n3\n4");
    assert.equal(await lineNumbers.evaluate((element) => getComputedStyle(element).pointerEvents), "none");
    assert.equal(await lineNumbers.evaluate((element) => getComputedStyle(element).userSelect), "none");
    assert.equal(await page.getByRole("textbox").count(), 1);
    const metrics = (element) => element.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.font, style.letterSpacing, style.tabSize, style.padding, style.whiteSpace, style.boxSizing];
    });
    assert.deepEqual(await metrics(highlight), await metrics(editor));
    const lineMetrics = (element) => element.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.fontFamily, style.fontSize, style.lineHeight, style.letterSpacing, style.paddingTop];
    });
    assert.deepEqual(await lineMetrics(lineNumbers), await lineMetrics(editor));
    const initialBounds = await Promise.all([lineNumbers.boundingBox(), editor.boundingBox()]);
    assert.equal(initialBounds[0].y, initialBounds[1].y);
    assert.equal(initialBounds[0].height, initialBounds[1].height);
    assert.ok(Math.abs(initialBounds[0].x + initialBounds[0].width - initialBounds[1].x) < 1);

    const longFirstLine = "# " + "long line ".repeat(100);
    const source999 = [longFirstLine, ...Array.from({ length: 998 }, (_, index) => `line ${index + 2}`)].join("\n");
    await editor.fill(source999);
    await waitForHighlight();
    await waitForLineCount(999);
    assert.equal((await lineNumbers.textContent()).split("\n").at(-1), "999");
    assert.equal(await sourceEditor.evaluate((element) =>
      element.style.getPropertyValue("--build-line-gutter-width")), "calc(3ch + 20px)");
    await editor.evaluate((element) => {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    });
    await page.keyboard.insertText("\nline 1000");
    const longSource = source999 + "\nline 1000";
    await waitForHighlight();
    await waitForLineCount(1000);
    assert.equal((await lineNumbers.textContent()).split("\n").at(-1), "1000");
    assert.equal(await sourceEditor.evaluate((element) =>
      element.style.getPropertyValue("--build-line-gutter-width")), "calc(4ch + 20px)");
    const selection = await editor.evaluate((el) => [el.selectionStart, el.selectionEnd]);
    assert.deepEqual(selection, [longSource.length, longSource.length]);
    assert.deepEqual(await editor.evaluate((el) => [el.selectionStart, el.selectionEnd]), selection);
    assert.equal(await editor.inputValue(), longSource);
    await editor.evaluate((el) => { el.scrollTop = 700; el.scrollLeft = 450; el.dispatchEvent(new Event("scroll")); });
    const scroll = (element) => element.evaluate((el) => [el.scrollTop, el.scrollLeft, el.clientWidth, el.clientHeight]);
    assert.deepEqual(await scroll(highlight), await scroll(editor));
    assert.equal(await lineNumbers.evaluate((element) => element.scrollTop), await editor.evaluate((element) => element.scrollTop));
    assert.equal(await lineNumbers.evaluate((element) => element.scrollLeft), 0);
    assert.ok(await editor.evaluate((element) => element.scrollWidth > element.clientWidth));
    assert.ok(await sourceEditor.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
    assert.ok(await page.locator("#details").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
    await page.setViewportSize({ width: 740, height: 720 });
    await page.waitForFunction(() => {
      const input = document.querySelector(".build-source-editor textarea");
      const layer = document.querySelector(".build-highlight");
      return input.clientWidth === layer.clientWidth && input.clientHeight === layer.clientHeight;
    });
    assert.deepEqual(await scroll(highlight), await scroll(editor));
    assert.equal(await lineNumbers.evaluate((element) => element.scrollTop), await editor.evaluate((element) => element.scrollTop));
    assert.ok(await editor.evaluate((element) => element.scrollWidth > element.clientWidth));
    assert.ok(await sourceEditor.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
    assert.ok(await page.locator("#details").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
    await editor.fill(artifacts[0].content);
    await waitForHighlight();
    const lightKeyword = await highlight.locator(".keyword").first().evaluate((el) => getComputedStyle(el).color);
    await page.locator("html").evaluate((el) => { el.dataset.studioTheme = "dark"; });
    const darkKeyword = await highlight.locator(".keyword").first().evaluate((el) => getComputedStyle(el).color);
    assert.notEqual(lightKeyword, darkKeyword);
    await page.emulateMedia({ forcedColors: "active" });
    assert.notEqual(await editor.evaluate((el) => getComputedStyle(el).color), "rgba(0, 0, 0, 0)");
    assert.equal(await highlight.evaluate((el) => getComputedStyle(el).visibility), "hidden");
    await page.emulateMedia({ forcedColors: "none" });
    await editor.dispatchEvent("compositionstart");
    assert.notEqual(await editor.evaluate((el) => getComputedStyle(el).color), "rgba(0, 0, 0, 0)");
    await editor.fill('def hello():\n\treturn "こんにちは"\n');
    await editor.dispatchEvent("compositionend");
    await waitForHighlight();
    assert.equal(await editor.inputValue(), 'def hello():\n\treturn "こんにちは"\n');
    await editor.evaluate((element) => {
      element.dataset.identityProbe = "native-source";
      element.setSelectionRange(4, 16, "forward");
      element.scrollTop = 8;
      element.scrollLeft = 3;
    });
    await highlight.evaluate((element) => { element.dataset.identityProbe = "prism-layer"; });
    const sourceState = await editor.evaluate((element) => [
      element.selectionStart, element.selectionEnd, element.selectionDirection,
      element.scrollTop, element.scrollLeft,
    ]);
    const prismState = await highlight.evaluate((element) => [element.innerHTML, element.scrollTop, element.scrollLeft]);
    await page.getByRole("button", { name: "Review changes", exact: true }).click();
    const diff = page.getByRole("region", { name: "Unified source changes" });
    await diff.waitFor();
    assert.ok(await diff.locator(".build-diff-hunk-header").count() > 0);
    assert.ok(await diff.locator('.build-diff-row[data-diff-kind="removed"]').count() > 0);
    assert.ok(await diff.locator('.build-diff-row[data-diff-kind="added"]').count() > 0);
    assert.equal(await diff.locator('[contenteditable="true"], [class*="cm-"]').count(), 0);
    for (const row of await diff.locator(".build-diff-row").all()) {
      assert.equal(await row.locator(".build-diff-line-number").count(), 2);
      assert.equal(await row.locator(".build-diff-marker").count(), 1);
      assert.equal(await row.locator(".build-diff-text").count(), 1);
    }
    assert.equal(await editor.isHidden(), true);
    assert.equal(await highlight.isHidden(), true);
    await page.getByRole("button", { name: "Back to editing" }).click();
    await page.waitForFunction(() => document.querySelector(".build-source-editor textarea") === document.activeElement);
    assert.equal(await editor.getAttribute("data-identity-probe"), "native-source");
    assert.equal(await highlight.getAttribute("data-identity-probe"), "prism-layer");
    assert.equal(await editor.inputValue(), 'def hello():\n\treturn "こんにちは"\n');
    assert.deepEqual(await editor.evaluate((element) => [
      element.selectionStart, element.selectionEnd, element.selectionDirection,
      element.scrollTop, element.scrollLeft,
    ]), sourceState);
    assert.deepEqual(await highlight.evaluate((element) => [element.innerHTML, element.scrollTop, element.scrollLeft]), prismState);
    await page.getByRole("button", { name: "Review changes", exact: true }).click();
    await page.getByRole("button", { name: "Save reviewed changes" }).click();
    await page.getByText(/Saved\. Restart/).waitFor();
    assert.equal(writes[0].content, 'def hello():\n\treturn "こんにちは"\n');
    assert.equal(writes[0].baseSha, "base");
    await page.locator('.build-area-button[data-area-id="runtime"]').click();
    await waitForHighlight();
    assert.equal(await page.locator(".build-language").textContent(), "JSON");
    assert.ok(await highlight.locator(".property").count() > 0);
    await page.locator('.build-area-button[data-area-id="policies"]').click();
    await waitForHighlight();
    assert.equal(await page.locator(".build-language").textContent(), "Plain text");
    assert.equal(await highlight.textContent(), artifacts[2].content);
    assert.equal(await highlight.locator("script, img, .token").count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await page.evaluate(() => {
      window.restoreBuildHighlight = buildSyntax.highlight;
      buildSyntax.highlight = () => { throw new Error("Simulated tokenizer failure."); };
    });
    await editor.fill("Keep this editable.");
    await page.getByRole("alert").filter({ hasText: /Syntax highlighting is unavailable/ }).waitFor();
    assert.equal(await page.locator(".build-source-editor").getAttribute("data-highlight"), "false");
    assert.notEqual(await editor.evaluate((el) => getComputedStyle(el).color), "rgba(0, 0, 0, 0)");
    assert.equal(await editor.inputValue(), "Keep this editable.");
    await page.evaluate(() => { buildSyntax.highlight = window.restoreBuildHighlight; });
    await editor.fill("Highlighting recovered.");
    await waitForHighlight();
    assert.equal(await page.locator(".build-syntax-error").count(), 0);
    assert.equal(await page.locator(".build-source-editor").getAttribute("data-highlight"), "true");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
