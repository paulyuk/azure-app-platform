import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";

import { APP_LOGS_CSS, createAppLogsPanel } from "./app-logs-panel.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("application logs workspace filters, pauses, refreshes, reports errors, and disposes safely", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const html = `<!doctype html>
    <html><head><meta name="color-scheme" content="light dark"><style>
      :root { --text:#17212b; --text-muted:#59636e; --border:#ccd3da; --surface:#fff; --surface-muted:#f4f6f8; --danger:#b42318; --font-mono:ui-monospace,monospace; }
      @media (prefers-color-scheme:dark) { :root { --text:#ecf1f5; --text-muted:#aeb8c2; --border:#46515c; --surface:#1f252b; --surface-muted:#151a1f; } }
      body { margin:16px; background:var(--surface); } ${APP_LOGS_CSS}
    </style></head><body><main id="host"></main><script>
      const createAppLogsPanel = ${createAppLogsPanel.toString()};
      window.logsActive = false;
      window.mountLogs = (nodeId = null) => {
        window.logsPanel?.dispose();
        const host = document.getElementById("host");
        host.replaceChildren();
        window.logsPanel = createAppLogsPanel({
          parent: host,
          nodeId,
          isActive: () => window.logsActive,
          load: async ({ serviceId, signal }) => {
            const query = new URLSearchParams({ root: "/fixture-app" });
            if (serviceId) query.set("serviceId", serviceId);
            const response = await fetch("/api/app-logs?" + query, {
              signal, headers: { "x-unity-studio-token": "fixture" },
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || "Request failed.");
            return body;
          },
        });
      };
      window.mountLogs("agent-node");
    </script></body></html>`;
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const catalog = [
    { id: "agent-service", label: "Deal agent", kind: "component", componentId: "agent-node", tierId: "agent", projectPath: "src/agent", aliases: [] },
    { id: "helper-service", label: "Azurite", kind: "supporting", componentId: null, tierId: "runtime", projectPath: null, aliases: ["azurite-queue", "azurite-table"] },
    { id: "skill-service", label: "Inventory skill", kind: "component", componentId: "skill-node", tierId: "skills", projectPath: "src/skills/inventory-search", aliases: [] },
  ];
  const makeStream = (stream, label, lines, reason = "", notice = "") => ({
    stream, label, available: !reason, reason, notice, lines,
  });
  const descriptor = (id) => catalog.find((service) => service.id === id);
  const service = (id, availability, reason, streams) => ({
    ...descriptor(id), availability, reason, streams,
  });
  const responseFor = (serviceId, generation) => {
    const longLine = `long:${"x".repeat(5000)}`;
    const services = [
      service("agent-service", "available", "", [
        makeStream("stdout", "Deal agent stdout", [`Agent output ${generation}`, longLine, "<script>window.logExecuted=true</script>"]),
        makeStream("stderr", "Deal agent stderr", [`Agent warning ${generation}`]),
      ]),
      service("helper-service", "available", "", [
        makeStream("combined", "azurite output", [`Storage ready ${generation}`], "", "Showing recent output."),
      ]),
      service("skill-service", "unavailable", "Log capture has not created this stream yet.", [
        makeStream("stdout", "Inventory skill stdout", [], "Log capture has not created this stream yet."),
      ]),
    ];
    const selected = serviceId ? services.filter((item) => item.id === serviceId) : services;
    return {
      root: "/fixture-app",
      scope: {
        serviceId,
        label: serviceId ? descriptor(serviceId)?.label : "All services",
        groupedByService: true,
        description: "Logs are grouped by service and retain source order within each stream. No cross-service chronology is inferred.",
      },
      catalog,
      services: selected,
      clipping: {
        clipped: !serviceId,
        services: { included: selected.length, total: 4, limit: 24 },
        catalog: { included: 3, total: 4, limit: 80 },
        lines: { included: 5, limit: 1200 },
        bytes: { included: 5100, limit: 262144 },
        notices: serviceId ? [] : ["Showing 3 of 4 discovered services."],
      },
    };
  };

  let browser;
  let generation = 1;
  let fail = false;
  let hold = false;
  let releaseHeld;
  let notifyHeld;
  const heldStarted = () => new Promise((resolve) => { notifyHeld = resolve; });
  const requests = [];
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 420, height: 720 }, colorScheme: "light" });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/app-logs?**", async (route) => {
      const request = route.request();
      assert.equal(request.method(), "GET");
      assert.equal(request.headers()["x-unity-studio-token"], "fixture");
      const url = new URL(request.url());
      assert.equal(url.searchParams.get("root"), "/fixture-app");
      const serviceId = url.searchParams.get("serviceId");
      requests.push(serviceId);
      if (hold) {
        notifyHeld?.();
        await new Promise((resolve) => { releaseHeld = resolve; });
      }
      if (fail) {
        await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Fixture log read failed."}' });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(responseFor(serviceId, generation)),
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/logs`);
    await page.clock.install();
    assert.deepEqual(requests, []);
    assert.equal(await page.getByRole("heading", { name: "Logs", exact: true }).count(), 1);
    await page.evaluate(() => { window.logsActive = true; });
    await page.clock.runFor(300);
    await page.getByLabel("Deal agent Deal agent stdout").filter({ hasText: "Agent output 1" }).waitFor();
    assert.deepEqual(requests.slice(0, 2), [null, "agent-service"]);
    assert.equal(await page.getByLabel("Service").inputValue(), "agent-service");
    assert.equal(await page.evaluate(() => window.logExecuted), undefined);

    await page.getByLabel("Stream").selectOption("stderr");
    assert.equal(await page.getByText("Agent warning 1", { exact: true }).count(), 1);
    await page.getByLabel("Search logs").fill("warning");
    await page.getByText("1 displayed line", { exact: false }).waitFor();
    await page.getByLabel("Search logs").fill("no-match");
    assert.equal(await page.getByText("No lines in this stream match the search.", { exact: true }).count(), 1);
    await page.getByLabel("Search logs").fill("");
    await page.getByLabel("Stream").selectOption("");

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const pausedCount = requests.length;
    generation = 2;
    await page.clock.runFor(5000);
    assert.equal(requests.length, pausedCount);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.locator(".app-logs-output").filter({ hasText: "Agent output 2" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Resume", exact: true }).count(), 1);

    await page.getByLabel("Service").selectOption("");
    await page.getByText("Storage ready 2", { exact: true }).waitFor();
    await page.getByText("Log capture has not created this stream yet.", { exact: true }).first().waitFor();
    assert.equal(await page.getByText("Showing 3 of 4 discovered services.", { exact: true }).count(), 1);
    assert.match(await page.locator(".app-logs-explanation").textContent(), /not a global chronological trace/);

    fail = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByText("Could not load application logs: Fixture log read failed.", { exact: true }).waitFor();
    assert.equal(await page.getByText("Storage ready 2", { exact: true }).count(), 1);
    fail = false;

    await page.evaluate(() => window.mountLogs("removed-component"));
    await page.getByText("The selected component has no matching application log service. No other component was substituted.", { exact: true }).waitFor();
    assert.equal(await page.getByText("Agent output 2", { exact: true }).count(), 0);

    const held = heldStarted();
    hold = true;
    await page.evaluate(() => window.mountLogs(null));
    await page.getByText("Loading application logs…", { exact: true }).first().waitFor();
    await held;
    await page.evaluate(() => window.logsPanel.dispose());
    assert.equal(await page.locator(".app-logs").count(), 0);
    releaseHeld();
    hold = false;
    await page.clock.runFor(2500);
    assert.equal(await page.locator(".app-logs").count(), 0);
    assert.deepEqual(pageErrors, []);

    await page.evaluate(() => window.mountLogs(null));
    await page.getByText("long:", { exact: false }).waitFor();
    const fitsNarrowView = await page.locator(".app-logs-output").first().evaluate((element) =>
      element.scrollWidth <= element.clientWidth + 1);
    assert.equal(fitsNarrowView, true);
  } finally {
    releaseHeld?.();
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
