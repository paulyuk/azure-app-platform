import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { DEFAULT_EDITOR_SETTINGS } from "./editor-settings.mjs";
import { EMPTY_TEMPLATE } from "./source-catalog.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let playwright;
try { playwright = requireWeb("playwright"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
const baseline = process.env.SHARED_APP_LIST_BASELINE === "1";
const output = process.env.SHARED_APP_LIST_EVIDENCE_DIR;
const rendererDirectory = process.env.SHARED_APP_LIST_RENDERER_DIR || fileURLToPath(new URL("./", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const clock = "2026-11-07T18:00:00Z";
const initialApps = [
  { name: "Document helper", path: "C:\\projects\\customer-portal", lastOpenedAt: "2026-11-07T17:55:00Z" },
  { name: "source", path: "C:\\east\\shared\\source", lastOpenedAt: "2026-11-07T17:00:00Z" },
  { name: "Deals", path: "C:\\projects\\deals", lastOpenedAt: "2026-11-07T17:58:00Z" },
  { name: "Review", path: "C:\\projects\\review", lastOpenedAt: "2026-11-06T18:00:00Z" },
  { name: "Documents", path: "\\\\host\\share\\workspaces\\documents", lastOpenedAt: "2026-11-05T18:00:00Z" },
  { name: "Sixth recent app", path: "C:\\projects\\sixth-app", lastOpenedAt: "2026-11-04T18:00:00Z" },
  { name: "source", path: "D:\\west\\shared\\source", lastOpenedAt: null },
  { name: "Never opened", path: "C:\\projects\\unopened", lastOpenedAt: "invalid" },
].map(app => ({ ...app, capabilityIds: [] }));

async function fixture(engine) {
  const { renderStudioHtml } = await import(pathToFileURL(join(rendererDirectory, "studio-ui.mjs")));
  const { serveStudioAsset } = await import(pathToFileURL(join(rendererDirectory, "studio-assets.mjs")));
  const state = { theme: "light", apps: structuredClone(initialApps), failSources: false, failRename: false, failDelete: false,
    deleteDelay: null, failRefreshAfterDelete: false };
  const errors = [], mutations = [], requests = [];
  const html = () => renderStudioHtml("shared-app-list-test", "fixture", {
    theme: state.theme, presentationProfile: "github-app",
  });
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url, "http://localhost").pathname;
      if (await serveStudioAsset(request, response, path)) return;
      if (path !== "/") { response.writeHead(404).end(); return; }
      response.writeHead(200, { "Content-Type": "text/html" }).end(html());
    })().catch(error => response.writeHead(500).end(error.message));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await playwright[engine].launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    const page = await browser.newPage({ reducedMotion: "reduce", locale: "en-US", timezoneId: "UTC" });
    page.setDefaultTimeout(5000);
    await page.addInitScript(clock => {
      window.appListNow = Date.parse(clock);
      Date.now = () => window.appListNow;
      window.minuteTimers = new Map();
      const start = window.setInterval.bind(window), stop = window.clearInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => {
        const timer = start(callback, delay, ...args);
        if (delay === 60000) window.minuteTimers.set(timer, () => callback(...args));
        return timer;
      };
      window.clearInterval = timer => { window.minuteTimers.delete(timer); stop(timer); };
      window.tickAppListMinute = () => {
        window.appListNow += 60000;
        for (const tick of window.minuteTimers.values()) tick();
      };
      window.copiedPaths = [];
      window.failCopy = false;
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: async path => {
          if (window.failCopy) throw new Error("Clipboard permission denied.");
          window.copiedPaths.push(path);
        },
      } });
    }, clock);
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      if (route.request().method() === "POST") mutations.push({ path, body: route.request().postDataJSON() });
      if (path === "/api/delete-app") {
        if (state.deleteDelay) await state.deleteDelay;
        if (state.failDelete) return route.fulfill({ status: 409, json: { error: "Worktree is in use." } });
        state.apps = state.apps.filter(app => app.path !== route.request().postDataJSON().root);
        if (state.failRefreshAfterDelete) state.failSources = true;
        return route.fulfill({ json: {} });
      }
      if (path === "/api/rename-app") {
        if (state.failRename) return route.fulfill({ status: 409, json: { error: "App is busy." } });
        const { root, name } = route.request().postDataJSON();
        state.apps = state.apps.map(app => app.path === root ? { ...app, name } : app);
        return route.fulfill({ json: { name } });
      }
      if (path === "/api/sources" && state.failSources) {
        return route.fulfill({ status: 503, json: { error: "Source catalog unavailable." } });
      }
      const json = path === "/api/sources" ? { roots: [], apps: state.apps, templates: [EMPTY_TEMPLATE] }
        : path === "/api/editor-settings" ? DEFAULT_EDITOR_SETTINGS
          : path === "/api/preferences" ? { theme: state.theme } : null;
      if (!json) { errors.push("Unexpected app-list request: " + path); return route.abort("failed"); }
      return route.fulfill({ json });
    });
    const origin = "http://127.0.0.1:" + server.address().port;
    return {
      page, browser, state, errors, mutations, requests, html,
      async open(surface) {
        await page.goto(origin);
        await page.locator("[data-recent-app]").nth(4).waitFor();
        if (surface === "open") {
          await page.locator("#open-app").click();
          await page.locator("[data-existing-app]").nth(initialApps.length - 1).waitFor();
        }
      },
      async close() {
        await browser.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      },
    };
  } catch (error) {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    throw error;
  }
}

