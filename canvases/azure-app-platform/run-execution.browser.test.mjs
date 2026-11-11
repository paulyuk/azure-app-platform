import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`execution view follows real layers, retains focus and fits compact canvases in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.app = "stopped";
    let available = false, release, onRequest, fail = false, calls = 0;
    const errors = [];
    const browser = await engine.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 430, height: 800 } });
      page.setDefaultTimeout(10000);
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/app-command", route => {
        fixture.state.app = "starting";
        return route.fulfill({ json: { outcome: "command-started" } });
      });
      await page.route("**/api/app-status*", route => route.fulfill({ json: {
        state: fixture.state.app,
        entrypoints: [{ name: "agent", port: 8088, expected: true, ready: available }],
      } }));
      await page.route("**/api/agent-invoke", async route => {
        calls++;
        await new Promise(resolve => { release = resolve; onRequest?.(); });
        await route.fulfill(fail ? { status: 503, json: { error: "Synthetic request failure" } } : { json: {
          response: { output_text: "Actual run result" },
          summary: { text: "Actual run result", tools: [
            { name: "inventory_search", status: "Completed" },
            { name: "<script>unsafe()</script>", status: "Call reported" },
          ] },
        } });
      });
      await page.goto(fixture.origin + "/app-map");
      assert.equal(await page.locator(".agent-response, .run-execution-view").count(), 0,
        "Prompt entry starts without a result placeholder or execution layers.");
      await page.getByRole("textbox", { name: "Agent message", exact: true }).fill("Check inventory.");
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      const view = page.getByRole("region", { name: "Run execution", exact: true });
      const heading = view.getByRole("heading", { name: "Run in progress" });
      const runtime = view.locator('[data-layer="runtime"]');
      const execution = view.locator('[data-layer="execution"]');
      await heading.waitFor();
      assert.equal(await heading.evaluate(node => node === document.activeElement), true);
      assert.equal(await page.locator("dialog[open]").count(), 0, "Execution is a workspace view, not a modal.");
      assert.equal(await page.getByRole("textbox", { name: "Agent message", exact: true }).count(), 0,
        "The prompt-entry screen is not visible in the execution view.");
      assert.equal(await page.getByRole("navigation", { name: "App workspaces", exact: true }).isVisible(), true);
      await runtime.locator("text=Starting services and waiting for the agent endpoint.").waitFor();
      assert.equal(await page.locator(".agent-tester").getByText("Autonomous run result").count(), 0);
      assert.equal(await page.locator(".agent-tester .agent-response, .agent-tester [data-run-evidence]").count(), 0);
      assert.equal(await runtime.getAttribute("data-state"), "active");
      assert.equal(await execution.getAttribute("data-state"), "pending");
      assert.equal(await view.locator(".run-execution-result").isVisible(), false,
        "Run results stay hidden while the request is in progress.");
      assert.equal(calls, 0);
      available = true;
      fixture.state.app = "running";
      await execution.locator("text=Active").waitFor();
      assert.equal(await runtime.getAttribute("data-state"), "succeeded");
      assert.equal(await runtime.locator('.run-execution-mark svg[data-octicon="check"]').count(), 1);
      assert.deepEqual(await runtime.evaluate(node => {
        const mark = node.querySelector(".run-execution-mark");
        const icon = mark.querySelector('svg[data-octicon="check"]');
        return {
          mark: [mark.getBoundingClientRect().width, mark.getBoundingClientRect().height],
          icon: [icon.getBoundingClientRect().width, icon.getBoundingClientRect().height],
        };
      }), { mark: [20, 20], icon: [16, 16] });
      const trail = execution.locator("rect");
      assert.deepEqual(await trail.evaluate(node => {
        window.executionTrail = node;
        const style = getComputedStyle(node);
        return [style.animationName, style.animationDuration, style.animationIterationCount];
      }), ["run-layer-clockwise", "2.4s", "infinite"]);
      assert.deepEqual(await trail.evaluate(node => {
        const animation = node.getAnimations()[0];
        const time = animation.currentTime;
        animation.pause();
        const offsets = [600, 1200].map(time => {
          animation.currentTime = time;
          return Number.parseFloat(getComputedStyle(node).strokeDashoffset);
        });
        animation.currentTime = time;
        animation.play();
        return offsets;
      }), [-25, -50], "The trail advances clockwise around the rectangle, not back and forth.");
      await view.getByRole("button", { name: "Back to Run", exact: true }).focus();
      await page.keyboard.press("Shift+Tab");
      assert.equal(await view.evaluate(node => node.contains(document.activeElement)), false,
        "Keyboard focus is not trapped in the execution view.");
      await page.waitForResponse(response => response.url().includes("/api/app-output"));
      assert.equal(await trail.evaluate(node => node === window.executionTrail), true);
      for (const width of [320, 430, 620, 960]) {
        await page.setViewportSize({ width, height: 600 });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(theme => { document.documentElement.dataset.studioTheme = theme; }, theme);
          assert.equal(await view.evaluate(node =>
            node.scrollWidth <= node.clientWidth && node.getBoundingClientRect().right <= innerWidth
            && node.getBoundingClientRect().bottom <= innerHeight), true, `${width}px ${theme}`);
          assert.equal(await execution.evaluate(node => node.scrollWidth <= node.clientWidth), true);
        }
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(await trail.evaluate(node => getComputedStyle(node).animationName), "none");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.setViewportSize({ width: 620, height: 800 });
      const history = page.getByRole("navigation", { name: "Workspace history", exact: true });
      await view.getByRole("button", { name: "Back to Run", exact: true }).click();
      await page.locator("[data-view-execution]").waitFor();
      assert.equal(await page.locator("[data-view-execution]").evaluate(node => node === document.activeElement), true);
      assert.equal(await page.getByRole("textbox", { name: "Agent message", exact: true }).inputValue(), "Check inventory.");
      assert.equal(await page.getByRole("textbox", { name: "Agent message", exact: true }).isDisabled(), true);
      assert.equal(calls, 1, "Returning to Run does not cancel or reinvoke the request.");
      await history.getByRole("button", { name: "Forward", exact: true }).click();
      await heading.waitFor();
      assert.equal(await trail.evaluate(node => node === window.executionTrail), true);
      await page.locator("#map-app").click();
      assert.equal(await view.isVisible(), false, "Workspace navigation remains usable during a run.");
      await history.getByRole("button", { name: "Back", exact: true }).click();
      await heading.waitFor();
      await history.getByRole("button", { name: "Back", exact: true }).click();
      await page.locator("[data-view-execution]").waitFor();
      await page.locator("[data-view-execution]").click();
      assert.equal(calls, 1, "Reopening must not submit another request.");
      release();
      const complete = view;
      await complete.getByRole("heading", { name: "Run complete" }).waitFor();
      assert.equal(await complete.locator(".run-execution-summary").count(), 0,
        "Execution layers stay stacked directly without a parent summary accordion.");
      assert.equal(await complete.locator(".run-execution-layers").isVisible(), true,
        "Completed execution layers remain visible above the response.");
      for (const width of [320, 430, 620, 960]) {
        await page.setViewportSize({ width, height: 800 });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(theme => { document.documentElement.dataset.studioTheme = theme; }, theme);
          const layersLayout = await complete.locator(".run-execution-layers").evaluate(node => {
            const rows = [...node.querySelectorAll(".run-execution-layer")];
            return {
              fits: node.scrollWidth <= node.clientWidth + 1,
              rowHeights: rows.map(row => row.getBoundingClientRect().height),
              triggerBorders: rows.map(row => getComputedStyle(row.querySelector(".run-execution-trigger")).borderTopColor),
              badgeHeights: rows.map(row => row.querySelector(".run-execution-state").getBoundingClientRect().height),
            };
          });
          assert.equal(layersLayout.fits, true, `${theme} layers overflow at ${width}px`);
          assert.ok(layersLayout.rowHeights.every(height => height >= 32 && height <= 36),
            `${theme} layer heights out of range at ${width}px: ${JSON.stringify(layersLayout.rowHeights)}`);
          assert.ok(layersLayout.triggerBorders.every(color => color === "rgba(0, 0, 0, 0)"),
            `${theme} layer trigger border visible at ${width}px: ${JSON.stringify(layersLayout.triggerBorders)}`);
          assert.ok(layersLayout.badgeHeights.every(height => height === 16),
            `${theme} layer badge heights at ${width}px: ${JSON.stringify(layersLayout.badgeHeights)}`);
        }
      }
      await page.setViewportSize({ width: 620, height: 800 });
      assert.equal(await complete.evaluate(node =>
        node.querySelector(".run-execution-layers").getBoundingClientRect().bottom <=
        node.querySelector(".run-execution-result").getBoundingClientRect().top), true,
      "The stacked execution layers remain directly above the completed result.");
      assert.equal(await complete.locator('[data-layer="tool-0"]').getAttribute("data-state"), "succeeded");
      assert.equal(await complete.locator('[data-layer="tool-1"]').getAttribute("data-state"), "unverified");
      assert.equal(await complete.locator("script").count(), 0);
      assert.equal(await complete.locator('.run-execution-layer[data-state="active"]').count(), 0);
      assert.equal(await complete.locator(".agent-response").innerText(), "Actual run result");
      assert.equal(await complete.locator(".agent-response").evaluate(node => getComputedStyle(node).maxHeight), "400px");
      assert.equal(await complete.locator(".run-execution-flyout").count(), 0,
        "Execution layers do not render hover cards or inspection flyouts.");
      const toolLayer = complete.locator('[data-layer="tool-0"]');
      const toolTrigger = toolLayer.locator(".run-execution-trigger");
      const toolDetails = toolLayer.locator(".run-execution-details");
      assert.deepEqual(await toolLayer.evaluate(node => ({
        isButton: node.querySelector(".run-execution-trigger").matches("button"),
        tabIndex: node.querySelector(".run-execution-trigger").tabIndex,
        expanded: node.querySelector(".run-execution-trigger").getAttribute("aria-expanded"),
        borderTopColor: getComputedStyle(node.querySelector(".run-execution-trigger")).borderTopColor,
        detailsHidden: node.querySelector(".run-execution-details").hidden,
        detailWhiteSpace: getComputedStyle(node.querySelector(".run-execution-detail")).whiteSpace,
      })), {
        isButton: true, tabIndex: 0, expanded: "false", borderTopColor: "rgba(0, 0, 0, 0)", detailsHidden: true, detailWhiteSpace: "nowrap",
      });
      const collapsedToolHeight = await toolLayer.evaluate(node => node.getBoundingClientRect().height);
      await toolTrigger.click();
      assert.equal(await toolTrigger.getAttribute("aria-expanded"), "true");
      assert.equal(await toolDetails.isVisible(), true);
      assert.match(await toolDetails.innerText(), /LAYER[\s\S]*3 of 4 · MCP tool/);
      assert.match(await toolDetails.innerText(), /TOOL[\s\S]*inventory_search/);
      assert.match(await toolDetails.innerText(), /EVIDENCE[\s\S]*Completed result confirmed/);
      assert.ok(await toolLayer.evaluate(node => node.getBoundingClientRect().height) > collapsedToolHeight);
      await toolTrigger.click();
      assert.equal(await toolDetails.isVisible(), false);
      await toolTrigger.focus();
      await page.keyboard.press("Enter");
      assert.equal(await toolTrigger.getAttribute("aria-expanded"), "true");
      assert.equal(await toolTrigger.evaluate(node => node === document.activeElement), true);
      assert.notEqual(await toolLayer.evaluate(node =>
        getComputedStyle(node.querySelector(".run-execution-chevron")).transform), "none");
      await page.keyboard.press("Space");
      assert.equal(await toolTrigger.getAttribute("aria-expanded"), "false");
      assert.equal(await toolDetails.isVisible(), false);
      assert.equal(await toolTrigger.evaluate(node => node === document.activeElement), true);
      const successCard = await complete.evaluate(viewNode => {
        const card = viewNode.querySelector('.run-result-card[data-state="succeeded"]');
        const icon = card.querySelector(".run-result-icon");
        const title = card.querySelector("[data-run-result-heading]");
        const subtitle = card.querySelector("[data-run-result-subtitle]");
        const status = card.querySelector("[data-run-result-status]");
        const callout = card.querySelector(".agent-response");
        const okLayerMark = viewNode.querySelector('.run-execution-layer[data-state="succeeded"] .run-execution-mark');
        const okLayer = okLayerMark.closest(".run-execution-layer");
        const viewTitle = viewNode.querySelector("#run-execution-title");
        const iconMask = getComputedStyle(icon, "::before").maskImage || getComputedStyle(icon, "::before").webkitMaskImage || "";
        return {
          heading: title.textContent,
          status: status.textContent,
          iconMask: decodeURIComponent(iconMask),
          iconColor: getComputedStyle(icon).color,
          iconBackground: getComputedStyle(icon).backgroundColor,
          titleColor: getComputedStyle(title).color,
          subtitleColor: getComputedStyle(subtitle).color,
          viewTitleColor: getComputedStyle(viewTitle).color,
          statusColor: getComputedStyle(status).color,
          iconSize: [icon.getBoundingClientRect().width, icon.getBoundingClientRect().height],
          glyphSize: [
            getComputedStyle(icon, "::before").width,
            getComputedStyle(icon, "::before").height,
          ],
          cardBorderColor: getComputedStyle(card).borderTopColor,
          neutralBorderColor: getComputedStyle(okLayer).borderTopColor,
          calloutBorderColor: getComputedStyle(callout).borderInlineStartColor || getComputedStyle(callout).borderLeftColor,
          okColor: getComputedStyle(okLayerMark).color,
        };
      });
      assert.equal(successCard.heading, "Response received · local runtime");
      assert.equal(successCard.status, "HTTP 200 · local runtime");
      assert.match(successCard.iconMask, /data-octicon="check"/);
      assert.deepEqual(successCard.iconSize, [20, 20]);
      assert.deepEqual(successCard.glyphSize, ["16px", "16px"]);
      assert.equal(successCard.iconBackground, successCard.okColor);
      assert.notEqual(successCard.iconColor, successCard.iconBackground);
      assert.equal(successCard.titleColor, successCard.viewTitleColor);
      assert.equal(successCard.statusColor, successCard.okColor);
      assert.equal(successCard.cardBorderColor, successCard.neutralBorderColor);
      assert.equal(successCard.calloutBorderColor, successCard.neutralBorderColor);
      assert.equal(await complete.locator('[data-run-disclosure="tool-activity"]').count(), 0);
      const submittedDisclosure = complete.locator('[data-run-disclosure="submitted-input"]');
      const rawDisclosure = complete.locator('[data-run-disclosure="raw-response"]');
      assert.equal(await submittedDisclosure.evaluate(node => node.open), false);
      assert.equal(await rawDisclosure.evaluate(node => node.open), false);
      await submittedDisclosure.locator("summary").click();
      assert.match(await complete.locator('[data-run-disclosure="submitted-input"]').innerText(), /Check inventory\./);
      await submittedDisclosure.locator("summary").click();
      assert.deepEqual(await complete.evaluate(viewNode => {
        const submitted = viewNode.querySelector('[data-run-disclosure="submitted-input"]');
        const raw = viewNode.querySelector('[data-run-disclosure="raw-response"]');
        const submittedRect = submitted.getBoundingClientRect();
        const rawRect = raw.getBoundingClientRect();
        return {
          display: getComputedStyle(submitted.parentElement).display,
          verticallyStacked: submittedRect.bottom <= rawRect.top,
          sameLeftEdge: Math.abs(submittedRect.left - rawRect.left) <= 1,
          sameWidth: Math.abs(submittedRect.width - rawRect.width) <= 1,
        };
      }), {
        display: "grid",
        verticallyStacked: true,
        sameLeftEdge: true,
        sameWidth: true,
      });
      assert.match(await complete.locator('[data-layer="tool-0"]').innerText(), /inventory_search[\s\S]*Completed/);
      await complete.getByRole("heading", { name: "Run complete" }).hover();
      const rawSummary = complete.locator('[data-run-disclosure="raw-response"] summary');
      await rawSummary.focus();
      await page.waitForResponse(response => response.url().includes("/api/app-output"));
      assert.equal(await rawSummary.evaluate(node => node === document.activeElement), true);
      await page.keyboard.press("Enter");
      assert.equal(await rawDisclosure.evaluate(node => node.open), true);
      assert.match(await rawDisclosure.innerText(), /Actual run result/);
      await page.keyboard.press("Tab");
      assert.equal(await complete.locator('[data-run-disclosure="raw-response"] pre')
        .evaluate(node => node === document.activeElement), true, "Evidence is reachable with the keyboard.");
      await complete.getByRole("button", { name: "Back to Run" }).click();
      assert.equal(await page.getByText("Autonomous run result", { exact: true }).isVisible(), false);
      assert.equal(await page.locator(".agent-response").isVisible(), false);
      assert.equal(await page.locator(".agent-tester [data-run-disclosure]").count(), 0);
      assert.match(await page.locator(".agent-status-brief").innerText(), /Select View execution/);
      await page.locator("[data-view-execution]").click();
      assert.equal(await complete.locator('[data-run-disclosure="raw-response"]').evaluate(node => node.open), true);
      assert.equal(calls, 1, "Result review does not invoke again.");
      await complete.getByRole("button", { name: "Back to Run" }).click();
      fail = true;
      const requestStarted = new Promise(resolve => { onRequest = resolve; });
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await requestStarted;
      await execution.locator("text=Active").waitFor();
      assert.equal(await view.locator('[data-layer^="tool-"]').count(), 0, "New runs clear old tool evidence.");
      release();
      const failed = view;
      await failed.getByRole("heading", { name: "Run needs review" }).waitFor();
      assert.equal(await failed.locator('[data-layer="execution"]').getAttribute("data-state"), "failed");
      assert.match(await failed.innerText(), /Backend execution may still be running/);
      assert.match(await failed.innerText(), /Synthetic request failure/);
      await failed.getByRole("button", { name: "View logs" }).click();
      await page.waitForFunction(() => document.activeElement?.getAttribute("data-run-tab") === "output");
      assert.equal(await page.locator('[data-run-tab="output"]').getAttribute("aria-selected"), "true");
      assert.equal(await page.locator('[data-run-tab="output"]').evaluate(node => node === document.activeElement), true);
      assert.equal(await failed.isVisible(), true, "Logs open alongside the execution view.");
      for (const [width, height] of [[320, 600], [620, 800]]) {
        await page.setViewportSize({ width, height });
        const layout = await page.evaluate(() => {
          const execution = document.querySelector("#run-execution-workspace").getBoundingClientRect();
          const diagnostics = document.querySelector("#workspace-diagnostics").getBoundingClientRect();
          return {
            executionHeight: execution.height,
            diagnosticsHeight: diagnostics.height,
            separated: execution.bottom <= diagnostics.top + 1,
            fits: execution.right <= innerWidth && diagnostics.right <= innerWidth && diagnostics.bottom <= innerHeight,
          };
        });
        assert.ok(layout.executionHeight > 0 && layout.diagnosticsHeight > 0 && layout.separated && layout.fits,
          JSON.stringify({ width, height, layout }));
      }
      assert.equal(calls, 2);
      assert.deepEqual(errors, []);
    } finally { release?.(); await browser.close(); await fixture.close(); }
  });
}
