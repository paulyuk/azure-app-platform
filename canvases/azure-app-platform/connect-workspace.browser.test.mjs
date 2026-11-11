import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture as createFixture } from "./run-settings-test-fixture.mjs";

const savedGateway = { name: "sub-a-first", subscriptionId: "sub-a", resourceGroup: "rg-sub-a",
  model: "gpt-latest", sandboxGroup: null };
const createRunSettingsFixture = () => createFixture({ gateway: savedGateway });

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

function gatewayOptions(url, { models = true } = {}) {
  const subscriptionId = url.searchParams.get("subscriptionId") || "sub-a";
  const sandboxSubscriptionId = url.searchParams.get("sandboxSubscriptionId") || "sub-a";
  const gateways = ["first", "second"].map(name => ({
    name: subscriptionId + "-" + name, subscriptionId, resourceGroup: "rg-" + subscriptionId, location: "eastus2",
  }));
  return {
    subscriptions: [{ id: "sub-a", name: "Subscription A" }, { id: "sub-b", name: "Subscription B" }],
    subscription: { id: subscriptionId }, sandboxSubscriptionId, gateways,
    suggested: gateways.find(gateway => gateway.name === url.searchParams.get("gatewayName")) || gateways[0],
    models: models ? [{ id: "gpt-latest", label: "GPT Latest" }, { id: "gpt-alternate", label: "GPT Alternate" }] : [],
    sandboxGroups: [{ name: "sandbox-" + sandboxSubscriptionId, resourceGroup: "rg-sandbox", subscriptionId: sandboxSubscriptionId }],
  };
}

const LONG_SUBSCRIPTIONS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Synthetic Demo Subscription Alpha With Deliberately Long Name",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Synthetic Demo Subscription Beta For Compact Layout Validation",
  },
];

function longGatewayOptions(url, { models = true } = {}) {
  const requestedSubscriptionId = url.searchParams.get("subscriptionId");
  const requestedSandboxSubscriptionId = url.searchParams.get("sandboxSubscriptionId");
  const subscriptionId = LONG_SUBSCRIPTIONS.some(item => item.id === requestedSubscriptionId)
    ? requestedSubscriptionId
    : LONG_SUBSCRIPTIONS[0].id;
  const sandboxSubscriptionId = LONG_SUBSCRIPTIONS.some(item => item.id === requestedSandboxSubscriptionId)
    ? requestedSandboxSubscriptionId
    : LONG_SUBSCRIPTIONS[0].id;
  const gateways = ["primary", "secondary"].map(name => ({
    name: `synthetic-${name}-layout-validation-ai-gateway-with-extra-long-name`,
    subscriptionId,
    resourceGroup: "rg-synthetic-layout-validation-gateway-westus2",
    location: "westus2",
  }));
  return {
    subscriptions: LONG_SUBSCRIPTIONS,
    subscription: { id: subscriptionId },
    sandboxSubscriptionId,
    gateways,
    suggested: gateways[0],
    models: models ? [{
      id: "gpt-latest",
      label: "gpt-latest · alias → synthetic-model-deployment-with-long-name",
    }] : [],
    sandboxGroups: [{
      name: "synthetic-layout-validation-sandbox-group-with-extra-long-name",
      resourceGroup: "rg-synthetic-layout-validation-sandbox-westus2",
      subscriptionId: sandboxSubscriptionId,
    }],
  };
}