async function rows(page) {
  return page.locator(".app-list-row").evaluateAll(elements => elements.map(row => {
    const link = row.querySelector(".app-list-target"), name = row.querySelector(".app-list-name");
    const metadata = row.querySelector(".app-list-metadata"), time = row.querySelector("time");
    const menu = row.querySelector("[data-app-actions]");
    const box = row.getBoundingClientRect(), action = menu.getBoundingClientRect(), target = link.getBoundingClientRect();
    const style = element => {
      const css = getComputedStyle(element);
      return Object.fromEntries(["fontFamily", "fontSize", "fontWeight", "lineHeight", "color", "gap", "padding",
        "borderWidth", "borderRadius", "backgroundColor"].map(key => [key, css[key]]));
    };
    return {
      name: name.textContent, accessibleName: link.getAttribute("aria-label"), href: link.getAttribute("href"),
      path: row.querySelector(".app-list-path").textContent, metadata: metadata.textContent,
      opened: time?.textContent || "", timestamp: time?.dateTime || "", absoluteTime: time?.title || "",
      menuLabel: menu.getAttribute("aria-label"),
      styles: { row: style(row), link: style(link), name: style(name), metadata: style(metadata), menu: style(menu) },
      geometry: { height: box.height, leftInset: target.left - box.left, rightInset: box.right - action.right,
        menuWidth: action.width, menuHeight: action.height,
        menuCenterOffset: Math.abs(box.top + box.height / 2 - action.top - action.height / 2) },
    };
  }));
}

