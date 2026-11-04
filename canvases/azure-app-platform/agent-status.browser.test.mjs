import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Autonomous tester retains event payload, result evidence and focus across lifecycle updates in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.documentInput = true;
    fixture.state.app = "stopped";
    let available = false, fail = false, release, invoking = false;
    const browser = await engine.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(10000);
      const errors = [], requests = [], commands = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/app-status*", route => route.fulfill({ json: {
        state: fixture.state.app, error: fixture.state.error, foreignEntrypoints: [],
        entrypoints: [
          { name: "web", port: 3000, ready: fixture.state.app === "running", expected: true },
          { name: "agent", port: 8088, ready: available, expected: true, healthStatus: fixture.state.health },
        ],
      } }));
      await page.route("**/api/app-command", route => {
        commands.push(route.request().postDataJSON());
        fixture.state.app = "starting";
        return route.fulfill({ json: { outcome: "command-started" } });
      });
      await page.route("**/api/agent-invoke", async route => {
        requests.push(route.request().postDataJSON());
        invoking = true;
        if (requests.length === 1) await new Promise(resolve => { release = resolve; });
        invoking = false;
        await route.fulfill(fail ? { status: 503, json: { error: "Task failed: simulated upstream timeout." } } : { json: {
          response: { output_text: "Structured task result", evidence: "response-only" },
          summary: { text: "Task output\n".repeat(80), tools: [{ name: "inventory_search", status: "Call reported" }] },
          documentAssessment: {
            state: "approved", sanitizedText: "Sanitized sample", redactions: { email: 1 }, truncated: false,
          },
        } });
      });
      await page.goto(fixture.origin + "/app-map");
      await page.waitForFunction(() => window.appPlatformReady);
      const brief = page.getByRole("region", { name: "Status Brief", exact: true });
      const status = page.locator(".agent-status-brief");
      await page.locator('.agent-status-brief[data-state="stopped"]').waitFor();
      assert.equal(await status.locator("h2").evaluate(node => getComputedStyle(node).fontSize), "11px",
        "Retained Status Brief typography must remain above the toolkit's generic element reset.");
      assert.match(await status.innerText(), /Invoke agent starts the local app/);
      assert.equal(await page.locator("#header-open-app").isVisible(), false);
      assert.equal(await page.locator(".run-primary").getByRole("button", { name: "Open app", exact: true }).count(), 0);
      await page.locator('[data-event-preset="loan.document.submitted"]').click();
      const prompt = page.getByRole("textbox", { name: "Agent message", exact: true });
      const document = page.getByLabel("Document text", { exact: true });
      assert.equal(await page.locator(".document-name").textContent(), "sample-loan-note.md");
      assert.equal(await page.locator(".run-document").evaluate(node => node.open), false);
      assert.match(await prompt.inputValue(), /^Event \[loan.document.submitted\]/);
      assert.match(await document.inputValue(), /Residential Auto Loan Intake/);
      await prompt.fill("Event [test.task.received]: verify this document without a conversation.");
      const payload = await prompt.inputValue(), documentText = await document.inputValue();
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await page.locator('.agent-status-brief[data-state="invoking"]').waitFor();
      assert.equal(await prompt.isDisabled(), true);
      assert.equal(commands.length, 1, "The existing auto-start path runs once.");
      assert.equal(requests.length, 0, "A running app alone cannot dispatch a task.");
      available = true;
      fixture.state.app = "running";
      await page.waitForFunction(() => document.querySelector(".agent-status-facts")?.textContent.includes("Endpoint available"));
      await page.waitForResponse(response => response.url().includes("/api/app-status"));
      assert.equal(invoking, true);
      fixture.state.app = "stopped";
      available = false;
      await page.waitForFunction(() => document.querySelector(".agent-status-facts")?.textContent.includes("Not running"));
      release();
      await page.locator('.agent-status-brief[data-state="succeeded"]').waitFor();
      assert.deepEqual(requests[0], {
        root: "/fixture/dealer", port: 8088, message: payload, document: { name: "sample-loan-note.md", content: documentText },
      });
      assert.match(await status.innerText(), /Not ready/);
      assert.match(await status.innerText(), /not proof of safety/);
      const raw = page.locator('[data-run-disclosure="raw-response"]');
      await raw.locator("summary").click();
      assert.match(await raw.innerText(), /response-only/);
      await page.locator('[data-run-disclosure="tool-activity"]').locator("summary").click();
      assert.match(await page.locator('[data-run-disclosure="tool-activity"]').innerText(), /inventory_search.*Call reported/);
      await page.locator('[data-document-assessment][data-state="approved"]').waitFor();
      await prompt.focus();
      await prompt.evaluate(node => node.setSelectionRange(6, 12));
      fixture.state.health = "Polled health update";
      await page.waitForFunction(() => document.querySelector("#run-panel-services")?.textContent.includes("Polled health update"));
      assert.deepEqual(await prompt.evaluate(node => [node === globalThis.document.activeElement, node.selectionStart, node.selectionEnd]), [true, 6, 12]);
      assert.equal(await raw.evaluate(node => node.open), true);
      assert.equal(await document.inputValue(), documentText);
      const result = page.getByRole("region", { name: "Agent response", exact: true });
      await result.focus();
      await result.evaluate(node => { node.scrollTop = 90; });
      fixture.state.health = "Result focus polling update";
      await page.waitForFunction(() => document.querySelector("#run-panel-services")?.textContent.includes("Result focus polling update"));
      assert.deepEqual(await result.evaluate(node => [node === globalThis.document.activeElement, node.scrollTop]), [true, 90]);
      await page.locator("#map-app").click();
      await page.locator("#manage-app").click();
      await raw.waitFor();
      assert.equal(await raw.evaluate(node => node.open), true);
      assert.equal(await prompt.inputValue(), payload);
      assert.deepEqual(await prompt.evaluate(node => [node.selectionStart, node.selectionEnd]), [6, 12]);
      assert.match(await raw.innerText(), /response-only/);
      assert.match(await page.locator(".agent-response").innerText(), /Task output/);
      assert.equal(await result.evaluate(node => node.scrollTop), 90);
      available = true;
      fixture.state.app = "running";
      await page.waitForFunction(() => document.querySelector(".agent-status-facts")?.textContent.includes("Endpoint available"));
      fail = true;
      const invoke = page.getByRole("button", { name: "Invoke agent", exact: true });
      await invoke.focus();
      await invoke.press("Enter");
      await page.locator('.agent-status-brief[data-state="failed"]').waitFor();
      assert.match(await page.locator(".agent-response").innerText(), /simulated upstream timeout/);
      assert.equal(await result.evaluate(node => node === globalThis.document.activeElement), true,
        "A temporarily disabled invocation action keeps focus in its result, not the page body.");
      assert.equal(await raw.count(), 0, "A failed retry must not present a previous run's raw output.");
      assert.doesNotMatch(await page.locator('[data-run-disclosure="tool-activity"]').innerText(), /inventory_search/);
      fixture.state.app = "stopping";
      available = false;
      await page.waitForFunction(() => document.querySelector(".agent-status-facts")?.textContent.includes("Stopping"));
      assert.equal(await result.evaluate(node => node === globalThis.document.activeElement), true);
      await page.locator("#map-app").click();
      await page.locator("#manage-app").click();
      await page.locator('.agent-status-brief[data-state="failed"]').waitFor();
      assert.match(await page.locator(".agent-response").innerText(), /simulated upstream timeout/);
      assert.equal(await prompt.inputValue(), payload);
      assert.equal(await document.inputValue(), documentText);
      assert.equal(await page.locator(".conversation-list,.chat-bubble,[data-conversation]").count(), 0);
      assert.equal(await brief.count(), 1);
      for (const [width, height] of [[320, 480], [620, 800]]) {
        await page.setViewportSize({ width, height });
        assert.ok(await page.locator("#details").evaluate(node => node.scrollWidth <= node.clientWidth + 1));
        assert.ok(await status.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
      }
      assert.deepEqual(errors, []);
    } finally {
      release?.();
      await browser.close();
      await fixture.close();
    }
  });

  test(`Task action row owns Start and Stop without losing runtime notices or recovery in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    let release, recovered = false, holdStop = true;
    const operations = [];
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/app-status*", async route => {
        const response = await route.fetch();
        await route.fulfill({ response, json: { ...await response.json(), recovered } });
      });
      await page.route("**/api/app-command", async route => {
        operations.push(route.request().postDataJSON());
        if (operations.at(-1).operation === "run-local") {
          fixture.state.app = "starting";
          await route.fulfill({ json: { outcome: "command-started" } });
          return;
        }
        fixture.state.app = "stopping";
        if (holdStop) await new Promise(resolve => { release = resolve; });
        fixture.state.app = "stopped";
        recovered = false;
        await route.fulfill({ json: { outcome: "command-started" } });
      });
      await page.goto(fixture.origin + "/app-map");
      await page.locator('.agent-status-brief[data-state="ready"]').waitFor();
      const invoke = page.getByRole("button", { name: "Invoke agent", exact: true });
      const stop = page.locator("[data-task-runtime-action]");
      assert.equal(await page.locator("#app-status-badge").isVisible(), false);
      assert.equal(await page.locator("#header-runtime-action").isVisible(), false);
      assert.match(await page.getByRole("region", { name: "Status Brief", exact: true }).innerText(), /Running locally/);
      assert.equal(await page.getByRole("button", { name: "Stop app", exact: true }).count(), 1);
      assert.equal(await stop.evaluate(node => node.closest(".actions").querySelectorAll("button")[1] === node), true);
      await invoke.focus();
      await page.keyboard.press(name === "WebKit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
      assert.equal(await stop.evaluate(node => node === document.activeElement), true);
      for (const width of [320, 380, 620]) {
        await page.setViewportSize({ width, height: 480 });
        assert.ok(await stop.evaluate(node => node.getBoundingClientRect().right <= innerWidth &&
          node.closest(".actions").scrollWidth <= node.closest(".actions").clientWidth + 1));
      }
      await page.locator("#map-app").click();
      await page.getByRole("button", { name: "Runtime controls", exact: true }).click();
      await stop.waitFor();
      assert.equal(await page.locator("dialog[open]").count(), 0);
      assert.deepEqual(operations, [], "Returning to Run must not stop or configure anything.");
      await stop.click();
      await page.locator('.agent-status-facts').filter({ hasText: "Stopping" }).waitFor();
      assert.equal(await stop.innerText(), "Stopping…");
      assert.equal(await stop.isDisabled(), true);
      assert.equal(await invoke.isDisabled(), true);
      release();
      holdStop = false;
      await page.locator('.agent-status-brief[data-state="stopped"]').waitFor();
      assert.equal(await stop.count(), 0);
      const start = page.locator("[data-task-start-app]");
      assert.equal(await page.locator("#workspace-runtime-bar").isVisible(), false);
      assert.equal(await page.locator("#app-status-badge").isVisible(), false);
      assert.equal(await page.getByRole("button", { name: "Start app", exact: true }).count(), 1);
      assert.deepEqual(await start.evaluate(node => [...node.closest(".actions").querySelectorAll("button")]
        .map(button => button.textContent)), ["Start app", "Invoke agent"]);
      await start.focus();
      await page.keyboard.press(name === "WebKit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
      assert.equal(await invoke.evaluate(node => node === document.activeElement), true);
      for (const width of [320, 380, 620]) {
        await page.setViewportSize({ width, height: 480 });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, theme);
          assert.ok(await start.evaluate(node => node.getBoundingClientRect().left >= 0 &&
            node.closest(".actions").scrollWidth <= node.closest(".actions").clientWidth + 1));
        }
      }
      await page.locator("#map-app").click();
      assert.equal(await page.getByRole("button", { name: "Start app", exact: true }).count(), 1);
      assert.equal(await page.locator("#header-runtime-action").isVisible(), true);
      await page.locator("#manage-app").click();
      await start.click();
      await page.getByRole("button", { name: "Cancel startup", exact: true }).waitFor();
      assert.equal(await start.count(), 0);
      assert.equal(await page.locator("#workspace-runtime-bar").isVisible(), true);
      assert.equal(operations.at(-1).operation, "run-local");
      recovered = true;
      await page.locator("#header-runtime-action").filter({ hasText: "Stop partial startup" }).waitFor();
      assert.equal(await page.locator("#app-status-badge").isVisible(), true);
      await page.locator("#header-runtime-action").click();
      await page.locator('.agent-status-brief[data-state="stopped"]').waitFor();
      fixture.state.configured = false;
      fixture.state.app = "running";
      await page.locator('.agent-status-brief[data-state="preview"]').waitFor();
      assert.equal(await page.locator("#app-status-badge").isVisible(), true);
      assert.equal(await stop.innerText(), "Stop preview");
      await stop.click();
      await stop.waitFor({ state: "detached" });
      assert.deepEqual(operations, ["stop-local", "run-local", "stop-local", "stop-local"]
        .map(operation => ({ root: "/fixture/dealer", operation })));
      fixture.state.app = "failed";
      fixture.state.error = "Simulated lifecycle failure.";
      await page.locator("#app-status-badge").filter({ hasText: "Needs attention" }).waitFor();
      assert.match(await page.locator(".run-primary").innerText(), /Simulated lifecycle failure/);
      assert.equal(await page.locator("#workspace-runtime-bar").isVisible(), true);
      assert.equal(await start.innerText(), "Start preview");
      fixture.state.configured = true;
      await start.filter({ hasText: "Start app" }).waitFor();
      assert.equal(await start.isDisabled(), false);
      await page.route("**/api/local-readiness*", route => route.fulfill({ json: {
        ready: false, gatewayConfigured: false, mode: "full",
      } }));
      await start.waitFor({ state: "detached" });
      assert.equal(await page.locator("#header-runtime-action").innerText(), "Set up");
      assert.equal(await page.locator("#header-runtime-action").isVisible(), true);
      assert.deepEqual(errors, []);
    } finally { release?.(); await browser.close(); await fixture.close(); }
  });

  test(`Status Brief exposes preview, missing agent, prerequisites and readiness errors in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.configured = false;
    const browser = await engine.launch({ headless: true });
    let prerequisiteMissing = false, configuring = false, readinessFailure = false;
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(10000);
      await page.route("**/api/local-readiness*", route => route.fulfill(readinessFailure
        ? { status: 503, json: { error: "Readiness endpoint offline" } }
        : { json: {
          ready: true, gatewayConfigured: fixture.state.configured,
          mode: fixture.state.configured ? "full" : "preview",
          activeGateway: configuring ? { name: "fixture-gateway", configurationStatus: "configuring" }
            : fixture.state.configured ? { name: "fixture-gateway" } : null,
          prerequisites: { ready: !prerequisiteMissing, missingTools: prerequisiteMissing ? [{ label: "ACA", command: "aca --version" }] : [] },
        } }));
      await page.goto(fixture.origin + "/app-map");
      await page.locator('.agent-status-brief[data-state="preview"]').waitFor();
      assert.equal(await page.getByRole("button", { name: "Invoke agent", exact: true }).isDisabled(), true);
      assert.match(await page.locator(".agent-status-brief").innerText(), /Local preview.*Agent.*Not ready/s);
      prerequisiteMissing = true;
      await page.locator('.agent-status-brief[data-state="prerequisites"]').waitFor();
      prerequisiteMissing = false;
      configuring = true;
      await page.locator('.agent-status-brief[data-state="configuring"]').waitFor();
      assert.match(await page.locator(".agent-status-brief").innerText(), /Applying connection/);
      configuring = false;
      await page.locator('.agent-status-brief[data-state="preview"]').waitFor();
      fixture.state.configured = true;
      await page.route("**/api/app-status*", route => route.fulfill({ json: {
        state: "running", entrypoints: [{ name: "web", port: 3000, ready: true }, { name: "agent", port: 8088, ready: false }],
      } }));
      await page.locator('.agent-status-brief[data-state="agent-unavailable"]').waitFor();
      assert.match(await page.locator(".agent-status-brief").innerText(), /App running; agent unavailable/);
      readinessFailure = true;
      await page.locator('.agent-status-brief[data-state="unavailable"]').waitFor();
      assert.match(await page.locator(".agent-status-brief").innerText(), /Readiness endpoint offline/);
      assert.equal(await page.getByRole("button", { name: "Invoke agent", exact: true }).isDisabled(), true);
      readinessFailure = false;
      await page.locator('.agent-status-brief[data-state="agent-unavailable"]').waitFor();
    } finally {
      await browser.close();
      await fixture.close();
    }
  });
}
