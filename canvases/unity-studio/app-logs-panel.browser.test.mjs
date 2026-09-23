import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";

import { APP_LOGS_CSS, createAppLogsPanel } from "./app-logs-panel.mjs";
import { renderThemeStyles } from "./studio-theme.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("application logs workspace filters, pauses, refreshes, reports errors, and disposes safely", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const html = `<!doctype html>
    <html data-studio-theme="light"><head><meta name="color-scheme" content="light dark"><style>
      ${renderThemeStyles()}
      body { margin:16px; height:calc(100vh - 32px); background:var(--surface); }
      #host { height:100%; } ${APP_LOGS_CSS}
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
          load: async ({ serviceId, serviceIds, signal }) => {
            const query = new URLSearchParams({ root: "/fixture-app" });
            for (const id of serviceIds ?? (serviceId ? [serviceId] : [])) query.append("serviceId", id);
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
  const responseFor = (serviceIds, generation) => {
    const serviceId = serviceIds.length === 1 ? serviceIds[0] : null;
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
    const selected = serviceIds.length ? services.filter((item) => serviceIds.includes(item.id)) : services;
    return {
      root: "/fixture-app",
      scope: {
        serviceId,
        serviceIds,
        label: serviceId ? descriptor(serviceId)?.label : serviceIds.length ? `${serviceIds.length} services` : "All services",
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
  let perServiceError = false;
  let extraLines = [];
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
      const serviceIds = url.searchParams.getAll("serviceId");
      requests.push(serviceIds.length > 1 ? serviceIds : serviceIds[0] ?? null);
      if (hold) {
        notifyHeld?.();
        await new Promise((resolve) => { releaseHeld = resolve; });
      }
      if (fail) {
        await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Fixture log read failed."}' });
        return;
      }
      const body = responseFor(serviceIds, generation);
      if (perServiceError) {
        const skill = body.services.find((service) => service.id === "skill-service");
        if (skill) Object.assign(skill, { availability: "error", reason: "Cannot read this service log.", streams: [] });
      }
      body.services.find((service) => service.id === "agent-service")?.streams[0].lines.push(...extraLines);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/logs`);
    await page.clock.install();
    const picker = page.locator(".app-logs-services");
    const selectServices = async (...names) => {
      if (!await picker.evaluate((el) => el.open)) await picker.locator("summary").click();
      await picker.getByRole("button", { name: "All services", exact: true }).click();
      if (!names.length) return;
      await picker.locator("summary").click();
      for (const name of names) await picker.getByRole("checkbox", { name, exact: true }).check();
      await picker.locator("summary").press("Escape");
    };
    assert.deepEqual(requests, []);
    assert.equal(await page.getByRole("heading", { name: "Logs", exact: true }).count(), 1);
    await page.evaluate(() => { window.logsActive = true; });
    await page.clock.runFor(300);
    await page.getByLabel("Deal agent Deal agent stdout").filter({ hasText: "Agent output 1" }).waitFor();
    assert.deepEqual(requests.slice(0, 2), [null, "agent-service"]);
    assert.equal(await picker.locator("summary").textContent(), "Deal agent");
    assert.equal(await page.evaluate(() => window.logExecuted), undefined);

    await page.getByLabel("Stream").selectOption("stderr");
    assert.equal(await page.getByText("Agent warning 1", { exact: true }).count(), 1);
    await page.getByLabel("Search logs").fill("warning");
    await page.getByText("1 displayed line", { exact: false }).waitFor();
    await page.getByLabel("Search logs").fill("no-match");
    assert.equal(await page.getByText("No log lines match the current filters.", { exact: true }).count(), 1);
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

    await selectServices();
    await page.getByText("Storage ready 2", { exact: true }).waitFor();
    const capture = page.locator(".app-logs-capture");
    assert.equal(await capture.evaluate((el) => el.open), false);
    assert.match(await capture.locator("summary").textContent(), /1 without output/);
    await capture.locator("summary").click();
    await page.getByText("Inventory skill: Log capture has not created this stream yet.", { exact: true }).waitFor();
    assert.equal(await page.getByText("Showing 3 of 4 discovered services.", { exact: true }).count(), 1);
    assert.match(await page.locator(".app-logs-explanation").textContent(), /Not a timeline/);
    assert.match(await page.locator(".app-logs-explanation").getAttribute("title"), /untimestamped output/);
    const viewer = page.getByRole("region", { name: "Application logs", exact: true });
    assert.equal(await viewer.count(), 1);
    assert.equal(await viewer.getAttribute("aria-live"), "off");
    assert.equal(await page.locator(".app-logs-service,.app-logs-stream").count(), 0);
    assert.deepEqual(await viewer.locator(".app-logs-entry").evaluateAll((rows) =>
      rows.map((row) => [row.dataset.serviceId, row.dataset.stream])), [
      ["agent-service", "stdout"], ["agent-service", "stdout"], ["agent-service", "stdout"],
      ["agent-service", "stderr"], ["helper-service", "combined"],
    ]);
    assert.equal(await viewer.locator('.app-logs-source[tabindex="0"]').count(), 2,
      "Only one keyboard stop per service, not one per line");
    await capture.locator("summary").click();

    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => { document.documentElement.dataset.studioTheme = theme; }, theme);
      for (const width of [380, 620, 1120]) {
        await page.setViewportSize({ width, height: 720 });
        const geometry = await viewer.evaluate((el) => {
          const bounds = el.getBoundingClientRect();
          const row = el.querySelector(".app-logs-entry").getBoundingClientRect();
          const origin = el.querySelector(".app-logs-origin").getBoundingClientRect();
          const output = el.querySelector(".app-logs-output").getBoundingClientRect();
          return {
            height: bounds.height, bottom: bounds.bottom, viewportHeight: innerHeight,
            scrolls: el.scrollHeight > el.clientHeight,
            pageFits: document.documentElement.scrollWidth <= innerWidth,
            fits: [...el.querySelectorAll(".app-logs-entry,.app-logs-output")].every((node) => node.scrollWidth <= node.clientWidth + 1),
            innerScrollers: [...el.querySelectorAll("*")].filter((node) => /auto|scroll/.test(getComputedStyle(node).overflowY)).length,
            origin: origin.toJSON(), output: output.toJSON(), row: row.toJSON(),
          };
        });
        assert.ok(geometry.height >= 160 && geometry.bottom < geometry.viewportHeight);
        assert.equal(geometry.scrolls, true);
        assert.equal(geometry.pageFits && geometry.fits, true);
        assert.equal(geometry.innerScrollers, 0, "All sources share one scroll surface");
        assert.ok(geometry.output.top >= geometry.row.top - 1);
        assert.equal(await viewer.locator(".app-logs-entry").first().evaluate((el) => getComputedStyle(el).display), "block");
        assert.equal(await viewer.locator(".app-logs-entry").first().evaluate((el) => getComputedStyle(el).borderBottomWidth), "0px");
      }
    }
    await viewer.evaluate((el) => {
      el.scrollTop = 80;
      window.retainedLogLine = el.querySelector(".app-logs-output");
      window.retainedLogLine.dataset.retained = "yes";
    });
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".app-logs").hasAttribute("aria-busy"));
    assert.equal(await viewer.evaluate((el) => el.scrollTop), 80);
    assert.equal(await viewer.locator(".app-logs-output").first().getAttribute("data-retained"), "yes",
      "Unchanged polls retain source DOM and selection");
    await viewer.getByRole("button", { name: "Show only Azurite", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".app-logs-status").textContent.includes("Azurite"));
    assert.equal(await picker.locator("summary").textContent(), "Azurite");
    assert.equal(await viewer.locator(".app-logs-entry").count(), 1);
    assert.equal(await picker.locator("summary").evaluate((el) => el === document.activeElement), true);
    await selectServices("Deal agent", "Azurite");
    await page.waitForFunction(() => !document.querySelector(".app-logs").hasAttribute("aria-busy"));
    assert.equal(await picker.locator("summary").textContent(), "2 services");
    assert.deepEqual(requests.at(-1), ["agent-service", "helper-service"]);
    assert.deepEqual(await viewer.locator(".app-logs-entry").evaluateAll((rows) =>
      [...new Set(rows.map((row) => row.dataset.serviceId))]), ["agent-service", "helper-service"]);
    assert.equal(await viewer.count(), 1, "Multiple selected services share the same viewer");
    assert.equal(await capture.locator("li").filter({ hasText: "Inventory skill" }).count(), 0);
    await picker.locator("summary").press("Enter");
    assert.equal(await picker.getByRole("checkbox", { name: "Deal agent", exact: true }).isChecked(), true);
    await picker.getByRole("checkbox", { name: "Deal agent", exact: true }).uncheck();
    await picker.locator("summary").press("Escape");
    assert.equal(await picker.locator("summary").textContent(), "Azurite");
    assert.equal(await picker.evaluate((el) => el.open), false);
    await selectServices();
    await page.getByText("Agent output 2", { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector(".app-logs").hasAttribute("aria-busy"));
    perServiceError = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".app-logs-capture").dataset.attention === "true");
    assert.equal(await capture.evaluate((el) => el.open), false);
    assert.match(await capture.locator("summary").textContent(), /1 read error/);
    assert.equal(await page.getByText("Storage ready 2", { exact: true }).count(), 1);
    perServiceError = false;

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

    extraLines = ["2026-09-18T16:34:12Z Later entry", "No timestamp supplied", "2026-09-18T16:33:01Z Earlier clock"];
    await page.evaluate(() => window.mountLogs(null));
    await page.getByText("long:", { exact: false }).waitFor();
    assert.deepEqual(await page.locator('.app-logs-entry[data-service-id="agent-service"][data-stream="stdout"] .app-logs-output')
      .allTextContents().then((lines) => lines.slice(-3)), extraLines, "Raw source order is not replaced with a fabricated timeline");
    const fitsNarrowView = await page.locator(".app-logs-output").first().evaluate((element) =>
      element.scrollWidth <= element.clientWidth + 1);
    assert.equal(fitsNarrowView, true);
  } finally {
    releaseHeld?.();
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
