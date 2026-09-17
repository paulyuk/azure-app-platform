import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
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
    { id: "python", title: "Agent implementation", path: "src/main.py", content: '# greeting\ndef hello():\n\treturn "résumé\u00a0value"\n' },
    { id: "json", title: "App configuration", path: "config/app.json", content: '{"name":"hello","enabled":true}' },
    { id: "plain", title: "Custom source", path: "notes.custom", content: '<script>window.injected = true;</script><img src=x onerror="window.injected=true">' },
  ].map((artifact) => ({ ...artifact, available: true, editable: true, sha: "base" }));
  const writes = [];
  const html = `<!doctype html><html data-studio-theme="light"><style>
    body { margin:0; } #details { height:100vh; }
    ${renderThemeStyles()} ${BUILD_PANEL_CSS}
    </style><aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
      onRun() {}, onModel() {}, onStructure() {},
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
    const highlight = page.locator(".build-highlight");
    const waitForHighlight = () => page.waitForFunction(() => {
      const source = document.querySelector(".build-source-editor textarea")?.value;
      return source !== undefined && document.querySelector(".build-highlight")?.textContent === source + (source.endsWith("\n") ? " " : "");
    });
    await editor.waitFor();
    await waitForHighlight();
    assert.equal(await page.locator(".build-language").textContent(), "Python");
    assert.deepEqual(await highlight.locator(".keyword").allTextContents(), ["def", "return"]);
    assert.equal(await editor.inputValue(), artifacts[0].content);
    assert.equal(await highlight.getAttribute("aria-hidden"), "true");
    assert.equal(await page.getByRole("textbox").count(), 1);
    const metrics = (element) => element.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.font, style.letterSpacing, style.tabSize, style.padding, style.whiteSpace, style.boxSizing];
    });
    assert.deepEqual(await metrics(highlight), await metrics(editor));
    const longSource = ('# ' + "long line ".repeat(100) + '\n\treturn "résumé\u00a0value"\n').repeat(40) + "\n";
    await editor.fill(longSource);
    await editor.press("ArrowLeft");
    const selection = await editor.evaluate((el) => [el.selectionStart, el.selectionEnd]);
    await waitForHighlight();
    assert.deepEqual(await editor.evaluate((el) => [el.selectionStart, el.selectionEnd]), selection);
    assert.equal(await editor.inputValue(), longSource);
    await editor.evaluate((el) => { el.scrollTop = 700; el.scrollLeft = 450; el.dispatchEvent(new Event("scroll")); });
    const scroll = (element) => element.evaluate((el) => [el.scrollTop, el.scrollLeft, el.clientWidth, el.clientHeight]);
    assert.deepEqual(await scroll(highlight), await scroll(editor));
    await page.setViewportSize({ width: 740, height: 720 });
    await page.waitForFunction(() => {
      const input = document.querySelector(".build-source-editor textarea");
      const layer = document.querySelector(".build-highlight");
      return input.clientWidth === layer.clientWidth && input.clientHeight === layer.clientHeight;
    });
    assert.deepEqual(await scroll(highlight), await scroll(editor));
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
    await page.getByRole("button", { name: "Review changes", exact: true }).click();
    await page.getByRole("button", { name: "Save reviewed changes" }).click();
    await page.getByText(/Saved\. Restart/).waitFor();
    assert.equal(writes[0].content, 'def hello():\n\treturn "こんにちは"\n');
    assert.equal(writes[0].baseSha, "base");
    await page.locator('[data-file-id="json"]').click();
    await waitForHighlight();
    assert.equal(await page.locator(".build-language").textContent(), "JSON");
    assert.ok(await highlight.locator(".property").count() > 0);
    await page.locator('[data-file-id="plain"]').click();
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
