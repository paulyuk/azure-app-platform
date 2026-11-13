import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture, returnToRun } from "./run-settings-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`invocation opens Output without stealing focus and respects collapse in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.lines = [
      "[agent] 2026-06-07 12:34:56,789 [ERROR] deal-finder: request failed",
      "[sandbox] WARNING connection slow",
    ];
    const browser = await engine.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    let release, requests = 0;
    try {
      const page = await browser.newPage({ viewport: { width: 430, height: 800 } });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/agent-invoke", async route => {
        requests++;
        await new Promise(resolve => { release = resolve; });
        await route.fulfill({ json: { response: "Complete", summary: { text: "Complete", tools: [] } } });
      });
      await page.goto(fixture.origin + "/app-map");
      await page.locator('.agent-status-brief[data-state="ready"]').waitFor();
      const prompt = page.getByRole("textbox", { name: "Agent message", exact: true });
      const invoke = page.getByRole("button", { name: "Invoke agent", exact: true });
      const headerToggle = page.locator("#run-diagnostics-toggle");
      await headerToggle.click();
      await page.locator("#run-tab-environment").click();
      await page.locator("#run-panel-environment .connections-root").waitFor();
      await headerToggle.click();
      await prompt.fill("   ");
      await invoke.click();
      assert.equal(await headerToggle.getAttribute("aria-expanded"), "false");
      assert.equal(requests, 0, "Invalid input must not invoke or open Output.");
      await prompt.fill("Inspect the synthetic request.");
      await invoke.click();
      const view = page.getByRole("region", { name: "Run execution", exact: true });
      const heading = view.getByRole("heading", { name: "Run in progress" });
      await heading.waitFor();
      await page.waitForFunction(() => document.querySelector("[data-invocation-stage]")?.textContent === "Waiting for response");
      assert.equal(await heading.evaluate(node => node === document.activeElement), true);
      assert.equal(await headerToggle.getAttribute("aria-expanded"), "true");
      assert.equal(await page.locator('[data-run-tab="output"]').getAttribute("aria-selected"), "true");
      assert.equal(await page.getByRole("heading", { name: "Command output", exact: true }).count(), 0);
      assert.equal(await page.locator("#run-panel-environment .connections-root").count(), 0,
        "Opening Output must not render the previously selected hidden Environment panel.");
      const issues = page.locator("[data-output-issues]");
      await page.waitForFunction(() =>
        document.querySelector("[data-output-issues]")?.getAttribute("aria-label")?.includes("1 error line, 1 warning line"));

      for (const width of [430, 960]) {
        await page.setViewportSize({ width, height: 800 });
        const handle = await page.getByRole("separator", { name: "Resize Diagnostics", exact: true }).boundingBox();
        const dock = await page.locator("#workspace-diagnostics").boundingBox();
        const stage = await page.locator(".run-output-stage").boundingBox();
        assert.ok(handle && dock && stage);
        assert.ok(Math.abs(handle.y - dock.y) <= 1, "The resize handle sits at the top of the log window.");
        assert.ok(handle.y + handle.height <= stage.y + 1, "The resize handle precedes the Output status bar.");
      }
      await page.setViewportSize({ width: 430, height: 800 });

      const toggle = page.locator("[data-output-toggle]");
      await toggle.focus();
      await toggle.press("Space");
      assert.equal(await headerToggle.getAttribute("aria-expanded"), "false");
      assert.equal(await toggle.evaluate(node => node === document.activeElement), true);
      fixture.state.lines.push("[agent] WARNING another synthetic line");
      await page.locator("[data-output-new]").waitFor();
      assert.equal(await headerToggle.getAttribute("aria-expanded"), "false", "Polling must not reopen logs.");
      release();
      await view.getByRole("heading", { name: "Run complete" }).waitFor();
      await page.locator("[data-invocation-stage]").filter({ hasText: "Response received" }).waitFor();
      assert.equal(await headerToggle.getAttribute("aria-expanded"), "false", "Completion must not reopen logs.");
      await page.locator("[data-output-toggle]").focus();
      await page.locator("[data-output-toggle]").press("Enter");
      assert.equal(await headerToggle.getAttribute("aria-expanded"), "true");
      assert.equal(await page.locator("[data-output-new]").isVisible(), false);
      assert.match(await issues.getAttribute("title"), /recognized error and warning lines/);

      await page.locator("#build-workspace").click();
      assert.equal(await page.locator(".run-output-stage").isVisible(), false);
      await page.locator("#manage-app").click();
      assert.equal(await page.locator(".run-output-stage").isVisible(), true);
      await returnToRun(page);
      assert.equal(await prompt.inputValue(), "Inspect the synthetic request.");
      assert.equal(requests, 1);
      assert.deepEqual(errors, []);
    } finally {
      release?.();
      await browser.close();
      await fixture.close();
    }
  });

  test(`Output filters, pause, scrolling and issue navigation use the latest shared tail in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.lines = [
      ...Array.from({ length: 90 }, (_, i) => `[agent] INFO synthetic line ${i}`),
      "[agent] ERROR first failure",
      "[sandbox] WARNING slow connection",
      "Unlabeled synthetic output",
    ];
    const browser = await engine.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    let release;
    try {
      const page = await browser.newPage({ viewport: { width: 430, height: 800 } });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/agent-invoke", async route => {
        await new Promise(resolve => { release = resolve; });
        await route.fulfill({ json: { response: "Complete", summary: { text: "Complete", tools: [] } } });
      });
      await page.goto(fixture.origin + "/app-map");
      await page.locator('.agent-status-brief[data-state="ready"]').waitFor();
      await page.getByRole("textbox", { name: "Agent message", exact: true }).fill("Inspect the synthetic output.");
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      const output = page.locator("[data-runtime-output]");
      const prefix = page.locator("[data-output-prefix]");
      const level = page.locator("[data-output-level]");
      const pause = page.locator("[data-output-pause]");
      const issues = page.locator("[data-output-issues]");
      await page.waitForFunction(() =>
        document.querySelector("[data-output-issues]")?.getAttribute("aria-label")?.includes("1 error line, 1 warning line"));
      await prefix.selectOption("unlabeled");
      assert.match(await output.innerText(), /Unlabeled synthetic output/);
      assert.doesNotMatch(await output.innerText(), /first failure/);
      await prefix.selectOption("prefix:sandbox");
      await level.selectOption("error");
      assert.match(await output.innerText(), /No output matches these filters/);
      assert.match(await issues.getAttribute("aria-label"), /1 error line, 1 warning line/);

      await pause.click();
      assert.equal(await pause.getAttribute("aria-pressed"), "true");
      fixture.state.lines.push("[agent] ERROR second failure");
      await page.waitForFunction(() =>
        document.querySelector("[data-output-issues]")?.getAttribute("aria-label")?.includes("2 error lines, 1 warning line"));
      assert.match(await output.innerText(), /No output matches these filters/);
      assert.equal(await page.locator("[data-output-new]").isVisible(), true);
      await page.locator("[data-output-toggle]").click();
      assert.equal(await page.locator("#run-diagnostics-toggle").getAttribute("aria-expanded"), "false");
      await issues.click();
      assert.equal(await page.locator("#run-diagnostics-toggle").getAttribute("aria-expanded"), "true");
      assert.equal(await prefix.inputValue(), "all");
      assert.equal(await level.inputValue(), "issues");
      assert.equal(await pause.getAttribute("aria-pressed"), "false");
      assert.equal(await output.evaluate(node => node === document.activeElement), true);
      assert.match(await output.innerText(), /first failure/);
      assert.match(await output.innerText(), /second failure/);
      assert.match(await output.innerText(), /slow connection/);
      assert.doesNotMatch(await output.innerText(), /synthetic line 1/);
      assert.equal(await page.locator("[data-output-new]").isVisible(), false);

      await level.selectOption("all");
      await output.evaluate(node => { node.scrollTop = 100; });
      const manualScroll = await output.evaluate(node => node.scrollTop);
      assert.ok(manualScroll > 0);
      fixture.state.lines.push("[agent] INFO after manual scroll");
      await page.waitForFunction(() => document.querySelector("[data-runtime-output]")?.textContent.includes("after manual scroll"));
      assert.ok(Math.abs((await output.evaluate(node => node.scrollTop)) - manualScroll) <= 1);
      await output.evaluate(node => { node.scrollTop = node.scrollHeight; });
      fixture.state.lines.push("[agent] INFO follow newest");
      await page.waitForFunction(() => document.querySelector("[data-runtime-output]")?.textContent.includes("follow newest"));
      assert.ok(await output.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop < 2));

      await prefix.selectOption("prefix:sandbox");
      await level.selectOption("warning");
      await prefix.focus();
      await page.evaluate(() => { window.previousOutputPrefix = document.querySelector("[data-output-prefix]"); });
      fixture.state.health = "Degraded";
      await page.waitForFunction(() => window.previousOutputPrefix !== document.querySelector("[data-output-prefix]"));
      assert.equal(await prefix.inputValue(), "prefix:sandbox");
      assert.equal(await level.inputValue(), "warning");
      assert.equal(await prefix.evaluate(node => node === document.activeElement), true);
      assert.match(await output.innerText(), /slow connection/);

      fixture.state.lines.push("[sandbox] WARNING " + "long-output-".repeat(90));
      await page.waitForFunction(() => document.querySelector("[data-runtime-output]")?.textContent.includes("long-output-long-output"));
      for (const width of [320, 430, 620, 960]) {
        await page.setViewportSize({ width, height: 800 });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, theme);
          const geometry = await page.evaluate(width => {
            const stage = document.querySelector(".run-output-stage").getBoundingClientRect();
            const button = document.querySelector("[data-output-toggle]").getBoundingClientRect();
            const output = document.querySelector("[data-runtime-output]");
            const dock = document.querySelector("#workspace-diagnostics");
            const controls = document.querySelector(".run-output-controls");
            const prefix = document.querySelector("[data-output-prefix]").getBoundingClientRect();
            const level = document.querySelector("[data-output-level]").getBoundingClientRect();
            const actions = [...controls.querySelectorAll("button")].map(node => node.getBoundingClientRect());
            return {
              pageFits: document.documentElement.scrollWidth <= innerWidth,
              dockFits: dock.scrollWidth <= dock.clientWidth + 1,
              stageFits: stage.left >= 0 && stage.right <= innerWidth,
              buttonFits: button.left >= stage.left && button.right <= stage.right + 1,
              outputFits: output.scrollWidth <= output.clientWidth + 1,
              controlsFit: controls.scrollWidth <= controls.clientWidth + 1,
              actionsOrdered: actions.length === 3 && actions.every((box, index) =>
                index === 0 || (box.left >= actions[index - 1].right && Math.abs(box.top - actions[0].top) <= 1)),
              wideSingleRow: width < 960 || actions.every(box => Math.abs(box.bottom - prefix.bottom) <= 4)
                && Math.abs(prefix.bottom - level.bottom) <= 1,
            };
          }, width);
          assert.ok(Object.values(geometry).every(Boolean), JSON.stringify({ width, theme, geometry }));
        }
      }
      assert.deepEqual(errors, []);
    } finally {
      release?.();
      await browser.close();
      await fixture.close();
    }
  });

  test(`Output reports loading, failures, recovery and stale Clear polls in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.lines = [];
    const browser = await engine.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    let releaseInvocation, releaseInitial, releaseStale;
    let initialArrived, staleArrived;
    const initialRequest = new Promise(resolve => { initialArrived = resolve; });
    const staleRequest = new Promise(resolve => { staleArrived = resolve; });
    const initialGate = new Promise(resolve => { releaseInitial = resolve; });
    const staleGate = new Promise(resolve => { releaseStale = resolve; });
    let mode = "initial", clearFails = true;
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/\/api\/app-output(?:\?.*)?$/, async route => {
        const current = mode;
        if (current === "initial") {
          initialArrived();
          await initialGate;
          return route.fulfill({ json: { lines: ["[agent] WARNING first loaded line"], commands: [] } });
        }
        if (current === "failure") return route.fulfill({ status: 503, json: { error: "Synthetic output failure" } });
        if (current === "invalid") return route.fulfill({ json: { lines: "not an array", commands: [] } });
        if (current === "stale") {
          mode = "normal";
          staleArrived();
          await staleGate;
          return route.fulfill({ json: { lines: ["[agent] ERROR stale before clear"], commands: [] } });
        }
        return route.fulfill({ json: { lines: fixture.state.lines, commands: fixture.state.commands } });
      });
      await page.route("**/api/app-output/clear", route => {
        if (clearFails) return route.fulfill({ status: 503, json: { error: "Synthetic clear failure" } });
        fixture.state.lines = [];
        return route.fulfill({ json: { lines: [], commands: fixture.state.commands } });
      });
      await page.route("**/api/agent-invoke", async route => {
        await new Promise(resolve => { releaseInvocation = resolve; });
        await route.fulfill({ json: { response: "Complete", summary: { text: "Complete", tools: [] } } });
      });
      await page.goto(fixture.origin + "/app-map");
      await initialRequest;
      await page.locator('.agent-status-brief[data-state="ready"]').waitFor();
      await page.getByRole("textbox", { name: "Agent message", exact: true }).fill("Exercise output states.");
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      const output = page.locator("[data-runtime-output]");
      const issues = page.locator("[data-output-issues]");
      const status = page.locator("[data-output-status]");
      const retry = page.locator("[data-output-retry]");
      await issues.filter({ hasText: "Checking logs" }).waitFor();
      assert.match(await output.innerText(), /Loading runtime output/);
      await page.locator("[data-output-pause]").click();
      mode = "normal";
      releaseInitial();
      await page.locator("[data-output-new]").waitFor();
      assert.match(await issues.getAttribute("aria-label"), /1 warning line/);
      assert.doesNotMatch(await output.innerText(), /first loaded line/);
      await page.locator("[data-output-pause]").click();
      await page.waitForFunction(() => document.querySelector("[data-runtime-output]")?.textContent.includes("first loaded line"));
      await issues.filter({ hasText: "No logs yet" }).waitFor();
      assert.match(await output.innerText(), /No command output yet/);

      mode = "invalid";
      await retry.waitFor();
      assert.match(await status.innerText(), /invalid output response/);
      assert.match(await issues.innerText(), /Counts unavailable/);
      mode = "failure";
      await retry.click();
      await status.filter({ hasText: "Synthetic output failure" }).waitFor();
      mode = "normal";
      fixture.state.lines = ["[agent] ERROR recovered output"];
      await retry.focus();
      await retry.press("Enter");
      await page.waitForFunction(() => document.querySelector("[data-runtime-output]")?.textContent.includes("recovered output"));
      assert.equal(await retry.isVisible(), false);
      assert.equal(await output.evaluate(node => node === document.activeElement), true,
        "Recovery moves focus out of the hidden retry control.");
      assert.match(await issues.getAttribute("aria-label"), /1 error line/);

      await page.locator("[data-clear-output]").click();
      await status.filter({ hasText: "Unable to clear output: Synthetic clear failure" }).waitFor();
      assert.match(await output.innerText(), /recovered output/);
      clearFails = false;
      mode = "stale";
      await staleRequest;
      await page.locator("[data-clear-output]").click();
      await issues.filter({ hasText: "No logs yet" }).waitFor();
      releaseStale();
      await page.waitForTimeout(1300);
      assert.doesNotMatch(await output.innerText(), /stale before clear/);
      assert.match(await output.innerText(), /Command output cleared/);
      assert.doesNotMatch(await status.innerText(), /Unable to clear/);
      assert.deepEqual(errors, []);
    } finally {
      releaseInitial();
      releaseStale();
      releaseInvocation?.();
      await browser.close();
      await fixture.close();
    }
  });
}
