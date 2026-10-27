import { installToolkitRoutes, withToolkitButtons } from "./toolkit-test-fixture.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { COMPONENT_LOGS_CSS, createComponentLogsPanel } from "./component-logs-panel.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("component logs are lazy, scoped, pausable and ignore responses after navigation", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const root = "/tmp/unity-component-logs";
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(withToolkitButtons(`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <style>${COMPONENT_LOGS_CSS}</style></head><body><main id="details"></main><script>
      const mount = ${createComponentLogsPanel.toString()};
      let panel;
      function leaveComponent() { panel?.dispose(); document.querySelector("#details").replaceChildren(); }
      function showComponent(id, initiallyOpen) {
        leaveComponent();
        const parent = document.querySelector("#details");
        const heading = document.createElement("h2");
        heading.textContent = id;
        parent.append(heading);
        panel = mount({ buttons: window.unityStudioButtons, parent, node: { id, name: id }, initiallyOpen, isActive: () => true,
          load: async ({ nodeId, signal }) => {
            const response = await fetch("/api/component-logs?root=" + encodeURIComponent(${JSON.stringify(root)}) +
              "&nodeId=" + encodeURIComponent(nodeId), { signal, headers: { "x-unity-studio-token": "fixture" } });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error);
            return body;
          }
        });
      }
      </script></body></html>`));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  let releaseHeld;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 640, height: 620 } });
    const errors = [];
    const logRequests = [];
    let failLogs = false;
    let holdLogs = false;
    let notifyHeld;
    const heldStarted = new Promise((resolve) => { notifyHeld = resolve; });
    let generation = 1;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      assert.equal(request.method(), "GET");
      assert.equal(request.headers()["x-unity-studio-token"], "fixture");
      const url = new URL(request.url());
      let body;
      if (url.pathname === "/api/component-logs") {
        assert.equal(url.searchParams.get("root"), root);
        const nodeId = url.searchParams.get("nodeId");
        assert.ok(["agent", "skills"].includes(nodeId));
        logRequests.push(nodeId);
        if (holdLogs && nodeId === "agent") {
          notifyHeld();
          await new Promise((resolve) => { releaseHeld = resolve; });
        }
        if (failLogs) {
          await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Fixture log read failed."}' });
          return;
        }
        body = nodeId === "agent" ? {
          node: { id: nodeId }, availability: "available", reason: "",
          streams: [
            { stream: "stdout", label: "stdout", available: true, reason: "", notice: "", lines: [`Agent output ${generation}`, "<script>window.logExecuted = true</script>"] },
            { stream: "stderr", label: "stderr", available: true, reason: "", notice: "", lines: [`Agent stderr ${generation}`] },
          ],
        } : { node: { id: nodeId }, availability: "unavailable", streams: [], reason: "No local service logs found for skills." };
      } else {
        assert.fail(`Unexpected route ${url.pathname}`);
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await installToolkitRoutes(page);

    await page.goto(`http://127.0.0.1:${server.address().port}/app-map`);
    await page.waitForFunction(() => window.unityToolkitFixtureReady);
    await page.clock.install();
    await page.evaluate(() => showComponent("agent", false));
    assert.equal(await page.locator(".component-logs").getAttribute("open"), null);
    assert.deepEqual(logRequests, []);
    await page.locator(".component-logs > summary").click();
    const output = page.getByLabel("agent service logs", { exact: true });
    await output.filter({ hasText: "Agent output 1" }).waitFor();
    assert.equal(await page.evaluate(() => window.logExecuted), undefined);
    assert.equal(await output.locator("script").count(), 0);
    const liveCount = logRequests.length;
    generation = 2;
    await page.clock.runFor(2100);
    await output.filter({ hasText: "Agent output 2" }).waitFor();
    assert.ok(logRequests.length > liveCount);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const pausedCount = logRequests.length;
    await page.clock.runFor(6000);
    assert.equal(logRequests.length, pausedCount);
    await page.getByRole("combobox", { name: "Log stream", exact: true }).selectOption("stderr");
    assert.equal(await output.textContent(), "Agent stderr 2");
    generation = 3;
    await page.locator(".component-logs").getByRole("button", { name: "Refresh", exact: true }).click();
    await output.filter({ hasText: "Agent stderr 3" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Resume", exact: true }).isVisible(), true);
    failLogs = true;
    await page.locator(".component-logs").getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByText("Could not load service logs: Fixture log read failed.", { exact: true }).waitFor();
    assert.equal(await output.textContent(), "Agent stderr 3");
    failLogs = false;
    generation = 4;
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await output.filter({ hasText: "Agent stderr 4" }).waitFor();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    holdLogs = true;
    await page.locator(".component-logs").getByRole("button", { name: "Refresh", exact: true }).click();
    await heldStarted;
    await page.evaluate(() => showComponent("skills", true));
    await page.getByLabel("skills service logs", { exact: true }).filter({ hasText: "No local service logs found" }).waitFor();
    releaseHeld();
    holdLogs = false;
    await page.clock.runFor(2100);
    assert.equal(await page.locator("#details h2").textContent(), "skills");
    assert.equal(await page.getByLabel("skills service logs", { exact: true }).textContent(), "No local service logs found for skills.");
    await page.evaluate(() => leaveComponent());
    const leftCount = logRequests.length;
    await page.clock.runFor(5000);
    assert.equal(logRequests.length, leftCount);
    assert.deepEqual(errors, []);
  } finally {
    releaseHeld?.();
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
