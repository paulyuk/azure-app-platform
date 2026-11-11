import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture, returnToRun } from "./run-settings-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Prompt entry stays static while the execution view owns progress motion in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      for (const presentationProfile of ["standalone", "github-app"]) {
        const fixture = await createRunSettingsFixture({ preview: true, presentationProfile });
        const page = await browser.newPage({ viewport: { width: 380, height: 800 } });
        let release;
        try {
          await page.route("**/api/agent-invoke", async route => {
            await new Promise(resolve => { release = resolve; });
            await route.fulfill({ json: { response: "Complete" } });
          });
          await page.goto(fixture.origin + "/app-map");
          assert.equal(await page.locator(".agent-response, .run-execution-view").count(), 0,
            "Prompt entry has no idle result placeholder or progress animation.");
          assert.equal(await page.locator(".agent-tester").evaluate(node =>
            node.getAnimations({ subtree: true }).length), 0);
          await page.getByRole("textbox", { name: "Agent message", exact: true })
            .fill("Check the execution-layer waiting state.");
          await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
          const execution = page.getByRole("region", { name: "Run execution", exact: true });
          const activeLayer = execution.locator('.run-execution-layer[data-state="active"]');
          const trail = activeLayer.locator(".run-execution-trail rect");
          await trail.waitFor();
          assert.equal(await execution.locator(".agent-response").isVisible(), false,
            "Waiting progress belongs to execution layers, not a duplicate result card.");
          assert.equal(await execution.locator(".run-execution-layers .ct-spinner").count(), 0);
          await trail.evaluate(node => { window.executionTrail = node; });
          for (const reducedMotion of ["no-preference", "reduce"]) {
            await page.emulateMedia({ reducedMotion });
            assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
              reducedMotion === "reduce");
            for (const theme of ["light", "dark"]) {
              await page.evaluate(theme => {
                document.documentElement.dataset.studioTheme = theme;
                document.documentElement.dataset.themeTone = theme;
                document.documentElement.dataset.colorMode = theme;
              }, theme);
              assert.equal(await trail.evaluate(node => node === window.executionTrail), true,
                "Motion and theme changes preserve the active execution layer.");
              assert.equal(await trail.evaluate(node => getComputedStyle(node).animationName),
                reducedMotion === "reduce" ? "none" : "run-layer-clockwise");
            }
          }
        } finally { release?.(); await page.close(); await fixture.close(); }
      }
    } finally { await browser.close(); }
  });

  test(`Response progress uses real readiness and request boundaries without losing state in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.app = "stopped";
    let available = false, release;
    const commands = [], requests = [], errors = [];
    const browser = await engine.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 430, height: 800 } });
      page.setDefaultTimeout(10000);
      page.on("pageerror", error => errors.push(error.message));
      await page.clock.install();
      await page.route("**/api/app-status*", route => route.fulfill({ json: {
        state: fixture.state.app, error: "",
        entrypoints: [
          { name: "web", port: 3000, ready: fixture.state.app === "running", expected: true },
          { name: "agent", port: 8088, ready: available, expected: true },
        ],
      } }));
      await page.route("**/api/app-command", route => {
        commands.push(route.request().postDataJSON());
        fixture.state.app = "starting";
        return route.fulfill({ json: { outcome: "command-started" } });
      });
      await page.route("**/api/agent-invoke", async route => {
        requests.push(route.request().postDataJSON());
        await new Promise(resolve => { release = resolve; });
        await route.fulfill({ json: {
          response: { output_text: "Actual fixture response" },
          summary: { text: "Actual fixture response\n".repeat(80), tools: [{ name: "inventory_search", status: "Call reported" }] },
        } });
      });
      await page.goto(fixture.origin + "/app-map");
      const result = page.getByRole("region", { name: "Agent response", exact: true });
      assert.equal(await result.count(), 0, "Prompt entry has no idle result placeholder.");
      const prompt = page.locator('textarea[aria-label="Agent message"]');
      await prompt.fill("Retain this exact payload during startup and response waiting.");
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      const execution = page.getByRole("region", { name: "Run execution", exact: true });
      const runtimeLayer = execution.locator('[data-layer="runtime"]');
      const executionLayer = execution.locator('[data-layer="execution"]');
      await execution.locator('[data-layer="runtime"][data-state="active"]').waitFor();
      assert.equal(await execution.locator(".run-execution-result").isVisible(), false,
        "Duplicate waiting result card stays hidden while execution layers are active.");
      assert.equal(commands.length, 1);
      assert.equal(requests.length, 0);
      await page.clock.fastForward(31_000);
      assert.doesNotMatch(await execution.innerText(), /Still waiting/);
      fixture.state.app = "running";
      await page.clock.runFor(700);
      assert.equal(requests.length, 0, "A running web app is not a ready agent.");
      available = true;
      await page.clock.runFor(700);
      await execution.locator('[data-layer="execution"][data-state="active"]').waitFor();
      assert.equal(await runtimeLayer.getAttribute("data-state"), "succeeded");
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0], {
        root: "/fixture/dealer", port: 8088, message: "Retain this exact payload during startup and response waiting.",
      });
      assert.equal(await prompt.isDisabled(), true);
      const now = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(now + 1_000);
      await page.clock.fastForward(27_000);
      assert.match(await executionLayer.innerText(), /Request in flight/);
      await page.clock.fastForward(2_000);
      assert.match(await executionLayer.innerText(), /Still waiting\. Inspect logs for more detail\./);
      assert.match(await page.locator("#status").innerText(), /Still waiting for a response/);
      await page.clock.resume();
      for (const width of [320, 430, 620, 960]) {
        await page.setViewportSize({ width, height: 800 });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(theme => { document.documentElement.dataset.studioTheme = theme; }, theme);
          const dimensions = await execution.evaluate(node => ({
            scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
            documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
          }));
          assert.ok(dimensions.scrollWidth <= dimensions.clientWidth && dimensions.documentWidth <= dimensions.viewportWidth,
            `Pending execution layers fit without horizontal overflow: ${width}px ${theme}: ${JSON.stringify(dimensions)}`);
        }
      }
      await page.setViewportSize({ width: 430, height: 800 });
      assert.equal(await page.locator(".run-execution-actions").getByRole("button", { name: "View logs" }).count(), 0);
      const outputTab = page.locator('[data-run-tab="output"]');
      await page.locator("#run-diagnostics-toggle").click();
      await outputTab.click();
      await page.waitForFunction(() => document.activeElement?.getAttribute("data-run-tab") === "output");
      assert.equal(await outputTab.getAttribute("aria-selected"), "true");
      assert.equal(await outputTab.evaluate(node => node === document.activeElement), true);
      assert.equal(requests.length, 1);
      assert.equal(commands.length, 1);
      await returnToRun(page);
      await page.locator("#map-app").click();
      await page.locator("#manage-app").click();
      await page.locator("[data-view-execution]").click();
      await executionLayer.filter({ hasText: "Still waiting. Inspect logs for more detail." }).waitFor();
      assert.equal(await prompt.inputValue(), requests[0].message);
      const backToInput = execution.getByRole("button", { name: "Back to input", exact: true });
      await backToInput.focus();
      fixture.state.health = "Response progress polling";
      await page.clock.runFor(2_100);
      assert.equal(await backToInput.evaluate(node => node === document.activeElement), true);
      release();
      await page.locator('.agent-response[data-state="succeeded"]').waitFor();
      assert.equal(await execution.locator(".run-execution-result").isVisible(), true);
      const expectedResponse = "Actual fixture response\n".repeat(80).trimEnd();
      assert.equal(await result.textContent(), expectedResponse);
      assert.equal(await result.locator("svg,ol,button").count(), 0);
      assert.equal(await result.locator(".ct-spinner").count(), 0);
      assert.equal(await result.getAttribute("aria-busy"), "false");
      assert.equal(await backToInput.evaluate(node => node === document.activeElement), true,
        "A completed result does not steal focus from the execution view's persistent controls.");
      const body = page.locator(".run-execution-body");
      await body.evaluate(node => { node.scrollTop = 90; });
      await page.clock.fastForward(31_000);
      assert.equal(await result.textContent(), expectedResponse);
      assert.equal(await body.evaluate(node => node.scrollTop), 90);
      assert.equal(await page.locator('[data-run-disclosure="tool-activity"]').count(), 0);
      assert.match(await page.locator('[data-layer="tool-0"]').innerText(), /inventory_search/);
      assert.deepEqual(errors, []);
    } finally { release?.(); await browser.close(); await fixture.close(); }
  });

  test(`Response errors and compact illustrated states remain readable in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.app = "stopped";
    let failStartup = true, available = false;
    const requests = [], errors = [];
    const browser = await engine.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 430, height: 800 } });
      page.setDefaultTimeout(10000);
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/app-command", route => route.fulfill(failStartup
        ? { status: 503, json: { error: "Startup failed: synthetic prerequisite error." } }
        : { json: { outcome: "command-started" } }));
      await page.route("**/api/app-status*", route => route.fulfill({ json: {
        state: fixture.state.app, error: fixture.state.error,
        entrypoints: [{ name: "agent", port: 8088, ready: available, expected: true }],
      } }));
      await page.route("**/api/agent-invoke", route => {
        requests.push(route.request().postDataJSON());
        fixture.state.commands = [{
          id: "invocation", kind: "http", label: "Invoke agent",
          command: "POST http://localhost:8088/responses", status: "failed", startedAt: Date.now(),
        }];
        return route.fulfill({ status: 503, json: { error: "Synthetic request timeout\n".repeat(12) + "<script>not executable</script>" } });
      });
      await page.goto(fixture.origin + "/app-map");
      const result = page.getByRole("region", { name: "Agent response", exact: true });
      assert.equal(await result.count(), 0);
      async function geometry(state) {
        for (const width of [320, 430, 620, 960]) {
          await page.setViewportSize({ width, height: 800 });
          for (const theme of ["light", "dark"]) {
            await page.evaluate(theme => { document.documentElement.dataset.studioTheme = theme; }, theme);
            const measured = await result.evaluate(node => ({
              fits: node.scrollWidth <= node.clientWidth,
              documentFits: document.documentElement.scrollWidth <= innerWidth,
              color: getComputedStyle(node).color,
              background: getComputedStyle(node).backgroundColor,
              height: node.getBoundingClientRect().height,
              images: [...node.querySelectorAll("svg.agent-result-illustration")].every(image => image.getBoundingClientRect().width > 0),
            }));
            assert.ok(measured.fits && measured.documentFits && measured.images, JSON.stringify({ width, theme, state, measured }));
            assert.notEqual(measured.color, measured.background);
            if (state === "idle") assert.ok(measured.height <= 110,
              `Idle guidance uses at most 110px at ${width}px ${theme}: ${measured.height}`);
          }
        }
      }
      const prompt = page.locator('textarea[aria-label="Agent message"]');
      await prompt.fill("Retain payload after startup and request failure.");
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      const failedExecution = page.getByRole("region", { name: "Run execution", exact: true });
      await failedExecution.getByRole("heading", { name: "Run needs review" }).waitFor();
      assert.equal(await failedExecution.locator('[data-layer="runtime"]').getAttribute("data-state"), "failed");
      assert.equal(await failedExecution.locator('[data-layer="execution"]').getAttribute("data-state"), "not-run");
      await result.locator(".agent-result-title").filter({ hasText: "The task was not sent" }).waitFor();
      assert.match(await result.innerText(), /Startup failed: synthetic prerequisite error/);
      const startupFailureIcon = await result.locator(".agent-result-error-icon").evaluate(icon => ({
        color: getComputedStyle(icon).color,
        background: getComputedStyle(icon).backgroundColor,
        border: getComputedStyle(icon).borderTopColor,
      }));
      assert.equal(startupFailureIcon.background, startupFailureIcon.border);
      assert.notEqual(startupFailureIcon.color, startupFailureIcon.background);
      assert.equal(requests.length, 0);
      await geometry("startup-failed");
      failStartup = false;
      available = true;
      fixture.state.app = "running";
      await page.waitForFunction(() => document.querySelector(".agent-status-facts")?.textContent.includes("Endpoint available"));
      await returnToRun(page);
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await result.locator(".agent-result-title").filter({ hasText: "This invocation had a problem" }).waitFor();
      assert.match(await result.innerText(), /does not confirm that backend execution stopped/);
      assert.match(await result.innerText(), /<script>not executable<\/script>/);
      assert.equal(await result.locator("script,svg,ol,.ct-spinner").count(), 0);
      assert.equal(requests.length, 1);
      assert.equal(await prompt.inputValue(), requests[0].message);
      await geometry("request-failed");
      await page.waitForResponse(response => response.url().includes("/api/app-output"));
      assert.equal(await page.locator(".agent-status-brief").getAttribute("data-state"), "ready");
      assert.equal(await page.locator("#status").getAttribute("role"), "status");
      assert.match(await page.locator("#status").getAttribute("class"), /visually-hidden/);
      assert.equal(await page.locator("#diagnostics-status, .run-diagnostics-toolbar").count(), 0);
      assert.equal(await page.locator("#run-diagnostics-toggle .logs-warning-badge").count(), 0,
        "Failed HTTP invocation history must not become a global Operations failure.");
      await page.locator("#run-diagnostics-toggle").click();
      await page.locator('[data-run-tab="output"]').click();
      await page.locator('[data-run-tab="operations"]').click();
      const record = page.locator('[data-run-disclosure="invocation"]');
      assert.equal(await record.getAttribute("data-status"), "failed");
      assert.match(await record.innerText(), /Invoke agent[\s\S]*POST http:\/\/localhost:8088\/responses/);
      await page.locator("#run-diagnostics-toggle").click();
      assert.deepEqual(await result.evaluate(node => {
        const probe = document.createElement("span");
        node.append(probe);
        probe.style.color = "var(--studio-line)";
        const border = getComputedStyle(probe).color;
        probe.style.color = "var(--studio-ink)";
        const text = getComputedStyle(probe).color;
        probe.style.color = "var(--studio-danger)";
        const danger = getComputedStyle(probe).color;
        probe.remove();
        return [
          getComputedStyle(node).borderTopColor === border,
          getComputedStyle(node.querySelector(".agent-result-error")).color === text,
          getComputedStyle(node.querySelector(".agent-result-title")).color === danger,
        ];
      }), [true, true, true], "Only the local failure heading is red; the result border and error body stay neutral.");
      fixture.state.app = "failed";
      fixture.state.error = "Synthetic runtime failure";
      fixture.state.commands.push({
        id: "startup", kind: "shell", label: "Run app", command: "aca run",
        status: "failed", startedAt: Date.now(),
      });
      available = false;
      await page.waitForFunction(() => document.querySelector(".agent-status-brief")?.dataset.state === "runtime-failed");
      await page.waitForFunction(() => {
        const label = document.querySelector("#run-diagnostics-toggle")?.getAttribute("aria-label") || "";
        return label.includes("Synthetic runtime failure") && label.includes("1 failed operation");
      });
      assert.doesNotMatch(await page.locator("#run-diagnostics-toggle").getAttribute("aria-label"), /2 failed operations/);
      assert.equal(await page.locator("#diagnostics-status, .run-diagnostics-toolbar").count(), 0);
      assert.match(await result.innerText(), /<script>not executable<\/script>/,
        "An independent runtime problem must not replace the retained invocation error.");
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await fixture.close(); }
  });

  test(`Response wait messages respect final departure and back-forward cache lifecycle in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    const browser = await engine.launch({ headless: true });
    try {
      for (const persisted of [false, true]) {
        const page = await browser.newPage();
        page.setDefaultTimeout(10000);
        let release, requestSeen = false;
        try {
          await page.clock.install();
          await page.route("**/api/agent-invoke", async route => {
            requestSeen = true;
            await new Promise(resolve => { release = resolve; });
            await route.fulfill({ json: { response: "Complete", summary: { text: "Complete", tools: [] } } });
          });
          await page.goto(fixture.origin + "/app-map");
          const result = page.getByRole("region", { name: "Agent response", exact: true });
          assert.equal(await result.count(), 0);
          await page.getByRole("textbox", { name: "Agent message", exact: true }).fill("Check wait timer cleanup.");
          await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
          const execution = page.getByRole("region", { name: "Run execution", exact: true });
          await execution.locator('[data-layer="execution"][data-state="active"]').waitFor();
          assert.equal(requestSeen, true);
          await page.evaluate(persisted => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted })), persisted);
          await page.clock.fastForward(31_000);
          if (persisted) assert.match(await execution.innerText(), /Still waiting\. Inspect logs for more detail\./);
          else assert.equal(await page.locator(".run-execution-view").count(), 0,
            "Final departure disposes the view; BFCache suspension retains the live request.");
          release();
          if (persisted) await page.locator('.agent-response[data-state="succeeded"]').waitFor();
          else {
            await page.waitForResponse(response => response.url().includes("/api/agent-invoke"));
            assert.equal(await page.locator(".run-execution-view").count(), 0, "Late results do not recreate a disposed view.");
          }
        } finally { release?.(); await page.close(); }
      }
    } finally { await browser.close(); await fixture.close(); }
  });
}
