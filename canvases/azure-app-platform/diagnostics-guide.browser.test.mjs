import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Build defers hidden discovery and keeps closed diagnostics out of source browsing in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.commands = [{
      id: "cancelled", kind: "az", label: "Azure discovery", command: "az aigateway list",
      status: "cancelled", startedAt: 1, durationMs: 10, note: "Cancelled",
    }];
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
      page.setDefaultTimeout(10000);
      const scans = [], errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => {
        if (new URL(request.url()).pathname === "/api/gateway-options") scans.push(request.url());
      });
      await page.goto(fixture.origin + "/app-map#build");
      await page.waitForFunction(() => window.appPlatformReady &&
        document.querySelector("#run-tab-operations-summary")?.textContent === "1 recorded");
      const logs = page.locator("#run-diagnostics-toggle");
      const dock = page.locator("#workspace-diagnostics");
      const support = page.locator("#run-diagnostics");
      assert.equal(await dock.isVisible(), false);
      assert.equal(await logs.getAttribute("aria-label"), "Logs");
      assert.equal(scans.length, 0, "Creation landing does not start discovery");

      await page.locator("#manage-app").click();
      await page.locator("#build-workspace").click();
      fixture.state.health = "Readiness settled in Build";
      await page.waitForFunction(() => document.querySelector("#run-panel-services").textContent.includes("Readiness settled"));
      assert.equal(scans.length, 0, "Navigation and readiness polling do not scan hidden Environment");
      await logs.click();
      assert.equal(await support.isVisible(), true);
      assert.equal(scans.length, 0, "Opening Output does not scan Environment");
      await page.locator("#run-tab-operations").click();
      const cancelled = page.locator('[data-run-disclosure="cancelled"]');
      assert.equal(await cancelled.getAttribute("data-status"), "cancelled");
      assert.match(await cancelled.innerText(), /Cancelled/);
      assert.equal(await logs.getAttribute("aria-label"), "Logs");
      await logs.click();

      fixture.state.commands.push({
        id: "failed", kind: "az", label: "Azure discovery", command: "az aigateway list",
        status: "failed", startedAt: 2, durationMs: 10, note: "Forbidden",
      });
      await page.waitForFunction(() => document.querySelector("#run-diagnostics-toggle").getAttribute("aria-label").includes("1 failed operation"));
      for (const theme of ["light", "dark"]) {
        await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, theme);
        assert.equal(await dock.isVisible(), false, "Closed Build has no diagnostics gutter");
        assert.equal(await logs.locator(".logs-warning-badge").isVisible(), true, "Real failures remain discoverable");
      }
      await logs.click();
      assert.equal(await support.isVisible(), true);
      assert.equal(await page.locator("#diagnostics-status, .run-diagnostics-toolbar").count(), 0);
      await page.locator('[data-run-disclosure="failed"] > summary').click();
      assert.match(await page.locator('[data-run-disclosure="failed"]').innerText(), /Forbidden/);
      await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === "/api/gateway-options"),
        page.locator("#run-tab-environment").click(),
      ]);
      assert.equal(scans.length, 1, "Explicit Environment selection starts discovery");
      await logs.click();
      fixture.state.health = "Closed Environment does not scan";
      await page.waitForFunction(() => document.querySelector("#run-panel-services").textContent.includes("Closed Environment"));
      assert.equal(scans.length, 1);
      assert.equal(await dock.isVisible(), false);
      await page.locator("#manage-app").click();
      assert.equal(await page.locator("#diagnostics-status, .run-diagnostics-toolbar").count(), 0);
      assert.equal(await logs.locator(".logs-warning-badge").isVisible(), true,
        "Run retains the real failure badge without a separate strip");
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await fixture.close(); }
  });

  test(`Header Logs shares one bottom pane across workspaces and reports real issues in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.documentInput = true;
    fixture.state.lines = Array.from({ length: 180 }, (_, i) => `[agent] Evidence ${i}`);
    const browser = await engine.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(fixture.origin + "/app-map");
      await page.locator('.agent-status-brief[data-state="ready"]').waitFor();
      await page.addStyleTag({ content: "::-webkit-scrollbar{width:16px;height:16px}::-webkit-scrollbar-thumb{background:var(--studio-muted)}" });
      const logs = page.locator("#run-diagnostics-toggle"), dock = page.locator("#run-diagnostics");
      const badge = logs.locator(".logs-warning-badge");
      assert.equal(await logs.innerText(), "");
      assert.equal(await logs.getAttribute("aria-label"), "Logs");
      assert.equal(await logs.getAttribute("data-appearance"), "secondary");
      assert.equal(await logs.locator('svg[data-octicon="terminal"]').count(), 1);
      assert.equal(await badge.count(), 0);
      await page.getByRole("textbox", { name: "Agent message", exact: true }).fill("Retain this task while reviewing logs.");
      await page.evaluate(() => { window.logsButton = document.querySelector("#run-diagnostics-toggle"); });
      for (const id of ["build-workspace", "connect-workspace", "manage-app", "map-app", "deploy-workspace"]) {
        await page.locator("#" + id).click();
        await logs.focus();
        await logs.press("Enter");
        assert.equal(await dock.isVisible(), true);
        assert.equal(await page.locator("#" + id).getAttribute("aria-current"), "page", "Logs must not navigate.");
        assert.equal(await logs.evaluate(node => node === window.logsButton), true);
        assert.equal(await dock.count(), 1);
        assert.equal(await page.locator("#app-workspace-main #run-diagnostics").count(), 0);
        await page.locator("[data-runtime-output]").evaluate(node => { node.scrollTop = 90; });
        fixture.state.lines.push("[agent] Still polling on " + id);
        await page.waitForFunction(value => document.querySelector("[data-runtime-output]").textContent.includes(value), id);
        assert.equal(await page.locator("[data-runtime-output]").evaluate(node => node.scrollTop), 90);
        const resizer = page.getByRole("separator", { name: "Resize Diagnostics", exact: true });
        await resizer.focus();
        fixture.state.health = "Updated with " + id + " and Logs open";
        await page.waitForFunction(value => document.querySelector("#run-panel-services").textContent.includes(value), fixture.state.health);
        assert.equal(await resizer.evaluate(node => node === document.activeElement), true);
        for (const theme of ["light", "dark"]) {
          await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, theme);
          for (const width of [320, 380, 620, 800]) {
            await page.setViewportSize({ width, height: 480 });
            await page.waitForFunction(() => {
              const dock = document.querySelector("#workspace-diagnostics");
              const available = dock.clientHeight + dock.previousElementSibling.clientHeight;
              return Number(dock.querySelector('[role="separator"]').getAttribute("aria-valuenow")) <= Math.floor(available * .55);
            });
            const geometry = await page.evaluate(() => {
              const action = document.querySelector("#header-runtime-action").getBoundingClientRect();
              const logs = document.querySelector("#run-diagnostics-toggle").getBoundingClientRect();
              const divider = document.querySelector(".workspace-action-divider").getBoundingClientRect();
              const menu = document.querySelector(".workspace-view-switch").getBoundingClientRect();
              const first = document.querySelector("#build-workspace").getBoundingClientRect();
              const bar = document.querySelector(".workspace-navigation-bar").getBoundingClientRect();
              const main = document.querySelector("#app-workspace-main").getBoundingClientRect();
              const dock = document.querySelector("#workspace-diagnostics").getBoundingClientRect();
              return {
                fits: document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth,
                divided: action.right < divider.left && divider.right < logs.left && divider.height === 20,
                sameRow: Math.abs(action.top - logs.top) <= 1,
                belowMenu: action.top >= menu.bottom + 4,
                besideMenu: action.left >= menu.right + 7 && Math.abs(action.top - first.top) <= 1,
                rightAligned: Math.abs(logs.right - (bar.right - 12)) <= 1,
                below: main.bottom <= dock.top + 1,
                mainHeight: main.height,
              };
            });
            assert.ok((width <= 680 ? geometry.belowMenu : geometry.besideMenu) &&
              geometry.rightAligned && geometry.fits && geometry.divided && geometry.sameRow && geometry.below && geometry.mainHeight > 60,
              JSON.stringify({ id, theme, width, geometry }));
          }
        }
        await page.locator("#run-tab-output").focus();
        await page.keyboard.press("Escape");
        assert.equal(await dock.isVisible(), false);
        assert.equal(await logs.evaluate(node => node === document.activeElement), true);
        assert.equal(await logs.getAttribute("aria-expanded"), "false");
        await logs.press("Space");
        assert.equal(await dock.isVisible(), true);
        await logs.press("Space");
        assert.equal(await dock.isVisible(), false);
        await page.setViewportSize({ width: 620, height: 800 });
      }
      await page.locator("#manage-app").click();
      assert.equal(await page.getByRole("textbox", { name: "Agent message", exact: true }).inputValue(),
        "Retain this task while reviewing logs.");
      fixture.state.app = "stopped";
      await page.locator("#app-status-badge").filter({ hasText: "Not running" }).waitFor();
      assert.equal(await badge.count(), 0, "A stopped runtime is not an issue.");
      fixture.state.commands = [{ id: "failed", label: "Simulated task", kind: "http", command: "POST /responses",
        status: "failed", startedAt: 1, durationMs: 10, note: "HTTP 503", output: "Simulated upstream failure" }];
      await badge.waitFor();
      assert.equal(await logs.getAttribute("aria-expanded"), "false");
      assert.match(await logs.getAttribute("aria-label"), /1 failed operation/);
      for (const theme of ["light", "dark"]) {
        await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, theme);
        assert.equal(await badge.getAttribute("data-color"), "danger");
        assert.equal(await badge.getAttribute("aria-hidden"), "true");
        assert.equal(await badge.locator("svg").count(), 1);
        const color = await badge.evaluate(node => getComputedStyle(node).color);
        const channels = color.match(/[\d.]+/g).map(Number);
        assert.ok(channels[0] > channels[1] && channels[0] > channels[2], color);
      }
      await page.route("**/api/app-status*", async route => {
        const response = await route.fetch();
        await route.fulfill({ response, json: { ...await response.json(), recovered: true } });
      });
      fixture.state.app = "starting";
      await page.locator("#header-runtime-action").filter({ hasText: "Stop partial startup" }).waitFor();
      for (const width of [320, 380, 620, 800]) {
        await page.setViewportSize({ width, height: 480 });
        const geometry = await page.evaluate(() => {
          const menu = document.querySelector(".workspace-view-switch").getBoundingClientRect();
          const action = document.querySelector("#header-runtime-action").getBoundingClientRect();
          const logs = document.querySelector("#run-diagnostics-toggle").getBoundingClientRect();
          const bar = document.querySelector(".workspace-navigation-bar").getBoundingClientRect();
          return { separated: action.left >= menu.right + 7, belowMenu: action.top >= menu.bottom + 4,
            sameRow: Math.abs(action.top - logs.top) <= 1,
            rightAligned: Math.abs(logs.right - (bar.right - 12)) <= 1, fits: logs.right <= innerWidth,
            label: document.querySelector("#header-runtime-action").getAttribute("aria-label") };
        });
        assert.ok((width <= 680 ? geometry.belowMenu : geometry.separated) &&
          geometry.sameRow && geometry.rightAligned && geometry.fits, JSON.stringify({ width, geometry }));
        assert.equal(geometry.label, "Stop partial startup");
      }
      await page.unroute("**/api/app-status*");
      fixture.state.app = "stopped";
      fixture.state.commands = [];
      fixture.state.outputError = true;
      await page.waitForFunction(() => document.querySelector("#run-diagnostics-toggle").getAttribute("aria-label").includes("Logs unavailable"));
      assert.equal(await page.locator("#diagnostics-status, .run-diagnostics-toolbar").count(), 0);
      fixture.state.outputError = false;
      await badge.waitFor({ state: "detached" });
      fixture.state.app = "failed";
      fixture.state.error = "Simulated runtime failure";
      await page.waitForFunction(() => document.querySelector("#run-diagnostics-toggle").getAttribute("aria-label").includes("Runtime failed"));
      fixture.state.app = "running";
      fixture.state.error = "";
      await badge.waitFor({ state: "detached" });
      await page.route("**/api/agent-invoke", route => route.fulfill({ status: 503, json: { error: "Simulated agent failure" } }));
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await page.locator('.agent-response[data-state="failed"]').waitFor();
      assert.match(await page.locator(".agent-response").innerText(), /Simulated agent failure/);
      assert.equal(await badge.count(), 0, "Invocation errors stay in their result, not global diagnostics.");
      assert.equal(await dock.isVisible(), false);
      assert.equal(fixture.mutations.filter(item => item.path === "/api/app-command").length, 0);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await fixture.close(); }
  });

  test(`Optional Diagnostics preserves task and support state through resize, polling and navigation in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.documentInput = true;
    fixture.state.lines = Array.from({ length: 180 }, (_, i) => `[agent] Evidence line ${i}`);
    fixture.state.commands = Array.from({ length: 15 }, (_, i) => ({
      id: String(i), label: "Task " + i, status: "succeeded", kind: "http",
      command: "POST /responses", startedAt: i + 1, durationMs: 100, note: "HTTP 200",
      output: "Task output\n".repeat(40),
    }));
    const browser = await engine.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(fixture.origin + "/app-map");
      await page.waitForFunction(() => window.appPlatformReady);
      await page.locator('.agent-status-brief[data-state="ready"]').waitFor();
      await page.addStyleTag({ content: "::-webkit-scrollbar{width:16px;height:16px}::-webkit-scrollbar-thumb{background:var(--studio-muted)}" });
      const support = page.getByRole("region", { name: "Diagnostics", exact: true });
      const toggle = page.locator("#run-diagnostics-toggle");
      const resizer = page.getByRole("separator", { name: "Resize Diagnostics", exact: true });
      assert.equal(await support.isVisible(), false);
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      await page.locator('[data-event-preset="loan.document.submitted"]').click();
      const prompt = page.getByRole("textbox", { name: "Agent message", exact: true });
      const document = page.locator('textarea[aria-label="Document text"]');
      await prompt.fill("Event [test.task.received]: preserve this payload.");
      const payload = await prompt.inputValue(), documentText = await document.inputValue();
      await prompt.evaluate(node => node.setSelectionRange(6, 12));
      await toggle.focus();
      await toggle.press("Enter");
      assert.equal(await support.isVisible(), true);
      assert.deepEqual(await support.getByRole("tab").allTextContents(), ["OutputLive logs", "Services3/3 ready", "EnvironmentGateway ready", "Operations15 recorded"]);
      await resizer.focus();
      const height = Number(await resizer.getAttribute("aria-valuenow"));
      await resizer.press("ArrowUp");
      assert.equal(Number(await resizer.getAttribute("aria-valuenow")), height + 24);
      await resizer.press("End");
      assert.equal(await resizer.getAttribute("aria-valuenow"), await resizer.getAttribute("aria-valuemax"));
      await resizer.press("Home");
      assert.equal(await resizer.getAttribute("aria-valuenow"), await resizer.getAttribute("aria-valuemin"));
      const beforeDrag = Number(await resizer.getAttribute("aria-valuenow"));
      const box = await resizer.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 4 });
      await page.mouse.up();
      const resized = Number(await resizer.getAttribute("aria-valuenow"));
      assert.ok(resized > beforeDrag);
      assert.equal(await page.locator("#workspace-diagnostics").evaluate(node => node.classList.contains("resizing-diagnostics")), false);
      const log = page.locator("[data-runtime-output]");
      await log.evaluate(node => { node.scrollTop = 90; });
      await page.waitForResponse(response => response.url().includes("/api/app-output"));
      assert.equal(await log.evaluate(node => node.scrollTop), 90);
      const operations = support.getByRole("tab", { name: "Operations", exact: true });
      await operations.click();
      const disclosure = page.locator('[data-run-disclosure="0"]');
      await disclosure.locator("summary").click();
      const panel = page.locator("#run-panel-operations");
      await panel.evaluate(node => { node.scrollTop = 45; });
      await toggle.click();
      assert.equal(await support.isVisible(), false);
      await toggle.press("Enter");
      assert.equal(await operations.getAttribute("aria-selected"), "true");
      assert.equal(await disclosure.evaluate(node => node.open), true);
      assert.equal(await panel.evaluate(node => node.scrollTop), 45);
      fixture.state.health = "Polled after resize";
      await page.waitForFunction(() => document.querySelector("#run-panel-services").textContent.includes("Polled after resize"));
      assert.equal(await disclosure.evaluate(node => node.open), true);
      assert.equal(await panel.evaluate(node => node.scrollTop), 45);
      assert.equal(Number(await resizer.getAttribute("aria-valuenow")), resized);
      await resizer.focus();
      fixture.state.health = "Resizer keeps focus";
      await page.waitForFunction(() => document.querySelector("#run-panel-services").textContent.includes("Resizer keeps focus"));
      assert.equal(await resizer.evaluate(node => node === globalThis.document.activeElement), true);
      await page.locator("#map-app").click();
      await page.locator("#manage-app").click();
      assert.equal(await support.isVisible(), true);
      assert.equal(await operations.getAttribute("aria-selected"), "true");
      assert.equal(await disclosure.evaluate(node => node.open), true);
      assert.equal(await panel.evaluate(node => node.scrollTop), 45);
      assert.equal(await prompt.inputValue(), payload);
      assert.equal(await document.inputValue(), documentText);
      assert.deepEqual(await prompt.evaluate(node => [node.selectionStart, node.selectionEnd]), [6, 12]);
      await resizer.focus();
      await resizer.press("Escape");
      assert.equal(await support.isVisible(), false);
      assert.equal(await toggle.evaluate(node => node === globalThis.document.activeElement), true);
      await toggle.press("Enter");
      assert.equal(await operations.getAttribute("aria-selected"), "true");
      await page.setViewportSize({ width: 320, height: 480 });
      await page.setViewportSize({ width: 620, height: 800 });
      await page.waitForFunction(value => Number(document.querySelector(".run-diagnostics-resizer").getAttribute("aria-valuenow")) === value, resized);
      assert.equal(Number(await resizer.getAttribute("aria-valuenow")), resized, "Viewport clamping retains the preferred height.");
      assert.equal(await page.locator(".agent-tester").count(), 1);
      await operations.press("Home");
      assert.equal(await support.getByRole("tab", { name: "Output", exact: true }).getAttribute("aria-selected"), "true");
      assert.equal(await log.evaluate(node => node.scrollTop), 90);
      await page.evaluate(() => { globalThis.document.documentElement.dir = "rtl"; });
      await support.getByRole("tab", { name: "Output", exact: true }).press("ArrowLeft");
      assert.equal(await support.getByRole("tab", { name: "Services", exact: true }).getAttribute("aria-selected"), "true");
      await page.evaluate(() => { globalThis.document.documentElement.dir = ""; });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(value => { globalThis.document.documentElement.dataset.studioTheme = value; }, theme);
        for (const [width, height] of [[320, 480], [380, 480], [620, 800], [1000, 480]]) {
          await page.setViewportSize({ width, height });
          await resizer.press("End");
          const geometry = await page.locator("#workspace-content").evaluate(node => {
            const primary = node.querySelector(".run-primary"), support = node.querySelector(".run-support");
            const shell = node.getBoundingClientRect(), main = primary.getBoundingClientRect(), dock = support.getBoundingClientRect();
            return { fits: node.scrollWidth <= node.clientWidth + 1, mainHeight: main.height,
              contained: main.bottom <= dock.top && dock.bottom <= shell.bottom + 1,
              height: support.clientHeight, max: Math.floor(node.clientHeight * .55),
              scrollbar: primary.offsetWidth - primary.clientWidth };
          });
          assert.ok(geometry.fits && geometry.contained && geometry.mainHeight > 65, JSON.stringify({ width, height, geometry }));
          assert.ok(geometry.height <= geometry.max && geometry.scrollbar >= 14);
          assert.ok(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
        }
      }
      await toggle.click();
      fixture.state.outputError = true;
      fixture.state.commands[0].status = "failed";
      await page.waitForFunction(() => document.querySelector("#run-diagnostics-toggle").getAttribute("aria-label").includes("Logs unavailable"));
      assert.equal(await page.locator("#diagnostics-status, .run-diagnostics-toolbar").count(), 0);
      assert.equal(await support.isVisible(), false);
      fixture.state.outputError = false;
      await page.waitForFunction(() => document.querySelector("#run-diagnostics-toggle").getAttribute("aria-label").includes("1 failed operation"));
      assert.equal(await support.isVisible(), false, "Failures stay explicit without forcing the pane open.");
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await fixture.close(); }
  });

  test(`Footer removal reclaims every workspace and retains action and failure announcements in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      let agentReady = false;
      await page.route("**/api/app-status*", route => route.fulfill({ json: {
        state: fixture.state.app, entrypoints: [{ name: "web", port: 3000, ready: true },
          { name: "agent", port: 8088, ready: agentReady, healthStatus: fixture.state.health }],
      } }));
      await page.goto(fixture.origin + "/app-map");
      await page.waitForFunction(() => window.appPlatformReady);
      await page.locator('.agent-status-brief[data-state="agent-unavailable"]').waitFor();
      assert.equal(await page.locator("#workspace-status-footer,#workspace-guide,#action-center,#guide-rail,[data-guide-stage]").count(), 0);
      assert.equal(await page.locator('[aria-controls*="guide-"]').count(), 0);
      assert.equal(await page.locator("#workspace-runtime-bar").isVisible(), false);
      assert.equal(await page.locator(".studio-theme-control #header-open-app").isVisible(), true);
      assert.ok(await page.evaluate(() => Math.abs(document.querySelector("#app-workspace-main").getBoundingClientRect().top -
        document.querySelector(".workspace-navigation-bar").getBoundingClientRect().bottom) <= 1),
      "Healthy Run starts immediately after navigation, with no empty runtime row.");
      const prompt = page.getByRole("textbox", { name: "Agent message", exact: true });
      await prompt.fill("Retain this task without a footer.");
      const status = page.locator("#status");
      assert.equal(await status.getAttribute("role"), "status");
      assert.ok(await status.evaluate(node => node.classList.contains("visually-hidden")));
      for (const theme of ["light", "dark"]) {
        await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, theme);
        for (const [width, height] of [[320, 480], [380, 480], [620, 800]]) {
          await page.setViewportSize({ width, height });
          for (const [id, mode] of [["build-workspace", "build"], ["connect-workspace", "connections"],
            ["manage-app", "manage"], ["map-app", "map"], ["deploy-workspace", "deploy"]]) {
            await page.locator("#" + id).click();
            await page.locator('body[data-workspace="' + mode + '"]').waitFor();
            const geometry = await page.evaluate(() => {
              const main = document.querySelector("#app-workspace-main").getBoundingClientRect();
              const dockNode = document.querySelector("#workspace-diagnostics");
              const dock = dockNode.getBoundingClientRect();
              const content = document.querySelector("#workspace-content").getBoundingClientRect();
              return {
                noGap: dockNode.checkVisibility()
                  ? Math.abs(main.bottom - dock.top) <= 1 && Math.abs(dock.bottom - content.bottom) <= 1
                  : Math.abs(main.bottom - content.bottom) <= 1,
                fits: document.documentElement.scrollWidth <= innerWidth,
                footer: document.querySelector("footer,#action-center,#guide-rail"),
              };
            });
            assert.ok(geometry.noGap && geometry.fits && !geometry.footer, JSON.stringify({ width, theme, mode, geometry }));
            assert.equal(await page.locator("#app-status-badge").isVisible(), true);
          }
        }
      }
      await page.setViewportSize({ width: 620, height: 800 });
      await page.locator("#manage-app").click();
      assert.equal(await prompt.inputValue(), "Retain this task without a footer.");
      const logs = page.locator("#run-diagnostics-toggle");
      await logs.click();
      const separator = page.getByRole("separator", { name: "Resize Diagnostics", exact: true });
      await separator.focus();
      await separator.press("ArrowUp");
      assert.ok(Number(await separator.getAttribute("aria-valuenow")) >= Number(await separator.getAttribute("aria-valuemin")));
      await separator.press("Escape");
      assert.equal(await logs.evaluate(node => node === document.activeElement), true);
      await page.route("**/api/open-entrypoint", route => route.fulfill({ status: 503,
        json: { error: "Simulated action failure without a footer." } }));
      await page.locator("#header-open-app").click();
      await status.filter({ hasText: "Simulated action failure without a footer." }).waitFor();
      assert.equal(await status.getAttribute("role"), "alert");
      assert.equal(await status.isVisible(), true);
      assert.ok(!await status.evaluate(node => node.classList.contains("visually-hidden")));
      await page.locator("#map-app").click();
      await page.locator(".map-tools > summary").click();
      await page.getByRole("button", { name: "Reset map", exact: true }).click();
      assert.equal(await status.textContent(), "App Map view reset.");
      assert.equal(await status.getAttribute("role"), "status");
      assert.ok(await status.evaluate(node => node.classList.contains("visually-hidden")));
      await page.locator("#manage-app").click();
      agentReady = true;
      await page.locator('.agent-status-brief[data-state="ready"]').waitFor();
      await page.route("**/api/agent-invoke", route => route.fulfill({ status: 503, json: { error: "Simulated task failure" } }));
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await page.locator('.agent-response[data-state="failed"]').waitFor();
      assert.equal(await page.locator(".agent-status-brief").getAttribute("data-state"), "ready");
      assert.match(await page.locator(".agent-response").innerText(), /Simulated task failure/);
      assert.equal(await status.getAttribute("role"), "status");
      assert.ok(await status.evaluate(node => node.classList.contains("visually-hidden")));
      assert.equal(await logs.getAttribute("aria-expanded"), "false");
      assert.equal(await logs.locator(".logs-warning-badge").count(), 0);
      await page.locator("#map-app").click();
      assert.equal(await page.locator("#workspace-runtime-bar").isVisible(), false);
      assert.equal(await page.locator(".workspace-lifecycle-actions #header-runtime-action").isVisible(), true,
        "Runtime controls remain on the navigation row outside Run.");
      await page.locator("#manage-app").click();
      fixture.state.app = "stopping";
      await page.locator("#app-status-badge").filter({ hasText: "Stopping" }).waitFor();
      assert.equal(await page.locator("#workspace-runtime-bar").isVisible(), false);
      assert.equal(await page.locator(".app-workspace-header #app-status-badge").isVisible(), true,
        "Active lifecycle status stays visible beside the app name without a footer.");
      assert.equal(fixture.mutations.some(item => item.path === "/api/app-command"), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await fixture.close(); }
  });
}
