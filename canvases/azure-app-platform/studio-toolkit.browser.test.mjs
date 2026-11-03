import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { EMPTY_TEMPLATE } from "./source-catalog.mjs";
import { DEFAULT_EDITOR_SETTINGS } from "./editor-settings.mjs";
import { createStudioNotices } from "./studio-notice.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

test("shipped toolkit notice preserves the review journey in light, dark and compact browsers", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "unity-toolkit-browser-"));
  const payload = join(root, "installed plugin");
  let server, browser;
  const evidence = [];
  const hostTokenProof = [];
  try {
    await cp(fileURLToPath(new URL("./", import.meta.url)), payload, {
      recursive: true,
      filter: file => !["node_modules", ".git"].includes(basename(file)) && !file.endsWith(".test.mjs"),
    });
    const { renderStudioHtml } = await import(pathToFileURL(join(payload, "studio-ui.mjs")));
    const { serveStudioAsset } = await import(pathToFileURL(join(payload, "studio-assets.mjs")));
    const provenance = JSON.parse(await readFile(join(payload, "vendor", "toolkit", "provenance.json")));
    let theme = "light";
    server = createServer((request, response) => {
      void (async () => {
        const url = new URL(request.url, "http://localhost");
        if (await serveStudioAsset(request, response, url.pathname)) return;
        if (url.pathname !== "/") { response.writeHead(404); response.end(); return; }
        let html = url.searchParams.has("before")
          ? await readFile(join(process.env.UNITY_TOOLKIT_BASELINE_DIR, `before-${theme}.html`), "utf8")
          : renderStudioHtml("toolkit-proof", "fixture", { theme });
        if (url.searchParams.has("hostTokens")) {
          html = html.replace("</head>", `<style id="synthetic-github-host-tokens">:root {
            --background-color-default: rgb(244, 249, 253);
            --text-color-default: rgb(17, 83, 121);
            --text-color-accent: rgb(124, 47, 150);
            --border-color-default: rgb(41, 106, 77);
            --background-color-muted: rgb(229, 239, 247);
            --font-sans: "Courier New", monospace;
            --text-body-medium: 17px;
            --leading-body-medium: 26px;
          }</style></head>`);
        }
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(html);
      })().catch(cause => { response.writeHead(500); response.end(cause.message); });
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ reducedMotion: "reduce" });
    page.setDefaultTimeout(5000);
    const errors = [], requests = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => requests.push(request.url()));
    await page.route("**/api/**", async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      let data;
      if (pathname === "/api/sources") data = { roots: [], apps: [], templates: [EMPTY_TEMPLATE] };
      else if (pathname === "/api/editor-settings") data = DEFAULT_EDITOR_SETTINGS;
      else if (pathname === "/api/preferences") {
        if (request.method() === "POST") theme = request.postDataJSON().theme;
        data = { theme };
      } else throw new Error(`Unexpected workflow request: ${pathname}`);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    });
    const openReview = async (before = false, query = "") => {
      await page.goto(origin + (before ? "/?before=1" : "/" + query));
      assert.equal(await page.locator("#review-notice").count(), 0);
      await page.locator("#new-app").click();
      await page.locator('input[name="template"]').waitFor();
      await page.locator("#app-name").fill("claims-app");
      await page.locator("#purpose").fill("Review claims safely.");
      await page.locator("#next").click();
      await page.locator("#agent-instructions").fill("Use verified tool results.");
      await page.locator("#next").click();
      await page.locator("#preferred-editor").waitFor();
    };
    const output = process.env.UNITY_TOOLKIT_EVIDENCE_DIR;
    if (output) await mkdir(output, { recursive: true });
    for (const initialTheme of ["light", "dark"]) {
      for (const width of [320, 900]) {
        await page.setViewportSize({ width, height: 900 });
        for (const before of process.env.UNITY_TOOLKIT_BASELINE_DIR ? [true, false] : [false]) {
          theme = initialTheme;
          await openReview(before);
          const notice = page.locator(".notice, #review-notice .ct-message")
            .filter({ hasText: "No Azure resources will be created or changed." });
          await notice.waitFor();
          assert.equal(await notice.textContent(), "No Azure resources will be created or changed.");
          if (!before) {
            assert.equal(await notice.getAttribute("role"), "status");
            assert.equal(await notice.locator(".ct-message-icon[aria-hidden=true] svg").count(), 1);
            assert.equal(await page.locator("#review-notice .ct-provider").count(), 1);
            const colors = await notice.evaluate(element => ({
              foreground: getComputedStyle(element).color,
              padding: getComputedStyle(element).padding,
              radius: getComputedStyle(element).borderRadius,
            }));
            assert.equal(colors.foreground, initialTheme === "light" ? "rgb(31, 35, 40)" : "rgb(230, 237, 243)");
            assert.equal(colors.padding, "16px");
            assert.equal(colors.radius, "6px");
          }
          assert.ok(await notice.evaluate(element => element.getBoundingClientRect().right <= innerWidth));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.equal(await page.locator("#next").isEnabled(), true);
          await page.locator("#open-editor").uncheck();
          const label = `${before ? "before" : "after"}-${initialTheme}-${width}`;
          if (output) {
            const html = await page.content();
            await writeFile(join(output, `${label}.html`), html);
            await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
            evidence.push({ label, synthetic: true, htmlSha256: hash(html), screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
          }
          if (!before) {
            await page.locator("#review-notice").evaluate(element => { window.savedNotice = element.firstElementChild; });
            await page.getByRole("button", { name: "Settings", exact: true }).click();
            await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(initialTheme === "light" ? "dark" : "light");
            await page.waitForFunction(expected => document.documentElement.dataset.studioTheme === expected,
              initialTheme === "light" ? "dark" : "light");
            await page.getByRole("button", { name: "Close settings", exact: true }).click();
            assert.equal(await page.locator("#review-notice").evaluate(element => element.firstElementChild === window.savedNotice), true);
            assert.equal(await page.locator("#open-editor").isChecked(), false);
            await page.locator("#back").click();
            assert.equal(await page.locator("#review-notice").count(), 0);
            await page.locator("#next").click();
            await page.locator("#review-notice .ct-message").waitFor();
            assert.equal(await page.locator("#open-editor").isChecked(), false);
          }
        }
      }
      // Distinctive synthetic host colors prove precedence, not native host delivery.
      for (const tone of ["light", "dark"]) {
        theme = tone;
        await page.setViewportSize({ width: 320, height: 900 });
        await openReview(false, "?hostTokens=1");
        await page.locator("#review-notice .ct-message").waitFor();
        const readColors = () => page.locator("#review-notice .ct-message").evaluate(element => ({
          foreground: getComputedStyle(element).color,
          background: getComputedStyle(element).backgroundColor,
          border: getComputedStyle(element).borderTopColor,
          icon: getComputedStyle(element.querySelector(".ct-message-icon")).color,
        }));
        assert.deepEqual(await readColors(), {
          foreground: "rgb(17, 83, 121)", background: "rgb(229, 239, 247)",
          border: "rgb(41, 106, 77)", icon: "rgb(124, 47, 150)",
        });
        const typography = await page.locator("#review-notice .ct-provider").evaluate(element => ({
          family: getComputedStyle(element).fontFamily,
          size: getComputedStyle(element).fontSize,
          lineHeight: getComputedStyle(element).lineHeight,
          bodySize: getComputedStyle(element.querySelector(".ct-message-body")).fontSize,
        }));
        assert.match(typography.family, /Courier New/);
        assert.equal(typography.size, "17px");
        assert.equal(typography.lineHeight, "26px");
        assert.equal(typography.bodySize, "17px");
        const initialColors = await readColors();
        if (output) {
          const label = `after-synthetic-host-tokens-${tone}-320`;
          await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
          evidence.push({ label, synthetic: true, screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
        }
        await page.locator("#review-notice .ct-message").evaluate(element => { window.hostNotice = element; });
        await page.evaluate(() => {
          document.documentElement.style.setProperty("--text-color-default", "rgb(193, 214, 235)");
          document.documentElement.style.setProperty("--background-color-muted", "rgb(31, 45, 59)");
          document.documentElement.style.setProperty("--border-color-default", "rgb(109, 133, 157)");
          document.documentElement.style.setProperty("--text-color-accent", "rgb(179, 145, 223)");
          document.documentElement.style.setProperty("--font-sans", "Arial, sans-serif");
          document.documentElement.style.setProperty("--text-body-medium", "16px");
          document.documentElement.style.setProperty("--leading-body-medium", "24px");
        });
        assert.deepEqual(await readColors(), {
          foreground: "rgb(193, 214, 235)", background: "rgb(31, 45, 59)",
          border: "rgb(109, 133, 157)", icon: "rgb(179, 145, 223)",
        });
        assert.equal(await page.locator("#review-notice .ct-message").evaluate(element => element === window.hostNotice), true);
        const lateTypography = await page.locator("#review-notice .ct-provider").evaluate(element => ({
          family: getComputedStyle(element).fontFamily,
          size: getComputedStyle(element).fontSize,
          lineHeight: getComputedStyle(element).lineHeight,
        }));
        assert.match(lateTypography.family, /Arial/);
        assert.equal(lateTypography.size, "16px");
        assert.equal(lateTypography.lineHeight, "24px");
        hostTokenProof.push({ tone, synthetic: true, initialColors, typography, lateColors: await readColors(), lateTypography, sameRoot: true });
      }
    }
    // Exercise the real toolkit root, including unchanged updates, not just a mock.
    await page.evaluate(async factory => {
      const toolkit = await import("/canvas-ui/base.mjs");
      const create = (0, eval)(`(${factory})`);
      const host = document.createElement("div");
      host.hidden = true;
      document.body.append(host);
      const controller = create({ loadToolkit: () => Promise.resolve(toolkit), onError: message => { throw new Error(message); } });
      const actions = [];
      controller.renderNotice(host, { children: "Stable notice", intent: "info", onClick: () => actions.push("stale"), tabIndex: 0 });
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!host.hidden) throw new Error("Mount changed notice visibility");
      host.hidden = false;
      const node = host.querySelector(".ct-message");
      node.focus();
      let mutations = 0;
      const observer = new MutationObserver(records => { mutations += records.length; });
      observer.observe(host, { childList: true, subtree: true, characterData: true, attributes: true });
      for (let index = 0; index < 20; index++) controller.renderNotice(host, {
        children: "Stable notice", intent: "info", onClick: () => actions.push("latest"),
      });
      await Promise.resolve();
      if (mutations !== 0 || node !== host.querySelector(".ct-message")) throw new Error("Unchanged updates remounted or mutated the live notice");
      if (document.activeElement !== node) throw new Error("Callback refresh lost focus");
      node.click();
      if (actions.join() !== "latest") throw new Error("Notice retained a stale callback");
      controller.renderNotice(host, { children: "Updated notice" });
      if (node !== host.querySelector(".ct-message") || node.textContent !== "Updated notice") throw new Error("Update replaced the React root");
      if (document.activeElement !== node) throw new Error("Content refresh lost focus");
      controller.clearNotice(host);
      if (host.childNodes.length) throw new Error("Clear left React-owned DOM behind");
      host.hidden = true;
      controller.renderNotice(host, { children: "Reused mount" });
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!host.hidden) throw new Error("Reuse changed notice visibility");
      if (host.querySelector(".ct-message")?.textContent !== "Reused mount") throw new Error("Cleared mount could not be reused");
      controller.dispose();
      if (host.childNodes.length) throw new Error("Dispose left React-owned DOM behind");
      observer.disconnect();
      host.remove();
    }, createStudioNotices.toString());
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    assert.equal(await page.locator("#review-notice .ct-message").count(), 1, "Back/forward cache must retain the mounted notice");
    await page.route("**/canvas-ui/base.mjs", route => route.abort());
    await page.goto(origin);
    await page.locator("#status").filter({ hasText: "Could not load Studio controls:" }).waitFor();
    assert.equal(await page.locator("#next").count(), 0, "A failed controls dependency must not expose a partially working wizard");
    await page.unroute("**/canvas-ui/base.mjs");
    await openReview();
    await page.locator("#review-notice .ct-message").waitFor();
    assert.deepEqual(errors, []);
    assert.ok(requests.some(url => url.endsWith("/canvas-ui/react-runtime.mjs")));
    assert.ok(requests.every(url => new URL(url).origin === origin), "Browser must not use a CDN or external package source");
    if (output) {
      await writeFile(join(output, "browser-evidence.json"), JSON.stringify({
        browser: await browser.version(), synthetic: true, toolkit: provenance,
        baselineCommit: process.env.UNITY_TOOLKIT_BASELINE_COMMIT ?? null,
        baselineHtml: process.env.UNITY_TOOLKIT_BASELINE_DIR ? Object.fromEntries(await Promise.all(
          ["light", "dark"].map(async theme => [theme,
            hash(await readFile(join(process.env.UNITY_TOOLKIT_BASELINE_DIR, `before-${theme}.html`)))]))) : null,
        rendererSha256: hash(await readFile(join(payload, "studio-ui.mjs"))),
        lifecycleSha256: hash(await readFile(join(payload, "studio-notice.mjs"))),
        themeSha256: hash(await readFile(join(payload, "studio-theme.mjs"))),
        captures: evidence,
        hostTokenProof,
      }, null, 2) + "\n");
    }
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
