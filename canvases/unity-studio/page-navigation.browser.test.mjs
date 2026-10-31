import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";
import { serveStudioAsset } from "./studio-assets.mjs";
import { DEFAULT_EDITOR_SETTINGS } from "./editor-settings.mjs";
import { openWorkspaceNavigation } from "./workspace-navigation-test-helpers.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Canonical responsive workspace navigation preserves production state in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const graph = {
      root: "/fixture", nodes: [{
        id: "agent", kind: "project", tierId: "agent", name: "Claims agent", projectPath: "src/agent",
        evidence: [], badges: [],
      }], edges: [], unresolved: [], diagnostics: [],
      summary: { projectNodes: 1, operationNodes: 0, edges: 0, unresolved: 0 },
    };
    let theme = "light";
    const server = createServer((request, response) => void (async () => {
      const url = new URL(request.url, "http://localhost");
      if (await serveStudioAsset(request, response, url.pathname)) return;
      response.setHeader("Content-Type", "text/html");
      response.end(renderInteractiveAppMapHtml(graph, { apiToken: "fixture", theme, appName: "Claims application with a long name" }));
    })().catch(error => { response.writeHead(500); response.end(error.message); }));
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      page.setDefaultTimeout(7000);
      const errors = [], requests = [], operations = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => requests.push(request.url()));
      await page.route("**/api/**", async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (request.method() !== "GET" && path !== "/api/preferences") operations.push(path);
        const responses = {
          "/api/build-workspace": { artifacts: [{
            id: "instructions", customizationArea: "behavior", title: "Agent instructions",
            path: "src/agent/prompts/system.md", projectPath: "src/agent", projectName: "Claims agent",
            description: "Agent behavior", available: true, content: "Use verified evidence.", sha: "fixture",
          }, {
            id: "configuration", customizationArea: "runtime", title: "App configuration",
            path: "src/agent/config.json", projectPath: "src/agent", projectName: "Claims agent",
            description: "Runtime configuration", available: true, content: '{"port":8088}', sha: "fixture",
          }] },
          "/api/app-status": { state: "stopped", recovered: false, foreignEntrypoints: [], entrypoints: [] },
          "/api/local-readiness": { ready: false, gatewayConfigured: false },
          "/api/app-output": { lines: [], commands: [] },
          "/api/editor-settings": DEFAULT_EDITOR_SETTINGS,
          "/api/app-logs": {
            root: "/fixture", scope: { label: "All services", groupedByService: true }, catalog: [], services: [],
            clipping: { clipped: false, notices: [] },
          },
        };
        if (path === "/api/preferences") {
          if (request.method() === "POST") theme = request.postDataJSON().theme;
          return route.fulfill({ json: { theme } });
        }
        assert.ok(responses[path], "Unexpected workflow request " + path);
        await route.fulfill({ json: responses[path] });
      });
      const origin = `http://127.0.0.1:${server.address().port}`;
      await page.goto(origin);
      const nav = page.getByRole("navigation", { name: "App workspaces", exact: true, includeHidden: true });
      const browse = page.getByRole("button", { name: "Browse app workspaces", exact: true });
      const surface = page.locator("#app-workspace-navigation");
      await nav.waitFor();
      await page.locator(".build-source-preview").first().waitFor();
      await page.locator("#app-status-badge").filter({ hasText: "Not running" }).waitFor();
      const guidedStage = await page.locator('[data-guide-stage][data-current="true"]').getAttribute("data-guide-stage");
      assert.deepEqual(await nav.locator("li button").allTextContents(), ["Build", "Run & Debug", "Observe"]);
      assert.equal(await page.locator(".header-actions").count(), 0);
      assert.equal(await page.locator("#workspace-navigation-mount > .ct-provider > .ct-shell").count(), 1);
      const select = async label => {
        await openWorkspaceNavigation(page);
        await nav.getByRole("button", { name: label, exact: true }).click();
        assert.equal(await nav.getByRole("button", { name: label, exact: true, includeHidden: true }).getAttribute("aria-current"), "page");
        assert.equal(await nav.locator('[aria-current="page"]').count(), 1);
        assert.equal(await page.locator("#workspace-location").textContent(), label);
      };
      for (const width of [1280, 1180, 1179, 800, 620, 380, 320]) {
        await page.setViewportSize({ width, height: 480 });
        await page.waitForFunction(wide => document.querySelector("#studio-workspace-navigation").dataset.navigationExpanded === String(wide), width >= 1180);
        assert.equal(await browse.isVisible(), width < 1180);
        const fallbackColors = {};
        for (const tone of ["light", "dark"]) {
          await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, tone);
          for (const label of ["Build", "Run & Debug", "Observe"]) {
            await select(label);
            assert.equal(await surface.getAttribute("data-mode"), width >= 1180 ? "sidebar" : "preview");
            await page.mouse.move(width - 1, 479);
            await page.getByRole("button", { name: "Settings", exact: true }).focus();
            if (width < 1180) await surface.waitFor({ state: "hidden" });
          }
          const geometry = await page.evaluate(() => {
            const main = document.querySelector("#app-workspace-main").getBoundingClientRect();
            const bar = document.querySelector("#workspace-runtime-bar").getBoundingClientRect();
            const action = document.querySelector("#header-runtime-action").getBoundingClientRect();
            const header = document.querySelector("#studio-workspace-navigation > header").getBoundingClientRect();
            return {
              overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
              mainHeight: main.height, barBottom: bar.bottom, mainTop: main.top,
              actionRight: action.right, headerRight: header.right,
            };
          });
          assert.equal(geometry.overflow, false, JSON.stringify({ width, tone, geometry }));
          assert.ok(geometry.mainHeight > 150 && geometry.mainTop >= geometry.barBottom);
          assert.ok(geometry.actionRight <= width && geometry.headerRight <= width);
          const fallback = await nav.evaluate(node => ({
            color: getComputedStyle(node).color, scheme: getComputedStyle(node).colorScheme,
          }));
          assert.equal(fallback.scheme, tone);
          fallbackColors[tone] = fallback.color;
        }
        assert.notEqual(fallbackColors.light, fallbackColors.dark);
      }
      // Keyboard disclosure transfers focus, does not lock destinations, and restores it on dismissal.
      await page.setViewportSize({ width: 620, height: 800 });
      await browse.focus();
      await page.keyboard.press("ArrowDown");
      assert.equal(await nav.getByRole("button", { name: "Build", exact: true }).evaluate(node => node === document.activeElement), true);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("body").getAttribute("data-workspace"), "manage");
      assert.equal(await browse.evaluate(node => node === document.activeElement), true);
      await browse.press("Space");
      assert.equal(await surface.getAttribute("data-mode"), "held");
      await page.getByRole("button", { name: "Close workspace menu", exact: true }).click();
      assert.equal(await browse.evaluate(node => node === document.activeElement), true);
      await browse.press("Space");
      await browse.press("ArrowDown");
      await page.keyboard.press("Escape");
      assert.equal(await surface.isVisible(), false);
      assert.equal(await browse.evaluate(node => node === document.activeElement), true);
      await browse.press("Space");
      const runtimeBounds = await page.locator("#workspace-runtime-bar").boundingBox();
      await page.mouse.click(runtimeBounds.x + runtimeBounds.width - 4, runtimeBounds.y + runtimeBounds.height / 2);
      assert.equal(await surface.isVisible(), false);
      // A narrow embedded container in a wide viewport still uses the canonical disclosure.
      await page.setViewportSize({ width: 1440, height: 800 });
      await page.locator("#workspace-navigation-mount").evaluate(node => { node.style.width = "600px"; });
      await browse.waitFor();
      assert.equal(await page.locator("#studio-workspace-navigation").getAttribute("data-navigation-expanded"), "false");
      await page.locator("#workspace-navigation-mount").evaluate(node => { node.style.removeProperty("width"); });
      await nav.waitFor();
      await page.getByRole("button", { name: "Collapse workspace sidebar", exact: true }).click();
      assert.equal(await browse.isVisible(), true);
      assert.equal(await page.evaluate(() => localStorage.getItem("unity-workspace:/fixture:navigation-collapsed")), "true");
      await browse.click();
      assert.equal(await surface.getAttribute("data-mode"), "sidebar");
      // Stable canonical roots, exact draft nodes and Build selections survive updates and resizing.
      await select("Build");
      await page.getByRole("tab", { name: "Runtime", exact: true }).click();
      const buildDisclosure = page.locator('.build-file[data-artifact="configuration"] .build-source-disclosure');
      if (await buildDisclosure.evaluate(node => node.open)) await buildDisclosure.locator("summary").click();
      await select("Run & Debug");
      const draft = page.getByRole("textbox", { name: "Agent message", exact: true });
      await draft.fill("Preserve this message.");
      await draft.evaluate(node => {
        window.navigationDraft = node;
        window.navigationRoot = document.querySelector("#studio-workspace-navigation");
        node.setSelectionRange(3, 8);
      });
      await page.setViewportSize({ width: 380, height: 800 });
      await page.waitForFunction(() => document.querySelector("#studio-workspace-navigation").dataset.navigationExpanded === "false");
      assert.equal(await draft.evaluate(node => node === window.navigationDraft && node === document.activeElement && node.selectionStart === 3 && node.selectionEnd === 8), true);
      await page.evaluate(() => {
        const nav = document.querySelector("#app-workspace-navigation");
        window.navigationMutations = 0;
        window.navigationObserver = new MutationObserver(records => { window.navigationMutations += records.length; });
        window.navigationObserver.observe(nav, { subtree: true, childList: true, attributes: true, characterData: true });
      });
      await page.waitForResponse(response => new URL(response.url()).pathname === "/api/app-status");
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      assert.equal(await page.evaluate(() => window.navigationMutations), 0);
      assert.equal(await draft.evaluate(node => node === document.activeElement), true);
      await page.evaluate(() => window.navigationObserver.disconnect());
      await select("Build");
      await buildDisclosure.waitFor({ state: "attached" });
      assert.equal(await page.getByRole("tab", { name: "Runtime", exact: true }).getAttribute("aria-selected"), "true");
      assert.equal(await buildDisclosure.evaluate(node => node.open), false);
      await select("Observe");
      await page.getByRole("tab", { name: "Logs", exact: true }).click();
      await select("Run & Debug");
      assert.equal(await draft.inputValue(), "Preserve this message.");
      await select("Observe");
      assert.equal(await page.getByRole("tab", { name: "Logs", exact: true }).getAttribute("aria-selected"), "true");
      assert.equal(await page.locator("body").getAttribute("data-workspace"), "logs");
      assert.equal(await page.locator("#studio-workspace-navigation").evaluate(node => node === window.navigationRoot), true);
      // Guide tracks readiness independently from the selected page.
      assert.equal(await page.locator('[data-guide-stage][data-current="true"]').getAttribute("data-guide-stage"), guidedStage);
      assert.notEqual(guidedStage, "observe");
      assert.equal(await page.locator("#map-app").getAttribute("aria-current"), "page");
      // Late synthetic tokens test cascade/focus, not native host delivery.
      await browse.focus();
      await browse.press("ArrowDown");
      const currentFocus = await page.evaluate(() => { window.navigationFocus = document.activeElement; return document.activeElement.id; });
      await page.evaluate(() => {
        const root = document.documentElement;
        root.style.setProperty("--background-color-default", "rgb(22, 33, 44)");
        root.style.setProperty("--text-color-default", "rgb(211, 224, 237)");
        root.style.setProperty("--border-color-default", "rgb(111, 132, 153)");
        root.style.setProperty("--background-color-muted", "rgb(39, 51, 63)");
        root.style.setProperty("--text-color-accent", "rgb(191, 155, 233)");
        root.style.setProperty("--color-focus-outline", "rgb(120, 201, 242)");
        root.style.setProperty("--font-sans", '"Courier New", monospace');
        root.style.setProperty("--text-body-medium", "17px");
        root.style.setProperty("--leading-body-medium", "26px");
      });
      await page.mouse.move(1100, 820);
      const tokens = await nav.evaluate(node => {
        const button = node.querySelector('[aria-current="page"]'), style = getComputedStyle(button);
        return { color: style.color, background: style.backgroundColor, font: style.fontFamily, size: style.fontSize,
          stableFocus: document.activeElement === window.navigationFocus };
      });
      assert.equal(tokens.color, "rgb(211, 224, 237)");
      assert.equal(tokens.background, "rgb(39, 51, 63)");
      assert.match(tokens.font, /Courier New/);
      assert.equal(tokens.size, "17px");
      assert.equal(tokens.stableFocus, true, currentFocus);
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
      assert.equal(await page.locator("#studio-workspace-navigation").count(), 1);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForFunction(() => document.querySelector("#studio-workspace-navigation").dataset.navigationExpanded === "true");
      await page.getByRole("button", { name: "Collapse workspace sidebar", exact: true }).click();
      await browse.waitFor();
      assert.equal(await surface.getAttribute("data-mode"), "preview");
      assert.equal(await page.locator("#workspace-location").textContent(), "Observe");
      await select("Run & Debug");
      assert.equal(await draft.inputValue(), "Preserve this message.");
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
      assert.equal(await page.locator("#studio-workspace-navigation").count(), 0);
      await page.evaluate(() => window.dispatchEvent(new Event("resize")));
      assert.equal(await page.locator("#studio-workspace-navigation").count(), 0, "Permanent disposal cannot revive the navigation");
      // Shared controls and navigation fail visibly and retry without replacing the workspace.
      await page.route("**/canvas-ui/base.mjs", route => route.abort());
      await page.goto(origin);
      await page.locator("#status").filter({ hasText: "Could not load Studio controls:" }).waitFor();
      assert.equal(await page.locator("#workspace-navigation-message").textContent(), "Workspace navigation is unavailable.");
      await page.locator("#workspace-content").evaluate(node => { window.retryContent = node; });
      await page.unroute("**/canvas-ui/base.mjs");
      await page.getByRole("button", { name: "Retry navigation", exact: true }).click();
      await page.locator("#studio-workspace-navigation").waitFor();
      await page.locator(".build-source-preview").first().waitFor();
      assert.equal(await page.locator("#workspace-content").evaluate(node => node === window.retryContent), true);
      assert.equal(await page.locator("#workspace-loading-header").isVisible(), false);
      assert.deepEqual(errors, []);
      assert.deepEqual(operations, [], "Free navigation must not invoke runtime or cloud operations");
      assert.ok(requests.some(url => url.endsWith("/canvas-ui/react-runtime.mjs")));
      assert.ok(requests.every(url => new URL(url).origin === origin), "Only same-origin shipped assets are used");
    } finally {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    }
  });
}
