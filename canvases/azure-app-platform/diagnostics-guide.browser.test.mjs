import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
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
      assert.equal(await page.locator("#details").evaluate(node => node.classList.contains("resizing-diagnostics")), false);
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
          const geometry = await page.locator(".run-workspace").evaluate(node => {
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
      await page.waitForFunction(() => document.querySelector("#diagnostics-status").textContent.includes("Logs unavailable"));
      assert.equal(await page.locator("#diagnostics-status").isVisible(), true);
      assert.equal(await support.isVisible(), false);
      fixture.state.outputError = false;
      await page.waitForFunction(() => document.querySelector("#diagnostics-status").textContent.includes("1 failed operation"));
      assert.equal(await support.isVisible(), false, "Failures stay explicit without forcing the pane open.");
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await fixture.close(); }
  });

  test(`Contextual Guide is a dismissible nonmodal view, not a competing rail in ${name}`, {
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
      const trigger = page.locator("#action-center"), guide = page.locator("#guide-rail");
      await page.getByRole("button", { name: "Guide: Check the agent endpoint", exact: true }).waitFor();
      assert.equal(await trigger.innerText(), "Guide");
      assert.equal(await page.locator("#workspace-status-footer #action-center").count(), 1);
      assert.equal(await page.locator("#workspace-runtime-bar #action-center, #studio-workspace-navigation > header #action-center").count(), 0);
      assert.equal(await page.locator("#workspace-runtime-bar").isVisible(), false);
      assert.equal(await page.locator(".studio-theme-control #header-open-app").isVisible(), true);
      assert.ok(await page.evaluate(() => Math.abs(document.querySelector("#app-workspace-main").getBoundingClientRect().top -
        document.querySelector(".workspace-navigation-bar").getBoundingClientRect().bottom) <= 1),
      "Healthy Run starts immediately after navigation, with no empty runtime row.");
      assert.equal(await guide.isVisible(), false);
      const width = (await page.locator("#workspace").boundingBox()).width;
      await trigger.press("ArrowDown");
      assert.equal(await guide.isVisible(), true);
      assert.equal(await page.locator("#guide-context button").evaluate(node => node === document.activeElement), true);
      assert.equal((await page.locator("#workspace").boundingBox()).width, width);
      assert.match(await page.locator("#guide-context").innerText(), /agent is not ready/);
      await page.locator("#guide-context button").press("Enter");
      assert.equal(await guide.isVisible(), false);
      assert.equal(await page.getByRole("tab", { name: "Services", exact: true }).getAttribute("aria-selected"), "true");
      agentReady = true;
      await page.getByRole("button", { name: "Guide: Dispatch an event or task", exact: true }).waitFor();
      await trigger.press("Enter");
      const more = page.locator("#guide-content .more-guidance");
      await more.locator("summary").click();
      await page.locator("#guide-content").evaluate(node => { node.scrollTop = 90; });
      fixture.state.health = "Updated with Guide open";
      await page.waitForFunction(() => document.querySelector("#run-panel-services").textContent.includes("Updated with Guide open"));
      assert.equal(await more.evaluate(node => node.open), true);
      assert.equal(await more.locator("summary").evaluate(node => node === document.activeElement), true);
      assert.equal(await page.locator("#guide-content").evaluate(node => node.scrollTop), 90);
      await page.locator('[data-guide-stage="connect"]').click();
      assert.equal(await guide.isVisible(), true, "Stage shortcuts explain progress without navigating.");
      await page.keyboard.press("Escape");
      assert.equal(await guide.isVisible(), false);
      assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
      await trigger.click();
      await page.locator("#guide-content [data-action-key='customize-app']").click();
      assert.equal(await guide.isVisible(), false);
      await page.getByRole("region", { name: "Build workspace", exact: true }).waitFor();
      assert.equal(await trigger.getAttribute("aria-expanded"), "false");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#build-workspace").getAttribute("aria-current"), "page");
      await page.locator("#manage-app").click();
      await trigger.click();
      await page.locator("#close-guide").click();
      assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
      await trigger.click();
      await page.locator("#app-title").click();
      assert.equal(await guide.isVisible(), false);
      await page.route("**/api/agent-invoke", route => route.fulfill({ status: 503, json: { error: "Simulated task failure" } }));
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await page.locator('.agent-status-brief[data-state="failed"]').waitFor();
      await page.getByRole("button", { name: "Guide: Review failed task", exact: true }).waitFor();
      assert.equal(await guide.isVisible(), false);
      assert.match(await page.locator(".agent-response").innerText(), /Simulated task failure/);
      assert.equal(await page.locator("#run-diagnostics-toggle").getAttribute("aria-expanded"), "true");
      for (const theme of ["light", "dark"]) {
        await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, theme);
        for (const [width, height] of [[320, 480], [620, 800], [1000, 480]]) {
          await page.setViewportSize({ width, height });
          await trigger.click();
          const bounds = await guide.boundingBox();
          assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
          assert.ok(bounds.y >= (await page.locator("#app-workspace-main").boundingBox()).y,
            "The footer-anchored Guide must leave header navigation accessible.");
          assert.equal(await page.locator("#workspace-runtime-bar").isVisible(), false);
          assert.equal(await trigger.isVisible(), true);
          assert.ok(await guide.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
          assert.equal(await page.getByRole("button", { name: "Guide: Review failed task", exact: true }).count(), 1);
          await page.keyboard.press("Escape");
        }
      }
      await page.locator("#map-app").click();
      assert.equal(await trigger.isVisible(), true);
      assert.equal(await page.locator("#workspace-runtime-bar").isVisible(), true,
        "Runtime controls remain available outside Run.");
      await page.locator("#manage-app").click();
      fixture.state.app = "stopping";
      await page.locator("#app-status-badge").filter({ hasText: "Stopping" }).waitFor();
      assert.equal(await page.locator("#workspace-runtime-bar").isVisible(), true,
        "Active lifecycle notices are never removed as empty chrome.");
      assert.equal(fixture.mutations.some(item => item.path === "/api/app-command"), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await fixture.close(); }
  });
}
