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

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let playwright;
try { playwright = requireWeb("playwright"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const luminance = rgb => rgb.match(/\d+/g).slice(0, 3).map(Number)
  .map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);

test("packaged task-first home preserves the three explicit journeys", {
  skip: !playwright && "Install src/web dependencies to run browser coverage.",
  timeout: 90000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "unity-home-browser-"));
  const payload = join(root, "installed plugin");
  let server, browser;
  const output = process.env.UNITY_HOME_EVIDENCE_DIR;
  const baseline = process.env.UNITY_HOME_BASELINE === "1";
  const captures = [];
  const browsers = [];
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
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(renderStudioHtml("home-proof", "fixture", {
          theme, intro: url.searchParams.has("intro"), presentationProfile: "github-app",
        }));
      })().catch(cause => { response.writeHead(500); response.end(cause.message); });
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (output) await mkdir(output, { recursive: true });
    for (const engine of ["chromium", "webkit"]) {
      browser = await playwright[engine].launch({ headless: true });
      browsers.push({ engine, version: await browser.version() });
      const page = await browser.newPage({ reducedMotion: "reduce" });
      page.setDefaultTimeout(5000);
      const errors = [], requests = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => requests.push(request.url()));
      let sourceMode = "ready", releaseSources, notifySourcePending;
      const sourcePending = new Promise(resolve => { notifySourcePending = resolve; });
      await page.route("**/api/**", async route => {
        const pathname = new URL(route.request().url()).pathname;
        let data;
        if (pathname === "/api/sources") {
          if (sourceMode === "pending") await new Promise(resolve => {
            releaseSources = resolve;
            notifySourcePending();
          });
          if (sourceMode === "error") {
            await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Source catalog unavailable." }) });
            return;
          }
          data = { roots: [], apps: [], templates: sourceMode === "empty" ? [] : [EMPTY_TEMPLATE] };
        } else if (pathname === "/api/editor-settings") data = DEFAULT_EDITOR_SETTINGS;
        else if (pathname === "/api/preferences") {
          if (route.request().method() === "POST") theme = route.request().postDataJSON().theme;
          data = { theme };
        } else throw new Error(`Unexpected workflow request: ${pathname}`);
        await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
      });
      for (const tone of ["light", "dark"]) {
        theme = tone;
        for (const width of [320, 390, 900]) {
          await page.setViewportSize({ width, height: 900 });
          const beforeRequests = requests.length;
          await page.goto(origin);
          await page.locator("#new-app").waitFor();
          await page.waitForFunction(() => [...document.images].every(image => image.complete));
          assert.ok(!requests.slice(beforeRequests).some(url => /\/api\/(?:sources|discovery)/.test(url)),
            "Home must not scan sources or Azure");
          assert.equal(await page.locator(".studio-welcome-brand").count(), 1);
          assert.equal(await page.locator(".studio-site-nav .studio-brand").isVisible(), false);
          assert.equal(await page.getByRole("link", { name: "Docs", exact: true }).isVisible(), true);
          assert.equal(await page.getByRole("button", { name: "Settings", exact: true }).isVisible(), true);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          if (!baseline) {
            assert.equal(await page.getByRole("heading", { name: "Build an app with Unity", exact: true }).count(), 1);
            assert.equal(await page.locator("#studio-home .ct-feature-panel").count(), 1);
            assert.equal(await page.locator("#studio-home .ct-action-card[data-joined=true]").count(), 2);
            assert.equal(await page.locator("#new-app").textContent(), "Create");
            assert.equal(await page.locator("#studio-home").getByRole("button").count(), 3);
            assert.equal(await page.locator("#studio-home").getByText("claims-assistant").count(), 0);
            const heading = await page.locator("#studio-home h1").evaluate(element => ({
              size: getComputedStyle(element).fontSize, lineHeight: getComputedStyle(element).lineHeight,
            }));
            assert.deepEqual(heading, { size: "20px", lineHeight: "28px" });
            const illustration = page.locator("#studio-home .ct-spot-illustration");
            assert.equal(await illustration.getAttribute("aria-hidden"), "true");
            assert.equal(await illustration.isVisible(), width === 900);
            assert.equal(await page.locator("#new-app").evaluate(element => getComputedStyle(element).fontWeight), "400");
            for (const state of ["rest", "hover"]) {
              if (state === "hover") await page.locator("#new-app").hover();
              const colors = await page.locator("#new-app").evaluate(element => ({
                foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor,
              }));
              const values = [luminance(colors.foreground), luminance(colors.background)];
              assert.ok((Math.max(...values) + .05) / (Math.min(...values) + .05) >= 4.5,
                `${tone} ${state} Create label must meet 4.5:1 contrast`);
            }
            await page.mouse.move(0, 0);
          }
          const label = `${baseline ? "before" : "after"}-${engine}-${tone}-${width}`;
          if (output) {
            const html = await page.content();
            await writeFile(join(output, `${label}.html`), html);
            await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
            captures.push({ label, synthetic: true, htmlSha256: hash(html), screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
          }
          if (!baseline) {
            await page.keyboard.press("Tab");
            await page.locator("#new-app").focus();
            assert.equal(await page.locator("#new-app").evaluate(element => getComputedStyle(element).outlineStyle), "solid");
            await page.keyboard.press("Tab");
            assert.equal(await page.locator("#open-app").evaluate(element => element === document.activeElement), true);
            await page.keyboard.press("Tab");
            assert.equal(await page.locator("#assemble-app").evaluate(element => element === document.activeElement), true);
            await page.keyboard.press("Enter");
            await page.getByRole("heading", { name: "Assemble existing pieces", exact: true }).waitFor();
            await page.locator("#top-back").click();
            await page.locator("#new-app").click();
            await page.locator('input[name="template"]').waitFor();
            await page.locator("#app-name").fill("synthetic-home-app");
            await page.locator("#purpose").fill("Exercise the unchanged creation review.");
            await page.locator("#next").click();
            await page.locator("#agent-instructions").fill("Use verified tool results.");
            await page.locator("#next").click();
            await page.locator("#preferred-editor").waitFor();
            await page.locator("#review-notice .ct-message").waitFor();
            await page.locator("#top-back").click();
            await page.locator("#top-back").click();
            await page.locator("#top-back").click();
            await page.locator("#open-app").click();
            await page.getByText("No existing runnable Unity apps were found", { exact: false }).waitFor();
            await page.locator("#top-back").click();
          }
        }
      }
      if (!baseline) {
        await page.goto(origin);
        await page.locator("#new-app").waitFor();
        await page.locator("#new-app").focus();
        await page.evaluate(() => {
          window.originalHome = document.querySelector("#studio-home .ct-provider");
          window.originalCreate = document.getElementById("new-app");
          for (const [name, value] of Object.entries({
            "--background-color-default": "rgb(244, 249, 253)",
            "--background-color-muted": "rgb(229, 239, 247)",
            "--text-color-default": "rgb(17, 83, 121)",
            "--text-color-muted": "rgb(59, 76, 91)",
            "--border-color-default": "rgb(41, 106, 77)",
            "--text-color-accent": "rgb(124, 47, 150)",
            "--background-color-button-primary-rest": "rgb(117, 72, 164)",
            "--text-color-button-primary-rest": "rgb(255, 255, 255)",
            "--text-body-medium": "16px",
            "--leading-body-ui": "24px",
            "--font-sans": "Arial, sans-serif",
          })) document.documentElement.style.setProperty(name, value);
        });
        assert.deepEqual(await page.locator("#studio-home .ct-feature-panel").evaluate(element => ({
          foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor,
          border: getComputedStyle(element).borderTopColor,
        })), { foreground: "rgb(17, 83, 121)", background: "rgb(229, 239, 247)", border: "rgb(41, 106, 77)" });
        assert.deepEqual(await page.locator("#new-app").evaluate(element => ({
          foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor,
        })), { foreground: "rgb(255, 255, 255)", background: "rgb(117, 72, 164)" });
        assert.equal(await page.locator("#studio-home .ct-spot-illustration").evaluate(element => getComputedStyle(element).color),
          "rgb(124, 47, 150)");
        const typography = await page.locator("#studio-home > .ct-provider").evaluate(element => ({
          family: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize,
        }));
        assert.match(typography.family, /Arial/);
        assert.equal(typography.size, "16px");
        assert.equal(await page.evaluate(() => window.originalHome === document.querySelector("#studio-home .ct-provider")
          && window.originalCreate === document.activeElement), true, "Late host delivery must preserve root and focus");
        if (output) {
          const label = `after-${engine}-synthetic-host-tokens`;
          await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
          captures.push({ label, synthetic: true, screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
        }
        sourceMode = "pending";
        await page.goto(origin);
        await page.locator("#open-app").click();
        await sourcePending;
        await page.waitForFunction(() => document.querySelector("#open-app")?.disabled);
        assert.equal(await page.locator("#new-app").isDisabled(), true);
        assert.equal(await page.locator("#assemble-app").isDisabled(), true);
        assert.match(await page.locator("#status").textContent(), /Finding source projects/);
        await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("Finding"));
        sourceMode = "error";
        releaseSources();
        await page.locator("#status").filter({ hasText: "Source catalog unavailable." }).waitFor();
        assert.equal(await page.locator("#new-app").isEnabled(), true);
        sourceMode = "empty";
        await page.reload();
        await page.locator("#new-app").click();
        await page.getByText("No hydrateable samples were found", { exact: false }).waitFor();
        await page.locator("#app-name").fill("empty-catalog-app");
        await page.locator("#purpose").fill("Exercise empty template selection.");
        await page.locator("#next").click();
        await page.locator("#status").filter({ hasText: "Choose a template or sample." }).waitFor();
        let releaseToolkit;
        const toolkitReady = new Promise(resolve => { releaseToolkit = resolve; });
        await page.route("**/canvas-ui/base.mjs", async route => {
          await toolkitReady;
          await route.continue();
        });
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.goto(`${origin}/?intro=1`, { waitUntil: "domcontentloaded" });
        assert.equal(await page.locator("#new-app").count(), 0);
        releaseToolkit();
        await page.locator("#new-app").waitFor();
        await page.getByRole("button", { name: "Skip", exact: true }).click();
        assert.equal(await page.locator("#new-app").evaluate(element => element === document.activeElement), true);
        await page.unroute("**/canvas-ui/base.mjs");
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.route("**/canvas-ui/base.mjs", route => route.abort());
        await page.goto(origin);
        await page.locator("#status").filter({ hasText: "Could not load Studio controls:" }).waitFor();
        assert.equal(await page.locator("#new-app").count(), 0);
        await page.unroute("**/canvas-ui/base.mjs");
        await page.reload();
        await page.locator("#new-app").waitFor();
      }
      assert.deepEqual(errors, []);
      assert.ok(requests.every(url => new URL(url).origin === origin), "No CDN or external requests");
      await browser.close();
      browser = null;
    }
    if (output) await writeFile(join(output, `${baseline ? "before" : "after"}-evidence.json`), JSON.stringify({
      synthetic: true, payloadIsolation: "Copied plugin without node_modules, imported outside checkout",
      rendererSha256: hash(await readFile(join(payload, "studio-ui.mjs"))),
      homeSha256: hash(await readFile(join(payload, "studio-home.mjs"))),
      toolkit: provenance, browsers, captures,
    }, null, 2) + "\n");
  } finally {
    server?.closeAllConnections();
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