for (const engine of ["chromium", "webkit"]) {
  test(`Home and Open share compact app row geometry, identity, tokens and keyboard actions in ${engine}`, {
    skip: !playwright && "Install src/web dependencies to run browser coverage.",
    timeout: 120000,
  }, async () => {
    const f = await fixture(engine), captures = [];
    const moduleHashes = {};
    for (const name of ["studio-ui.mjs", "studio-home.mjs", "studio-open-apps.mjs", ...(baseline ? [] : ["studio-app-list.mjs"])]) {
      moduleHashes[name] = hash(await readFile(join(rendererDirectory, name)));
    }
    async function capture(surface, width, state = "default") {
      if (!output) return;
      await mkdir(output, { recursive: true });
      const file = `${baseline ? "before" : "after"}-${engine}-${f.state.theme}-${width}-${surface}${state === "default" ? "" : "-" + state}.png`;
      await f.page.screenshot({ path: join(output, file) });
      captures.push({ file, surface, state, theme: f.state.theme, viewport: { width, height: 1200 },
        screenshotSha256: hash(await readFile(join(output, file))), renderedHtmlSha256: hash(f.html()) });
    }
    try {
      const { page } = f;
      for (const tone of ["light", "dark"]) for (const width of [380, 620]) {
        f.state.theme = tone;
        await page.setViewportSize({ width, height: 1200 });
        const snapshots = {};
        for (const surface of ["home", "open"]) {
          await f.open(surface);
          await page.mouse.move(0, 0);
          await page.evaluate(() => { document.activeElement?.blur(); document.scrollingElement.scrollTop = 0; });
          await page.evaluate(() => document.fonts.ready);
          await capture(surface, width);
          if (baseline) continue;
          snapshots[surface] = await rows(page);
          assert.deepEqual(snapshots[surface].map(row => row.path),
            ["customer-portal", "source", "deals", "review", "documents", "sixth-app", "source", "unopened"]
              .slice(0, surface === "home" ? 5 : initialApps.length),
          "Only the project folder is visible, even when another app has the same folder name");
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
          assert.ok(snapshots[surface].every(row => row.geometry.height <= 72 && row.geometry.leftInset === 8
            && row.geometry.rightInset === 8 && row.geometry.menuCenterOffset <= 1));
          const itemAttribute = surface === "home" ? "data-recent-app" : "data-existing-app";
          assert.deepEqual(await page.locator(`[${itemAttribute}]`).evaluateAll((items, attribute) => items.map(item => item.getAttribute(attribute)), itemAttribute),
            initialApps.slice(0, surface === "home" ? 5 : initialApps.length).map(app => app.path));
          const link = page.locator(`[${itemAttribute}]`).nth(1);
          await page.keyboard.press("Tab");
          await link.focus();
          assert.equal(await link.evaluate(node => node === document.activeElement && getComputedStyle(node).outlineStyle === "solid"), true);
          const tooltip = page.getByRole("tooltip");
          await tooltip.waitFor();
          assert.equal(await tooltip.innerText(), initialApps[1].path);
          assert.equal(await tooltip.evaluate(node => getComputedStyle(node).borderWidth), "0px");
          assert.ok(await link.getAttribute("aria-describedby"));
          if (width === 380) await capture(surface, width, "tooltip");
          await page.keyboard.press("Escape");
          await tooltip.waitFor({ state: "hidden" });
          assert.equal(await link.evaluate(node => node === document.activeElement), true);
          await page.keyboard.press("Tab");
          const menu = page.locator("[data-app-actions]").nth(1);
          assert.equal(await menu.evaluate(node => node === document.activeElement), true);
          await page.keyboard.press("Enter");
          await page.getByRole("menuitem", { name: "Delete app", exact: true }).waitFor();
          assert.deepEqual(await page.getByRole("menuitem").allTextContents(), ["Copy full path", "Rename app", "Delete app"]);
          if (width === 380) await capture(surface, width, "menu");
          await page.keyboard.press("Escape");
          assert.equal(await menu.evaluate(node => node === document.activeElement), true);
          await page.keyboard.press("Tab");
          assert.equal(await page.locator(`[${itemAttribute}]`).nth(2).evaluate(node =>
            node === document.activeElement && getComputedStyle(node).outlineStyle === "solid"), true,
          "Opening links are tab stops in both engines, including WebKit");
          const search = page.getByRole("searchbox", { name: surface === "home" ? "Find a recent app" : "Search apps" });
          await search.fill("  EAST  ");
          assert.equal(await page.locator(`[${itemAttribute}]`).count(), 1);
          assert.equal(await page.locator(".app-list-path").innerText(), "source");
          await search.fill("source");
          const matchingApps = surface === "home" ? 1 : 2;
          assert.equal(await page.locator(`[${itemAttribute}]`).count(), matchingApps);
          assert.deepEqual(await page.locator(".app-list-path").allTextContents(), Array(matchingApps).fill("source"),
            "Duplicate project folders stay compact before and after filtering");
          await search.fill("C:\\east\\shared\\source");
          assert.equal(await page.locator(`[${itemAttribute}]`).count(), 1, "Search still uses the complete path");
          await search.fill("sixth-app");
          assert.equal(await page.locator(`[${itemAttribute}]`).count(), 1, "Home filters before applying its cap");
          if (surface === "home") {
            for (const query of ["west", "Never opened"]) {
              await search.fill(query);
              assert.equal(await page.locator("[data-recent-app]").count(), 0, "Unopened and invalid-time apps are not recent");
            }
          }
        }
        if (!baseline) {
          assert.deepEqual(snapshots.home, snapshots.open.slice(0, 5), "Same apps have identical metadata, tokens, menu geometry and labels");
          assert.equal(snapshots.open[6].opened, "");
          assert.equal(snapshots.open[7].opened, "");
          assert.equal(snapshots.home[0].opened, "\u2022 opened 5m ago");
        }
      }
      if (!baseline) {
        await f.open("home");
        assert.equal(await page.evaluate(() => window.minuteTimers.size), 1);
        await page.evaluate(() => window.tickAppListMinute());
        await page.locator(".app-list-opened").first().filter({ hasText: "opened 6m ago" }).waitFor();
        await page.locator("#open-app").click();
        await page.locator("[data-existing-app]").nth(7).waitFor();
        assert.equal(await page.evaluate(() => window.minuteTimers.size), 1, "Changing lists disposes the old relative clock");
        await page.evaluate(() => window.tickAppListMinute());
        await page.locator(".app-list-opened").first().filter({ hasText: "opened 7m ago" }).waitFor();
        await page.locator("#top-back").click();
        await page.locator("[data-recent-app]").nth(4).waitFor();
        assert.equal(await page.evaluate(() => window.minuteTimers.size), 1);
        await page.locator("#new-app").click();
        await page.locator('input[name="template"]').waitFor();
        assert.equal(await page.evaluate(() => window.minuteTimers.size), 0);
        await page.locator("#top-back").click();
        await page.locator("[data-recent-app]").nth(4).waitFor();
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
        assert.equal(await page.evaluate(() => window.minuteTimers.size), 0, "Permanent page disposal clears the list clock");
      }
      assert.deepEqual(f.errors, []);
      assert.deepEqual(f.mutations, []);
      if (output) await writeFile(join(output, `${baseline ? "before" : "after"}-${engine}-receipt.json`), JSON.stringify({
        build: process.env.SHARED_APP_LIST_BUILD_LABEL || "working-tree", engine, browserVersion: f.browser.version(),
        rendererDirectory, moduleHashes, fixture: initialApps, fixtureSha256: hash(JSON.stringify(initialApps)),
        clock, timezone: "UTC", locale: "en-US", deviceScaleFactor: 1, presentationProfile: "github-app", captures,
      }, null, 2) + "\n");
    } finally { await f.close(); }
  });

  test(`Shared Home and Open actions preserve search, focus, errors and deletion boundaries in ${engine}`, {
    skip: baseline ? "Baseline captures only." : !playwright && "Install src/web dependencies to run browser coverage.",
    timeout: 120000,
  }, async () => {
    const f = await fixture(engine);
    try {
      const { page, state } = f;
      await page.setViewportSize({ width: 380, height: 900 });
      for (const surface of ["home", "open"]) {
        state.apps = structuredClone(initialApps);
        await f.open(surface);
        const search = page.getByRole("searchbox", { name: surface === "home" ? "Find a recent app" : "Search apps" });
        const view = surface === "home" ? "#studio-home" : "#studio-open-apps";
        await search.fill("customer-portal");
        await page.evaluate(view => {
          window.originalAppListView = document.querySelector(view + " .ct-provider");
          window.originalAppListSearch = document.querySelector(view + ' input[type="search"]');
        }, view);
        const menu = page.locator("[data-app-actions]");
        const action = async name => { await menu.click(); await page.getByRole("menuitem", { name, exact: true }).click(); };
        const intact = async () => {
          assert.equal(await page.locator(view).count(), 1, "Actions must not change the current screen");
          assert.equal(await search.inputValue(), "customer-portal");
          assert.equal(await page.evaluate(view => window.originalAppListView === document.querySelector(view + " .ct-provider")
            && window.originalAppListSearch === document.querySelector(view + ' input[type="search"]'), view), true,
          "Actions update the existing root and search node");
        };
        await action("Copy full path");
        await page.getByText("Full path copied.", { exact: true }).waitFor();
        assert.deepEqual(await page.evaluate(() => window.copiedPaths), [initialApps[0].path]);
        await page.evaluate(() => { window.failCopy = true; });
        await action("Copy full path");
        await page.getByText("Could not copy full path: Clipboard permission denied.", { exact: true }).waitFor();
        assert.deepEqual(await page.evaluate(() => window.copiedPaths), [initialApps[0].path]);
        await page.evaluate(() => { window.failCopy = false; });
        await intact();
        const renameCount = f.mutations.filter(item => item.path === "/api/rename-app").length;
        await action("Rename app");
        const dialog = page.getByRole("dialog", { name: "Rename app", exact: true });
        const input = dialog.getByRole("textbox", { name: "App name", exact: true });
        assert.equal(await input.inputValue(), initialApps[0].name);
        await input.fill("Unsaved draft");
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.equal(f.mutations.filter(item => item.path === "/api/rename-app").length, renameCount);
        assert.equal(await menu.evaluate(node => node === document.activeElement), true);
        await action("Rename app");
        await input.fill("Customer workspace");
        state.failRename = true;
        await dialog.getByRole("button", { name: "Save", exact: true }).click();
        await dialog.getByRole("alert").getByText("Could not rename app: App is busy.", { exact: true }).waitFor();
        assert.equal(await input.inputValue(), "Customer workspace");
        assert.equal(await page.locator(".app-list-name").innerText(), initialApps[0].name);
        state.failRename = false;
        await dialog.getByRole("button", { name: "Save", exact: true }).click();
        await page.getByRole("link", { name: "Customer workspace", exact: true }).waitFor();
        await page.waitForFunction(() => document.activeElement?.hasAttribute("data-app-actions"));
        await intact();
        const deletesBeforeCancel = f.mutations.filter(item => item.path === "/api/delete-app").length;
        await action("Delete app");
        await page.getByRole("alertdialog").waitFor();
        await page.getByText("No Azure resources, repositories, or cloud deployments will be deleted.", { exact: true }).waitFor();
        await page.getByRole("button", { name: "No, keep app", exact: true }).click();
        assert.equal(f.mutations.filter(item => item.path === "/api/delete-app").length, deletesBeforeCancel);
        assert.equal(await menu.evaluate(node => node === document.activeElement), true);
        await action("Delete app");
        state.failDelete = true;
        let release;
        state.deleteDelay = new Promise(resolve => { release = resolve; });
        await page.getByRole("button", { name: "Yes, delete worktree", exact: true }).click();
        await page.waitForFunction(() => document.querySelector(".app-list-target")?.getAttribute("aria-disabled") === "true");
        assert.equal(await search.isDisabled(), true);
        assert.equal(await menu.isDisabled(), true);
        assert.equal(await page.locator(".app-list-target").evaluate(link =>
          !link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))), true, "Busy opening targets cannot navigate");
        release();
        state.deleteDelay = null;
        await page.getByText("Worktree is in use.", { exact: true }).waitFor();
        assert.equal(await search.isEnabled(), true);
        assert.equal(await page.locator(".app-list-row").count(), 1);
        await intact();
        state.failDelete = false;
        await action("Delete app");
        await page.getByRole("button", { name: "Yes, delete worktree", exact: true }).click();
        await page.getByText("App worktree deleted. Azure resources were not changed.", { exact: true }).waitFor();
        await page.getByText(surface === "home" ? "No recent apps match. Try a different name or path." : "No apps match your search.", { exact: true }).waitFor();
        await page.waitForFunction(() => window.originalAppListSearch === document.activeElement);
        await intact();
        assert.equal(await page.locator(".app-list-row").count(), 0);
        await search.fill("");
        assert.equal(await page.locator(".app-list-row").count(), surface === "home" ? 5 : initialApps.length - 1);
        assert.equal(await page.locator("[data-app-actions]").evaluateAll(items =>
          items.some(item => item.dataset.appActions === "C:\\projects\\customer-portal")), false);
        const deletes = f.mutations.filter(item => item.path === "/api/delete-app").slice(deletesBeforeCancel);
        assert.deepEqual(deletes.map(item => item.body), Array(2).fill({ root: initialApps[0].path, confirmed: true }));
        assert.deepEqual(f.mutations.filter(item => item.path === "/api/rename-app").slice(renameCount).map(item => item.body),
          Array(2).fill({ root: initialApps[0].path, name: "Customer workspace" }));
      }
      assert.deepEqual(f.errors, []);
      assert.ok(f.mutations.every(item => ["/api/rename-app", "/api/delete-app"].includes(item.path)));
    } finally { await f.close(); }
  });

  test(`List refresh failure never reports success or revives a deleted app, and rename can filter a row away in ${engine}`, {
    skip: baseline ? "Baseline captures only." : !playwright && "Install src/web dependencies to run browser coverage.",
    timeout: 90000,
  }, async () => {
    const f = await fixture(engine);
    try {
      const { page, state } = f;
      await page.setViewportSize({ width: 380, height: 900 });
      for (const surface of ["home", "open"]) {
        state.apps = structuredClone(initialApps);
        state.failSources = false;
        state.failRefreshAfterDelete = false;
        await f.open(surface);
        const view = surface === "home" ? "#studio-home" : "#studio-open-apps";
        const search = page.getByRole("searchbox", { name: surface === "home" ? "Find a recent app" : "Search apps" });
        await search.fill("Document helper");
        await page.locator("[data-app-actions]").click();
        await page.getByRole("menuitem", { name: "Rename app", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Rename app", exact: true });
        await dialog.getByRole("textbox", { name: "App name", exact: true }).fill("A different name");
        await dialog.getByRole("button", { name: "Save", exact: true }).click();
        await page.getByText("App renamed.", { exact: true }).waitFor();
        await page.waitForFunction(() => document.activeElement?.type === "search");
        assert.equal(await search.inputValue(), "Document helper");
        assert.equal(await page.locator(".app-list-row").count(), 0);
        assert.equal(await page.locator(view).count(), 1);
        await search.fill("customer-portal");
        await page.locator("[data-app-actions]").click();
        await page.getByRole("menuitem", { name: "Delete app", exact: true }).click();
        state.failRefreshAfterDelete = true;
        await page.getByRole("button", { name: "Yes, delete worktree", exact: true }).click();
        await page.getByText("App worktree deleted, but apps could not be refreshed: Source catalog unavailable.", { exact: true }).waitFor();
        assert.equal(await page.locator("#status").getAttribute("class"), "error");
        assert.equal(await page.locator(view).count(), 1);
        assert.equal(await page.getByText("App worktree deleted. Azure resources were not changed.", { exact: true }).count(), 0);
        if (surface === "home") {
          assert.equal(await search.inputValue(), "customer-portal");
          assert.equal(await search.isDisabled(), true);
          await page.getByText("Recent apps could not be refreshed. Use Open an app to retry.", { exact: true }).waitFor();
          state.failSources = false;
          await page.getByRole("button", { name: "Browse apps", exact: true }).click();
        } else {
          state.failSources = false;
          await page.getByRole("button", { name: "Retry", exact: true }).click();
        }
        await page.locator("[data-existing-app]").nth(6).waitFor();
        assert.equal(await page.locator("[data-app-actions]").evaluateAll(items =>
          items.some(item => item.dataset.appActions === "C:\\projects\\customer-portal")), false);
        await page.locator("#top-back").click();
        await page.locator("[data-recent-app]").nth(4).waitFor();
        assert.equal(await page.locator("[data-recent-app]").evaluateAll(items =>
          items.some(item => item.dataset.recentApp === "C:\\projects\\customer-portal")), false);
      }
      assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
  });
}
