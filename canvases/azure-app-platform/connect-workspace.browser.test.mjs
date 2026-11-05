import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";

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
  await search.fill(query);
  const match = panel.getByRole("option", { name: option });
  await match.waitFor();
  assert.equal(await panel.getByRole("option").count(), 1);
  await search.press("ArrowDown");
  await page.keyboard.press("Enter");
}

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
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
      for (const label of ["AI Gateway", "AI model", "ACA Sandbox Group"]) {
        assert.equal(await field(label).isVisible(), true);
      }
      for (const label of ["Azure subscription", "Sandbox subscription"]) {
        assert.equal(await subscription(label).isVisible(), true);
      }
      assert.equal(await content.locator(
        'select[aria-label="Azure subscription"], select[aria-label="Sandbox subscription"]',
      ).count(), 0);
      for (const label of ["Refresh subscriptions & gateways", "Refresh sandbox groups", "Create Gateway", "Create Sandbox Group", "Apply"]) {
        assert.equal(await content.getByRole("button", { name: label, exact: true }).isEnabled(), true);
      }
      await chooseSubscription(page, content, {
        label: "Azure subscription",
        searchLabel: "Filter Azure subscriptions by name or ID",
        query: "sub-b",
        option: /Subscription B .* sub-b/,
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
      await page.locator("#build-workspace").click();
      await page.getByRole("region", { name: "Build workspace", exact: true }).waitFor();
      await page.getByRole("navigation", { name: "Workspace history", exact: true }).getByRole("button", { name: "Back", exact: true }).click();
      await field("AI model").waitFor();
      assert.equal(await field("AI model").inputValue(), "gpt-alternate");
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
        option: /Subscription B .* sub-b/,
      });
      await chooseSubscription(page, settings, {
        label: "Sandbox subscription",
        searchLabel: "Filter sandbox subscriptions by name or ID",
        query: "sub-a",
        option: /Subscription A .* sub-a/,
      });
      await settings.getByRole("combobox", { name: "ACA Sandbox Group", exact: true }).selectOption("local-simulation");
      await page.keyboard.press("Escape");
      await settings.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.querySelector('.gateway-connection-page [aria-label="ACA Sandbox Group"]')?.value === "local-simulation");
      assert.equal(await field("ACA Sandbox Group").inputValue(), "local-simulation");
      await field("ACA Sandbox Group").selectOption("0");
      applyError = true;
      await content.getByRole("button", { name: "Apply", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Gateway validation failed." }).first().waitFor();
      await field("AI model").waitFor();
      assert.equal(await field("AI model").inputValue(), "gpt-alternate");
      applyError = false;
      await content.getByRole("button", { name: "Apply", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.gateway-connection-page [data-gateway-apply]')?.disabled);
      assert.equal(applied.length, 2);
      assert.deepEqual(applied[1], {
        root: "/fixture/dealer", name: "sub-b-second", resourceGroup: "rg-sub-b", subscriptionId: "sub-b",
        model: "gpt-alternate", sandboxGroup: { name: "sandbox-sub-a", resourceGroup: "rg-sandbox", subscriptionId: "sub-a" },
      });
      assert.ok(queries.some(query => query.gatewayName === "sub-b-second" && query.sandboxSubscriptionId === "sub-a"));
      assert.deepEqual(fixture.mutations, [], "Only explicit Apply uses the existing gateway endpoint; navigation never starts runtime/cloud operations");
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
      await page.route("**/api/gateway-options*", async route => {
        if (delay) await new Promise(resolve => { release = resolve; });
        await route.fulfill(error ? { status: 503, json: { error: "Subscription discovery unavailable." } }
          : { json: gatewayOptions(new URL(route.request().url()), { models: !noModels }) }).catch(cause => {
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
      await content.getByRole("alert").filter({ hasText: "Subscription discovery unavailable." }).waitFor();
      error = false;
      noModels = true;
      await content.getByRole("button", { name: "Retry scan", exact: true }).click();
      await content.getByRole("button", { name: "Configure Model", exact: true }).waitFor();
      assert.equal(await content.getByRole("button", { name: "Apply", exact: true }).isDisabled(), true);
      for (const [width, height] of [[320, 480], [380, 480], [620, 800]]) {
        await page.setViewportSize({ width, height });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, theme);
          assert.equal(await content.evaluate(node => document.documentElement.scrollWidth <= innerWidth &&
            node.scrollWidth <= node.clientWidth + 1), true);
          await content.getByRole("button", { name: "Azure subscription", exact: true }).click();
          const search = page.getByRole("textbox", {
            name: "Filter Azure subscriptions by name or ID", exact: true,
          });
          await search.waitFor();
          assert.equal(await search.evaluate(node => {
            const panel = node.closest(".ct-select-panel");
            const box = panel.getBoundingClientRect();
            return box.left >= 0 && box.right <= innerWidth && panel.scrollWidth <= panel.clientWidth + 1;
          }), true);
          await page.keyboard.press("Escape");
        }
      }
      assert.deepEqual(fixture.mutations, []);
    } finally { release?.(); await browser.close(); await fixture.close(); }
  });
}
