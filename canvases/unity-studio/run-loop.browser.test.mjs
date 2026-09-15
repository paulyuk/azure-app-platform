import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try {
  ({ chromium } = requireWeb("playwright"));
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

test("Run loop keeps logs, endpoint actions, message invocation and active modes visible", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const gateway = { name: "demo-gateway", resourceGroup: "rg", subscriptionId: "sub", endpoint: "https://example.test" };
  let appState = "stopped";
  let configured = false;
  let selected = false;
  let log = "Waiting for startup";
  let selections = 0;
  let agentPort = 8088;
  const portStops = [];
  const lifecycleCalls = [];
  let recovered = false;
  const invocations = [];
  const sourceReviews = [];
  const errors = [];
  const graph = {
    root: "/tmp/unity-run-loop-fixture", generatedAt: new Date().toISOString(),
    nodes: [
      { id: "agent", kind: "project", tierId: "agent", name: "Agent", projectPath: "src/agent", badges: [], evidence: [] },
      { id: "skill", kind: "project", tierId: "skills", name: "Inventory", projectPath: "src/skills/inventory", badges: [], evidence: [] },
      { id: "web", kind: "project", tierId: "web", name: "driveline-web", projectPath: "src/web", badges: [], evidence: [] },
    ], edges: [], summary: { projectNodes: 1, operationNodes: 0, edges: 0 },
  };
  const html = renderInteractiveAppMapHtml(graph, { apiToken: "fixture-token" });
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(request.url === "/" ? "<h1>Unity home</h1>" : html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let data;
      if (path === "/api/app-status") data = {
        state: appState, recovered,
        entrypoints: [{ name: "agent", port: agentPort, expected: true, ready: appState === "running",
          healthStatus: appState === "running" ? "Healthy" : "Offline", url: "http://localhost:" + agentPort }],
        foreignEntrypoints: [],
      };
      else if (path === "/api/local-readiness") data = {
        ready: true, gatewayConfigured: configured, model: configured ? "gpt-5-mini" : null,
        activeGateway: selected ? { ...gateway, configurationStatus: configured ? "ready" : "configuring" } : null,
      };
      else if (path === "/api/gateway-options") data = {
        subscriptions: [{ id: "sub", name: "Default subscription" }],
        subscription: { id: "sub", name: "Default subscription" },
        gateways: [gateway], suggested: gateway, active: selected ? gateway : null,
        models: [{ id: "gpt-5-mini", label: "gpt-5-mini" }, { id: "gpt-main", label: "GPT main" }],
      };
      else if (path === "/api/build-workspace") data = { artifacts: [] };
      else if (path === "/api/active-gateway") {
        selections += 1;
        assert.equal(request.postDataJSON().model, "gpt-5-mini");
        selected = true;
        appState = "configuring";
        data = { active: gateway, configuration: { state: "configuring" } };
      } else if (path === "/api/app-output") data = { lines: [log], commands: [{
        id: "invoke", kind: "http", label: "Invoke agent", command: "POST http://127.0.0.1:8088/responses",
        status: invocations.length ? "succeeded" : "running", durationMs: invocations.length ? 120 : null,
        startedAt: 1, note: invocations.length ? "HTTP 200" : "",
      }] };
      else if (path === "/api/open-source") {
        sourceReviews.push(request.postDataJSON());
        data = { outcome: "opened" };
      }
      else if (path === "/api/ports/pick") {
        agentPort = 8091;
        data = { settings: { AGENT_PORT: agentPort } };
      } else if (path === "/api/ports/review-stop") {
        data = { reviewId: "review-fixture", ports: [agentPort], targets: [{ pid: 424242, command: "node", ports: [agentPort] }] };
      } else if (path === "/api/ports/stop") {
        portStops.push(request.postDataJSON());
        appState = "stopped";
        data = { stopped: [424242], ports: [agentPort] };
      }
      else if (path === "/api/app-command") {
        lifecycleCalls.push(request.postDataJSON().operation);
        appState = request.postDataJSON().operation === "run-local" ? "starting" : "stopped";
        data = { outcome: "command-started" };
      } else if (path === "/api/agent-invoke") {
        invocations.push(request.postDataJSON());
        data = { response: { output_text: "Hello from the agent" },
          summary: { text: "Hello from the agent", tools: [{ name: "inventory_search", status: "Call reported" }] } };
      } else if (path === "/api/open-entrypoint") data = { outcome: "canvas-opened" };
      else throw new Error(`Unexpected route ${path}`);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/app-map`);
    const mapStyle = await page.locator("#graph-shell").evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      nodeFont: getComputedStyle(document.querySelector(".node-title")).fontSize,
    }));
    await page.locator("#manage-app").click();
    await page.waitForFunction(() => document.querySelector("#manage-app").getAttribute("aria-pressed") === "true");
    await page.locator("[data-runtime-output]").waitFor({ state: "visible" });
    assert.equal(await page.getByLabel("Document file", { exact: true }).count(), 0);
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      assert.deepEqual(await page.locator("[data-runtime-output]").evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor, text: getComputedStyle(el).color,
      })), { background: "rgb(0, 0, 0)", text: "rgb(255, 255, 255)" });
    }
    await page.emulateMedia({ colorScheme: "light" });
    assert.equal(await page.locator(".management-section .section-title").first().textContent(), "AI model connection");
    assert.equal(await page.locator("#details").getAttribute("data-mode"), "manage");
    assert.equal(await page.locator(".section-title").filter({ hasText: "Command reference" }).count(), 0);
    assert.equal(await page.locator(".section-title").filter({ hasText: "Test & troubleshoot" }).count(), 0);
    const sourceWeb = page.locator('[data-source-only="true"]').filter({ hasText: "driveline-web" });
    assert.ok(await sourceWeb.getByText("Source only", { exact: true }).isVisible());
    assert.equal(await sourceWeb.getByRole("button", { name: /Open web/ }).count(), 0);
    await sourceWeb.getByRole("button", { name: "Review source" }).click();
    assert.deepEqual(sourceReviews, [{ root: graph.root, projectPath: "src/web" }]);
    assert.deepEqual(await page.locator("#graph-shell").evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      nodeFont: getComputedStyle(document.querySelector(".node-title")).fontSize,
    })), mapStyle);
    await page.waitForFunction(() => document.querySelector(".run-card")?.textContent.includes("Configuring model access"));
    assert.equal(selections, 1);
    configured = true;
    appState = "stopped";
    await page.waitForFunction(() => [...document.querySelectorAll(".management-section")]
      .some((section) => section.querySelector("summary").textContent.includes("gpt-5-mini") && !section.open));
    await page.locator(".management-section > summary").filter({ hasText: "AI model connection" }).click();
    await page.getByRole("combobox", { name: "AI model", exact: true }).selectOption("gpt-main");
    const refreshed = page.waitForResponse((response) => response.url().includes("/api/gateway-options"));
    await page.getByRole("button", { name: "Refresh subscriptions & gateways" }).click();
    await refreshed;
    assert.equal(await page.getByRole("combobox", { name: "AI model", exact: true }).inputValue(), "gpt-main");
    await page.getByRole("button", { name: "Pick available ports", exact: true }).click();
    await page.getByText("Available ports saved. Run the app to start on these ports.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Stop apps using these ports", exact: true }).click();
    await page.locator("[data-port-review]").waitFor();
    assert.match(await page.locator("[data-port-review]").textContent(), /PID 424242.*8091/);
    assert.equal(portStops.length, 0);
    await page.locator("[data-port-review]").getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(portStops.length, 0);
    await page.getByRole("button", { name: "Stop apps using these ports", exact: true }).click();
    await page.locator("[data-port-review]").getByRole("button", { name: "Confirm stop", exact: true }).click();
    await page.getByText("Selected ports are free. Apps remain stopped.", { exact: true }).waitFor();
    assert.deepEqual(portStops, [{ root: graph.root, reviewId: "review-fixture", confirmed: true }]);
    await page.getByRole("button", { name: "Run app", exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector(".run-card")?.textContent.includes("Starting your app"));
    assert.equal(await page.locator("#header-runtime-action").getAttribute("aria-label"), "Cancel startup");
    assert.equal(await page.locator("#header-runtime-action").isEnabled(), true);
    await page.locator("#header-runtime-action").click();
    await page.waitForFunction(() => document.querySelector("#header-runtime-action")?.textContent === "Start app");
    assert.equal(lifecycleCalls.at(-1), "stop-local");
    await page.getByRole("button", { name: "Run app", exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector(".run-card")?.textContent.includes("Starting your app"));
    log = "[agent] Connected tools and ready on 8088";
    await page.waitForFunction(() => document.querySelector("[data-runtime-output]")?.textContent.includes("Connected tools"));
    appState = "running";
    await page.getByRole("button", { name: "Open agent", exact: true }).waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((button) => button.textContent === "Open agent")?.disabled);
    await page.getByRole("button", { name: "Open agent", exact: true }).click();
    await page.getByRole("textbox", { name: "Agent message", exact: true }).fill("Hello dealer");
    await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".agent-response")?.textContent === "Hello from the agent");
    assert.deepEqual(invocations[0], { root: graph.root, port: 8091, message: "Hello dealer" });
    assert.equal(await page.getByRole("button", { name: "Pick available ports", exact: true }).isDisabled(), true);
    await page.getByText("inventory_search · Call reported", { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector("[data-command-feed]")?.textContent.includes("HTTP 200"));
    assert.equal(await page.locator(".endpoint-heading strong").first().evaluate((el) => getComputedStyle(el).fontSize), "12px");
    assert.equal(selections, 1);
    assert.equal(await page.locator(".command-record .command-code").first().evaluate((el) => getComputedStyle(el).minHeight), "0px");
    assert.equal(await page.locator(".command-record .command-code").first().evaluate((el) => getComputedStyle(el).fontSize), "12px");
    recovered = true;
    appState = "starting";
    await page.waitForFunction(() => document.querySelector("#header-runtime-action")?.textContent === "Stop partial startup");
    assert.equal(await page.locator("#app-status-badge").textContent(), "Partial startup");
    await page.locator("#header-runtime-action").click();
    await page.waitForFunction(() => document.querySelector("#header-runtime-action")?.textContent === "Start app");
    assert.equal(lifecycleCalls.at(-1), "stop-local");
    recovered = false;
    appState = "running";
    for (const width of [380, 620, 780, 1000, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.locator("#details").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      assert.ok(await page.locator("header").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `Header overflows at ${width}px`);
      const controls = page.locator('#back-apps, #header-runtime-action, #app-status-badge');
      for (const control of await controls.all()) {
        const appearance = await control.evaluate((el) => ({
          height: el.getBoundingClientRect().height, nowrap: getComputedStyle(el).whiteSpace,
          fits: el.scrollWidth <= el.clientWidth + 1,
        }));
        assert.deepEqual(appearance, { height: 32, nowrap: "nowrap", fits: true }, `Inconsistent header control at ${width}px`);
      }
      for (const button of await page.locator(".header-actions > button").all()) {
        assert.ok(await button.evaluate((el) => el.getBoundingClientRect().height === 32 && el.scrollWidth <= el.clientWidth + 1));
      }
    }
    appState = "failed";
    log = "Startup failed: agent health check returned HTTP 503";
    await page.waitForFunction(() => document.querySelector("[data-runtime-output]")?.textContent.includes("HTTP 503"));
    await page.waitForFunction(() => document.querySelector(".run-card")?.textContent.includes("Last operation failed"));
    assert.equal(await page.locator("#app-status-badge").textContent(), "Needs attention");
    assert.equal(await page.getByRole("textbox", { name: "Agent message", exact: true }).inputValue(), "Hello dealer");
    assert.equal(selections, 1);
    await page.locator("#map-app").click();
    await page.waitForFunction(() => document.querySelector("#manage-app").getAttribute("aria-pressed") === "false");
    assert.equal(await page.locator("#manage-app").getAttribute("aria-pressed"), "false");
    await page.locator(".map-tools > summary").click();
    assert.equal(await page.locator("#map-app").getAttribute("aria-pressed"), "true");
    await page.locator("#action-center").click();
    assert.equal(await page.locator("#details").getAttribute("data-mode"), null);
    assert.equal(await page.locator("#action-center").getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator("#map-app").getAttribute("aria-pressed"), "true");
    await page.locator("#manage-app").click();
    assert.equal(await page.locator(".map-tools").evaluate((element) => element.open), false);
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.waitForURL(origin + "/");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
