import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("First-time setup clearly offers connection, preserves preview, and never configures on inspection", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const fixture = await createRunSettingsFixture();
  fixture.state.app = "stopped";
  fixture.state.configured = false;
  fixture.state.gatewayAvailable = false;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 620, height: 850 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(fixture.origin + "/app-map");
    await page.locator("#manage-app").click();
    const connect = page.locator(".run-heading").getByRole("button", { name: "Connect AI Gateway", exact: true });
    await connect.waitFor();
    assert.match(await connect.textContent(), /No AI Gateway connected/);
    assert.equal(await connect.evaluate((el) => getComputedStyle(el).borderTopWidth), "1px");
    assert.equal(await page.locator("#details").getByRole("button", { name: "Run preview", exact: true }).isEnabled(), true);
    assert.equal(await page.getByRole("button", { name: "Invoke agent", exact: true }).isDisabled(), true);
    await page.locator("#details").getByRole("button", { name: "Run preview", exact: true }).click();
    await page.getByRole("button", { name: "Stop preview", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Invoke agent", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Stop preview", exact: true }).click();
    await page.locator("#details").getByRole("button", { name: "Run preview", exact: true }).waitFor();
    await connect.click();
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    await dialog.getByText("No AI Gateway found in this subscription. Create one to connect a model.", { exact: true }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Create or manage gateways" }).isVisible(), true);
    assert.equal(await dialog.getByRole("button", { name: "Connect gateway", exact: true }).count(), 0);
    assert.equal(fixture.mutations.length, 2);
    fixture.state.gatewayAvailable = true;
    await dialog.getByRole("button", { name: "Refresh subscriptions & gateways" }).click();
    await dialog.getByRole("button", { name: "Connect gateway", exact: true }).waitFor();
    assert.equal(fixture.mutations.length, 2, "Discovering an available gateway is not approval to configure it");
    await dialog.getByRole("button", { name: "Connect gateway", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".run-connection-action")?.textContent === "Connection settings");
    await dialog.getByRole("button", { name: "Close settings" }).click();
    const settings = page.getByRole("button", { name: "Connection settings", exact: true });
    assert.match(await settings.textContent(), /gpt-5-mini.*dealer-gateway/);
    for (const width of [380, 620, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      assert.equal(await settings.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
      assert.equal(await page.locator("#details").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
    }
    assert.deepEqual(fixture.mutations.map((item) => item.path), ["/api/app-command", "/api/app-command", "/api/active-gateway"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test("Preview setup shortcuts show native agent evidence and missing-gateway guidance", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const fixture = await createRunSettingsFixture({ preview: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 620, height: 850 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(fixture.origin + "/preview");
    await page.getByRole("button", { name: "Open agent setup", exact: true }).click();
    await page.getByRole("heading", { name: "Add to Agent", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Existing evidence", exact: true }).isVisible(), true);
    assert.match(await page.locator("#details").textContent(), /Deal finder.*src\/agent/);
    await page.locator("#manage-app").click();
    fixture.state.app = "stopped";
    fixture.state.configured = false;
    fixture.state.gatewayAvailable = false;
    await page.locator(".run-heading").getByRole("button", { name: "Connect AI Gateway", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    await dialog.getByRole("button", { name: "Create or manage gateways" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("heading", { name: "Add to Gateway", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Suggested scaffold", exact: true }).isVisible(), true);
    await page.getByRole("button", { name: "Build this capability", exact: true }).click();
    await page.getByRole("button", { name: "Confirm capability request", exact: true }).click();
    await page.getByText("This UI preview cannot start implementation work. Open Unity Studio to make real changes.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Capability implementation started" }).count(), 0);
    assert.deepEqual(fixture.mutations.filter((item) => item.path === "/api/tier-action").map((item) => item.body.tierId), ["agent", "gateway"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test("Settings retain scope, focus, appearance rollback, lifecycle gates and reviewed deletion", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const fixture = await createRunSettingsFixture();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 780, height: 850 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(fixture.origin + "/app-map");
    await page.locator("#manage-app").click();
    const message = page.getByRole("textbox", { name: "Agent message", exact: true });
    await message.fill("Find an SUV under $35,000.");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    await dialog.waitFor();
    assert.equal(fixture.mutations.length, 0);
    assert.ok(await dialog.getByText("This app · Dealer · UI preview", { exact: true }).isVisible());
    for (let index = 0; index < 9; index++) {
      await page.keyboard.press("Tab");
      assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true);
    }
    fixture.state.preferenceError = true;
    await dialog.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
    await dialog.getByRole("alert").filter({ hasText: "Could not save appearance." }).waitFor();
    assert.equal(await dialog.getByRole("combobox", { name: "Appearance" }).inputValue(), "light");
    assert.equal(await page.locator("html").getAttribute("data-studio-theme"), "light");
    fixture.state.preferenceError = false;
    await dialog.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
    await page.waitForFunction(() => document.documentElement.dataset.studioTheme === "dark");
    await dialog.locator('[data-settings-section="connection"] > summary').click();
    await dialog.getByText("Stop the local app before changing its AI Gateway.", { exact: true }).waitFor();
    await dialog.locator('[data-settings-section="danger"] > summary').click();
    assert.equal(await dialog.getByRole("button", { name: "Delete local app..." }).count(), 0);
    const ports = dialog.locator('[data-settings-section="ports"] > summary');
    await ports.click();
    assert.equal(await dialog.getByRole("button", { name: "Pick available ports" }).isDisabled(), true);
    await ports.click();
    fixture.state.app = "stopped";
    await page.waitForFunction(() => document.querySelector("#header-runtime-action").textContent === "Start app");
    await ports.click();
    assert.equal(await dialog.getByRole("button", { name: "Pick available ports" }).isEnabled(), true,
      "Reopening a collapsed setting uses current lifecycle state");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("button", { name: "Settings", exact: true }).evaluate((el) => el === document.activeElement), true);
    assert.equal(await message.inputValue(), "Find an SUV under $35,000.");
    fixture.state.app = "stopped";
    await page.waitForFunction(() => document.querySelector("#header-runtime-action").textContent === "Start app");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await dialog.getByRole("button", { name: "Delete local app..." }).click();
    assert.equal(fixture.mutations.filter((item) => item.path === "/api/delete-app").length, 0);
    await dialog.getByRole("button", { name: "Cancel deletion" }).click();
    await dialog.getByRole("button", { name: "Delete local app..." }).click();
    fixture.state.deleteError = true;
    await dialog.getByRole("button", { name: "Delete local worktree", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "Local worktree could not be deleted." }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Delete local worktree" }).isEnabled(), true);
    const deletion = fixture.mutations.filter((item) => item.path === "/api/delete-app");
    assert.deepEqual(deletion.map((item) => item.body), [{ root: "/fixture/dealer", confirmed: true }]);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    assert.equal(await dialog.getByRole("button", { name: "Delete local worktree" }).count(), 0, "Closing resets deletion review");
    for (const [width, height] of [[380, 640], [620, 780], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
    }
    await page.getByRole("button", { name: "Close settings" }).click();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test("Run disclosures preserve drafts and selection, expose hidden errors and retain Azure actions", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const fixture = await createRunSettingsFixture();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 780, height: 850 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(fixture.origin + "/app-map");
    await page.locator("#manage-app").click();
    const message = page.getByRole("textbox", { name: "Agent message", exact: true });
    await message.fill("Find an SUV.");
    await message.evaluate((el) => { el.focus(); el.setSelectionRange(3, 7); });
    fixture.state.health = "Ready after refresh";
    await page.waitForFunction(() => document.querySelector(".endpoint-status")?.textContent === "Ready after refresh");
    assert.deepEqual(await message.evaluate((el) => [el === document.activeElement, el.selectionStart, el.selectionEnd]), [true, 3, 7]);
    const diagnostics = page.locator('[data-run-section="diagnostics"]');
    assert.equal(await diagnostics.evaluate((el) => el.open), false);
    fixture.state.outputError = true;
    await diagnostics.locator("summary").getByText("Output unavailable", { exact: true }).waitFor();
    assert.equal(await diagnostics.evaluate((el) => el.open), false);
    fixture.state.outputError = false;
    fixture.state.commands = [{ id: "failed", kind: "shell", label: "Start agent", status: "failed", command: "uv run main.py", startedAt: Date.now() }];
    await diagnostics.locator("summary").getByText("1 failed operation", { exact: true }).waitFor();
    await diagnostics.locator("summary").press("Enter");
    await page.getByRole("button", { name: "Open all logs" }).waitFor();
    await page.locator("#build-app").click();
    await page.locator("#manage-app").click();
    assert.equal(await diagnostics.evaluate((el) => el.open), true);
    assert.equal(await message.inputValue(), "Find an SUV.");
    await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
    await page.locator(".agent-response").filter({ hasText: "three vehicles" }).waitFor();
    await page.locator('[data-run-disclosure="tool-activity"] > summary').click();
    await page.getByText("inventory_search · Call reported", { exact: true }).waitFor();
    await page.locator('[data-run-section="deployment"] > summary').click();
    await page.getByRole("button", { name: "Set up Azure resources" }).click();
    await page.waitForFunction(() => document.querySelector("#app-status-badge").textContent.includes("Provisioning"));
    await page.waitForFunction(() => document.querySelector(".run-card")?.textContent.includes("Provisioning Azure resources"));
    assert.equal(await diagnostics.evaluate((el) => el.open), true);
    fixture.state.app = "stopped";
    await page.waitForFunction(() => document.querySelector("#header-runtime-action").textContent === "Start app");
    await page.getByRole("button", { name: "Deploy latest app" }).click();
    await page.waitForFunction(() => document.querySelector("#app-status-badge").textContent.includes("Deploying"));
    assert.deepEqual(fixture.mutations.filter((item) => item.path === "/api/app-command").map((item) => item.body.operation),
      ["provision-cloud", "deploy-cloud"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await fixture.close();
  }
});
