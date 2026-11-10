import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Idle stays static and invocation uses one animated Spinner even with reduced motion in ${name}`, {
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
          const result = page.getByRole("region", { name: "Agent response", exact: true });
          const illustration = result.locator("svg.agent-result-illustration");
          await illustration.waitFor();
          await page.waitForFunction(() => {
            const box = document.querySelector(".agent-response svg.agent-result-illustration")?.getBoundingClientRect();
            return box?.width === 64 && box.height === 64;
          });
          for (const reducedMotion of ["no-preference", "reduce"]) {
            await page.emulateMedia({ reducedMotion });
            for (const theme of ["light", "dark"]) {
              await page.evaluate(theme => {
                document.documentElement.dataset.studioTheme = theme;
                document.documentElement.dataset.themeTone = theme;
                document.documentElement.dataset.colorMode = theme;
              }, theme);
              assert.equal(await result.getAttribute("aria-busy"), "false");
              assert.equal(await illustration.count(), 1);
              assert.equal(await illustration.getAttribute("aria-hidden"), "true");
              assert.equal(await illustration.getAttribute("focusable"), "false");
              assert.equal(await result.locator(".ct-spinner").count(), 0, "Idle must not look busy");
              assert.equal(await result.evaluate(node => node.getAnimations({ subtree: true }).length), 0);
              assert.equal(await page.getByRole("textbox", { name: "Agent message", exact: true }).isEnabled(), true);
            }
          }
          assert.deepEqual(fixture.mutations, [], "Static idle artwork starts no work");
          await page.getByRole("textbox", { name: "Agent message", exact: true }).fill("Check the spinner-only waiting state.");
          await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
          await page.locator('.agent-response[data-phase="waiting"]').waitFor();
          const spinner = result.locator(".agent-result-summary > .agent-result-step-spinner .ct-spinner-ring");
          await spinner.waitFor();
          await spinner.evaluate(node => { window.responseSpinner = node; });
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
              assert.equal(await result.getAttribute("aria-busy"), "true");
              assert.equal(await result.locator("svg").count(), 0);
              assert.equal(await result.locator(".ct-spinner").count(), 1);
              assert.equal(await result.locator(".agent-result-title .ct-spinner").count(), 0);
              assert.equal(await result.locator(".agent-result-step-spinner").getAttribute("aria-hidden"), "true");
              const geometry = await result.evaluate(node => {
                const slot = node.querySelector(".agent-result-step-spinner").getBoundingClientRect();
                const ring = node.querySelector(".ct-spinner-ring").getBoundingClientRect();
                const copy = node.querySelector(".agent-result-copy").getBoundingClientRect();
                const style = getComputedStyle(node.querySelector(".ct-spinner-ring"));
                return {
                  slotWidth: slot.width, slotHeight: slot.height,
                  ringWidth: style.width, ringHeight: style.height,
                  sharesIllustrationColumn: Math.abs(slot.x - node.querySelector(".agent-result-summary").getBoundingClientRect().x) < 1,
                  beforeCopy: slot.right <= copy.left,
                  centered: Math.abs((slot.x + slot.width / 2) - (ring.x + ring.width / 2)) < 1
                    && Math.abs((slot.y + slot.height / 2) - (ring.y + ring.height / 2)) < 1,
                };
              });
              assert.deepEqual(geometry, {
                slotWidth: 64, slotHeight: 64, ringWidth: "32px", ringHeight: "32px",
                sharesIllustrationColumn: true, beforeCopy: true, centered: true,
              }, "The larger spinner is centered in the former illustration slot, outside the heading");
              assert.equal(await page.getByRole("textbox", { name: "Agent message", exact: true }).isDisabled(), true);
              assert.deepEqual(await spinner.evaluate(node => {
                const style = getComputedStyle(node);
                return [style.animationName, style.animationDuration, style.animationIterationCount, style.animationPlayState];
              }), ["ct-spin", "1s", "infinite", "running"]);
              const start = await spinner.evaluate(node => {
                if (node !== window.responseSpinner) throw new Error("Motion and theme changes must preserve the Spinner");
                return node.getAnimations()[0]?.currentTime;
              });
              assert.equal(typeof start, "number", "The indicator has a real running CSS animation");
              await page.waitForFunction(start => {
                const ring = document.querySelector(".agent-result-step-spinner .ct-spinner-ring");
                return ring.getAnimations().some(animation => animation.currentTime > start + 50);
              }, start);
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
      await result.locator(".agent-result-title").filter({ hasText: "Your result will appear here" }).waitFor();
      assert.equal(await result.getAttribute("aria-busy"), "false");
      assert.equal(await result.locator("svg.agent-result-illustration").count(), 1);
      assert.equal(await result.getByRole("button").count(), 0);
      assert.equal(await result.locator(".ct-spinner").count(), 0);
      const prompt = page.getByRole("textbox", { name: "Agent message", exact: true });
      await prompt.fill("Retain this exact payload during startup and response waiting.");
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await result.locator(".agent-result-title").filter({ hasText: "Waiting for the agent endpoint" }).waitFor();
      assert.equal(commands.length, 1);
      assert.equal(requests.length, 0);
      assert.equal(await result.locator("ol").count(), 0);
      const spinner = result.locator(".agent-result-summary > .agent-result-step-spinner .ct-spinner-ring");
      assert.equal(await spinner.count(), 1);
      assert.equal(await result.locator("svg.agent-result-illustration").count(), 0,
        "Startup uses only the progress Spinner, not spot artwork.");
      assert.deepEqual(await spinner.evaluate(node => {
        window.responseStepSpinner = node;
        const style = getComputedStyle(node);
        return [style.animationName, style.animationDuration, style.animationIterationCount, style.animationPlayState];
      }), ["ct-spin", "1s", "infinite", "running"]);
      assert.equal(await result.locator(".agent-result-step-spinner").getAttribute("aria-hidden"), "true");
      await page.clock.fastForward(31_000);
      assert.doesNotMatch(await result.innerText(), /Still waiting for a response/);
      fixture.state.app = "running";
      await page.clock.runFor(700);
      assert.equal(requests.length, 0, "A running web app is not a ready agent.");
      available = true;
      await page.clock.runFor(700);
      await result.locator(".agent-result-title").filter({ hasText: "Waiting for the agent response" }).waitFor();
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0], {
        root: "/fixture/dealer", port: 8088, message: "Retain this exact payload during startup and response waiting.",
      });
      assert.equal(await result.locator("ol").count(), 0);
      assert.equal(await spinner.evaluate(node => node === window.responseStepSpinner), true,
        "Phase changes retain the same owned Spinner instead of restarting its animation.");
      assert.equal(await result.locator(".ct-spinner").count(), 1);
      assert.equal(await result.locator("svg.agent-result-illustration").count(), 0);
      assert.equal(await result.getAttribute("aria-busy"), "true");
      assert.equal(await prompt.isDisabled(), true);
      const now = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(now + 1_000);
      await page.clock.fastForward(27_000);
      assert.match(await result.innerText(), /Waiting for the agent response/);
      await page.clock.fastForward(2_000);
      assert.match(await result.innerText(), /Still waiting for a response/);
      assert.match(await page.locator("#status").innerText(), /Still waiting for a response/);
      await page.clock.resume();
      for (const width of [320, 430, 620, 960]) {
        await page.setViewportSize({ width, height: 800 });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(theme => { document.documentElement.dataset.studioTheme = theme; }, theme);
          const dimensions = await result.evaluate(node => ({
            scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
            scrollHeight: node.scrollHeight, clientHeight: node.clientHeight,
            documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
          }));
          assert.ok(dimensions.scrollWidth <= dimensions.clientWidth
            && dimensions.scrollHeight <= dimensions.clientHeight && dimensions.documentWidth <= dimensions.viewportWidth,
          `Pending summary and logs fit without nested clipping: ${width}px ${theme}: ${JSON.stringify(dimensions)}`);
          assert.ok(await result.evaluate(node => node.getBoundingClientRect().height <= 160),
            `Waiting uses at most 160px at ${width}px ${theme}, including the long-wait message and logs.`);
        }
      }
      await page.setViewportSize({ width: 430, height: 800 });
      const logs = result.getByRole("button", { name: "View logs", exact: true });
      assert.equal(await logs.getAttribute("data-appearance"), "secondary");
      await logs.click();
      const outputTab = page.locator('[data-run-tab="output"]');
      assert.equal(await outputTab.getAttribute("aria-selected"), "true");
      assert.equal(await outputTab.evaluate(node => node === document.activeElement), true);
      assert.equal(requests.length, 1);
      assert.equal(commands.length, 1);
      await page.locator("#map-app").click();
      await page.locator("#manage-app").click();
      await result.locator(".agent-result-title").filter({ hasText: "Still waiting for a response" }).waitFor();
      assert.equal(await prompt.inputValue(), requests[0].message);
      assert.equal(await spinner.evaluate(node => node === window.responseStepSpinner), true,
        "The active spinner retains its mount across workspace navigation.");
      await logs.focus();
      fixture.state.health = "Response progress polling";
      await page.clock.runFor(2_100);
      assert.equal(await logs.evaluate(node => node === document.activeElement), true);
      release();
      await page.locator('.agent-response[data-state="succeeded"]').waitFor();
      assert.equal(await result.textContent(), "Actual fixture response\n".repeat(80));
      assert.equal(await result.locator("svg,ol,button").count(), 0);
      assert.equal(await result.locator(".ct-spinner").count(), 0);
      assert.equal(await result.getAttribute("aria-busy"), "false");
      assert.equal(await result.evaluate(node => node === document.activeElement), true);
      await result.evaluate(node => { node.scrollTop = 90; });
      await page.clock.fastForward(31_000);
      assert.equal(await result.textContent(), "Actual fixture response\n".repeat(80));
      assert.equal(await result.evaluate(node => node.scrollTop), 90);
      await page.locator('[data-run-disclosure="tool-activity"] summary').click();
      assert.match(await page.locator('[data-run-disclosure="tool-activity"]').innerText(), /inventory_search/);
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
      await result.locator("svg.agent-result-illustration").waitFor();
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
      await geometry("idle");
      const prompt = page.getByRole("textbox", { name: "Agent message", exact: true });
      await prompt.fill("Retain payload after startup and request failure.");
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await result.locator(".agent-result-title").filter({ hasText: "The task was not sent" }).waitFor();
      assert.match(await result.innerText(), /Startup failed: synthetic prerequisite error/);
      assert.equal(requests.length, 0);
      await geometry("startup-failed");
      failStartup = false;
      available = true;
      fixture.state.app = "running";
      await page.waitForFunction(() => document.querySelector(".agent-status-facts")?.textContent.includes("Endpoint available"));
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
      await result.getByRole("button", { name: "View logs", exact: true }).click();
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
      await page.locator('.agent-status-brief[data-state="runtime-failed"]').waitFor();
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
          await result.locator(".agent-result-title").waitFor();
          await page.getByRole("textbox", { name: "Agent message", exact: true }).fill("Check wait timer cleanup.");
          await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
          await page.locator('.agent-response[data-phase="waiting"]').waitFor();
          assert.equal(requestSeen, true);
          await page.evaluate(persisted => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted })), persisted);
          await page.clock.fastForward(31_000);
          assert.equal((await result.innerText()).includes("Still waiting for a response"), persisted,
            "Final departure clears the message timer; BFCache suspension retains the live request.");
          release();
          await page.locator('.agent-response[data-state="succeeded"]').waitFor();
        } finally { release?.(); await page.close(); }
      }
    } finally { await browser.close(); await fixture.close(); }
  });
}