async function chooseSubscription(page, scope, { label, searchLabel, query, option }) {
  const trigger = scope.getByRole("button", { name: label, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const search = page.getByRole("textbox", { name: searchLabel, exact: true });
  await search.waitFor();
  const panel = search.locator("xpath=ancestor::*[contains(@class, 'ct-select-panel')]");
  const design = await panel.evaluate((panelEl, triggerLabel) => {
    const root = panelEl.closest(".studio-filterable-dropdown");
    const triggerEl = root?.querySelector(`.ct-combobox[aria-label="${triggerLabel}"]`);
    const triggerStyle = triggerEl ? getComputedStyle(triggerEl) : null;
    const panelStyle = getComputedStyle(panelEl);
    const unselectedLabel = panelEl.querySelector(".ct-select-option:not([data-selected]) .ct-option-label");
    const selectedLabel = panelEl.querySelector(".ct-select-option[data-selected] .ct-option-label");
    const description = panelEl.querySelector(".ct-option-description");
    const searchRow = panelEl.querySelector(".ct-select-search-row");
    const searchIcon = searchRow?.querySelector("svg");
    const searchInput = searchRow?.querySelector("input");
    const iconBox = searchIcon?.getBoundingClientRect();
    const inputBox = searchInput?.getBoundingClientRect();
    const panelBox = panelEl.getBoundingClientRect();
    const optionsFit = Array.from(panelEl.querySelectorAll(".ct-select-option")).every(optionEl => {
      const optionBox = optionEl.getBoundingClientRect();
      return optionBox.left >= panelBox.left - 1 && optionBox.right <= panelBox.right + 1
        && optionEl.scrollWidth <= optionEl.clientWidth + 1;
    });
    return {
      triggerMinHeight: triggerStyle?.minHeight,
      triggerPadding: triggerStyle?.padding,
      triggerFontWeight: triggerStyle?.fontWeight,
      triggerFontSize: triggerStyle?.fontSize,
      triggerWidth: triggerEl?.getBoundingClientRect().width ?? 0,
      panelPadding: panelStyle.padding,
      panelFontWeight: panelStyle.fontWeight,
      panelWidth: panelEl.getBoundingClientRect().width,
      unselectedWeight: unselectedLabel ? getComputedStyle(unselectedLabel).fontWeight : null,
      selectedWeight: selectedLabel ? getComputedStyle(selectedLabel).fontWeight : null,
      descriptionWeight: description ? getComputedStyle(description).fontWeight : null,
      descriptionFontSize: description ? getComputedStyle(description).fontSize : null,
      searchGap: iconBox && inputBox ? inputBox.left - iconBox.right : -1,
      panelFits: panelBox.left >= 0 && panelBox.right <= innerWidth
        && panelEl.scrollWidth <= panelEl.clientWidth + 1,
      optionsFit,
    };
  }, label);
  assert.equal(design.triggerMinHeight, "34px");
  assert.equal(design.triggerPadding, "6px 10px");
  assert.equal(design.triggerFontWeight, "400");
  assert.equal(design.triggerFontSize, "13px");
  assert.equal(design.panelPadding, "0px");
  assert.equal(design.panelFontWeight, "400");
  assert.ok(Math.abs(design.panelWidth - design.triggerWidth) <= 1);
  assert.equal(design.unselectedWeight, "400");
  assert.equal(design.selectedWeight, "600");
  assert.equal(design.descriptionWeight, "400");
  assert.equal(design.descriptionFontSize, "11px");
  assert.ok(design.searchGap >= 7, `Search icon and input need a visible gap, received ${design.searchGap}px`);
  assert.equal(design.panelFits, true);
  assert.equal(design.optionsFit, true);
  await search.fill(query);
  const match = panel.getByRole("option", { name: option });
  await match.waitFor();
  assert.equal(await panel.getByRole("option").count(), 1);
  await search.press("ArrowDown");
  await page.keyboard.press("Enter");
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  for (const configured of [true, false]) {
    test(`Connect renders ${configured ? "known" : "empty"} local state before runtime and Azure discovery resolve in ${name}`, {
      skip: !engine && "Install src/web dependencies to run browser coverage.",
    }, async () => {
      const fixture = await createRunSettingsFixture();
      fixture.state.configured = configured;
      const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
      const pending = deferred(), discovery = deferred();
      try {
        const page = await browser.newPage({ viewport: { width: 380, height: 640 } });
        page.setDefaultTimeout(7000);
        const errors = [];
        let failed = true, discoveries = 0, localReads = 0;
        page.on("pageerror", error => errors.push(error.message));
        await page.route(/\/api\/(app-status|local-readiness)\?/, async route => {
          await pending.promise;
          if (failed) return route.fulfill({ status: 503, json: { error: "Connection status is unavailable." } });
          return route.continue();
        });
        await page.route("**/api/connection-state*", route => {
          localReads++;
          return route.fulfill({ json: { activeGateway: configured ? { ...savedGateway, configurationStatus: "ready" } : null,
            gatewayConfigured: configured, model: configured ? savedGateway.model : null, sandboxGroup: null } });
        });
        await page.route("**/api/gateway-options*", async route => {
          discoveries++;
          await discovery.promise;
          return route.fulfill(failed
            ? { status: 503, json: { error: "Azure discovery is unavailable." } }
            : { json: gatewayOptions(new URL(route.request().url())) });
        });
        await page.goto(fixture.origin + "/app-map");
        await page.waitForFunction(() => window.appPlatformReady);
        const before = performance.now();
        await page.locator("#connect-workspace").click();
        const content = page.locator(".gateway-connection-page");
        const gateway = content.getByRole("combobox", { name: "AI Gateway", exact: true });
        await gateway.waitFor({ timeout: 1500 });
        assert.ok(performance.now() - before < 1500, "Local connection controls must not wait for held runtime or Azure calls");
        await content.getByRole("status").filter({ hasText: "Refreshing available connections in the background..." }).waitFor();
        assert.equal(await content.locator(".connections-skeleton").isVisible(), false);
        assert.equal(await content.locator(".connections-current").isVisible(), true);
        assert.match(await content.locator(".connections-current").innerText(), configured
          ? /gpt-latest.*sub-a-first.*Sandbox not selected/ : /No connection has been saved/);
        assert.equal(await content.getByRole("combobox", { name: "AI model", exact: true }).inputValue(),
          configured ? savedGateway.model : "");
        assert.equal(await content.getByText("Connection validated", { exact: true }).count(), configured ? 1 : 0);
        assert.equal(await content.getByRole("status").count(), 1);
        assert.equal(await content.getByRole("button", { name: "Apply connections", exact: true }).isDisabled(), true);
        assert.equal(await content.getByRole("button", { name: "Cancel Azure discovery scan", exact: true }).isVisible(), true);
        assert.equal(localReads, 1);
        assert.equal(discoveries, 1, "Read-only discovery can run without waiting for mutation safety checks");
        assert.equal(await content.locator(".connections-footer").evaluate(node => {
          const box = node.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= innerHeight;
        }), true);
        pending.resolve();
        discovery.resolve();
        await content.getByRole("alert").filter({ hasText: "Azure discovery is unavailable." }).waitFor();
        assert.equal(await content.locator(".connections-skeleton").isVisible(), false);
        assert.equal(await content.getByRole("button", { name: "Apply connections", exact: true }).isDisabled(), true);
        assert.equal(await gateway.isVisible(), true, "Failures must not hide local configuration");
        assert.match(await content.locator(".connections-current").innerText(), configured
          ? /sub-a-first/ : /No connection has been saved/);
        assert.equal(await content.getByRole("button", { name: "Retry scan", exact: true }).isEnabled(), true);
        failed = false;
        await content.getByRole("button", { name: "Retry scan", exact: true }).click();
        await page.waitForFunction(() => document.querySelector(".connections-root")?.dataset.phase === "ready");
        assert.equal(await content.locator(".connections-skeleton").isVisible(), false);
        assert.equal(await content.locator(".connections-current").isVisible(), true);
        assert.equal(discoveries, 2);
        assert.deepEqual(fixture.mutations, []);
        assert.deepEqual(errors, []);
      } finally { pending.resolve(); discovery.resolve(); await browser.close(); await fixture.close(); }
    });
  }

  for (const knownToRun of [true, false]) {
    test(`Connect ${knownToRun ? "reuses Run's known connection" : "reads env-only configuration after Run readiness completes"} in ${name}`, {
      skip: !engine && "Install src/web dependencies to run browser coverage.",
    }, async () => {
      const fixture = await createRunSettingsFixture();
      fixture.state.configured = knownToRun;
      const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
      const discovery = deferred();
      try {
        const page = await browser.newPage({ viewport: { width: 380, height: 640 } });
        page.setDefaultTimeout(7000);
        let localReads = 0;
        await page.route("**/api/connection-state*", route => {
          localReads++;
          return route.fulfill({ json: { activeGateway: { ...savedGateway, configurationStatus: "local" },
            gatewayConfigured: false, model: savedGateway.model, sandboxGroup: null } });
        });
        await page.route("**/api/gateway-options*", async route => {
          await discovery.promise;
          return route.fulfill({ json: gatewayOptions(new URL(route.request().url())) });
        });
        await page.goto(fixture.origin + "/app-map");
        await page.waitForFunction(() => window.appPlatformReady &&
          document.querySelector("#header-runtime-action")?.dataset.operation === "stop-local");
        await page.locator("#connect-workspace").click();
        const content = page.locator(".gateway-connection-page");
        await content.getByRole("combobox", { name: "AI Gateway", exact: true }).waitFor({ timeout: 1500 });
        assert.match(await content.locator(".connections-current").innerText(), /gpt-latest.*sub-a-first/);
        assert.equal(await content.getByText(knownToRun ? "Connection validated" : "Configured locally", { exact: true }).count(), 1);
        assert.equal(await content.getByRole("combobox", { name: "AI model", exact: true }).inputValue(), savedGateway.model);
        assert.equal(localReads, knownToRun ? 0 : 1, "Only a known Run selection can replace reading local connection configuration");
        assert.equal(await content.getByRole("button", { name: "Apply connections", exact: true }).isDisabled(), true);
        assert.deepEqual(fixture.mutations, []);
      } finally { discovery.resolve(); await browser.close(); await fixture.close(); }
    });
  }

  for (const entry of ["Settings", "Run Environment", "Build Model connection"]) {
    test(`Shared Connections loading, recovery, drafts and Apply work through ${entry} in ${name}`, {
      skip: !engine && "Install src/web dependencies to run browser coverage.",
    }, async () => {
      const fixture = await createRunSettingsFixture();
      const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
      const readiness = deferred(), discovery = deferred(), appliedRequest = deferred(), save = deferred();
      try {
        const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
        page.setDefaultTimeout(7000);
        const errors = [], applied = [];
        let discoveries = 0, failDiscovery = true;
        let saved = { name: "sub-a-first", subscriptionId: "sub-a", resourceGroup: "rg-sub-a",
          model: "gpt-latest", sandboxGroup: null };
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/api/local-readiness*", async route => {
          await readiness.promise;
          return route.fulfill({ json: { ready: true, gatewayConfigured: true, activeGateway: saved, model: saved.model } });
        });
        await page.route("**/api/gateway-options*", async route => {
          discoveries++;
          await discovery.promise;
          return route.fulfill(failDiscovery
            ? { status: 503, json: { error: "Shared connection discovery failed." } }
            : { json: { ...gatewayOptions(new URL(route.request().url())), active: saved } });
        });
        await page.route("**/api/build-workspace*", route => route.fulfill({ json: {
          supportsDocuments: true,
          artifacts: [{ id: "runtime", customizationArea: "runtime", title: "Runtime & access",
            path: "config/runtime.json", available: true, content: '{"agentRuntime":"copilot-sdk-sandbox"}', sha: "fixture" }],
        } }));
        await page.route("**/api/active-gateway", async route => {
          const selection = route.request().postDataJSON();
          applied.push(selection);
          appliedRequest.resolve();
          await save.promise;
          saved = { name: selection.name, subscriptionId: selection.subscriptionId, resourceGroup: selection.resourceGroup,
            model: selection.model, sandboxGroup: selection.sandboxGroup };
          return route.fulfill({ json: { active: saved, configuration: { state: "ready" } } });
        });
        const open = async () => {
          if (entry === "Run Environment") {
            await page.locator("#manage-app").click();
            if (await page.locator("#run-diagnostics-toggle").getAttribute("aria-expanded") !== "true") {
              await page.locator("#run-diagnostics-toggle").click();
            }
            await page.locator("#run-tab-environment").click();
            return page.locator("#run-panel-environment .connections-root");
          }
          if (entry === "Build Model connection") {
            await page.locator("#build-workspace").click();
            await page.getByRole("button", { name: "Model connection", exact: true }).click().catch(async cause => {
              throw new Error(cause.message + "\nBuild: " + await page.locator("#customize-content").innerText() +
                "\nErrors: " + errors.join("\n"), { cause });
            });
          } else {
            await page.getByRole("button", { name: "Settings", exact: true }).click();
            const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
            const picker = dialog.locator("[data-settings-navigation]");
            if (await picker.isVisible()) await picker.selectOption("connection");
            else await dialog.locator('[data-settings-target="connection"]').click();
          }
          return page.getByRole("dialog", { name: "Settings", exact: true }).locator(".connections-root");
        };
        await page.goto(fixture.origin + "/app-map");
        await page.waitForFunction(() => window.appPlatformReady);
        let content = await open();
        await content.getByRole("status").filter({ hasText: "Refreshing available connections in the background..." }).waitFor();
        assert.equal(await content.locator(".connections-skeleton").isVisible(), false);
        assert.equal(await content.locator(".connections-current").isVisible(), true);
        assert.equal(await content.getByRole("status").count(), 1);
        assert.equal(await content.getByRole("combobox").count(), 3);
        assert.equal(await content.getByRole("button", { name: "Apply connections", exact: true }).isDisabled(), true);
        assert.equal(await content.getByRole("button", { name: "Cancel Azure discovery scan", exact: true }).isVisible(), true);
        assert.equal(discoveries, 1);
        readiness.resolve();
        assert.equal(await content.getByRole("button", { name: "Cancel Azure discovery scan", exact: true }).isEnabled(), true);
        assert.equal(await content.getByRole("button", { name: "Apply connections", exact: true }).isDisabled(), true);
        discovery.resolve();
        await content.getByRole("alert").filter({ hasText: "Shared connection discovery failed." }).waitFor();
        assert.equal(await content.locator(".connections-skeleton").isVisible(), false);
        failDiscovery = false;
        await content.getByRole("button", { name: "Retry scan", exact: true }).click();
        const model = content.getByRole("combobox", { name: "AI model", exact: true });
        await model.waitFor();
        await content.getByRole("region", { name: "Model access", exact: true }).waitFor();
        await content.getByRole("region", { name: "Sandbox execution", exact: true }).waitFor();
        for (const label of ["Azure subscription", "Sandbox subscription"]) {
          await content.getByRole("button", { name: label, exact: true }).waitFor();
          assert.equal(await content.getByRole("combobox", { name: label, exact: true }).count(), 0);
        }
        assert.equal(await model.inputValue(), "gpt-latest");
        await model.selectOption("gpt-alternate");
        assert.equal(await content.getByRole("radio").count(), 0, "Sandbox execution is required, not an optional mode");
        assert.equal(await content.getByRole("button", { name: "Apply connections", exact: true }).isDisabled(), true);
        await content.getByRole("combobox", { name: "ACA Sandbox Group", exact: true }).selectOption("0");
        assert.match(await content.locator(".connections-current").innerText(), /Unsaved changes/);
        assert.deepEqual(applied, []);
        if (entry !== "Run Environment") await page.keyboard.press("Escape");
        await page.locator("#connect-workspace").click();
        const connect = page.locator(".gateway-connection-page .connections-root");
        await connect.getByRole("combobox", { name: "AI model", exact: true }).waitFor();
        assert.equal(await connect.getByRole("combobox", { name: "AI model", exact: true }).inputValue(), "gpt-alternate");
        assert.equal(await connect.getByRole("combobox", { name: "ACA Sandbox Group", exact: true }).inputValue(), "0");
        await connect.getByRole("button", { name: "Discard", exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.gateway-connection-page [aria-label="AI model"]')?.value === "gpt-latest");
        content = await open();
        await content.getByRole("combobox", { name: "AI model", exact: true }).waitFor();
        assert.equal(await content.getByRole("combobox", { name: "AI model", exact: true }).inputValue(), "gpt-latest");
        assert.equal(await content.getByRole("combobox", { name: "ACA Sandbox Group", exact: true }).inputValue(), "");
        assert.equal(await content.getByRole("button", { name: "Apply connections", exact: true }).isDisabled(), true);
        assert.match(await content.locator(".connections-current").innerText(), /Sandbox not selected/);
        fixture.state.app = "deploying";
        await content.getByRole("status").filter({ hasText: "An app operation is in progress." }).waitFor();
        assert.equal(await content.getByRole("button", { name: "Apply connections", exact: true }).isDisabled(), true);
        fixture.state.app = "stopped";
        await content.getByRole("status").filter({ hasText: "Choose an available sandbox group" }).waitFor();
        await content.getByRole("combobox", { name: "AI model", exact: true }).selectOption("gpt-alternate");
        await content.getByRole("combobox", { name: "ACA Sandbox Group", exact: true }).selectOption("0");
        assert.deepEqual(applied, [], "Inspection, selection, navigation and Discard do not save or start resources");
        const apply = content.getByRole("button", { name: "Apply connections", exact: true });
        assert.equal(await apply.isEnabled(), true);
        await Promise.all([
          page.waitForRequest("**/api/active-gateway"),
          apply.evaluate(node => { node.click(); node.click(); }),
        ]);
        await appliedRequest.promise;
        assert.equal(await apply.isDisabled(), true);
        assert.equal(applied.length, 1, "Duplicate clicks cannot submit twice");
        assert.deepEqual(applied[0], { root: "/fixture/dealer", name: "sub-a-first", resourceGroup: "rg-sub-a",
          subscriptionId: "sub-a", model: "gpt-alternate",
          sandboxGroup: { name: "sandbox-sub-a", resourceGroup: "rg-sandbox", subscriptionId: "sub-a" } });
        save.resolve();
        await content.getByText("Connection validated", { exact: true }).waitFor();
        assert.deepEqual(fixture.mutations, [], "Explicit Apply is intercepted; no real runtime or cloud mutation occurs");
        assert.deepEqual(errors, []);
      } finally {
        readiness.resolve(); discovery.resolve(); save.resolve();
        await browser.close(); await fixture.close();
      }
    });
  }

  test(`Connections loading, model gating and refresh recovery preserve focus in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    let held = deferred();
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(7000);
      const errors = [], applied = [];
      let failed = false;
      page.on("pageerror", error => errors.push(error.message));
      const saved = { name: "sub-a-first", subscriptionId: "sub-a", resourceGroup: "rg-sub-a",
        model: "gpt-latest", sandboxGroup: null };
      await page.route("**/api/local-readiness*", route => route.fulfill({ json: {
        ready: true, gatewayConfigured: true, activeGateway: saved, model: saved.model,
        sandboxGroup: { name: "stale-sandbox", subscriptionId: "sub-a", resourceGroup: "rg-sandbox" },
      } }));
      await page.route("**/api/gateway-options*", async route => {
        const url = new URL(route.request().url());
        const pending = held;
        if (pending) await pending.promise;
        const options = gatewayOptions(url);
        options.warnings = ["Synthetic discovery warning: subscription access is limited."];
        if (url.searchParams.get("gatewayName") === "sub-a-second") options.models = [{ id: "second-model", label: "Second gateway model" }];
        await route.fulfill(failed ? { status: 503, json: { error: "Discovery failed; retained choices were not saved." } }
          : { json: { ...options, active: saved, suggestedSandboxGroup: options.sandboxGroups[0] } }).catch(cause => {
            if (!/closed|cancelled|aborted/i.test(cause.message)) throw cause;
          });
      });
      await page.route("**/api/active-gateway", route => {
        applied.push(route.request().postDataJSON());
        return route.fulfill({ json: { active: saved, configuration: {} } });
      });
      await page.goto(fixture.origin + "/app-map");
      await page.waitForFunction(() => window.appPlatformReady);
      await page.locator("#connect-workspace").click();
      const content = page.locator(".gateway-connection-page");
      const field = label => content.getByRole("combobox", { name: label, exact: true });
      const apply = content.getByRole("button", { name: "Apply connections", exact: true });
      const refresh = content.getByRole("button", { name: "Refresh subscriptions & gateways", exact: true });
      await content.getByRole("button", { name: "Cancel Azure discovery scan", exact: true }).waitFor();
      assert.equal(await content.locator(".connections-skeleton").isVisible(), false);
      assert.equal(await content.getByRole("status").filter({ hasText: "Refreshing available connections in the background..." }).count(), 1);
      assert.equal(await apply.isDisabled(), true);
      held.resolve(); held = null;
      await field("AI Gateway").waitFor();
      assert.equal(await field("AI Gateway").inputValue(), "0", "A suggested JSON candidate maps to the actual option");
      assert.equal(await content.getByText("Synthetic discovery warning: subscription access is limited.", { exact: true }).isVisible(), true);
      assert.equal(await content.getByRole("radio").count(), 0);
      assert.equal(await field("ACA Sandbox Group").isVisible(), true);
      assert.equal(await field("ACA Sandbox Group").inputValue(), "",
        "A saved null sandbox must not silently adopt a suggestion or stale readiness");
      assert.equal(await apply.isDisabled(), true);
      await apply.evaluate(node => { node.click(); node.click(); });
      assert.deepEqual(applied, [], "A legacy connection without a sandbox cannot be applied");
      await field("ACA Sandbox Group").selectOption("0");
      assert.equal(await apply.isEnabled(), true);
      held = deferred();
      await field("AI Gateway").focus();
      await field("AI Gateway").selectOption("1");
      await content.getByRole("status").filter({ hasText: "Loading models for the selected gateway..." }).waitFor();
      assert.equal(await apply.isDisabled(), true);
      assert.equal(await field("AI model").inputValue(), "");
      assert.equal(await content.getByRole("group", { name: "Connection choices" }).getAttribute("aria-busy"), "true");
      await apply.evaluate(node => { node.click(); node.click(); });
      assert.deepEqual(applied, []);
      held.resolve(); held = null;
      await field("AI model").getByRole("option", { name: "Second gateway model", exact: true }).waitFor({ state: "attached" });
      assert.equal(await field("AI model").inputValue(), "second-model");
      assert.equal(await field("AI Gateway").evaluate(node => node === document.activeElement), true);
      await refresh.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => !document.querySelector('.gateway-connection-page [aria-label="Refresh subscriptions & gateways"]').disabled);
      assert.equal(await refresh.evaluate(node => node === document.activeElement), true);
      failed = true;
      await refresh.focus();
      await page.keyboard.press("Enter");
      const retry = content.getByRole("button", { name: "Retry scan", exact: true });
      await retry.waitFor();
      assert.equal(await retry.evaluate(node => node === document.activeElement), true);
      assert.equal(await field("AI model").inputValue(), "second-model");
      assert.equal(await apply.isDisabled(), true);
      failed = false;
      await retry.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => !document.querySelector('.gateway-connection-page [data-gateway-apply]').disabled);
      assert.equal(await refresh.evaluate(node => node === document.activeElement), true);
      held = deferred();
      await refresh.click();
      await content.getByRole("button", { name: "Cancel Azure discovery scan", exact: true }).focus();
      await page.keyboard.press("Enter");
      assert.equal(await retry.evaluate(node => node === document.activeElement), true);
      assert.equal(await field("AI model").inputValue(), "second-model");
      assert.equal(await apply.isDisabled(), true);
      held.resolve(); held = null;
      assert.deepEqual(applied, []);
      assert.deepEqual(fixture.mutations, []);
      assert.deepEqual(errors, []);
    } finally { held?.resolve(); await browser.close(); await fixture.close(); }
  });

  test(`Connections discard, missing sandbox and real validation states remain distinct in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    const browser = await engine.launch();
    const confirmApply = deferred();
    const applyReceived = deferred();
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(7000);
      const initial = gatewayOptions(new URL("http://fixture/"));
      let saved = { ...initial.gateways[0], model: "gpt-latest", sandboxGroup: initial.sandboxGroups[0] };
      let missingSandbox = false, missingGateway = false, configurationStatus = "ready";
      const applied = [];
      await page.route("**/api/local-readiness*", route => route.fulfill({ json: {
        ready: configurationStatus === "ready", gatewayConfigured: configurationStatus === "ready",
        activeGateway: { ...saved, configurationStatus }, model: saved.model, sandboxGroup: saved.sandboxGroup,
      } }));
      await page.route("**/api/gateway-options*", route => {
        const options = gatewayOptions(new URL(route.request().url()));
        return route.fulfill({ json: { ...options, active: saved,
          gateways: missingGateway ? [] : options.gateways, suggested: missingGateway ? null : options.suggested,
          sandboxGroups: missingSandbox ? [] : options.sandboxGroups } });
      });
      await page.route("**/api/active-gateway", async route => {
        applied.push(route.request().postDataJSON());
        saved = applied.at(-1);
        configurationStatus = "configuring";
        applyReceived.resolve();
        await confirmApply.promise;
        return route.fulfill({ json: { active: { ...saved, configurationStatus }, configuration: { state: "configuring" } } });
      });
      await page.goto(fixture.origin + "/app-map");
      await page.waitForFunction(() => window.appPlatformReady);
      await page.locator("#connect-workspace").click();
      const content = page.locator(".gateway-connection-page");
      const model = content.getByRole("combobox", { name: "AI model", exact: true });
      const apply = content.getByRole("button", { name: "Apply connections", exact: true });
      const discard = content.getByRole("button", { name: "Discard", exact: true });
      const refresh = content.getByRole("button", { name: "Refresh subscriptions & gateways", exact: true });
      await model.waitFor();
      assert.equal(await discard.isVisible(), false);
      await model.selectOption("gpt-alternate");
      await discard.waitFor();
      assert.match(await content.locator(".connections-current").innerText(), /Unsaved changes/);
      await discard.click();
      await page.waitForFunction(() => document.querySelector('.gateway-connection-page [aria-label="AI model"]')?.value === "gpt-latest");
      assert.deepEqual(applied, [], "Discard never applies a selection");
      missingSandbox = true;
      await refresh.click();
      await content.getByRole("status").filter({ hasText: "Choose an available sandbox group" }).waitFor();
      assert.equal(await content.getByRole("combobox", { name: "ACA Sandbox Group", exact: true }).isVisible(), true);
      assert.equal(await apply.isDisabled(), true);
      assert.equal(await content.getByRole("radio").count(), 0);
      assert.equal(await content.getByRole("button", { name: "Create Sandbox Group", exact: true }).isEnabled(), true);
      await apply.evaluate(node => { node.click(); node.click(); });
      assert.deepEqual(applied, [], "A missing sandbox cannot be bypassed");
      missingGateway = true;
      await refresh.click();
      await content.getByRole("status").filter({ hasText: "No AI Gateways found." }).waitFor();
      assert.equal(await apply.isDisabled(), true);
      assert.equal(await content.getByRole("button", { name: "Create Gateway", exact: true }).isEnabled(), true);
      missingGateway = false;
      missingSandbox = false;
      await refresh.click();
      await content.getByRole("combobox", { name: "ACA Sandbox Group", exact: true }).getByRole("option", { name: /sandbox-sub-a/ }).waitFor({ state: "attached" });
      assert.equal(await apply.isDisabled(), true, "A recovered sandbox must be explicitly reselected");
      await content.getByRole("combobox", { name: "ACA Sandbox Group", exact: true }).selectOption("0");
      await page.waitForFunction(() => !document.querySelector('.gateway-connection-page [data-gateway-apply]').disabled);
      fixture.state.app = "deploying";
      await content.getByRole("status").filter({ hasText: "An app operation is in progress." }).waitFor();
      assert.equal(await apply.isDisabled(), true);
      fixture.state.app = "running";
      await page.waitForFunction(() => !document.querySelector('.gateway-connection-page [data-gateway-apply]').disabled);
      await apply.click();
      await applyReceived.promise;
      await apply.evaluate(node => { node.click(); node.click(); });
      assert.equal(applied.length, 1, "An in-flight valid Apply cannot be submitted twice");
      confirmApply.resolve();
      await content.getByRole("status").filter({ hasText: "Validating the saved gateway endpoint" }).waitFor();
      assert.equal(await apply.isDisabled(), true);
      assert.equal(applied.length, 1);
      assert.deepEqual(applied[0].sandboxGroup, initial.sandboxGroups[0]);
      assert.equal(await content.getByText("Connection validated", { exact: true }).count(), 0);
      configurationStatus = "ready";
      await content.getByText("Connection validated", { exact: true }).waitFor();
      assert.equal(await discard.isVisible(), false);
      assert.deepEqual(fixture.mutations, []);
    } finally { confirmApply.resolve(); await browser.close(); await fixture.close(); }
  });

  test(`Connection resource actions retain their real operation names and scopes in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.configured = false;
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 780, height: 850 } });
      page.setDefaultTimeout(7000);
      const commands = [];
      await page.route("**/api/gateway-options*", route =>
        route.fulfill({ json: gatewayOptions(new URL(route.request().url()), { models: false }) }));
      await page.route("**/api/app-command", route => {
        commands.push(route.request().postDataJSON());
        return route.fulfill({ json: { outcome: "command-started" } });
      });
      await page.goto(fixture.origin + "/app-map");
      await page.waitForFunction(() => window.appPlatformReady);
      const content = page.locator(".gateway-connection-page");
      await page.locator("#connect-workspace").click();
      await content.getByRole("button", { name: "Discard", exact: true }).click();
      await content.getByRole("status").filter({ hasText: "Choose an AI Gateway to load its models." }).waitFor();
      assert.equal(await content.getByRole("combobox", { name: "AI Gateway", exact: true }).inputValue(), "");
      assert.equal(await content.getByRole("button", { name: "Discard", exact: true }).isVisible(), false);
      assert.deepEqual(commands, [], "Discarding a first-time draft never creates or configures resources");
      await chooseSubscription(page, content, {
        label: "Azure subscription", searchLabel: "Filter Azure subscriptions by name or ID",
        query: "sub-b", option: /Subscription B sub-b/,
      });
      await page.waitForFunction(() => document.querySelector('.gateway-connection-page [aria-label="AI Gateway"] option[value="0"]')?.textContent.includes("sub-b"));
      for (const action of ["Create Gateway", "Create Sandbox Group", "Configure Model"]) {
        await content.getByRole("button", { name: action, exact: true }).click();
        await page.waitForFunction(() => document.body.dataset.workspace === "manage");
        await page.locator("#connect-workspace").click();
        await content.getByRole("button", { name: "Create Gateway", exact: true }).waitFor();
      }
      assert.deepEqual(commands, [
        { root: "/fixture/dealer", operation: "bootstrap-starter-gateway", subscriptionId: "sub-b" },
        { root: "/fixture/dealer", operation: "create-sandbox-group", subscriptionId: "sub-a",
          resourceGroup: "rg-sub-b", location: "eastus2", sandboxGroupName: "aca-sandboxes-dealer-ui-preview" },
        { root: "/fixture/dealer", operation: "onboard-gateway-models", subscriptionId: "sub-b",
          resourceGroup: "rg-sub-b", gatewayName: "sub-b-first" },
      ]);
      assert.deepEqual(fixture.mutations, []);
    } finally { await browser.close(); await fixture.close(); }
  });

  test(`Connect owns gateway configuration, scopes, retained selections and apply in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.documentInput = true;
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(7000);
      const errors = [], queries = [], applied = [];
      let applyError = false;
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/gateway-options*", route => {
        const url = new URL(route.request().url());
        queries.push(Object.fromEntries(url.searchParams));
        return route.fulfill({ json: gatewayOptions(url) });
      });
      await page.route("**/api/active-gateway", route => {
        applied.push(route.request().postDataJSON());
        return route.fulfill(applyError
          ? { status: 503, json: { error: "Gateway validation failed. Nothing was saved." } }
          : { json: { active: applied.at(-1), configuration: { state: "ready" } } });
      });
      await page.goto(fixture.origin + "/app-map");
      await page.waitForFunction(() => window.appPlatformReady);
      await page.locator('.agent-status-brief[data-state="ready"]').waitFor();
      const draft = page.getByRole("textbox", { name: "Agent message", exact: true });
      await page.getByRole("combobox", { name: "Event triggers", exact: true }).selectOption("loan.document.submitted");
      await draft.fill("Keep this document-backed event.");
      const connect = page.locator("#connect-workspace");
      await connect.click();
      const content = page.locator(".gateway-connection-page");
      const field = label => content.getByRole("combobox", { name: label, exact: true });
      const subscription = label => content.getByRole("button", { name: label, exact: true });
      await field("AI Gateway").waitFor();
      assert.equal(await page.locator("dialog[open]").count(), 0);
      assert.equal(await page.locator("#graph-shell").isVisible(), false);
      assert.equal(await connect.getAttribute("aria-current"), "page");
      assert.equal(await page.locator("#workspace-location").textContent(), "Connect");
      await field("ACA Sandbox Group").selectOption("0");
      for (const label of ["AI Gateway", "AI model", "ACA Sandbox Group"]) {
        assert.equal(await field(label).isVisible(), true);
      }
      for (const label of ["Azure subscription", "Sandbox subscription"]) {
        assert.equal(await subscription(label).isVisible(), true);
      }
      assert.equal(await content.locator(
        'select[aria-label="Azure subscription"], select[aria-label="Sandbox subscription"]',
      ).count(), 0);
      for (const label of ["Refresh subscriptions & gateways", "Refresh sandbox groups", "Create Gateway", "Create Sandbox Group", "Apply connections"]) {
        assert.equal(await content.getByRole("button", { name: label, exact: true }).isEnabled(), true);
      }
      await chooseSubscription(page, content, {
        label: "Azure subscription",
        searchLabel: "Filter Azure subscriptions by name or ID",
        query: "sub-b",
        option: /Subscription B sub-b/,
      });
      await page.waitForFunction(() => document.querySelector('.gateway-connection-page [aria-label="AI Gateway"] option[value="0"]')?.textContent.includes("sub-b"));
      assert.match(await subscription("Sandbox subscription").textContent(), /Subscription A .* sub-a/);
      await field("AI Gateway").selectOption("1");
      await field("AI model").getByRole("option", { name: "GPT Alternate", exact: true }).waitFor({ state: "attached" });
      await field("AI model").selectOption("gpt-alternate");
      await field("ACA Sandbox Group").selectOption("0");
      await field("AI model").focus();
      await field("AI model").evaluate(node => { window.retainedGatewayModel = node; });
      fixture.state.health = "Changed health while choosing a model";
      await page.waitForResponse(response => new URL(response.url()).pathname === "/api/app-status");
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await field("AI model").evaluate(node => node === window.retainedGatewayModel && node === document.activeElement), true);
      const retainedScroll = await content.locator(".connections-body").evaluate(node => { node.scrollTop = 100; return node.scrollTop; });
      assert.ok(retainedScroll > 0);
      await page.locator("#build-workspace").click();
      await page.getByRole("region", { name: "Build workspace", exact: true }).waitFor();
      await page.getByRole("navigation", { name: "Workspace history", exact: true }).getByRole("button", { name: "Back", exact: true }).click();
      await field("AI model").waitFor();
      assert.equal(await field("AI model").inputValue(), "gpt-alternate");
      await page.waitForFunction(scroll => document.querySelector(".gateway-connection-page .connections-body")?.scrollTop === scroll, retainedScroll);
      assert.equal(await content.locator(".connections-body").evaluate(node => node.scrollTop), retainedScroll);
      await page.locator("#manage-app").click();
      assert.equal(await draft.inputValue(), "Keep this document-backed event.");
      await page.getByRole("navigation", { name: "Workspace history", exact: true }).getByRole("button", { name: "Back", exact: true }).click();
      await field("AI Gateway").waitFor();
      assert.match(await subscription("Azure subscription").textContent(), /Subscription B .* sub-b/);
      assert.equal(await field("AI Gateway").inputValue(), "1");
      assert.equal(await field("AI model").inputValue(), "gpt-alternate");
      assert.equal(await field("ACA Sandbox Group").inputValue(), "0");
      assert.equal(applied.length, 0);
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.evaluate(() => window.appPlatformSettings.open("connection"));
      const settings = page.getByRole("dialog", { name: "Settings", exact: true });
      await settings.getByRole("combobox", { name: "AI model", exact: true }).waitFor();
      assert.equal(await settings.getByRole("combobox", { name: "AI model", exact: true }).inputValue(), "gpt-alternate");
      await chooseSubscription(page, settings, {
        label: "Azure subscription",
        searchLabel: "Filter Azure subscriptions by name or ID",
        query: "Subscription B",
        option: /Subscription B sub-b/,
      });
      await chooseSubscription(page, settings, {
        label: "Sandbox subscription",
        searchLabel: "Filter sandbox subscriptions by name or ID",
        query: "sub-a",
        option: /Subscription A sub-a/,
      });
      await settings.getByRole("combobox", { name: "AI model", exact: true }).focus();
      await settings.getByRole("combobox", { name: "AI model", exact: true }).evaluate(node => { window.settingsModel = node; });
      fixture.state.health = "Changed health while Settings is open";
      await page.waitForResponse(response => new URL(response.url()).pathname === "/api/app-status");
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await settings.getByRole("combobox", { name: "AI model", exact: true }).evaluate(node =>
        node === window.settingsModel && node === document.activeElement), true);
      await settings.getByRole("combobox", { name: "ACA Sandbox Group", exact: true }).selectOption("");
      await page.keyboard.press("Escape");
      await settings.waitFor({ state: "hidden" });
      assert.equal(await field("ACA Sandbox Group").isVisible(), true);
      assert.equal(await field("ACA Sandbox Group").inputValue(), "");
      assert.equal(await content.getByRole("button", { name: "Apply connections", exact: true }).isDisabled(), true);
      await field("ACA Sandbox Group").selectOption("0");
      applyError = true;
      await content.getByRole("button", { name: "Apply connections", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Gateway validation failed." }).first().waitFor();
      await field("AI model").waitFor();
      assert.equal(await field("AI model").inputValue(), "gpt-alternate");
      applyError = false;
      await content.getByRole("button", { name: "Apply connections", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.gateway-connection-page [data-gateway-apply]')?.disabled);
      assert.equal(applied.length, 2);
      assert.deepEqual(applied[1], {
        root: "/fixture/dealer", name: "sub-b-second", resourceGroup: "rg-sub-b", subscriptionId: "sub-b",
        model: "gpt-alternate", sandboxGroup: { name: "sandbox-sub-a", resourceGroup: "rg-sandbox", subscriptionId: "sub-a" },
      });
      assert.ok(queries.some(query => query.gatewayName === "sub-b-second" && query.sandboxSubscriptionId === "sub-a"));
      assert.deepEqual(fixture.mutations, [], "Only explicit Apply uses the existing gateway endpoint; navigation never starts runtime/cloud operations");
      await page.locator("#manage-app").click();
      await page.locator("#run-diagnostics-toggle").click();
      await page.locator("#run-tab-environment").click();
      const environmentModel = page.locator("#run-panel-environment").getByRole("combobox", { name: "AI model", exact: true });
      await environmentModel.waitFor();
      await page.waitForFunction(() => !document.querySelector('#run-panel-environment [aria-label="AI model"]').disabled);
      await page.setViewportSize({ width: 920, height: 800 });
      await page.locator(".run-diagnostics-resizer").focus();
      await page.keyboard.press("End");
      assert.equal(await page.locator("#run-panel-environment .run-environment-connections").evaluate(node => {
        const panel = node.closest("#run-panel-environment");
        const nodeBox = node.getBoundingClientRect();
        const panelBox = panel.getBoundingClientRect();
        return nodeBox.width > 560
          && nodeBox.left >= panelBox.left - 1
          && nodeBox.right <= panelBox.right + 1
          && panel.scrollWidth <= panel.clientWidth + 1;
      }), true, "Diagnostics connection fields use the expanded panel instead of leaving a capped blank column");
      assert.equal(await environmentModel.inputValue(), "gpt-alternate");
      await environmentModel.focus();
      await environmentModel.evaluate(node => { window.environmentModel = node; });
      fixture.state.health = "Changed health with Environment focused";
      await page.waitForResponse(response => new URL(response.url()).pathname === "/api/app-status");
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const continuity = await environmentModel.evaluate(node => ({
        same: node === window.environmentModel, focused: node === document.activeElement,
        active: document.activeElement.outerHTML.slice(0, 300),
        phase: node.closest(".connections-root").dataset.phase, disabled: node.disabled,
      }));
      assert.equal(continuity.same && continuity.focused, true, JSON.stringify(continuity));
      assert.equal(applied.length, 2);
      assert.deepEqual(fixture.mutations, []);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await fixture.close(); }
  });

  test(`Connect handles stale discovery, retry, no-model setup and compact geometry in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    let release;
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(7000);
      let error = false, noModels = false, delay = false;
      const initialOptions = longGatewayOptions(new URL("http://fixture/"));
      const saved = {
        ...initialOptions.gateways[0],
        model: "gpt-latest",
        sandboxGroup: initialOptions.sandboxGroups[0],
      };
      await page.route("**/api/local-readiness*", route => route.fulfill({ json: {
        ready: true,
        gatewayConfigured: true,
        activeGateway: saved,
        model: saved.model,
        sandboxGroup: saved.sandboxGroup,
      } }));
      await page.route("**/api/gateway-options*", async route => {
        if (delay) await new Promise(resolve => { release = resolve; });
        await route.fulfill(error ? { status: 503, json: { error: "Subscription discovery unavailable." } }
          : { json: longGatewayOptions(new URL(route.request().url()), { models: !noModels }) }).catch(cause => {
            if (!/closed|cancelled|aborted/i.test(cause.message)) throw cause;
          });
      });
      await page.goto(fixture.origin + "/app-map");
      await page.waitForFunction(() => window.appPlatformReady);
      await page.locator('.agent-status-brief[data-state="ready"]').waitFor();
      await page.locator("#connect-workspace").click();
      const content = page.locator(".gateway-connection-page");
      await content.getByRole("combobox", { name: "AI Gateway", exact: true }).waitFor();
      delay = true;
      await content.getByRole("button", { name: "Refresh subscriptions & gateways", exact: true }).click();
      await content.getByRole("button", { name: "Cancel Azure discovery scan", exact: true }).waitFor();
      assert.equal(await content.getByRole("button", { name: "Azure subscription", exact: true }).isDisabled(), true);
      await page.locator("#manage-app").click();
      delay = false;
      release();
      await page.getByText("Autonomous event / task payload", { exact: true }).waitFor();
      error = true;
      await page.locator("#connect-workspace").click();
      await content.getByRole("alert").filter({ hasText: "Subscription discovery unavailable." }).waitFor().catch(async cause => {
        throw new Error(cause.message + "\nConnections: " + await content.innerText() +
          "\nPhase: " + await content.locator(".connections-root").getAttribute("data-phase"), { cause });
      });
      error = false;
      noModels = true;
      await content.getByRole("button", { name: "Retry scan", exact: true }).click();
      await content.getByRole("button", { name: "Configure Model", exact: true }).waitFor();
      assert.equal(await content.getByRole("button", { name: "Apply connections", exact: true }).isDisabled(), true);
      for (const [width, height] of [[380, 720], [920, 800]]) {
        await page.setViewportSize({ width, height });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, theme);
          assert.equal(await content.evaluate(node => {
            const body = node.querySelector(".connections-body");
            const root = node.querySelector(".connections-root");
            const rootBox = root.getBoundingClientRect();
            const controlsFit = Array.from(root.querySelectorAll("button, input, select"))
              .filter(control => {
                const style = getComputedStyle(control);
                const box = control.getBoundingClientRect();
                return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
              })
              .every(control => {
                const box = control.getBoundingClientRect();
                return box.left >= Math.max(0, rootBox.left) - 1
                  && box.right <= Math.min(innerWidth, rootBox.right) + 1;
              });
            return document.documentElement.scrollWidth <= innerWidth
              && node.scrollWidth <= node.clientWidth + 1
              && body.scrollWidth <= body.clientWidth + 1
              && controlsFit;
          }), true, `Connections and visible controls fit ${width}x${height} in ${theme}`);
          await content.getByRole("button", { name: "Azure subscription", exact: true }).click();
          const search = page.getByRole("textbox", {
            name: "Filter Azure subscriptions by name or ID", exact: true,
          });
          await search.waitFor();
          await search.fill(LONG_SUBSCRIPTIONS[1].id);
          const option = page.getByRole("option", {
            name: `${LONG_SUBSCRIPTIONS[1].name} ${LONG_SUBSCRIPTIONS[1].id}`,
            exact: true,
          });
          await option.waitFor();
          assert.equal(await option.locator(".ct-option-label").textContent(), LONG_SUBSCRIPTIONS[1].name);
          assert.equal(await option.locator(".ct-option-description").textContent(), LONG_SUBSCRIPTIONS[1].id);
          assert.deepEqual(await option.locator(".ct-option-description").evaluate(node => {
            const style = getComputedStyle(node);
            return {
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              whiteSpace: style.whiteSpace,
              fits: node.scrollWidth <= node.clientWidth + 1,
            };
          }), {
            fontSize: "11px",
            fontWeight: "400",
            whiteSpace: "nowrap",
            fits: true,
          });
          assert.equal(await search.evaluate(node => {
            const panel = node.closest(".ct-select-panel");
            const icon = panel.querySelector(".ct-select-search-row svg");
            const iconBox = icon.getBoundingClientRect();
            const inputBox = node.getBoundingClientRect();
            const box = panel.getBoundingClientRect();
            return box.left >= 0 && box.right <= innerWidth
              && panel.scrollWidth <= panel.clientWidth + 1
              && inputBox.left - iconBox.right >= 7
              && Array.from(panel.querySelectorAll(".ct-select-option")).every(optionEl =>
                optionEl.scrollWidth <= optionEl.clientWidth + 1);
          }), true, `Open subscription picker fits ${width}x${height} in ${theme}`);
          await page.keyboard.press("Escape");
          assert.equal(await content.locator(".connections-footer").evaluate(node => {
            const box = node.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= innerHeight && box.height > 0;
          }), true, `Apply footer remains in view at ${width}x${height} in ${theme}`);
        }
      }
      assert.deepEqual(fixture.mutations, []);
    } finally { release?.(); await browser.close(); await fixture.close(); }
  });
}
