import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_EDITOR_SETTINGS } from "./editor-settings.mjs";
import { EMPTY_TEMPLATE } from "./source-catalog.mjs";
import { serveStudioAsset } from "./studio-assets.mjs";
import { renderStudioHtml } from "./studio-ui.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let playwright;
try { playwright = requireWeb("playwright"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const engine of ["chromium", "webkit"]) {
  test(`Open apps stays compact, searchable, and safe to delete in ${engine}`, {
    skip: !playwright && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    let theme = "light", presentationProfile = "github-app";
    const server = createServer((request, response) => {
      void (async () => {
        const path = new URL(request.url, "http://localhost").pathname;
        if (await serveStudioAsset(request, response, path)) return;
        if (path !== "/") { response.writeHead(404).end(); return; }
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(renderStudioHtml("open-apps-test", "fixture", { theme, presentationProfile }));
      })().catch(error => response.writeHead(500).end(error.message));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    let browser;
    try {
      browser = await playwright[engine].launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
      const page = await browser.newPage({ reducedMotion: "reduce" });
      page.setDefaultTimeout(5000);
      const errors = [], deletions = [];
      page.on("pageerror", error => errors.push(error.message));
      const initialApps = [
        { name: "alexbritez-microsoft-animated-waffle", path: "C:\\projects\\customer-portal" },
        { name: "alexbritez-microsoft-animated-parakeet", path: "C:\\projects\\inventory-dashboard" },
        { name: "alexbritez-microsoft-automatic-fortnight-with-a-long-unbroken-name", path: "C:\\projects\\support-assistant" },
        { name: "pr63-source-82977d5", path: "C:\\projects\\review" },
        { name: "source", path: "C:\\projects\\customer-app\\source" },
        { name: "source", path: "C:\\projects\\internal-app\\source" },
        { name: "Document helper <draft>", path: "C:\\projects\\document-helper" },
      ].map((app, index) => ({ ...app, capabilityIds: index === 6 ? ["agent"] : ["web", "agent", "skills", "sandbox", "gateway", "workflows"],
        lastOpenedAt: index === 0 ? "2026-11-06T16:46:28Z" : null }));
      let apps = [...initialApps], failDelete = false, failSources = false, sourceRequests = 0;
      await page.route("**/api/**", route => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/sources") {
          sourceRequests++;
          if (failSources) return route.fulfill({ status: 503, json: { error: "Source catalog unavailable." } });
        }
        if (path === "/api/delete-app") {
          const body = route.request().postDataJSON();
          deletions.push(body);
          if (failDelete) return route.fulfill({ status: 409, json: { error: "Worktree is in use." } });
          apps = apps.filter(app => app.path !== body.root);
          return route.fulfill({ json: {} });
        }
        const json = path === "/api/sources" ? { roots: [], apps, templates: [EMPTY_TEMPLATE] }
          : path === "/api/editor-settings" ? DEFAULT_EDITOR_SETTINGS
            : path === "/api/preferences" ? { theme } : null;
        if (!json) { errors.push("Unexpected request: " + path); return route.abort("failed"); }
        return route.fulfill({ json });
      });
      const origin = "http://127.0.0.1:" + server.address().port;
      const output = process.env.OPEN_APPS_EVIDENCE_DIR;
      const baseline = process.env.OPEN_APPS_BASELINE === "1";
      const openAppsModuleSha256 = createHash("sha256")
        .update(await readFile(new URL("./studio-open-apps.mjs", import.meta.url))).digest("hex");
      const captures = [];
      if (output) await mkdir(output, { recursive: true });
      for (const tone of ["light", "dark"]) {
        theme = tone;
        for (const width of [320, 380, 620]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(origin);
          await page.locator("#open-app").click();
          await page.locator("[data-existing-app]").nth(6).waitFor();
          if (output && width !== 320) {
            const file = `${baseline ? "before" : "after"}-${engine}-${tone}-${width}.png`;
            await page.mouse.move(0, 0);
            await page.screenshot({ path: join(output, file) });
            captures.push({ file, theme: tone, viewport: { width, height: 900 },
              renderedHtmlSha256: createHash("sha256").update(renderStudioHtml("open-apps-test", "fixture", {
                theme, presentationProfile: "github-app",
              })).digest("hex") });
            if (width === 380) {
              await page.locator("[data-existing-app]").nth(4).hover();
              await page.getByRole("tooltip").waitFor();
              const hoverFile = `${baseline ? "before" : "after"}-${engine}-${tone}-${width}-hover.png`;
              await page.screenshot({ path: join(output, hoverFile) });
              captures.push({ file: hoverFile, theme: tone, viewport: { width, height: 900 }, state: "full-path tooltip on hover" });
              await page.mouse.move(0, 0);
              await page.getByRole("tooltip").waitFor({ state: "hidden" });
            }
          }
          if (baseline) continue;
          await page.mouse.move(0, 0);
          await page.getByRole("searchbox", { name: "Search apps" }).focus();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          const geometry = await page.locator(".open-app-row").evaluateAll(rows => rows.map(row => {
            const rect = row.getBoundingClientRect();
            const menu = row.querySelector("[data-app-actions]").getBoundingClientRect();
            const style = getComputedStyle(row);
            return {
              height: rect.height, rightGap: rect.right - menu.right,
              centeredMenu: Math.abs(rect.top + rect.height / 2 - menu.top - menu.height / 2),
              borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
              borderRadius: style.borderRadius, background: style.backgroundColor,
            };
          }));
          assert.ok(geometry.every(row => row.height <= 72), JSON.stringify(geometry));
          assert.ok(geometry.every(row => row.rightGap >= 0 && row.rightGap <= 9 && row.centeredMenu <= 1), JSON.stringify(geometry));
          assert.ok(geometry.every(row => row.borders.every(border => border === "0px")
            && row.borderRadius === "0px" && row.background === "rgba(0, 0, 0, 0)"), JSON.stringify(geometry));
          assert.deepEqual(await page.locator(".open-app-path").allTextContents(), [
            "customer-portal", "inventory-dashboard", "support-assistant", "review",
            "customer-app\\source", "internal-app\\source", "document-helper",
          ]);
          assert.equal(await page.locator(".open-app-row time, .open-app-meta").count(), 0);
          assert.equal(await page.getByText(/^Opened /).count(), 0);
          assert.equal(await page.getByText("Opened: not recorded", { exact: true }).count(), 0);
          assert.equal(await page.getByText(/\d+ capabilit/).count(), 0);
          const duplicate = page.locator("[data-existing-app]").nth(4);
          await duplicate.focus();
          assert.notEqual(await duplicate.locator("..").evaluate(row => getComputedStyle(row).backgroundColor),
            "rgba(0, 0, 0, 0)", "Keyboard focus highlights the row");
          const tooltip = page.getByRole("tooltip");
          await tooltip.waitFor();
          assert.equal(await tooltip.innerText(), initialApps[4].path);
          assert.deepEqual(await tooltip.evaluate(popup => {
            const style = getComputedStyle(popup);
            return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
          }), ["0px", "0px", "0px", "0px"], "Full-path tooltips must not inherit the native popover border");
          assert.ok(await duplicate.getAttribute("aria-describedby"));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await page.keyboard.press("Escape");
          await tooltip.waitFor({ state: "hidden" });
          assert.equal(await duplicate.evaluate(link => link === document.activeElement), true);
          await page.getByRole("searchbox", { name: "Search apps" }).focus();
          await duplicate.hover();
          await tooltip.waitFor();
          assert.equal(await tooltip.innerText(), initialApps[4].path);
          await page.mouse.move(0, 0);
          await tooltip.waitFor({ state: "hidden" });
          await page.getByRole("searchbox", { name: "Search apps" }).focus();
          await page.keyboard.press("Tab");
          await duplicate.focus();
          assert.equal(await duplicate.evaluate(link => link === document.activeElement && getComputedStyle(link).outlineStyle === "solid"), true,
            "Removing the tooltip border must preserve keyboard focus");
          await page.keyboard.press("Escape");
          await page.getByRole("searchbox", { name: "Search apps" }).focus();
          assert.equal(await page.getByRole("menuitem", { name: "Delete app" }).count(), 0);
          const search = page.getByRole("searchbox", { name: "Search apps" });
          await search.fill("PARAKEET");
          await page.waitForFunction(() => document.querySelectorAll("[data-existing-app]").length === 1);
          assert.equal(await page.locator("[data-existing-app]").innerText().then(text => text.includes("parakeet")), true);
          await search.fill(" internal-app ");
          await page.waitForFunction(() => document.querySelectorAll("[data-existing-app]").length === 1);
          assert.equal(await page.locator("[data-existing-app]").getAttribute("data-existing-app"), initialApps[5].path);
          assert.equal(await page.locator(".open-app-path").innerText(), "internal-app\\source",
            "Filtering must not change the displayed identity of same-name apps");
          await search.fill("C:\\projects");
          await page.waitForFunction(() => document.querySelectorAll("[data-existing-app]").length === 7);
          await search.fill("no matching app");
          await page.getByText("No apps match your search.", { exact: true }).waitFor();
          await page.getByRole("button", { name: "Clear search", exact: true }).click();
          assert.equal(await search.inputValue(), "");
          assert.equal(await search.evaluate(element => element === document.activeElement), true);
          assert.equal(await page.locator("[data-existing-app]").count(), 7);
        }
        if (output) await writeFile(join(output, `${baseline ? "before" : "after"}-${engine}.json`), JSON.stringify({
          build: process.env.OPEN_APPS_BUILD_LABEL || "working-tree",
          engine, browserVersion: browser.version(), fixture: initialApps, openAppsModuleSha256, captures,
        }, null, 2));
      }
      async function captureEmpty() {
        const artwork = baseline ? null : Object.fromEntries(await Promise.all(["light", "dark"].map(async tone => [
          tone, await readFile(new URL(`./assets/open-app-empty-${tone}.svg`, import.meta.url), "utf8"),
        ])));
        for (const profile of ["github-app", "standalone"]) {
          presentationProfile = profile;
          const silhouettes = [];
          for (const tone of ["light", "dark"]) {
            theme = tone;
            await page.emulateMedia({ colorScheme: tone === "light" ? "dark" : "light" });
            for (const width of [320, 380, 620]) {
              await page.setViewportSize({ width, height: 900 });
              await page.goto(origin);
              await page.locator("#open-app").click();
              await page.getByRole("button", { name: "Create an app", exact: true }).waitFor();
              if (!baseline) {
                await page.getByRole("heading", { name: "Your next app starts here", exact: true }).waitFor();
                assert.equal(await page.locator("main h1").count(), 1);
                const art = page.locator(".open-app-empty-art svg:visible");
                assert.equal(await art.count(), 1);
                assert.equal(await art.getAttribute("aria-hidden"), "true");
                assert.equal(await art.getAttribute("focusable"), "false");
                assert.equal(await art.locator("..").getAttribute("data-open-app-art-theme"), tone);
                const observed = await page.locator(".open-app-welcome").evaluate((welcome, { source, tone }) => {
                  const svg = welcome.querySelector(`[data-open-app-art-theme="${tone}"] svg`);
                  const xml = new DOMParser().parseFromString(source, "image/svg+xml");
                  const ids = [...xml.querySelectorAll("[id]")].map(node => node.id);
                  const references = [...xml.querySelectorAll("[aria-labelledby]")].flatMap(node => node.getAttribute("aria-labelledby").split(/\s+/));
                  const attributes = [...xml.querySelectorAll("*")].flatMap(node => [...node.attributes]);
                  for (const attribute of attributes) {
                    if (/^(?:href|xlink:href)$/i.test(attribute.name)) references.push(attribute.value.slice(1));
                    for (const [, id] of attribute.value.matchAll(/url\(#([^)]+)\)/g)) references.push(id);
                  }
                  const liveIds = [...document.querySelectorAll("[id]")].map(node => node.id);
                  const parent = welcome.getBoundingClientRect(), bounds = svg.getBBox();
                  const code = [...svg.querySelectorAll("use")].find(node =>
                    (node.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "").endsWith("-stroke1_0_1"));
                  const add = svg.querySelector('g[id$="-code-window-add-control"]');
                  const codeBounds = code.getBoundingClientRect(), addBounds = add.getBoundingClientRect();
                  const stops = node => {
                    const id = node.getAttribute("fill").match(/^url\(#([^)]+)\)$/)[1];
                    return [...svg.querySelectorAll(`[id="${id}"] > stop`)].map(stop => stop.getAttribute("stop-color"));
                  };
                  return {
                    geometry: [...welcome.children].map(node => {
                      const rect = node.getBoundingClientRect();
                      return { centerOffset: Math.abs(rect.left + rect.width / 2 - parent.left - parent.width / 2), right: rect.right };
                    }),
                    silhouette: [...svg.querySelectorAll("path, rect, g[transform]")].map(node => [
                      node.tagName, ...["d", "x", "y", "width", "height", "rx", "transform"].map(name => node.getAttribute(name)),
                    ]),
                    shell: stops(svg.querySelector('rect[x="32"][y="64"]')),
                    blue: stops(code),
                    plusFill: add.querySelector("path").getAttribute("fill"),
                    codePath: svg.querySelector('path[id$="-stroke1_0_1"]').getAttribute("d"),
                    plusPath: add.querySelector("path").getAttribute("d"),
                    addDoesNotCoverCode: addBounds.bottom <= codeBounds.top,
                    overflow: document.documentElement.scrollWidth > innerWidth,
                    xmlErrors: xml.querySelectorAll("parsererror").length,
                    duplicateIds: ids.length !== new Set(ids).size || liveIds.length !== new Set(liveIds).size,
                    missingReferences: references.filter(id => !ids.includes(id)),
                    unsafe: xml.querySelectorAll("script, foreignObject, image, animate, animateTransform, set").length,
                    activeAttributes: attributes.filter(attribute => /^on/i.test(attribute.name) ||
                      /^(?:href|xlink:href|src)$/i.test(attribute.name) && !attribute.value.startsWith("#") ||
                      /url\((?!#)/i.test(attribute.value)).length,
                    invalidMatrices: [...xml.querySelectorAll('feColorMatrix[type="matrix"]')].filter(node => {
                      const values = node.getAttribute("values").trim().split(/[\s,]+/).map(Number);
                      return values.length !== 20 || values.some(value => !Number.isFinite(value));
                    }).length,
                    lighting: xml.querySelectorAll("filter").length,
                    gradients: xml.querySelectorAll("linearGradient, radialGradient").length,
                    filteredMaterials: [...svg.querySelectorAll('[fill^="url(#"]')].filter(node => node.closest("[filter]")).length,
                    artInBounds: bounds.x > 8 && bounds.y > 8 && bounds.x + bounds.width < 504 && bounds.y + bounds.height < 504,
                  };
                }, { source: artwork[tone], tone });
                assert.ok(observed.geometry.every(item => item.centerOffset < 1 && item.right <= width), JSON.stringify(observed));
                assert.equal(observed.overflow, false);
                assert.equal(observed.xmlErrors, 0);
                assert.equal(observed.duplicateIds, false);
                assert.deepEqual(observed.missingReferences, []);
                assert.equal(observed.unsafe, 0);
                assert.equal(observed.activeAttributes, 0);
                assert.equal(observed.invalidMatrices, 0);
                assert.ok(observed.lighting > 0 && observed.gradients > 0, "Azure materials retain vector lighting");
                assert.equal(observed.filteredMaterials, 0, "Separate bevel overlays avoid WebKit banding on material gradients");
                assert.equal(observed.artInBounds, true);
                assert.notEqual(observed.shell[0], observed.shell.at(-1), "Neutral housing retains directional material shading");
                assert.ok(observed.blue.includes(tone === "light" ? "#0969da" : "#79b8ff"), "Code material retains the resolved Canvas accent");
                assert.equal(observed.plusFill, tone === "light" ? "#ffffff" : "#0d1117");
                assert.equal(createHash("sha256").update(observed.codePath).digest("hex"),
                  "96d7d246bc92c0d2ff49c7d7e3562d024cf97f18b7abbada7f505980bba1b9f7", "Original code geometry is unchanged");
                assert.equal(createHash("sha256").update(observed.plusPath).digest("hex"),
                  "1dcedd041ca8f00898bba518909eeb884433ee1b40636b5c0955a5f9609331eb", "The supplied rounded plus is unchanged");
                assert.equal(observed.addDoesNotCoverCode, true);
                if (width === 620) silhouettes.push(observed.silhouette);
              }
              if (!output) continue;
              const label = `${baseline ? "before" : "after"}-empty-${engine}-${tone}-${width}${profile === "standalone" ? "-standalone" : ""}`;
              await page.mouse.move(0, 0);
              await page.screenshot({ path: join(output, label + ".png") });
              await writeFile(join(output, label + ".json"), JSON.stringify({
                build: process.env.OPEN_APPS_BUILD_LABEL || "working-tree", engine, browserVersion: browser.version(),
                theme, presentationProfile, viewport: { width, height: 900 }, fixture: [],
                artworkSha256: artwork ? createHash("sha256").update(artwork[tone]).digest("hex") : null,
                renderedHtmlSha256: createHash("sha256").update(renderStudioHtml("open-apps-test", "fixture", {
                  theme, presentationProfile,
                })).digest("hex"),
              }, null, 2));
            }
          }
          if (!baseline) {
            assert.deepEqual(silhouettes[0], silhouettes[1], profile + " theme pair has identical geometry");
            for (const [fallback, hostTone, colorMode, sharedExpected] of [
              ["light", "dark", "light", "dark"],
              ["dark", "light", "dark", "light"],
              ["light", null, "dark", "dark"],
              ["dark", null, "light", "light"],
              ["light", "custom", "dark", "dark"],
              ["dark", "custom", "light", "light"],
              ["dark", null, null, "dark"],
              ["light", null, null, "light"],
            ]) {
              await page.evaluate(([fallback, hostTone, colorMode]) => {
                const root = document.documentElement;
                root.setAttribute("data-studio-theme", fallback);
                for (const [key, value] of [["data-theme-tone", hostTone], ["data-color-mode", colorMode]]) {
                  if (value === null) root.removeAttribute(key);
                  else root.setAttribute(key, value);
                }
              }, [fallback, hostTone, colorMode]);
              const expected = profile === "standalone" ? fallback : sharedExpected;
              assert.equal(await page.locator(".open-app-empty-art svg:visible").locator("..").getAttribute("data-open-app-art-theme"), expected,
                JSON.stringify({ profile, fallback, hostTone, colorMode }));
            }
          }
        }
        presentationProfile = "github-app";
        if (!baseline) {
          for (const tone of ["light", "dark"]) {
            theme = tone;
            await page.setViewportSize({ width: 320, height: 480 });
            await page.goto(origin);
            await page.locator("#open-app").click();
            await page.getByRole("button", { name: "Create an app", exact: true }).waitFor();
            const button = await page.getByRole("button", { name: "Create an app", exact: true }).boundingBox();
            assert.ok(button.y >= 0 && button.y + button.height <= 480, "Create stays visible in short canvas panes");
            assert.equal(await page.locator(".open-app-empty-art").evaluate(node => node.getBoundingClientRect().width), 160);
            if (output) {
              const label = `after-empty-${engine}-${tone}-320-short`;
              await page.mouse.move(0, 0);
              await page.screenshot({ path: join(output, label + ".png") });
              await writeFile(join(output, label + ".json"), JSON.stringify({
                build: process.env.OPEN_APPS_BUILD_LABEL || "working-tree", engine, browserVersion: browser.version(),
                theme, presentationProfile, viewport: { width: 320, height: 480 }, fixture: [],
                artworkSha256: createHash("sha256").update(artwork[tone]).digest("hex"),
                renderedHtmlSha256: createHash("sha256").update(renderStudioHtml("open-apps-test", "fixture", {
                  theme, presentationProfile,
                })).digest("hex"),
              }, null, 2));
            }
          }
          await page.setViewportSize({ width: 620, height: 900 });
        } else {
          await page.goto(origin);
          await page.locator("#open-app").click();
          await page.getByRole("button", { name: "Create an app", exact: true }).waitFor();
        }
      }
      if (baseline) {
        apps = [];
        await page.goto(origin);
        await page.locator("#open-app").click();
        await page.getByRole("button", { name: "Create an app", exact: true }).waitFor();
        await captureEmpty();
        return;
      }
      const longPath = "C:\\Users\\developer\\.copilot\\repos\\copilot-worktrees\\workspace-with-a-long-folder-name\\document-helper";
      apps = [{ ...initialApps[6], path: longPath }];
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(origin);
      await page.locator("#open-app").click();
      const longPathLink = page.locator("[data-existing-app]");
      await longPathLink.waitFor();
      assert.equal(await page.locator(".open-app-path").innerText(), "document-helper");
      await longPathLink.focus();
      const longPathTooltip = page.getByRole("tooltip");
      await longPathTooltip.waitFor();
      assert.equal(await longPathTooltip.innerText(), longPath);
      const tooltipBounds = await longPathTooltip.boundingBox();
      assert.ok(tooltipBounds.x >= 0 && tooltipBounds.x + tooltipBounds.width <= 320, JSON.stringify(tooltipBounds));
      assert.equal(await longPathTooltip.evaluate(node => node.scrollWidth <= node.clientWidth), true);
      await page.keyboard.press("Escape");
      await longPathTooltip.waitFor({ state: "hidden" });
      apps = [...initialApps];
      await page.setViewportSize({ width: 620, height: 900 });
      await page.goto(origin);
      await page.locator("#open-app").click();
      await page.locator("[data-existing-app]").nth(6).waitFor();
      const menu = page.locator("[data-app-actions]").first();
      await menu.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("menuitem", { name: "Delete app", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await menu.evaluate(element => element === document.activeElement), true);
      await menu.click();
      await page.getByRole("searchbox", { name: "Search apps" }).click();
      assert.equal(await page.getByRole("menuitem", { name: "Delete app", exact: true }).count(), 0);
      await menu.click();
      await page.getByRole("menuitem", { name: "Delete app", exact: true }).click();
      await page.getByRole("alertdialog").waitFor();
      assert.equal(deletions.length, 0);
      await page.getByRole("button", { name: "No, keep app", exact: true }).click();
      assert.equal(await menu.evaluate(element => element === document.activeElement), true);
      const search = page.getByRole("searchbox", { name: "Search apps" });
      await search.fill("waffle");
      await page.locator("[data-app-actions]").click();
      await page.getByRole("menuitem", { name: "Delete app", exact: true }).click();
      failDelete = true;
      await page.getByRole("button", { name: "Yes, delete worktree", exact: true }).click();
      await page.getByText("Worktree is in use.", { exact: true }).waitFor();
      assert.equal(await search.isEnabled(), true);
      assert.equal(await page.locator("[data-existing-app]").count(), 1);
      failDelete = false;
      await page.locator("[data-app-actions]").click();
      await page.getByRole("menuitem", { name: "Delete app", exact: true }).click();
      await page.getByRole("button", { name: "Yes, delete worktree", exact: true }).click();
      await page.getByText("App worktree deleted. Azure resources were not changed.", { exact: true }).waitFor();
      assert.equal(await search.inputValue(), "waffle");
      await page.getByText("No apps match your search.", { exact: true }).waitFor();
      assert.deepEqual(deletions, Array(2).fill({ root: initialApps[0].path, confirmed: true }));
      await search.fill("<draft>");
      await page.route("**/app-map?**", route => route.fulfill({ contentType: "text/html", body: "<h1>App workspace</h1>" }));
      await page.locator("[data-existing-app]").focus();
      await page.keyboard.press("Enter");
      await page.getByRole("heading", { name: "App workspace" }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get("root"), initialApps[6].path);
      apps = [];
      await page.goto(origin);
      await page.locator("#open-app").click();
      await page.getByRole("heading", { name: "Your next app starts here", exact: true }).waitFor();
      assert.equal(await page.getByRole("searchbox").count(), 0);
      await captureEmpty();
      await page.getByRole("button", { name: "Create an app", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("heading", { name: "Create a new app", exact: true }).waitFor();
      await page.locator('input[name="template"]').waitFor();
      await page.locator("#top-back").click();
      failSources = true;
      await page.locator("#open-app").click();
      await page.getByRole("heading", { name: "Apps could not be loaded", exact: true }).waitFor();
      await page.getByText("Source catalog unavailable.", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Create an app", exact: true }).count(), 0);
      assert.equal(await page.locator(".open-app-empty-art").count(), 0);
      const beforeRetry = sourceRequests;
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector("#studio-open-apps button")?.disabled);
      await page.getByRole("heading", { name: "Apps could not be loaded", exact: true }).waitFor();
      assert.equal(sourceRequests, beforeRetry + 1);
      apps = [...initialApps];
      failSources = false;
      await page.getByRole("button", { name: "Retry", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.locator("[data-existing-app]").nth(6).waitFor();
      assert.equal(await page.getByRole("button", { name: "Retry", exact: true }).count(), 0);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await new Promise(resolve => server.close(resolve));
    }
  });
}
