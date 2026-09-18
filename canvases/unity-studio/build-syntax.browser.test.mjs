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

test("Build lazily renders accessible, scrollable and injection-safe source previews", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const longLine = `# ${"wide source ".repeat(120)}`;
  const bodyLines = Array.from({ length: 80 }, (_, index) =>
    index === 0 ? "def hello():" : index === 1 ? '\treturn "résumé\u00a0value"' : `line ${index + 1}`);
  const artifacts = [
    {
      id: "python", customizationArea: "behavior", title: "Agent implementation", path: "src/main.py",
      projectPath: "src/agent", projectName: "Agent", focusLine: 50,
      content: [longLine, ...bodyLines, "", ""].join("\r\n"),
    },
    {
      id: "fallback", customizationArea: "behavior", title: "Fallback source", path: "src/fallback.py",
      projectPath: "src/fallback", projectName: "Fallback", content: "def fallback():\n    return True\n",
    },
    {
      id: "json", customizationArea: "runtime", title: "App configuration", path: "config/app.json",
      content: '{"name":"hello","enabled":true}',
    },
    {
      id: "plain", customizationArea: "policies", title: "Custom source", path: "notes.custom",
      content: '<script>window.injected = true;</script>\n<img src=x onerror="window.injected=true">\n',
    },
  ].map((artifact) => ({ ...artifact, available: true, sha: "base" }));
  const requests = [];
  const html = `<!doctype html><html data-studio-theme="light"><style>
    body { margin:0; } #details { height:100vh; }
    ${renderThemeStyles()} ${BUILD_PANEL_CSS}
    </style><aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
      onRun() {}, onModel() {},
      request: async (path, options) => {
        const response = await fetch(path, options);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      }
    });
    panel.show();
    </script></html>`;
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 740, height: 520 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push({ path, method: route.request().method() });
      if (path === "/api/build-workspace") await route.fulfill({ json: { artifacts } });
      else throw new Error(`Unexpected route ${path}`);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('.build-file[data-artifact="python"]').waitFor();
    const pythonDisclosure = page.locator(
      '.build-file[data-artifact="python"] .build-source-disclosure[data-preview-for="python"]');
    assert.equal(await pythonDisclosure.evaluate((element) => element.open), true);
    const preview = page.getByRole("region", { name: "Agent implementation source preview", exact: true });
    const lineNumbers = preview.locator(".build-line-numbers");
    const highlight = preview.locator("pre.build-highlight");
    await preview.waitFor();
    assert.equal(await preview.getAttribute("tabindex"), "0");
    assert.equal(await preview.getAttribute("data-language"), "python");
    assert.equal(await lineNumbers.getAttribute("aria-hidden"), "true");
    assert.equal(await highlight.getAttribute("aria-hidden"), null);
    assert.equal(await highlight.textContent(), artifacts[0].content.replaceAll("\r\n", "\n"));
    const renderedLines = (await lineNumbers.textContent()).split("\n");
    assert.equal(renderedLines.length, 83);
    assert.equal(renderedLines[0], "1");
    assert.equal(renderedLines.at(-1), "83");
    assert.equal(await page.locator("textarea,[contenteditable=true],.cm-editor").count(), 0);
    assert.equal(await page.getByRole("textbox").count(), 0);
    assert.equal(await pythonDisclosure.locator(".build-language").textContent(), "Python");
    assert.deepEqual(await highlight.locator(".keyword").allTextContents(), ["def", "return"]);
    assert.equal(await lineNumbers.evaluate((element) => getComputedStyle(element).userSelect), "none");
    assert.ok(await preview.evaluate((element) => element.scrollWidth > element.clientWidth));
    assert.ok(await preview.evaluate((element) => element.scrollHeight > element.clientHeight));
    assert.ok(await preview.evaluate((element) => element.scrollTop > 0),
      "The first lazy render scrolls the focusLine into view");
    const [previewBounds, gutterBounds, sourceBounds] = await Promise.all([
      preview.boundingBox(), lineNumbers.boundingBox(), highlight.boundingBox(),
    ]);
    assert.ok(gutterBounds.width > 0);
    assert.ok(Math.abs(gutterBounds.height - sourceBounds.height) < 1);
    assert.ok(gutterBounds.x >= previewBounds.x
      && gutterBounds.x + gutterBounds.width < previewBounds.x + previewBounds.width);
    await preview.evaluate((element) => {
      element.scrollTop = 120;
      element.scrollLeft = 300;
      element.dataset.cacheProbe = "python";
    });
    assert.ok(await preview.evaluate((element) => element.scrollTop > 0));
    assert.ok(await preview.evaluate((element) => element.scrollLeft > 0));
    assert.ok(Math.abs((await lineNumbers.boundingBox()).x - previewBounds.x) <= 2,
      "The sticky gutter remains visible while source scrolls horizontally");
    const cachedScroll = await preview.evaluate((element) => [element.scrollTop, element.scrollLeft]);
    const textBeforeTyping = await highlight.textContent();
    await preview.focus();
    await page.keyboard.insertText("This must not edit source.");
    assert.equal(await highlight.textContent(), textBeforeTyping);

    await pythonDisclosure.locator(":scope > summary").press("Space");
    assert.equal(await pythonDisclosure.evaluate((element) => element.open), false);
    assert.equal(await pythonDisclosure.locator(".build-source-preview").count(), 1,
      "Closing a rendered preview may keep its DOM cached");
    await pythonDisclosure.locator(":scope > summary").press("Space");
    assert.equal(await preview.getAttribute("data-cache-probe"), "python");
    assert.deepEqual(await preview.evaluate((element) => [element.scrollTop, element.scrollLeft]), cachedScroll);

    const lightKeyword = await highlight.locator(".keyword").first().evaluate((element) => getComputedStyle(element).color);
    await page.locator("html").evaluate((element) => { element.dataset.studioTheme = "dark"; });
    const darkKeyword = await highlight.locator(".keyword").first().evaluate((element) => getComputedStyle(element).color);
    assert.notEqual(lightKeyword, darkKeyword);

    await page.getByRole("tab", { name: "Runtime", exact: true }).click();
    const runtime = page.locator('.build-area[data-area-id="runtime"]');
    const jsonDisclosure = runtime.locator('.build-source-disclosure[data-preview-for="json"]');
    assert.equal(await jsonDisclosure.evaluate((element) => element.open), true);
    const jsonPreview = page.getByRole("region", { name: "App configuration source preview", exact: true });
    await jsonPreview.waitFor();
    assert.equal(await jsonPreview.getAttribute("data-language"), "json");
    assert.equal(await jsonDisclosure.locator(".build-language").textContent(), "JSON");
    assert.ok(await jsonPreview.locator(".property").count() > 0);

    await page.getByRole("tab", { name: "Policies", exact: true }).click();
    const policies = page.locator('.build-area[data-area-id="policies"]');
    const plainDisclosure = policies.locator('.build-source-disclosure[data-preview-for="plain"]');
    assert.equal(await plainDisclosure.evaluate((element) => element.open), true);
    const plainPreview = page.getByRole("region", { name: "Custom source source preview", exact: true });
    await plainPreview.waitFor();
    assert.equal(await plainPreview.getAttribute("data-language"), "plain");
    assert.equal(await plainDisclosure.locator(".build-language").textContent(), "Plain text");
    assert.equal(await plainPreview.locator(".build-highlight").textContent(), artifacts[3].content);
    assert.equal(await plainPreview.locator("script,img,.token").count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);

    await page.evaluate(() => {
      window.originalBuildHighlight = buildSyntax.highlight;
      buildSyntax.highlight = () => { throw new Error("Simulated tokenizer failure."); };
    });
    await page.getByRole("tab", { name: "Behavior", exact: true }).click();
    await page.locator('.build-project-list [data-project-path="src/fallback"]').click();
    const fallbackDisclosure = page.locator(
      '.build-file[data-artifact="fallback"] .build-source-disclosure[data-preview-for="fallback"]');
    assert.equal(await fallbackDisclosure.evaluate((element) => element.open), true);
    const fallbackPreview = page.getByRole("region", { name: "Fallback source source preview", exact: true });
    await page.getByRole("alert").filter({ hasText: /plain text preview is still available/i }).waitFor();
    assert.equal(await fallbackPreview.locator(".build-highlight").textContent(), artifacts[1].content);
    assert.equal(await fallbackPreview.locator(".token").count(), 0);
    assert.equal(await fallbackPreview.isVisible(), true);
    await page.evaluate(() => { buildSyntax.highlight = window.originalBuildHighlight; });

    assert.equal(requests.some(({ path }) => path === "/api/build-diff" || path === "/api/build-file"), false);
    assert.equal(requests.filter(({ method }) => method !== "GET").length, 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
