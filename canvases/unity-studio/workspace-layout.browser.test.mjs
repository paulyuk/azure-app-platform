import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("Build, Run, Map and Logs own the workspace independently of the collapsible Guide", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const graph = {
    root: "/tmp/workspace-layout-fixture", generatedAt: new Date().toISOString(),
    nodes: [{
      id: "agent", kind: "project", tierId: "agent", name: "Loan agent", projectPath: "src/agent",
      evidence: Array.from({ length: 20 }, (_, index) => ({ path: "src/agent/main.py", line: index + 1, rule: "agent-source" })),
      badges: [],
    }],
    unresolved: [{
      from: "agent", reference: "custom-tool", candidates: ["agent"],
      evidence: { path: "src/agent/main.py", line: 14 },
    }],
    edges: [], summary: { projectNodes: 1, operationNodes: 0, edges: 0 },
  };
  let theme = "light";
  let preferenceFailure = false;
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(renderInteractiveAppMapHtml(graph, { apiToken: "fixture", theme }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  let appState = "stopped";
  let appRecovered = false;
  const errors = [];
  const mutations = [];
  const logRequests = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() !== "GET") mutations.push(path);
      let body;
      if (path === "/api/preferences") {
        assert.equal(request.headers()["x-unity-studio-token"], "fixture");
        if (preferenceFailure) {
          await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Preference save failed." }) });
          return;
        }
        if (request.method() === "POST") theme = request.postDataJSON().theme;
        body = { theme };
      }
      else if (path === "/api/editor-settings") body = {
        editorId: "vscode",
        editors: [
          { id: "vscode", label: "VS Code" },
          { id: "cursor", label: "Cursor" },
          { id: "zed", label: "Zed" },
        ],
      };
      else if (path === "/api/build-workspace") body = { artifacts: [{
        id: "instructions", customizationArea: "behavior", title: "Agent instructions", path: "src/agent/prompts/system.md",
        projectPath: "src/agent", projectName: "Loan agent",
        description: "Loan agent behavior.", available: true, content: "Explain applications.", sha: "fixture",
      }], supportsDocuments: true };
      else if (path === "/api/app-status") body = {
        state: appState, recovered: appRecovered, foreignEntrypoints: [],
        entrypoints: [{ name: "agent", port: 8091, ready: appState === "running", healthStatus: "Healthy", url: "http://localhost:8091" }],
      };
      else if (path === "/api/local-readiness") body = {
        ready: true, gatewayConfigured: true, model: "model", activeGateway: { name: "gateway" },
        documentInput: { extensions: [".txt", ".md"], maxBytes: 65536 },
      };
      else if (path === "/api/gateway-options") body = { subscriptions: [], gateways: [], models: [] };
      else if (path === "/api/app-output") body = { lines: ["Ready"], commands: [] };
      else if (path === "/api/app-logs") {
        const serviceId = new URL(request.url()).searchParams.get("serviceId");
        assert.ok(serviceId === null || serviceId === "agent");
        assert.equal(new URL(request.url()).searchParams.get("root"), graph.root);
        assert.equal(request.headers()["x-unity-studio-token"], "fixture");
        logRequests.push(serviceId);
        const service = {
          id: "agent", label: "Loan agent", kind: "component", componentId: "agent",
          tierId: "agent", projectPath: "src/agent", aliases: [],
        };
        body = {
          root: graph.root,
          scope: {
            serviceId, label: serviceId ? service.label : "All services", groupedByService: true,
            description: "Logs are grouped by service; no cross-service chronology is inferred.",
          },
          catalog: [service],
          services: [{
            ...service, availability: "available", reason: "",
            streams: [{
              stream: "stdout", label: "Agent stdout", available: true, reason: "",
              lines: ["Agent service output"], cursor: null, reset: false, notice: "",
            }],
          }],
          clipping: {
            clipped: false, services: { included: 1, total: 1, limit: 24 },
            catalog: { included: 1, total: 1, limit: 80 },
            lines: { included: 1, limit: 1200 },
            bytes: { included: Buffer.byteLength("Agent service output\n"), limit: 262144 }, notices: [],
          },
        };
      }
      else throw new Error("Unexpected route " + path);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    const url = `http://127.0.0.1:${server.address().port}/app-map`;
    const openWorkspace = async (mode) => {
      if (mode === "map" || mode === "logs") {
        await page.locator("#map-app").click();
        await page.locator(mode === "map" ? "#map-view" : "#logs-app").click();
      } else await page.locator(mode === "manage" ? "#manage-app" : "#build-app").click();
    };
    const openStructureFromGuide = async () => {
      const toggle = page.locator("#action-center");
      const collapsed = await toggle.getAttribute("aria-expanded") === "false";
      if (collapsed) await toggle.click();
      await page.getByRole("button", { name: "Build: edit app structure", exact: true }).click();
      if (collapsed) await toggle.click();
    };
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(url);
    const buildRow = page.locator('.build-file[data-artifact="instructions"]');
    const buildDisclosure = buildRow.locator(
      '.build-source-disclosure[data-preview-for="instructions"]');
    const preview = page.getByRole("region", { name: "Agent instructions source preview", exact: true });
    const source = preview.locator(".build-highlight");
    const openBuildPreview = async () => {
      await buildRow.waitFor();
      if (!await buildDisclosure.evaluate((element) => element.open)) {
        await buildDisclosure.locator(":scope > summary").click();
      }
      await preview.waitFor();
    };
    await buildRow.waitFor();
    await openBuildPreview();
    assert.equal(await page.locator("html").getAttribute("data-studio-theme"), "light");
    assert.equal(await page.getByRole("link", { name: "Unity Studio home" }).count(), 1);
    assert.equal(await page.getByRole("link", { name: "Unity Studio home" }).getAttribute("href"), "/");
    assert.equal(await page.getByRole("button", { name: "Home", exact: true }).count(), 0);
    assert.equal(await page.getByRole("link", { name: "Docs", exact: true }).getAttribute("target"), "_blank");
    assert.deepEqual(await page.getByRole("group", { name: "App workspaces", exact: true }).getByRole("button").allTextContents(), ["Build", "Run & Debug", "Observe"]);
    assert.equal(await page.locator(".header-actions [role='tab']").count(), 0);
    assert.equal(await page.locator("body > .studio-site-nav").count(), 0);
    assert.equal(await page.locator("header .studio-site-nav").count(), 1);
    assert.equal(await page.locator("header h1").count(), 1);
    assert.equal(await page.locator("header .runtime-badge").count(), 1);
    assert.equal(await page.locator("header .runtime-action").count(), 1);
    const headerBounds = await page.locator("header").boundingBox();
    assert.ok(headerBounds.height <= 64, "The desktop workspace has one compact top bar");
    assert.ok(Math.abs((await page.locator("main").boundingBox()).y - (headerBounds.y + headerBounds.height)) < 1);
    assert.equal(await page.locator(".header-actions #action-center").count(), 0);
    assert.equal(await page.locator("#guide-rail button[title='Collapse Guide']").count(), 1);
    assert.equal(await page.locator("#collapse-guide").count(), 0);
    assert.equal(await page.locator("#action-center .guide-chevron").evaluate((el) => getComputedStyle(el).transform), "none");
    assert.equal(await page.locator("body").getAttribute("data-workspace"), "build");
    assert.equal(await page.locator("#graph-shell").isVisible(), false);
    assert.equal(await page.locator(".map-palette").isVisible(), false);
    assert.equal(await page.locator(".map-view-bar").count(), 0);
    const expanded = await page.locator("#workspace").boundingBox();
    const rail = await page.locator("#guide-rail").boundingBox();
    assert.ok(expanded.width >= 1440 - 300);
    assert.ok(Math.abs(expanded.x + expanded.width - rail.x) < 1);
    assert.ok(rail.width <= 280);
    assert.ok(Math.abs((await page.locator("#details").boundingBox()).width - expanded.width) < 1);

    const buttonFormat = (button) => button.evaluate((el) => {
      const style = getComputedStyle(el);
      return { size: style.fontSize, weight: style.fontWeight, lineHeight: style.lineHeight,
        radius: style.borderRadius, padding: style.padding, height: el.getBoundingClientRect().height };
    });
    const standardButton = { size: "12px", weight: "600", lineHeight: "18px", radius: "6px", padding: "6px 10px", height: 32 };
    const assertHeaderLayout = async (width) => {
      const layout = await page.locator("header").evaluate((header) => {
        const rect = (el) => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        };
        const find = (selector) => rect(header.querySelector(selector));
        return {
          brand: find(".studio-site-nav"), identity: find(".heading"),
          navigation: find(".header-actions"), utilities: find(".studio-theme-control"),
          navigationButtons: [...header.querySelectorAll(".header-actions button")].map(rect),
          navigationInset: parseFloat(getComputedStyle(header.querySelector(".header-actions")).paddingTop) +
            parseFloat(getComputedStyle(header.querySelector(".header-actions")).borderTopWidth),
          overflow: [header, header.querySelector(".app-title-row"), ...header.querySelectorAll("button")]
            .some((el) => el.scrollWidth > el.clientWidth + 1),
          right: header.getBoundingClientRect().right - parseFloat(getComputedStyle(header).paddingRight),
          titleWidth: header.querySelector("h1").getBoundingClientRect().width,
        };
      });
      const context = `${width}px, ${appState}${appRecovered ? " (recovered)" : ""}: ${JSON.stringify(layout)}`;
      const midline = (rect) => rect.y + rect.height / 2;
      assert.ok(Math.abs(midline(layout.brand) - midline(layout.utilities)) < 1, `Utilities must stay in the first row: ${context}`);
      assert.ok(Math.abs(layout.utilities.x + layout.utilities.width - layout.right) < 1, `Utilities stay at the right edge: ${context}`);
      assert.equal(layout.overflow, false, context);
      assert.ok(layout.titleWidth >= 16, `App identity retains space before truncation: ${context}`);
      for (const button of layout.navigationButtons) assert.ok(Math.abs(button.y - layout.navigation.y - layout.navigationInset) < 1, `Workspace buttons move as one group: ${context}`);
      if (width > 960) {
        assert.ok(Math.abs(midline(layout.navigation) - midline(layout.brand)) < 1, context);
      } else {
        assert.ok(layout.navigation.y >= layout.brand.y + layout.brand.height + 8, context);
      }
      if (width <= 680) assert.ok(layout.navigation.y >= layout.identity.y + layout.identity.height + 8, context);
      else assert.ok(Math.abs(midline(layout.identity) - midline(layout.brand)) < 1, context);
      const groups = [layout.brand, layout.identity, layout.navigation, layout.utilities];
      for (let i = 0; i < groups.length; i++) {
        for (const b of groups.slice(i + 1)) {
          const a = groups[i];
          const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
          assert.ok(overlapX <= 1 || overlapY <= 1, `Header groups must not overlap: ${context}`);
        }
      }
    };
    for (const [state, recovered] of [["stopped", false], ["running", false], ["starting", false], ["starting", true], ["failed", false]]) {
      appState = state;
      appRecovered = recovered;
      await page.evaluate(() => refreshOperationalState());
      await page.waitForFunction(({ state, recovered }) => operationalState.app?.state === state && operationalState.app?.recovered === recovered, { state, recovered });
      for (const width of [320, 380, 620, 640, 679, 680, 681, 780, 959, 960, 961, 1000, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await assertHeaderLayout(width);
      }
    }
    appState = "stopped";
    appRecovered = false;
    await page.evaluate(() => refreshOperationalState());
    const assertObserveSwitcher = async () => {
      const views = page.getByRole("tablist", { name: "Observe views", exact: true });
      assert.deepEqual(await views.getByRole("tab").allTextContents(), ["App Map", "Logs"]);
      assert.equal(await views.locator('.studio-tab-icon[aria-hidden="true"]').count(), 2);
      assert.equal(await views.locator(".studio-tab-icon").evaluateAll((icons) =>
        icons.every((icon) => getComputedStyle(icon).webkitMaskImage !== "none")), true);
      const groupBounds = await views.boundingBox();
      const shellBounds = await page.locator("#workspace-shell").boundingBox();
      assert.ok(groupBounds.x >= shellBounds.x && groupBounds.x + groupBounds.width <= shellBounds.x + shellBounds.width);
      assert.ok(groupBounds.width > shellBounds.width - 32 && groupBounds.height >= 48,
        "Observe uses the full-width compact tab row");
      const styles = await views.evaluate((el) => {
        const selected = getComputedStyle(el.querySelector('[aria-selected="true"]'));
        const other = getComputedStyle(el.querySelector('[aria-selected="false"]'));
        const group = getComputedStyle(el);
        return {
          border: group.borderBottomWidth,
          selectedFill: selected.backgroundColor, otherFill: other.backgroundColor,
          selectedBorder: selected.borderBottomColor, otherBorder: other.borderBottomColor,
          selectedBorderWidth: selected.borderBottomWidth,
          selectedColor: selected.color, overflow: el.scrollWidth > el.clientWidth + 1,
        };
      });
      assert.equal(styles.border, "1px");
      assert.notEqual(styles.selectedFill, styles.otherFill);
      assert.notEqual(styles.selectedBorder, styles.otherBorder);
      assert.equal(styles.selectedBorderWidth, "3px");
      assert.equal(styles.overflow, false);
    };
    assert.deepEqual(await buttonFormat(page.locator("#details .build-edit-files")), standardButton);
    assert.equal(await page.locator("#details .build-header").count(), 0);
    assert.equal(await page.locator("#details").getByRole("button", { name: "Run/Debug", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Test with a document", exact: true }).count(), 1);
    assert.deepEqual(await buttonFormat(page.locator("#build-app")), standardButton);
    await page.getByRole("button", { name: "Build", exact: true }).press("Tab");
    assert.equal(await page.getByRole("button", { name: "Run & Debug", exact: true }).evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.locator("body").getAttribute("data-workspace"), "build");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("body").getAttribute("data-workspace"), "manage");
    assert.deepEqual(await buttonFormat(page.locator("#details .actions button").first()), standardButton);
    await page.locator("#manage-app").press("Tab");
    assert.equal(await page.locator("#map-app").evaluate((el) => el === document.activeElement), true);
    await page.locator("#build-app").focus();
    await page.keyboard.press("Space");
    await openBuildPreview();
    await preview.evaluate((element) => {
      element.scrollTop = 12;
      element.dataset.layoutProbe = "read-only-preview";
    });
    await openStructureFromGuide();
    await page.waitForFunction(() => mapHasFitted);
    const structureGuidance = page.getByRole("region", { name: "App structure guidance", exact: true });
    assert.equal(await structureGuidance.isVisible(), true);
    assert.equal(await structureGuidance.evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.locator("#graph-shell").evaluate((el) => el.classList.contains("structure-editing")), true);
    assert.equal(await page.locator("#graph").count(), 1);
    assert.equal(await page.locator("#map-view").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("#map-app").getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await structureGuidance.isVisible(), false);
    assert.equal(await page.locator("#map-view").evaluate((el) => el === document.activeElement), true);
    await page.getByRole("button", { name: "Build: edit app structure", exact: true }).click();
    assert.equal(await structureGuidance.isVisible(), true);
    await page.locator(".flow-add").first().press("Enter");
    assert.equal(await page.locator("#details").isVisible(), true);
    assert.equal(await structureGuidance.isVisible(), false);
    await page.locator("#build-app").click();
    await openBuildPreview();
    assert.equal(await source.textContent(), "Explain applications.");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("dark");
    await page.waitForFunction(() => document.documentElement.dataset.studioTheme === "dark");
    await page.getByRole("button", { name: "Close settings" }).click();
    assert.equal(await source.textContent(), "Explain applications.");
    assert.equal(await page.locator(".build-source-preview").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(27, 30, 37)");
    assert.equal(await page.locator("#build-app").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(27, 30, 37)");
    assert.equal(await page.locator("#build-app").evaluate((el) => getComputedStyle(el).color), "rgb(237, 240, 245)");
    assert.equal(await page.locator("#build-app").evaluate((el) => getComputedStyle(el).borderBottomColor), "rgb(197, 166, 255)");
    const expandedToggleBounds = await page.locator("#action-center").boundingBox();
    await page.locator("#action-center").click();
    assert.deepEqual(await page.locator("#action-center").boundingBox(), expandedToggleBounds, "Collapsing Guide must not move its toggle");
    assert.equal(await page.locator("#action-center").getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator("#action-center").getAttribute("title"), "Expand Guide");
    assert.equal(await page.locator("#action-center .guide-chevron").evaluate((el) => getComputedStyle(el).transform), "matrix(-1, 0, 0, 1, 0, 0)");
    assert.equal(await page.locator("#action-center").evaluate((el) => el === document.activeElement), true);
    assert.ok((await page.locator("#details").boundingBox()).width >= 1393);
    assert.equal((await page.locator("#guide-rail").boundingBox()).width, 46);
    assert.equal(await page.locator("#guide-shortcuts button").count(), 4);
    assert.equal(await page.locator("#guide-content").isVisible(), false);
    assert.equal(await source.textContent(), "Explain applications.");
    await page.locator("#action-center").click();
    assert.equal(await page.locator("#action-center").getAttribute("title"), "Collapse Guide");
    assert.deepEqual(await page.locator("#action-center").boundingBox(), expandedToggleBounds, "Expanding Guide must not move its toggle");
    assert.equal(await source.textContent(), "Explain applications.");

    await preview.focus();
    appState = "running";
    await page.locator('#guide-content [data-stage="observe"].active').waitFor();
    assert.equal(await page.locator('#guide-content [aria-current="step"]').getAttribute("data-stage"), "observe");
    assert.match(await page.locator('#guide-content [data-stage="run"]').innerText(), /Complete.*Run.*running locally/si);
    assert.equal(await page.locator('#guide-content [data-stage="connect"]').getAttribute("class"), "journey-stage attention");
    assert.equal(await page.getByRole("button", { name: "Open App Map", exact: true }).count(), 1);
    assert.equal(await source.textContent(), "Explain applications.");
    assert.equal(await preview.evaluate((el) => el === window.document.activeElement), true);
    assert.equal(await page.locator("#build-app").getAttribute("aria-pressed"), "true");
    await page.locator("#action-center").click();
    const reviewShortcut = page.locator('[data-guide-stage="connect"]');
    assert.equal(await reviewShortcut.getAttribute("data-state"), "attention");
    assert.equal(await reviewShortcut.locator(".guide-state-icon").textContent(), "!");
    assert.match(await reviewShortcut.getAttribute("aria-label"), /Connect: Review/);
    assert.equal(await page.locator('[data-guide-stage="run"] .guide-state-icon').textContent(), "✓");
    assert.equal(await page.locator('[data-guide-stage="observe"]').getAttribute("data-current"), "true");
    await reviewShortcut.press("Enter");
    assert.equal(await page.locator("body").getAttribute("data-workspace"), "build");
    assert.equal(await page.locator('#guide-content [data-stage="connect"]').evaluate((el) => el === document.activeElement), true);
    assert.equal(await source.textContent(), "Explain applications.");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#guide-content").isVisible(), false);
    assert.equal(await page.locator("#action-center").evaluate((el) => el === document.activeElement), true);
    await page.locator("#action-center").click();
    await page.getByRole("button", { name: "Open App Map", exact: true }).click();
    assert.equal(await page.locator("body").getAttribute("data-workspace"), "map");
    await page.waitForFunction(() => mapHasFitted);
    assert.equal(await page.getByRole("button", { name: "Open App Map", exact: true }).count(), 0);
    assert.equal(await page.locator("#map-app").evaluate((el) => el === document.activeElement), true);
    const connectionReview = page.getByRole("button", { name: "Connect: review connections", exact: true });
    const reviewCamera = await page.locator("#viewport").getAttribute("transform");
    await connectionReview.press("Enter");
    assert.equal(await page.locator("#details").getAttribute("data-mode"), "connections");
    assert.equal(await page.locator("#details h2").textContent(), "Connection review");
    assert.match(await page.locator("#details").innerText(), /custom-tool.*src\/agent\/main\.py:14.*Possible destinations: Loan agent/s);
    assert.match(await page.locator("#details").innerText(), /does not mean a running service has failed/);
    assert.equal(await page.locator("#viewport").getAttribute("transform"), reviewCamera);
    await page.locator("#details").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    assert.ok(await page.locator("#details").evaluate((el) => el.scrollTop > 0));
    await page.getByRole("button", { name: "Inspect Loan agent", exact: true }).click();
    assert.equal(await page.locator("#details h2").textContent(), "Loan agent");
    assert.equal(await page.locator("#details").evaluate((el) => el.scrollTop), 0);
    await page.locator("#details").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    assert.ok(await page.locator("#details").evaluate((el) => el.scrollTop > 0));
    await connectionReview.press("Space");
    assert.equal(await page.locator("#details").evaluate((el) => el.scrollTop), 0);
    await page.getByRole("button", { name: "Edit connections on App Map", exact: true }).click();
    assert.equal(await structureGuidance.isVisible(), true);
    await page.locator(".flow-connect").first().press("Enter");
    assert.match(await page.locator("#details h2").textContent(), /^Connect /);
    assert.equal(await structureGuidance.isVisible(), false);
    await connectionReview.press("Space");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#details").isVisible(), false);
    assert.equal(await connectionReview.evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.locator("#viewport").getAttribute("transform"), reviewCamera);
    await page.locator("#build-app").click();
    await openBuildPreview();
    assert.equal(await page.getByRole("button", { name: "Open App Map", exact: true }).count(), 1);
    assert.equal(await source.textContent(), "Explain applications.");

    await page.locator("#manage-app").click();
    const message = page.getByRole("textbox", { name: "Agent message", exact: true });
    const document = page.getByRole("textbox", { name: "Document text", exact: true });
    await message.fill("Explain my application.");
    await page.getByLabel("Document attachment", { exact: true }).click();
    await document.fill("Synthetic loan application.");
    assert.equal(await page.locator("#details").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(27, 30, 37)");
    await page.locator("#action-center").click();
    assert.equal(await message.inputValue(), "Explain my application.");
    assert.equal(await page.locator("#manage-app").getAttribute("aria-pressed"), "true");
    assert.ok((await page.locator("#details").boundingBox()).width >= 1393);

    for (const width of [380, 430, 620, 640, 780, 1000, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ["build", "manage", "logs", "map"]) {
        await openWorkspace(mode);
        if (mode === "build") {
          await openStructureFromGuide();
          assert.equal(await structureGuidance.isVisible(), true);
          assert.ok(await structureGuidance.evaluate((el) => el.scrollWidth <= el.clientWidth), `Structure guidance overflows at ${width}px`);
          const hint = await structureGuidance.boundingBox();
          const shell = await page.locator("#workspace-shell").boundingBox();
          assert.ok(hint.x >= shell.x && hint.x + hint.width <= shell.x + shell.width);
          await page.getByRole("button", { name: "Dismiss app structure guidance", exact: true }).click();
          assert.equal(await page.locator("#graph-shell").evaluate((el) => el.classList.contains("structure-editing")), false);
          await openWorkspace("build");
          await openBuildPreview();
          assert.equal(await page.locator(".build-explorer,.build-explorer-reopen,[data-build-files-toggle]").count(), 0);
          assert.equal(await page.getByRole("separator", { name: /Resize key files/i }).count(), 0);
          assert.equal(await page.locator(".build-source-preview").count(), 1);
          assert.ok((await preview.boundingBox()).height > 0);
          assert.equal(await source.textContent(), "Explain applications.");
          assert.ok(await buildRow.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
        }
        await page.mouse.move(0, 0);
        if (mode === "map" || mode === "logs") await assertObserveSwitcher();
        else assert.equal(await page.locator("#observe-views").isVisible(), false);
        if (mode === "logs") {
          await page.locator("#details").filter({ hasText: "Agent service output" }).waitFor();
          for (const button of await page.locator(".app-logs-controls button:visible").all()) assert.deepEqual(await buttonFormat(button), standardButton);
          for (const control of await page.locator('.app-logs-controls input:not([type="checkbox"]), .app-logs-controls select').all()) {
            const format = await buttonFormat(control);
            assert.ok(["normal", "18px"].includes(format.lineHeight), "Native single-line controls retain their line metrics");
            assert.deepEqual({ ...format, lineHeight: "18px" }, { ...standardButton, weight: "400" });
          }
          assert.equal(await page.locator(".app-logs-heading").evaluate((el) => getComputedStyle(el).fontSize), "20px");
          assert.equal(await page.locator(".app-logs-explanation").evaluate((el) => getComputedStyle(el).fontSize), "12px");
          assert.equal(await page.locator(".app-logs-status").evaluate((el) => getComputedStyle(el).fontSize), "11px");
          assert.equal(await page.locator(".app-logs-source").first().evaluate((el) => getComputedStyle(el).fontSize), "12px");
          assert.equal(await page.locator(".app-logs-content").count(), 1);
          assert.equal(await page.locator(".app-logs-service").count(), 0);
          assert.equal(await page.locator("#details").evaluate((el) => el.scrollHeight <= el.clientHeight + 1), true,
            "Logs owns its scrolling region instead of also scrolling the page");
        }
        const content = page.locator(mode === "map" ? "#graph-shell" : "#details");
        const bounds = await content.boundingBox();
        assert.ok(Math.abs(bounds.width - (width - 46)) < 1, `${mode} must leave only the status rail at ${width}px: ${JSON.stringify({
          bounds, workspace: await page.locator("#workspace").boundingBox(),
          guideCollapsed: await page.locator("#guide-rail").getAttribute("data-collapsed"),
          mode: await page.locator("body").getAttribute("data-workspace"),
        })}`);
        assert.ok((await content.boundingBox()).height > 500, `${mode} must fill the available height`);
        assert.ok(await content.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${mode} overflows at ${width}px`);
      }
      assert.ok(await page.locator("header").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      assert.ok(await page.locator(".studio-site-nav").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      assert.ok(await page.locator(".map-palette").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    }
    await page.locator("#build-app").click();
    await openBuildPreview();
    assert.equal(await source.textContent(), "Explain applications.");
    await page.locator("#manage-app").click();
    assert.equal(await message.inputValue(), "Explain my application.");
    assert.equal(await document.inputValue(), "Synthetic loan application.");

    await openWorkspace("map");
    assert.equal(await page.getByRole("button", { name: "Service logs for gateway", exact: true }).count(), 0);
    const beforeComponentLogs = logRequests.length;
    await page.getByRole("button", { name: "Service logs for Loan agent", exact: true }).press("Enter");
    const serviceFilter = page.locator(".app-logs-services > summary");
    await page.waitForFunction(() => document.querySelector(".app-logs-services > summary")?.textContent === "Loan agent");
    await page.locator("#details").filter({ hasText: "Agent service output" }).waitFor();
    assert.equal(await page.locator("body").getAttribute("data-workspace"), "logs");
    assert.equal(await page.locator("#graph-shell").isVisible(), false);
    assert.equal(await page.locator("#logs-app").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("#map-app").getAttribute("aria-pressed"), "true");
    assert.deepEqual(logRequests.slice(beforeComponentLogs, beforeComponentLogs + 2), [null, "agent"]);
    await page.locator("#logs-app").click();
    await page.locator("#details").filter({ hasText: "Agent service output" }).waitFor();
    assert.equal(await serviceFilter.textContent(), "All services", "The global Logs entry resets component scoping");
    await page.locator("#build-app").click();
    await page.locator("#map-app").click();
    assert.equal(await page.locator("body").getAttribute("data-workspace"), "logs", "Observe remembers its last view");
    await page.locator("#logs-app").press("ArrowLeft");
    assert.equal(await page.locator("#map-view").evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.locator("#logs-app").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("body").getAttribute("data-workspace"), "logs");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#map-view").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("body").getAttribute("data-workspace"), "map");
    assert.equal(await page.getByRole("tab").count(), 2);
    // Keep a selected card near the bottom to catch implicit camera correction on open.
    await page.evaluate(() => {
      const card = nodeElements.get("agent").getBoundingClientRect();
      const area = graphShell.getBoundingClientRect();
      transform.y += area.bottom - 10 - card.bottom;
      applyTransform();
    });
    const cameraBeforeDetails = await page.locator("#viewport").getAttribute("transform");
    const nodeBeforeDetails = await page.locator('[data-node-id="agent"]').boundingBox();
    await page.locator('[data-node-id="agent"]').press("Enter");
    assert.equal(await page.locator("#details h2").textContent(), "Loan agent");
    assert.equal(await page.locator("#map-app").getAttribute("aria-pressed"), "true");
    for (const button of await page.locator("#details > .actions > button").all()) assert.deepEqual(await buttonFormat(button), standardButton);
    const pathBounds = await page.locator("#details > code").boundingBox();
    const actionsBounds = await page.locator("#details > .actions").boundingBox();
    assert.ok(actionsBounds.y >= pathBounds.y + pathBounds.height + 8, "Inspector actions form a separate row below the source path");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator("#viewport").getAttribute("transform"), cameraBeforeDetails);
    const nodeAfterDetails = await page.locator('[data-node-id="agent"]').boundingBox();
    assert.ok(Math.abs(nodeBeforeDetails.y - nodeAfterDetails.y) < 1);
    assert.equal(await page.locator("#details").evaluate((el) => el.scrollTop), 0);
    const resizer = page.getByRole("separator", { name: "Resize details panel" });
    assert.equal(await resizer.getAttribute("aria-orientation"), "horizontal");
    const initialHeight = Number(await resizer.getAttribute("aria-valuenow"));
    await resizer.press("ArrowUp");
    assert.equal(Number(await resizer.getAttribute("aria-valuenow")), initialHeight + 24);
    await resizer.press("ArrowDown");
    assert.equal(Number(await resizer.getAttribute("aria-valuenow")), initialHeight);
    const handle = await resizer.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 3);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y - 45);
    await page.mouse.up();
    assert.ok(Number(await resizer.getAttribute("aria-valuenow")) > initialHeight);
    assert.equal(await page.locator("#viewport").getAttribute("transform"), cameraBeforeDetails);
    for (const width of [380, 640, 1024, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      const map = await page.locator("#graph-shell").boundingBox();
      const inspector = await page.locator("#details").boundingBox();
      assert.ok(Math.abs(map.width - inspector.width) < 1);
      assert.ok(inspector.y >= map.y + map.height);
      assert.ok(map.height > 100 && inspector.height >= 180);
      assert.ok(await page.locator("#details").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    }
    await page.locator("#action-center").click();
    assert.equal(await page.locator("#details h2").textContent(), "Loan agent");
    const mapWithGuide = await page.locator("#graph-shell").boundingBox();
    assert.equal((await page.locator("#details").boundingBox()).width, mapWithGuide.width);
    assert.ok(mapWithGuide.x + mapWithGuide.width <= (await page.locator("#guide-rail").boundingBox()).x + 1);
    await page.locator("#action-center").click();
    assert.equal(await page.locator("#details h2").textContent(), "Loan agent");
    const closeDetails = page.getByRole("button", { name: "Close details", exact: true });
    assert.equal(await closeDetails.textContent(), "");
    assert.equal(await closeDetails.locator('svg[aria-hidden="true"]').count(), 1);
    assert.equal(await closeDetails.getAttribute("title"), "Close details");
    assert.ok((await closeDetails.boundingBox()).width <= 34);
    await closeDetails.click();
    assert.equal(await page.locator('[data-node-id="agent"]').evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.locator("#details").isVisible(), false);
    assert.ok((await page.locator("#graph-shell").boundingBox()).width >= 1393);
    await page.locator(".map-tools > summary").click();
    assert.equal(await page.locator("#map-app").getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".map-tools").evaluate((el) => el.open), false);

    await page.reload();
    await buildRow.waitFor();
    await openBuildPreview();
    assert.equal(await page.locator("html").getAttribute("data-studio-theme"), "dark");
    preferenceFailure = true;
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    assert.equal(await page.getByRole("combobox", { name: "Preferred external editor" }).inputValue(), "vscode");
    await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("light");
    await page.getByText("Preference save failed.", { exact: true }).waitFor();
    assert.equal(await page.locator("html").getAttribute("data-studio-theme"), "dark");
    assert.equal(await page.getByRole("combobox", { name: "Appearance", exact: true }).isEnabled(), true);
    preferenceFailure = false;
    await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("light");
    await page.waitForFunction(() => document.documentElement.dataset.studioTheme === "light");
    await page.getByRole("button", { name: "Close settings" }).click();
    assert.equal(await page.locator(".build-source-preview").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(255, 255, 255)");
    assert.equal(await page.locator("#build-app").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(255, 255, 255)");
    assert.equal(await page.locator("#build-app").evaluate((el) => getComputedStyle(el).color), "rgb(31, 35, 40)");
    assert.equal(await page.locator("#build-app").evaluate((el) => getComputedStyle(el).borderBottomColor), "rgb(107, 63, 214)");
    assert.equal(await page.locator("#guide-content").isVisible(), false);
    assert.equal(await page.locator("#action-center").getAttribute("aria-expanded"), "false");
    await page.setViewportSize({ width: 380, height: 1000 });
    for (const mode of ["map", "logs"]) {
      await openWorkspace(mode);
      await page.mouse.move(0, 0);
      await assertObserveSwitcher();
    }
    await page.locator("#build-app").click();
    await openBuildPreview();
    const narrowToggleBounds = await page.locator("#action-center").boundingBox();
    await page.locator("#action-center").click();
    assert.ok(await page.locator("#guide-rail").isVisible());
    assert.ok((await page.locator("#guide-rail").boundingBox()).width <= 280);
    assert.deepEqual(await page.locator("#action-center").boundingBox(), narrowToggleBounds, "The narrow Guide overlay must keep the toggle anchored");
    await page.locator("#action-center").click();
    assert.deepEqual(await page.locator("#action-center").boundingBox(), narrowToggleBounds);
    assert.ok((await page.locator("#details").boundingBox()).width >= 333);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await openBuildPreview();
    assert.equal(await page.locator("#guide-content").isVisible(), false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#guide-content").waitFor({ state: "visible" });
    assert.equal(await page.locator("#guide-content").isVisible(), true);
    assert.deepEqual(mutations, ["/api/preferences", "/api/preferences", "/api/preferences"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
