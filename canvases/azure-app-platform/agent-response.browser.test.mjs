import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Idle SVG retains its brand palette and follows theme blue without changing geometry in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      for (const presentationProfile of ["standalone", "github-app"]) {
        const fixture = await createRunSettingsFixture({ preview: true, presentationProfile });
        const page = await browser.newPage({ viewport: { width: 430, height: 800 } });
        try {
          await page.goto(fixture.origin + "/app-map");
          const svg = page.locator(".agent-response svg.agent-result-illustration");
          await svg.waitFor();
          const geometry = await svg.evaluate(node => [...node.querySelectorAll("path")].map(path => path.getAttribute("d")));
          const palettes = [];
          for (const theme of ["light", "dark"]) {
            if (presentationProfile === "github-app") {
              await page.evaluate(theme => {
                const hostColors = theme === "light"
                  ? { "--background-color-overlay": "#fdf7e8", "--text-color-muted": "#805030",
                    "--text-color-accent": "#b02070", "--background-color-accent-muted": "#f8d0e8",
                    "--text-color-button-primary-rest": "#fffaf0", "--true-color-blue": "#1473e6" }
                  : { "--background-color-overlay": "#201d30", "--text-color-muted": "#d0b090",
                    "--text-color-accent": "#e090c0", "--background-color-accent-muted": "#403050",
                    "--text-color-button-primary-rest": "#302010", "--true-color-blue": "#82baff" };
                for (const [token, value] of Object.entries(hostColors)) document.documentElement.style.setProperty(token, value);
              }, theme);
            }
            await page.evaluate(theme => { document.documentElement.dataset.studioTheme = theme; }, theme);
            const palette = await svg.evaluate(node => {
              const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
              node.append(probe);
              const resolve = token => {
                probe.setAttribute("fill", "var(" + token + ")");
                return getComputedStyle(probe).fill;
              };
              const colors = [
                [getComputedStyle(node.querySelector("#subject-intake > use")).fill, resolve("--run-art-paper")],
                [getComputedStyle(node.querySelector("#subject-intake > path")).stroke, resolve("--run-art-outline")],
                [getComputedStyle(node.querySelector("#subject-task > path")).fill, resolve("--run-art-task")],
                [getComputedStyle(node.querySelector("#connection-dispatch > circle")).fill, resolve("--true-color-blue")],
                [getComputedStyle(node.querySelector("#connection-dispatch > path")).stroke, resolve("--run-art-highlight")],
                [getComputedStyle(node.querySelector("#subject-intake > path[fill]")).fill, resolve("--run-art-soft-blue")],
              ];
              probe.remove();
              return colors;
            });
            for (const [actual, expected] of palette) assert.equal(actual, expected, `${presentationProfile} ${theme} uses inherited tokens`);
            palettes.push(palette.map(([actual]) => actual));
            assert.deepEqual(await svg.evaluate(node => [...node.querySelectorAll("path")].map(path => path.getAttribute("d"))), geometry);
          }
          assert.notDeepEqual(palettes[0], palettes[1], `${presentationProfile} brand blue must follow theme colors`);
          for (const palette of palettes) {
            assert.deepEqual(palette.slice(0, 3), ["rgb(245, 245, 245)", "rgb(41, 68, 130)", "rgb(255, 228, 180)"],
              "Light object interiors, blue outlines and warm task color must survive dark surfaces and purple UI accents");
            assert.equal(palette[4], "rgb(255, 255, 255)");
          }
          if (presentationProfile === "github-app") {
            assert.equal(palettes[0][3], "rgb(20, 115, 230)");
            assert.equal(palettes[1][3], "rgb(130, 186, 255)");
          }
          assert.equal(await svg.locator('[fill^="#"],[stroke^="#"]').count(), 0, "No fixed palette remains in rendered artwork");
        } finally { await page.close(); await fixture.close(); }
      }
    } finally { await browser.close(); }
  });

  test(`Only idle is illustrated; invocation, success and failure retain plain text in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture({ preview: true });
    let release, failure = false;
    const requests = [], errors = [];
    const success = "Actual fixture response\n".repeat(80) + "<script>not executable</script>";
    const failed = "Synthetic request failure\n".repeat(12) + "<script>not executable</script>";
    const browser = await engine.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 430, height: 800 } });
      page.setDefaultTimeout(10000);
      page.on("pageerror", error => errors.push(error.message));
      await page.clock.install();
      await page.route("**/api/agent-invoke", async route => {
        requests.push(route.request().postDataJSON());
        await new Promise(resolve => { release = resolve; });
        await route.fulfill(failure
          ? { status: 503, json: { error: failed } }
          : { json: { response: success, summary: { text: success, tools: [{ name: "inventory_search", status: "Call reported" }] } } });
      });
      await page.goto(fixture.origin + "/app-map");
      const result = page.getByRole("region", { name: "Agent response", exact: true });
      await result.locator(".agent-result-illustration").waitFor();
      assert.equal(await result.locator(".agent-result-title").textContent(), "Your next run starts here");
      assert.equal(await result.locator("p").textContent(), "Choose an event or enter a task above, then invoke the agent.");
      const illustration = result.locator("svg.agent-result-illustration");
      assert.equal(await illustration.getAttribute("aria-hidden"), "true");
      assert.equal(await illustration.getAttribute("focusable"), "false");
      assert.equal(await illustration.getAttribute("role"), null);
      assert.equal(await illustration.getAttribute("aria-labelledby"), null);
      assert.equal(await result.locator("ol,button,.ct-spinner").count(), 0);
      for (const width of [320, 430, 620]) {
        await page.setViewportSize({ width, height: 800 });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(theme => { document.documentElement.dataset.studioTheme = theme; }, theme);
          assert.ok(await result.evaluate(node => node.scrollWidth <= node.clientWidth
            && node.scrollHeight <= node.clientHeight && document.documentElement.scrollWidth <= innerWidth),
          `${width}px ${theme} idle must fit`);
        }
      }
      await page.setViewportSize({ width: 430, height: 800 });
      const prompt = page.getByRole("textbox", { name: "Agent message", exact: true });
      const payload = "Retain this exact task.";
      await prompt.fill(payload);
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".agent-response").dataset.state === "invoking");
      assert.equal(await result.textContent(), "Waiting for the local agent\u2026");
      assert.equal(await result.locator("*").count(), 0);
      assert.equal(await result.evaluate(node => getComputedStyle(node).whiteSpace), "pre-wrap");
      assert.equal(await prompt.isDisabled(), true);
      await page.clock.fastForward(31_000);
      assert.equal(await result.textContent(), "Waiting for the local agent\u2026", "No slow timer or new pending presentation");
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0], { root: "/fixture/dealer", port: 8088, message: payload });
      assert.equal(fixture.mutations.filter(item => item.path === "/api/app-command").length, 0);
      release();
      await page.waitForFunction(() => document.querySelector(".agent-response").dataset.state === "succeeded");
      assert.equal(await result.textContent(), success);
      assert.equal(await result.locator("*").count(), 0);
      assert.equal(await prompt.inputValue(), payload);
      await page.locator('[data-run-disclosure="tool-activity"] summary').click();
      assert.match(await page.locator('[data-run-disclosure="tool-activity"]').innerText(), /inventory_search/);
      assert.equal(await page.locator('[data-run-disclosure="raw-response"] pre').textContent(), success);
      await page.locator("#map-app").click();
      await page.locator("#manage-app").click();
      assert.equal(await result.textContent(), success, "Returning to Run must not restore the idle artwork");
      failure = true;
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".agent-response").dataset.state === "invoking");
      await page.waitForFunction(() => document.querySelector(".agent-response").textContent === "Waiting for the local agent\u2026");
      assert.equal(requests.length, 2);
      release();
      await page.waitForFunction(() => document.querySelector(".agent-response").dataset.state === "failed");
      assert.equal(await result.textContent(), failed);
      assert.equal(await result.locator("*").count(), 0);
      assert.equal(await result.evaluate(node => getComputedStyle(node).whiteSpace), "pre-wrap");
      assert.equal(await prompt.isDisabled(), false);
      assert.equal(await prompt.inputValue(), payload);
      assert.deepEqual(errors, []);
    } finally { release?.(); await browser.close(); await fixture.close(); }
  });

  test(`Startup failure retains base error and never sends a task in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture({ preview: true });
    fixture.state.app = "stopped";
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route("**/api/app-command", route => route.fulfill({
        status: 503, json: { error: "Synthetic prerequisite failure." },
      }));
      await page.goto(fixture.origin + "/app-map");
      const result = page.getByRole("region", { name: "Agent response", exact: true });
      await result.locator(".agent-result-illustration").waitFor();
      await page.getByRole("textbox", { name: "Agent message", exact: true }).fill("Retain this task after startup failure.");
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".agent-response").dataset.state === "failed");
      assert.equal(await result.textContent(), "Synthetic prerequisite failure.");
      assert.equal(await result.locator("*").count(), 0);
      assert.equal(fixture.mutations.filter(item => item.path === "/api/agent-invoke").length, 0);
    } finally { await browser.close(); await fixture.close(); }
  });
}
