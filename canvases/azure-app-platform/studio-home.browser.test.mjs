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
import { inspectSpotArtwork } from "./spot-artwork-test-fixture.mjs";
import { openStudioSettings } from "./workspace-navigation-test-helpers.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let playwright;
try { playwright = requireWeb("playwright"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

for (const engine of ["chromium", "webkit"]) {
  test(`homepage SVG line artwork remains passive, portable and visible in ${engine}`, {
    skip: !playwright && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const { serveStudioAsset } = await import("./studio-assets.mjs");
    const server = createServer((request, response) => {
      void (async () => {
        if (await serveStudioAsset(request, response, new URL(request.url, "http://localhost").pathname)) return;
        response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>Artwork verification</title>");
      })().catch(error => response.writeHead(500).end(error.message));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    let browser;
    try {
      browser = await playwright[engine].launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const lightMaterials = new Map();
      for (const name of ["create", "open", "assemble"]) for (const theme of ["light", "dark"]) {
        const suffix = theme === "dark" ? "-dark" : "";
        const svg = await readFile(new URL(`./assets/homepage-${name}${suffix}.svg`, import.meta.url), "utf8");
        assert.doesNotMatch(svg, /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|currentColor|var\(/i);
        const response = await fetch(`http://127.0.0.1:${server.address().port}/assets/homepage-${name}${suffix}.svg`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("Content-Type"), "image/svg+xml");
        assert.equal(await response.text(), svg);
        const result = await inspectSpotArtwork(page, svg);
        if (theme === "light") lightMaterials.set(name, result);
        else {
          const light = lightMaterials.get(name);
          assert.deepEqual(result.geometry, light.geometry, `${name} theme pair must preserve geometry`);
        }
      }
    } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  });
}

for (const engine of ["chromium", "webkit"]) {
  test(`Home boundary copy preserves compact journeys and recent actions in ${engine}`, {
    skip: !playwright && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const { renderStudioHtml } = await import("./studio-ui.mjs");
    const { serveStudioAsset } = await import("./studio-assets.mjs");
    let theme = "light", presentationProfile = "standalone";
    const server = createServer((request, response) => {
      void (async () => {
        const path = new URL(request.url, "http://localhost").pathname;
        if (await serveStudioAsset(request, response, path)) return;
        if (path !== "/") { response.writeHead(404).end(); return; }
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(renderStudioHtml("home-copy-test", "fixture", { theme, presentationProfile }));
      })().catch(error => { response.writeHead(500).end(error.message); });
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    let browser;
    try {
      browser = await playwright[engine].launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
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
      for (const profile of ["standalone", "github-app"]) for (const tone of ["light", "dark"]) {
        presentationProfile = profile;
        theme = tone;
        for (const width of [320, 380, 620]) {
          await page.setViewportSize({ width, height: 800 });
          await page.goto(origin);
          await page.locator("[data-recent-app]").nth(4).waitFor();
          assert.equal(await page.locator(".simple-home-introduction h1").innerText(), "What would you like to do?");
          assert.equal(await page.locator(".simple-home-introduction p").innerText(), "Start a new app, bring existing projects together, or pick up where you left off.");
          assert.equal(await page.locator("#studio-home .simple-home-task").count(), 3);
          assert.equal(await page.locator("#studio-home .ct-action-card-arrow").count(), 0);
          assert.equal(await page.locator("[data-recent-app]").count(), 5);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          assert.equal(await page.locator(".simple-home-task:focus").count(), 0, "Home must not automatically focus a starting point");
          for (let step = 0; step < 8; step++) {
            if (await page.locator("#new-app").evaluate(element => element === document.activeElement)) break;
            await page.keyboard.press("Tab");
          }
          assert.equal(await page.locator("#new-app").evaluate(element => element === document.activeElement), true, "The first starting point remains keyboard reachable");
          assert.equal(await page.locator("#new-app").evaluate(element => getComputedStyle(element).outlineStyle), "solid", "Keyboard focus remains visible");
          await page.keyboard.press("Enter");
          await page.locator('input[name="template"]').first().waitFor();
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
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await page.locator("[data-recent-app]").first().focus();
      await page.keyboard.press("Enter");
      await page.getByRole("heading", { name: "Synthetic existing app workspace", exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get("root"), apps[0].path);
      assert.deepEqual(mutations, []);
      assert.deepEqual(errors, []);
    } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
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
      browser = await playwright[engine].launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
      browsers.push({ engine, version: await browser.version() });
      const page = await browser.newPage({ reducedMotion: "reduce" });
      page.setDefaultTimeout(5000);
      const errors = [], requests = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => requests.push(request.url()));
      const expectArtwork = async tone => {
        const visible = page.locator(".simple-home-art [data-home-art-theme]:visible");
        assert.equal(await visible.count(), 3, "Exactly one material is visible per card");
        assert.deepEqual(await visible.evaluateAll(images => images.map(image => ({
          theme: image.dataset.homeArtTheme, decorativeSvg: image.querySelector("svg").getAttribute("aria-hidden"),
          decorative: image.closest(".simple-home-art").getAttribute("aria-hidden"),
        }))), ["create", "open", "assemble"].map(name => ({
          theme: tone, decorativeSvg: "true", decorative: "true",
        })));
      };
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
          data = { roots: [], apps: sourceMode === "long" ? [{
            ...recentInventory[0], name: "A long app name for a compact canvas ".repeat(5),
            path: "projects/" + "long-unbroken-project-path-".repeat(12),
          }] : sourceMode === "populated" ? recentInventory.slice(0, recentCount) : [],
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
        await page.emulateMedia({ colorScheme: tone === "light" ? "dark" : "light" });
        for (const width of [390, 900, 1440]) {
          await page.setViewportSize({ width, height: width === 1440 ? 1100 : 1000 });
          const beforeRequests = requests.length;
          await page.goto(origin);
          await page.locator("#new-app:not(:disabled)").waitFor();
          await page.waitForFunction(() => [...document.images].every(image => image.complete));
          if (!baseline) await expectArtwork(tone);
          assert.equal(requests.slice(beforeRequests).filter(url => new URL(url).pathname === "/api/sources").length, 1,
            "Home preserves its existing local source refresh");
          assert.ok(!requests.slice(beforeRequests).some(url => /\/api\/discovery/.test(url)),
            "Home must not discover Azure resources");
          assert.equal(await page.locator(".studio-welcome-brand").count(), 0);
          assert.equal(await page.getByRole("button", { name: "App home", exact: true }).isVisible(), true,
            await page.locator(".studio-site-nav").evaluate(element => element.outerHTML));
          if (baseline) {
            assert.equal(await page.getByRole("link", { name: "Docs", exact: true }).isVisible(), true);
            assert.equal(await page.getByRole("button", { name: "Settings", exact: true }).isVisible(), true);
          } else {
            assert.equal(await page.getByRole("button", { name: "More options", exact: true }).isVisible(), true);
            assert.equal(await page.getByRole("menuitem", { name: "Docs", exact: true }).count(), 0);
          }
          if (!baseline) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
          if (!baseline) {
            assert.equal(await page.getByRole("heading", { name: "What would you like to do?", exact: true }).count(), 1);
            assert.equal(await page.locator("#studio-home .ct-feature-panel").count(), 0);
            assert.equal(await page.locator("#studio-home .simple-home-task").count(), 3);
            assert.equal(await page.locator("#studio-home").getByRole("button").count(), 5);
            assert.equal(await page.locator("#studio-home").getByText("claims-assistant").count(), 0);
            const heading = await page.locator(".simple-home-introduction h1").evaluate(element => ({
              size: getComputedStyle(element).fontSize, lineHeight: getComputedStyle(element).lineHeight,
            }));
            assert.deepEqual(heading, { size: "20px", lineHeight: "28px" });
            assert.equal(await page.locator("#new-app .simple-home-task-title").evaluate(element => getComputedStyle(element).fontWeight), "600");
            assert.equal(await page.locator(".simple-home-art svg").count(), 6);
            assert.equal(await page.locator(".simple-home-art svg").evaluateAll(images => images.every(image =>
              image.getAttribute("aria-hidden") === "true" && image.getAttribute("focusable") === "false"
              && image.querySelector("rect, path, circle"))), true);
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
            assert.equal(measured.columns, width === 390 ? 1 : 2);
            const [first, second, third] = measured.cards;
            if (measured.columns === 2) {
              assert.equal(first.width, measured.content.width, "An odd card count gives the first card a full row");
              assert.equal(first.x, second.x);
              assert.equal(second.y, third.y);
              assert.equal(second.width, third.width);
              assert.equal(second.y - first.bottom, 12);
              assert.equal(third.x - second.right, 12);
            }
            assert.equal(await page.locator(".simple-home-task").evaluateAll(cards => cards.every(card => {
              const art = card.querySelector(".simple-home-art").getBoundingClientRect();
              const copy = card.querySelector(".simple-home-task-copy").getBoundingClientRect();
              return art.width === 84 && art.height === 74 && copy.left - art.right === 12;
            })), true, "Artwork stays beside the text at every width");
            const availableWidth = await page.evaluate(() => document.documentElement.clientWidth);
            assert.equal(measured.content.width, Math.min(888, availableWidth) - (width === 390 ? 32 : 48));
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
            geometry.push({ engine, tone, width, state: "empty", ...measured });
          }
          const label = `${baseline ? "before" : "after"}-${engine}-${tone}-${width}`;
          if (output) {
            const html = await page.content();
            await writeFile(join(output, `${label}.html`), html);
            await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
            captures.push({ label, synthetic: true, htmlSha256: hash(html), screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
          }
          if (baseline && output) {
            sourceMode = "populated";
            await page.locator("#open-app").click();
            await page.locator("[data-existing-app]").nth(6).waitFor();
            await page.locator("#top-back").click();
            await page.locator("[data-recent-app]").nth(4).waitFor();
            await page.evaluate(() => { document.activeElement?.blur(); document.scrollingElement.scrollTop = 0; });
            for (const state of ["populated", "hover"]) {
              if (state === "hover") await page.locator(".simple-home-recent .app-list-row").first().hover();
              const label = `before-${state}-${engine}-${tone}-${width}`;
              await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
              captures.push({ label, synthetic: true, screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
            }
            sourceMode = "ready";
          }
          if (!baseline) {
            await page.keyboard.press("Tab");
            await page.locator("#new-app").focus();
            for (const [outerWidth, columns] of [[648, 1], [687, 1], [688, 2]]) {
              await page.locator("#studio-home").evaluate((element, width) => { element.style.width = width + "px"; }, outerWidth);
              assert.equal(await page.locator(".simple-home-tasks").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length), columns,
                "The 640px content breakpoint is independent of host viewport width");
              const countLayouts = await page.locator(".simple-home-tasks").evaluate(grid => {
                const fixture = grid.cloneNode(false);
                fixture.setAttribute("aria-hidden", "true");
                fixture.inert = true;
                grid.after(fixture);
                try {
                  return [1, 2, 3, 4, 5].map(count => {
                    fixture.replaceChildren(...Array.from({ length: count }, () => {
                      const card = grid.firstElementChild.cloneNode(true);
                      card.removeAttribute("id");
                      return card;
                    }));
                    return { count, width: fixture.getBoundingClientRect().width,
                      cards: [...fixture.children].map(card => card.getBoundingClientRect().toJSON()) };
                  });
                } finally { fixture.remove(); }
              });
              for (const layout of countLayouts) {
                const fullFirstRow = columns === 1 || layout.count % 2 === 1;
                assert.equal(layout.cards[0].width, fullFirstRow ? layout.width : (layout.width - 12) / 2,
                  `${layout.count} cards at ${outerWidth}px use the expected first-row span`);
                for (let index = fullFirstRow ? 1 : 0; index < layout.count; index++) {
                  if (columns === 1) assert.equal(layout.cards[index].width, layout.width);
                  else {
                    assert.equal(layout.cards[index].width, (layout.width - 12) / 2);
                    if ((index - (fullFirstRow ? 1 : 0)) % 2 === 1) {
                      assert.equal(layout.cards[index].y, layout.cards[index - 1].y, "Remaining cards form horizontal pairs");
                    }
                  }
                }
              }
              if (columns === 2) {
                const heights = await page.locator(".simple-home-task").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
                assert.equal(heights[1], heights[2], "Paired cards have equal heights");
              }
            }
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
            await page.getByRole("heading", { name: "Your next app starts here", exact: true }).waitFor();
            assert.equal(await page.getByRole("button", { name: "Create an app", exact: true }).isVisible(), true);
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
              await page.getByText("Finding your apps...", { exact: true }).waitFor({ state: "hidden" });
              await page.locator("[data-existing-app]").first().waitFor();
              assert.equal(await page.locator("[data-existing-app]").count(), count, "Open retains the full source inventory");
              await page.locator("#top-back").click();
              await page.locator(".simple-home-recent .app-list-row").nth(Math.min(count, 5) - 1).waitFor();
              assert.deepEqual(await page.locator("[data-recent-app]").evaluateAll(elements => elements.map(element => element.dataset.recentApp)),
                recentInventory.slice(0, Math.min(count, 5)).map(app => app.path), "Home preserves newest-first order and caps only its own rows");
              recentBoundaries.push({ engine, tone, width, inventoryCount: count,
                visiblePaths: await page.locator("[data-recent-app]").evaluateAll(elements => elements.map(element => element.dataset.recentApp)) });
              assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
            }
            if (output) {
              const label = `after-populated-${engine}-${tone}-${width}`;
              await page.evaluate(() => { document.activeElement?.blur(); document.scrollingElement.scrollTop = 0; });
              await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
              captures.push({ label, synthetic: true, screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
            }
            const beforeSearchRequests = requests.length;
            const search = page.getByRole("searchbox", { name: "Find a recent app" });
            const searchBounds = await search.boundingBox();
            const searchIcon = await page.locator(".simple-home-search-toolbar .ct-filter-search > svg").boundingBox();
            assert.ok(searchIcon.x >= searchBounds.x && searchIcon.y >= searchBounds.y
              && searchIcon.x + searchIcon.width <= searchBounds.x + searchBounds.width
              && searchIcon.y + searchIcon.height <= searchBounds.y + searchBounds.height, "Canonical search icon stays inside the input border");
            const textInset = await search.evaluate(element => {
              const style = getComputedStyle(element);
              return parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
            });
            assert.ok(searchBounds.x + textInset >= searchIcon.x + searchIcon.width + 4, "Placeholder and typed text cannot overlap the search icon");
            await search.fill(" KNOWLEDGE ");
            assert.equal(await page.locator("[data-recent-app]").count(), 1, "Search includes cached entries beyond the first five");
            assert.equal(await page.locator("[data-recent-app]").getAttribute("data-recent-app"), "projects/knowledge-search");
            await search.fill("projects/order-");
            assert.equal(await page.locator("[data-recent-app]").getAttribute("data-recent-app"), "projects/order-tracker");
            await search.fill("No matching app");
            await page.getByText("No recent apps match. Try a different name or path.", { exact: true }).waitFor();
            assert.equal(await page.locator("[data-recent-app]").count(), 0);
            await search.fill("");
            assert.equal(await page.locator("[data-recent-app]").count(), 5);
            const help = page.getByRole("button", { name: "How apps work", exact: true });
            assert.equal(await help.getAttribute("aria-expanded"), "false");
            await help.focus();
            await page.keyboard.press("Enter");
            const isolation = page.getByRole("button", { name: "How is tool execution isolated?", exact: true });
            assert.equal(await isolation.getAttribute("aria-expanded"), "false");
            await isolation.focus();
            await page.keyboard.press("Space");
            await page.getByText("ACA Sandboxes can isolate tool execution from the agent. Local subprocess execution is a simulation, not that isolation boundary.", { exact: true }).waitFor();
            if (output) {
              const label = `after-help-${engine}-${tone}-${width}`;
              await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
              captures.push({ label, synthetic: true, screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
            }
            await help.click();
            await help.click();
            assert.equal(await isolation.getAttribute("aria-expanded"), "true", "Outer disclosure preserves inner choices");
            await help.click();
            assert.equal(requests.length, beforeSearchRequests, "Search and help perform no operations or discovery");
            const row = page.locator(".simple-home-recent .app-list-row").first();
            await row.scrollIntoViewIfNeeded();
            const beforeHover = await row.boundingBox();
            await row.hover();
            assert.deepEqual(await row.boundingBox(), beforeHover, "Compact hover never shifts row geometry");
            assert.equal(await row.evaluate(element => getComputedStyle(element).borderRadius), "0px");
            assert.equal(await row.evaluate(element => getComputedStyle(element).padding), "8px");
            assert.equal(await row.getByRole("button").count(), 1);
            if (output) {
              const label = `after-hover-${engine}-${tone}-${width}`;
              await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
              captures.push({ label, synthetic: true, screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
            }
            await page.locator("[data-recent-app]").first().focus();
            await page.keyboard.press("Tab");
            assert.equal(await row.locator("[data-app-actions]").evaluate(element =>
              element === document.activeElement && getComputedStyle(element).outlineStyle === "solid"), true,
              "The row's separate action menu is keyboard reachable");
            await page.keyboard.press("Tab");
            assert.equal(await page.locator("[data-recent-app]").nth(1).evaluate(element =>
              element === document.activeElement && getComputedStyle(element).outlineStyle === "solid"), true,
              "Opening links retain visible keyboard focus");
            await page.route("**/app-map?**", route => route.fulfill({ contentType: "text/html", body: "<h1>Synthetic existing app workspace</h1>" }));
            await row.locator(".app-list-path").click();
            await page.getByRole("heading", { name: "Synthetic existing app workspace" }).waitFor();
            assert.equal(new URL(page.url()).searchParams.get("root"), "projects/customer-portal", "Name and folder metadata share the opening target");
            await page.goto(origin);
            await page.locator("[data-recent-app]").nth(4).waitFor();
            await page.evaluate(() => new Promise(requestAnimationFrame));
            await page.locator("[data-recent-app]").last().focus();
            await page.keyboard.press("Enter");
            await page.getByRole("heading", { name: "Synthetic existing app workspace" }).waitFor();
            assert.equal(new URL(page.url()).searchParams.get("root"), "projects/document-helper");
            await page.unroute("**/app-map?**");
            sourceMode = "ready";
            await page.goto(origin);
            await page.locator("#new-app").click();
            await page.locator('input[name="template"]').first().waitFor();
            await page.locator("#next").click();
            await page.evaluate(() => new Promise(requestAnimationFrame));
            await page.locator("#agent-instructions").fill("Use verified tool results.");
            await page.locator("#top-back").click();
            await page.locator("#next").click();
            assert.equal(await page.locator("#agent-instructions").inputValue(), "Use verified tool results.", `${engine}/${tone}/${width}: returning preserves the instructions draft`);
            await page.locator("#top-back").click();
            await page.locator("#top-back").click();
            await page.locator("#open-app").click();
            await page.getByRole("heading", { name: "Your next app starts here", exact: true }).waitFor();
            assert.equal(await page.getByRole("button", { name: "Create an app", exact: true }).isVisible(), true);
            await page.locator("#top-back").click();
          }
        }
      }
      if (!baseline) {
        theme = "light";
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
        await expectArtwork("light");
        const readMaterials = () => page.locator(".simple-home-art [data-home-art-theme]:visible svg").evaluateAll(images =>
          images.map(image => ({
            outline: getComputedStyle(image.querySelector('[data-spot-role="outline"]')).stroke,
            accent: getComputedStyle(image.querySelector('[data-spot-role="accent"]')).stroke,
            detail: getComputedStyle(image.querySelector('[data-spot-role="supporting-detail"]')).stroke,
          })));
        const originalMaterials = await readMaterials();
        assert.ok(originalMaterials.every(material => material.accent === "rgb(124, 47, 150)"),
          "Illustration accents use the delivered host accent, not fixed Azure colors");
        await page.evaluate(() => {
          window.originalArtwork = [...document.querySelectorAll(".simple-home-art svg")];
          document.documentElement.style.setProperty("--background-color-default", "rgb(53, 58, 44)");
          document.documentElement.style.setProperty("--background-color-muted", "rgb(65, 70, 53)");
          document.documentElement.style.setProperty("--text-color-default", "rgb(241, 213, 171)");
          document.documentElement.style.setProperty("--text-color-muted", "rgb(197, 173, 137)");
          document.documentElement.style.setProperty("--text-color-accent", "rgb(217, 171, 106)");
        });
        const oliveMaterials = await readMaterials();
        assert.ok(oliveMaterials.every((material, index) => material.accent === "rgb(217, 171, 106)"
          && material.outline !== originalMaterials[index].outline
          && material.outline === "rgb(241, 213, 171)"
          && material.detail === "rgb(197, 173, 137)"),
          "An olive host palette updates distinct outline, supporting and accent roles without a tone change");
        assert.equal(await page.evaluate(() => window.originalArtwork.every((svg, index) =>
          svg === document.querySelectorAll(".simple-home-art svg")[index]) && window.originalCreate === document.activeElement),
        true, "Live palette changes preserve artwork, controls and focus");
        assert.equal(await page.evaluate(() => {
          const ids = [...document.querySelectorAll(".simple-home-art [id]")].map(node => node.id);
          return new Set(ids).size === ids.length;
        }), true);
        for (const [tone, compatibility, expected] of [
          ["dark", "light", "dark"], ["light", "dark", "light"],
          ["invalid", "dark", "dark"], ["invalid", "light", "light"],
          ["invalid", "auto", "light"], [null, null, "light"],
        ]) {
          await page.evaluate(({ tone, compatibility }) => {
            const root = document.documentElement;
            if (tone === null) delete root.dataset.themeTone;
            else root.dataset.themeTone = tone;
            if (compatibility === null) delete root.dataset.colorMode;
            else root.dataset.colorMode = compatibility;
          }, { tone, compatibility });
          await expectArtwork(expected);
          assert.equal(await page.evaluate(() => window.originalHome === document.querySelector("#studio-home .ct-provider")
            && window.originalCreate === document.activeElement), true, "Host theme changes preserve roots and focus");
        }
        await openStudioSettings(page);
        await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("dark");
        await page.waitForFunction(() => document.documentElement.dataset.studioTheme === "dark");
        await expectArtwork("dark");
        await page.evaluate(() => { document.documentElement.dataset.themeTone = "light"; });
        await expectArtwork("light");
        await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("light");
        await page.waitForFunction(() => document.documentElement.dataset.studioTheme === "light");
        await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("dark");
        await page.waitForFunction(() => document.documentElement.dataset.studioTheme === "dark");
        await expectArtwork("light");
        await page.evaluate(() => { delete document.documentElement.dataset.themeTone; });
        await expectArtwork("dark");
        await page.getByRole("button", { name: "Close settings", exact: true }).click();
        if (output) {
          const label = `after-${engine}-synthetic-host-tokens`;
          await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
          captures.push({ label, synthetic: true, screenshotSha256: hash(await readFile(join(output, `${label}.png`))) });
        }
        await page.getByRole("button", { name: "More options", exact: true }).focus();
        await page.keyboard.press("Enter");
        await page.getByRole("menuitem", { name: "Settings", exact: true }).focus();
        await page.keyboard.press("Enter");
        await page.getByRole("dialog", { name: "Settings", exact: true }).waitFor();
        await page.keyboard.press("Escape");
        assert.equal(await page.getByRole("button", { name: "More options", exact: true }).evaluate(element => element === document.activeElement), true);
        await page.keyboard.press("Enter");
        const docs = page.getByRole("menuitem", { name: "Docs", exact: true });
        await page.context().route("https://github.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Synthetic Docs destination</h1>" }));
        const popupReady = page.waitForEvent("popup");
        await docs.focus();
        await page.keyboard.press("Enter");
        const popup = await popupReady;
        await popup.getByRole("heading", { name: "Synthetic Docs destination" }).waitFor();
        assert.equal(popup.url(), "https://github.com/coreai-microsoft/azure-app-platform/tree/main/canvases/azure-app-platform#readme");
        await popup.close();
        await page.context().unroute("https://github.com/**");
        const search = page.getByRole("searchbox", { name: "Find a recent app" });
        await search.fill("Retained search");
        await page.getByRole("button", { name: "How apps work", exact: true }).click();
        await search.focus();
        await page.evaluate(() => { document.documentElement.dataset.themeTone = "light"; });
        await expectArtwork("light");
        assert.equal(await search.inputValue(), "Retained search");
        assert.equal(await search.evaluate(element => element === document.activeElement), true);
        assert.equal(await page.getByRole("button", { name: "How apps work", exact: true }).getAttribute("aria-expanded"), "true");
        await page.evaluate(() => { delete document.documentElement.dataset.themeTone; });
        await expectArtwork("dark");
        await page.evaluate(() => { window.busyHome = document.querySelector("#studio-home .ct-provider"); });
        sourceMode = "pending";
        await page.locator("#open-app").click();
        await sourcePending;
        await page.getByRole("heading", { name: "Open an app", exact: true }).waitFor();
        await page.getByText("Finding your apps...", { exact: true }).waitFor();
        assert.equal(await page.locator(".journey-skeleton").count(), 3, "An empty cached inventory gets a picker skeleton while refreshing");
        await page.getByRole("button", { name: "App home", exact: true }).focus();
        await page.keyboard.press("Enter");
        assert.equal(await page.locator("#open-app").isEnabled(), true, "Read-only discovery does not block Home journeys");
        await page.getByText("Refreshing recent apps...", { exact: true }).waitFor();
        if (output) await page.screenshot({ path: join(output, `busy-${engine}.png`), fullPage: true });
        sourceMode = "error";
        releaseSources();
        await page.getByText("Recent apps could not be refreshed. Showing previously loaded apps. Use Open an app to retry.", { exact: true }).waitFor();
        assert.equal(await page.locator("#new-app").isEnabled(), true);
        assert.equal(await search.isEnabled(), true);
        await page.locator("#assemble-app").click();
        await page.locator("#top-back").click();
        await page.getByText("Recent apps could not be refreshed. Showing previously loaded apps. Use Open an app to retry.", { exact: true }).waitFor();
        if (output) await page.screenshot({ path: join(output, `failed-${engine}.png`), fullPage: true });
        sourceMode = "empty";
        await page.reload();
        await page.locator("#new-app").click();
        await page.locator('input[name="template"]').nth(2).waitFor();
        await page.locator("#next").click();
        await page.locator("#agent-instructions").waitFor();
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
        assert.equal(await page.locator(".simple-home-task:focus").count(), 0, "Intro dismissal must not choose a starting point");
        await page.unroute("**/canvas-ui/base.mjs");
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.route("**/canvas-ui/base.mjs", route => route.abort());
        await page.goto(origin);
        await page.locator("#status").filter({ hasText: "Could not load Canvas controls:" }).waitFor();
        assert.equal(await page.locator("#new-app").count(), 0);
        await page.unroute("**/canvas-ui/base.mjs");
        await page.reload();
        await page.locator("#new-app").waitFor();
        sourceMode = "long";
        for (const tone of ["light", "dark"]) {
          theme = tone;
          for (const width of [320, 900]) {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(origin);
            await page.locator("[data-recent-app]").waitFor();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "Long names and unbroken paths do not overflow");
            const row = await page.locator(".simple-home-recent .app-list-row").boundingBox();
            const title = await page.locator("[data-recent-app]").boundingBox();
            assert.ok(title.x >= row.x && title.x + title.width <= row.x + row.width, "Long titles stay inside the row");
            if (output) await page.screenshot({ path: join(output, `after-long-${engine}-${tone}-${width}.png`), fullPage: true });
          }
        }
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
