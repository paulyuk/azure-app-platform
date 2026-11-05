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

for (const engine of ["chromium", "webkit"]) {
  test(`Home boundary copy preserves compact journeys and recent actions in ${engine}`, {
    skip: !playwright && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const { renderStudioHtml } = await import("./studio-ui.mjs");
    const { serveStudioAsset } = await import("./studio-assets.mjs");
    let theme = "light";
    const server = createServer((request, response) => {
      void (async () => {
        const path = new URL(request.url, "http://localhost").pathname;
        if (await serveStudioAsset(request, response, path)) return;
        if (path !== "/") { response.writeHead(404).end(); return; }
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(renderStudioHtml("home-copy-test", "fixture", { theme, presentationProfile: "github-app" }));
      })().catch(error => { response.writeHead(500).end(error.message); });
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const browser = await playwright[engine].launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage();
      const errors = [], mutations = [];
      page.on("pageerror", error => errors.push(error.message));
      const apps = Array.from({ length: 7 }, (_, index) => ({
        name: "Synthetic app " + index, path: "projects/app-" + index, capabilityIds: [],
        lastOpenedAt: new Date(Date.UTC(2026, 9, 29 - index, 12)).toISOString(),
      }));
      await page.route("**/api/**", route => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() !== "GET") mutations.push(path);
        const json = path === "/api/sources" ? { roots: [], apps, templates: [EMPTY_TEMPLATE] }
          : path === "/api/editor-settings" ? DEFAULT_EDITOR_SETTINGS
            : path === "/api/preferences" ? { theme } : null;
        if (!json) {
          errors.push("Unexpected Home request: " + path);
          return route.abort("failed");
        }
        return route.fulfill({ json });
      });
      const origin = "http://127.0.0.1:" + server.address().port;
      for (const tone of ["light", "dark"]) {
        theme = tone;
        for (const width of [320, 380, 620]) {
          await page.setViewportSize({ width, height: 800 });
          await page.goto(origin);
          await page.locator("[data-recent-app]").nth(4).waitFor();
          assert.equal(await page.locator(".simple-home-introduction h1").innerText(), "Automate real tasks within boundaries you set.");
          assert.equal(await page.locator(".simple-home-introduction p").innerText(), "Isolate tool execution and govern access to shared models and tools.");
          assert.equal(await page.locator("#studio-home .ct-action-card").count(), 3);
          assert.equal(await page.locator("[data-recent-app]").count(), 5);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await page.locator("#new-app").focus();
          await page.keyboard.press("Enter");
          await page.locator('input[name="template"]').waitFor();
          await page.locator("#top-back").click();
          await page.locator("#open-app").click();
          await page.locator("[data-existing-app]").nth(6).waitFor();
          assert.equal(await page.locator("[data-existing-app]").count(), 7);
          await page.locator("#top-back").click();
          await page.locator("#assemble-app").click();
          await page.getByRole("heading", { name: "Assemble existing projects", exact: true }).waitFor();
          await page.locator("#top-back").click();
        }
      }
      await page.route("**/app-map?**", route => route.fulfill({ contentType: "text/html", body: "<h1>Synthetic existing app workspace</h1>" }));
      await page.locator("[data-recent-app]").first().focus();
      await page.keyboard.press("Enter");
      await page.getByRole("heading", { name: "Synthetic existing app workspace", exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get("root"), apps[0].path);
      assert.deepEqual(mutations, []);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  });
}

test("packaged simple home preserves the three explicit journeys", {
  skip: !playwright && "Install src/web dependencies to run browser coverage.",
  timeout: 90000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "unity-home-browser-"));
  const payload = join(root, "installed plugin");
  let server, browser;
  const output = process.env.UNITY_HOME_EVIDENCE_DIR;
  const baseline = process.env.UNITY_HOME_BASELINE === "1";
  const captures = [];
  const geometry = [];
  const recentBoundaries = [];
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
      let sourceMode = "ready", recentCount = 7, releaseSources, notifySourcePending;
      const recentInventory = [
        { name: "Customer portal", path: "projects/customer-portal" },
        { name: "Inventory dashboard", path: "projects/inventory-dashboard" },
        { name: "Support assistant", path: "projects/support-assistant" },
        { name: "Order tracker", path: "projects/order-tracker" },
        { name: "Document helper", path: "projects/document-helper" },
        { name: "Schedule assistant", path: "projects/schedule-assistant" },
        { name: "Knowledge search", path: "projects/knowledge-search" },
      ].map((app, index) => ({
        ...app, lastOpenedAt: new Date(Date.UTC(2026, 9, 29 - index, 12)).toISOString(), capabilityIds: [],
      }));
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
          data = { roots: [], apps: sourceMode === "populated" ? recentInventory.slice(0, recentCount) : [],
            templates: sourceMode === "empty" ? [] : [EMPTY_TEMPLATE] };
        } else if (pathname === "/api/editor-settings") data = DEFAULT_EDITOR_SETTINGS;
        else if (pathname === "/api/preferences") {
          if (route.request().method() === "POST") theme = route.request().postDataJSON().theme;
          data = { theme };
        } else throw new Error(`Unexpected workflow request: ${pathname}`);
        await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
      });
      for (const tone of ["light", "dark"]) {
        theme = tone;
        for (const width of [390, 900, 1440]) {
          await page.setViewportSize({ width, height: width === 1440 ? 1100 : 1000 });
          const beforeRequests = requests.length;
          await page.goto(origin);
          await page.locator("#new-app").waitFor();
          await page.waitForFunction(() => [...document.images].every(image => image.complete));
          assert.ok(!requests.slice(beforeRequests).some(url => /\/api\/(?:sources|discovery)/.test(url)),
            "Home must not scan sources or Azure");
          assert.equal(await page.locator(".studio-welcome-brand").count(), 0);
          assert.equal(await page.getByRole("button", { name: "App home", exact: true }).isVisible(), true,
            await page.locator(".studio-site-nav").evaluate(element => element.outerHTML));
          assert.equal(await page.getByRole("link", { name: "Docs", exact: true }).isVisible(), true,
            await page.locator(".studio-site-nav").evaluate(element => element.outerHTML));
          assert.equal(await page.getByRole("button", { name: "Settings", exact: true }).isVisible(), true);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          if (!baseline) {
            assert.equal(await page.getByRole("heading", { name: "Automate real tasks within boundaries you set.", exact: true }).count(), 1);
            assert.equal(await page.locator("#studio-home .ct-feature-panel").count(), 0);
            assert.equal(await page.locator("#studio-home .ct-action-card").count(), 3);
            assert.equal(await page.locator("#studio-home").getByRole("button").count(), 3);
            assert.equal(await page.locator("#studio-home").getByText("claims-assistant").count(), 0);
            const heading = await page.locator(".simple-home-introduction h1").evaluate(element => ({
              size: getComputedStyle(element).fontSize, lineHeight: getComputedStyle(element).lineHeight,
            }));
            assert.deepEqual(heading, { size: "20px", lineHeight: "28px" });
            assert.equal(await page.locator("#new-app .ct-action-card-title").evaluate(element => getComputedStyle(element).fontWeight), "400");
            const measured = await page.evaluate(() => {
              const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
              const style = selector => {
                const css = getComputedStyle(document.querySelector(selector));
                return { size: css.fontSize, lineHeight: css.lineHeight, weight: css.fontWeight, color: css.color };
              };
              const intro = rect(".simple-home-introduction"), grid = rect(".simple-home-tasks");
              const cards = [...document.querySelectorAll(".simple-home-task")].map(element => element.getBoundingClientRect().toJSON());
              return {
                intro,
                content: { width: grid.width, x: grid.x },
                title: style(".simple-home-introduction h1"), description: style(".simple-home-introduction p"),
                introductionToGridGap: grid.top - intro.bottom, cards,
                cardCount: cards.length, gap: getComputedStyle(document.querySelector(".simple-home-tasks")).gap,
                columns: new Set(cards.map(card => card.x)).size,
                recentHeadingTop: rect("#recent-apps-title").top,
                recentGap: rect(".simple-home-recent").top - grid.bottom,
                header: rect(".studio-site-nav .ct-header"),
                headerToIntroGap: intro.top - rect(".studio-site-nav .ct-header").bottom,
                logo: rect(".studio-site-nav img"),
                brand: style(".studio-site-nav [aria-label='App home']"),
                brandBounds: rect(".studio-site-nav [aria-label='App home']"),
                brandGap: getComputedStyle(document.querySelector(".studio-site-nav .ct-header-identity")).gap,
              };
            });
            assert.equal(measured.columns, width === 390 ? 1 : 3);
            assert.equal(measured.content.width, width === 390 ? 342 : 840);
            assert.equal(measured.introductionToGridGap, 24);
            assert.equal(measured.recentGap, 24);
            assert.equal(measured.header.height, 32);
            assert.equal(measured.header.top, 8);
            assert.equal(measured.intro.top, 64);
            assert.equal(measured.headerToIntroGap, 24);
            assert.equal(measured.logo.width, 20);
            assert.equal(measured.logo.height, 20);
            assert.equal(measured.brand.size, "12px");
            assert.equal(measured.brand.lineHeight, "20px");
            assert.equal(measured.brand.weight, "400");
            assert.equal(measured.brandBounds.height, 28);
            assert.equal(measured.brandGap, "8px");
            assert.ok(measured.cards.every(card => card.height >= 88));
            geometry.push({ engine, tone, width, state: "not-loaded", ...measured });
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
            await page.locator("#studio-home").evaluate(element => { element.style.width = "648px"; });
            assert.equal(await page.locator(".simple-home-tasks").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length), 2,
              "A 600px content container uses two columns independently of the host viewport");
            await page.locator("#studio-home").evaluate(element => { element.style.removeProperty("width"); });
            assert.equal(await page.locator("#new-app").evaluate(element => getComputedStyle(element).outlineStyle), "solid");
            await page.keyboard.press("Tab");
            assert.equal(await page.locator("#open-app").evaluate(element => element === document.activeElement), true);
            await page.keyboard.press("Tab");
            assert.equal(await page.locator("#assemble-app").evaluate(element => element === document.activeElement), true);
            await page.keyboard.press("Enter");
            await page.getByRole("heading", { name: "Assemble existing projects", exact: true }).waitFor();
            await page.locator("#top-back").click();
            await page.locator("#open-app").click();
            await page.getByText("No existing runnable Unity apps were found", { exact: false }).waitFor();
            await page.locator("#top-back").click();
            await page.getByText("No recently viewed apps were found.", { exact: true }).waitFor();
            assert.equal(await page.locator("[data-recent-app]").count(), 0);
            recentBoundaries.push({ engine, tone, width, inventoryCount: 0, visiblePaths: [] });
            if (output) {
              const label = `empty-${engine}-${tone}-${width}`;
              await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
              captures.push({ label, synthetic: true, screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
            }
            sourceMode = "populated";
            for (const count of width === 390 && tone === "light" ? [1, 5, 7] : [7]) {
              recentCount = count;
              await page.locator("#open-app").click();
              await page.locator("[data-existing-app]").first().waitFor();
              assert.equal(await page.locator("[data-existing-app]").count(), count, "Open retains the full source inventory");
              await page.locator("#top-back").click();
              await page.locator(".simple-home-recent .ct-work-item").nth(Math.min(count, 5) - 1).waitFor();
              assert.deepEqual(await page.locator("[data-recent-app]").evaluateAll(elements => elements.map(element => element.dataset.recentApp)),
                recentInventory.slice(0, Math.min(count, 5)).map(app => app.path), "Home preserves newest-first order and caps only its own rows");
              recentBoundaries.push({ engine, tone, width, inventoryCount: count,
                visiblePaths: await page.locator("[data-recent-app]").evaluateAll(elements => elements.map(element => element.dataset.recentApp)) });
              assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            }
            if (output) {
              const label = `populated-${engine}-${tone}-${width}`;
              await page.evaluate(() => { document.activeElement?.blur(); document.scrollingElement.scrollTop = 0; });
              await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
              captures.push({ label, synthetic: true, screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
            }
            await page.route("**/app-map?**", route => route.fulfill({ contentType: "text/html", body: "<h1>Synthetic existing app workspace</h1>" }));
            await page.locator("[data-recent-app]").last().focus();
            await page.keyboard.press("Enter");
            await page.getByRole("heading", { name: "Synthetic existing app workspace" }).waitFor();
            assert.equal(new URL(page.url()).searchParams.get("root"), "projects/document-helper");
            await page.unroute("**/app-map?**");
            sourceMode = "ready";
            await page.goto(origin);
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
          window.originalHeader = document.querySelector(".studio-site-nav .ct-header");
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
        assert.deepEqual(await page.locator("#new-app").evaluate(element => ({
          foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor,
        })), { foreground: "rgb(17, 83, 121)", background: "rgb(244, 249, 253)" });
        const typography = await page.locator("#studio-home > .ct-provider").evaluate(element => ({
          family: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize,
        }));
        assert.match(typography.family, /Arial/);
        assert.equal(typography.size, "16px");
        assert.equal(await page.evaluate(() => window.originalHome === document.querySelector("#studio-home .ct-provider")
          && window.originalCreate === document.activeElement
          && window.originalHeader === document.querySelector(".studio-site-nav .ct-header")), true, "Late host delivery must preserve roots and focus");
        if (output) {
          const label = `after-${engine}-synthetic-host-tokens`;
          await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
          captures.push({ label, synthetic: true, screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
        }
        await page.getByRole("button", { name: "Settings", exact: true }).focus();
        await page.keyboard.press("Enter");
        await page.getByRole("dialog", { name: "Settings", exact: true }).waitFor();
        await page.keyboard.press("Escape");
        assert.equal(await page.getByRole("button", { name: "Settings", exact: true }).evaluate(element => element === document.activeElement), true);
        const docs = page.getByRole("link", { name: "Docs", exact: true });
        assert.equal(await docs.getAttribute("href"), "https://github.com/coreai-microsoft/azure-app-platform/tree/main/canvases/azure-app-platform#readme");
        await page.context().route("https://github.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Synthetic Docs destination</h1>" }));
        const popupReady = page.waitForEvent("popup");
        await docs.focus();
        await page.keyboard.press("Enter");
        const popup = await popupReady;
        await popup.getByRole("heading", { name: "Synthetic Docs destination" }).waitFor();
        await popup.close();
        await page.context().unroute("https://github.com/**");
        sourceMode = "pending";
        await page.goto(origin);
        await page.locator("#open-app").click();
        await sourcePending;
        await page.waitForFunction(() => document.querySelector("#open-app")?.disabled);
        assert.equal(await page.locator("#new-app").isDisabled(), true);
        assert.equal(await page.locator("#assemble-app").isDisabled(), true);
        assert.match(await page.locator("#status").textContent(), /Finding source projects/);
        await page.getByRole("button", { name: "App home", exact: true }).focus();
        await page.keyboard.press("Enter");
        assert.equal(await page.locator("#open-app").isDisabled(), true, "Home cannot abandon an in-flight workflow");
        assert.match(await page.locator("#status").textContent(), /Finding source projects/);
        if (output) await page.screenshot({ path: join(output, `busy-${engine}.png`), fullPage: true });
        await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("Finding"));
        sourceMode = "error";
        releaseSources();
        await page.locator("#status").filter({ hasText: "Source catalog unavailable." }).waitFor();
        assert.equal(await page.locator("#new-app").isEnabled(), true);
        await page.locator("#assemble-app").click();
        await page.locator("#top-back").click();
        await page.getByText("Recent apps could not be refreshed. Use Open an app to retry.", { exact: true }).waitFor();
        if (output) await page.screenshot({ path: join(output, `failed-${engine}.png`), fullPage: true });
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
      headerSha256: hash(await readFile(join(payload, "studio-header.mjs"))),
      emittedHtmlSha256: hash(renderStudioHtml("home-proof", "fixture", {
        theme: "light", intro: false, presentationProfile: "github-app",
      })),
      toolkit: provenance, browsers, geometry, recentBoundaries, captures,
    }, null, 2) + "\n");
  } finally {
    server?.closeAllConnections();
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
