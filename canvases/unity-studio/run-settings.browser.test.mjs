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
  fixture.state.editorId = "cursor";
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
    await page.waitForFunction(() =>
      document.querySelector('[aria-label="Preferred external editor"]')?.value === "cursor");
    await dialog.getByRole("combobox", { name: "Preferred external editor" }).selectOption("windsurf");
    await page.waitForFunction(() => document.querySelector('[aria-label="Preferred external editor"]')?.value === "windsurf");
    assert.equal(fixture.state.editorId, "windsurf");
    fixture.state.editorId = "zed";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(() =>
      document.querySelector('[aria-label="Preferred external editor"]')?.value === "zed");
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

test("Run tabs preserve editing state, expose hidden failures, and retain output and Azure activity", {
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
    const services = page.getByRole("tab", { name: "Services", exact: true });
    const output = page.getByRole("tab", { name: "Output", exact: true });
    const operations = page.getByRole("tab", { name: "Operations", exact: true });
    const deploy = page.getByRole("tab", { name: "Deploy", exact: true });
    assert.equal(await output.getAttribute("aria-selected"), "true");
    await services.click();
    assert.equal(await services.getAttribute("aria-selected"), "true");
    assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
    fixture.state.outputError = true;
    await output.locator(".run-tab-summary").getByText("Unavailable", { exact: true }).waitFor();
    assert.equal(await services.getAttribute("aria-selected"), "true");
    fixture.state.outputError = false;
    fixture.state.lines = Array.from({ length: 100 }, (_, index) => "Runtime line " + index);
    await output.click();
    const runtimeOutput = page.locator("[data-runtime-output]");
    await page.waitForFunction(() => document.querySelector("[data-runtime-output]")?.textContent.includes("Runtime line 99"));
    await runtimeOutput.evaluate((el) => { el.scrollTop = 80; });
    fixture.state.health = "Ready after output refresh";
    await page.waitForFunction(() => document.querySelector(".endpoint-status")?.textContent === "Ready after output refresh");
    assert.ok(await runtimeOutput.evaluate((el) => el.scrollTop >= 75 && el.scrollTop <= 85));
    await runtimeOutput.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    fixture.state.lines.push("Runtime tail");
    await page.waitForFunction(() => document.querySelector("[data-runtime-output]")?.textContent.includes("Runtime tail"));
    assert.ok(await runtimeOutput.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 40));
    await services.click();
    fixture.state.commands = Array.from({ length: 12 }, (_, index) => ({
      id: "operation-" + index,
      kind: index ? "http" : "shell",
      label: index ? "Invoke agent " + index : "Start agent",
      status: index ? "succeeded" : "failed",
      command: index ? "POST http://localhost:8088/responses/" + index : "uv run main.py",
      startedAt: Date.now() + index,
      durationMs: 100 + index,
    }));
    await operations.locator(".run-tab-summary").getByText("1 failed", { exact: true }).waitFor();
    assert.equal(await services.getAttribute("aria-selected"), "true");
    await operations.click();
    const firstOperation = page.locator('[data-run-disclosure="operation-0"]');
    await firstOperation.locator("summary").click();
    const feed = page.locator("[data-command-feed]");
    await feed.evaluate((el) => { el.scrollTop = 80; });
    await firstOperation.locator("summary").focus();
    fixture.state.health = "Ready after operation refresh";
    await page.waitForFunction(() => document.querySelector(".endpoint-status")?.textContent === "Ready after operation refresh");
    assert.equal(await operations.getAttribute("aria-selected"), "true");
    assert.equal(await firstOperation.evaluate((el) => el.open), true);
    assert.equal(await firstOperation.locator("summary").evaluate((el) => el === document.activeElement), true);
    assert.ok(await feed.evaluate((el) => el.scrollTop > 0));
    await output.click();
    await page.getByRole("button", { name: "Open all logs" }).waitFor();
    await page.locator("#build-app").click();
    await page.locator("#manage-app").click();
    assert.equal(await output.getAttribute("aria-selected"), "true");
    assert.equal(await message.inputValue(), "Find an SUV.");
    await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
    await page.locator(".agent-response").filter({ hasText: "three vehicles" }).waitFor();
    await page.locator('[data-run-disclosure="tool-activity"] > summary').click();
    await page.getByText("inventory_search · Call reported", { exact: true }).waitFor();
    await deploy.click();
    await page.getByRole("button", { name: "Set up Azure resources" }).click();
    await page.waitForFunction(() => document.querySelector("#app-status-badge").textContent.includes("Provisioning"));
    await page.waitForFunction(() => document.querySelector(".run-card")?.textContent.includes("Provisioning Azure resources"));
    assert.equal(await deploy.getAttribute("aria-selected"), "true");
    await deploy.locator(".run-tab-summary").getByText("Provisioning…", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute("aria-label"),
      tab: document.activeElement?.getAttribute("data-run-tab"),
    })), { tag: "BUTTON", label: "Deploy", tab: "deployment" },
    "Auto-revealing Output keeps keyboard focus on the initiating tab");
    fixture.state.app = "stopped";
    await page.waitForFunction(() => document.querySelector("#header-runtime-action").textContent === "Start app");
    await deploy.click();
    await page.getByRole("button", { name: "Deploy latest app" }).click();
    await page.waitForFunction(() => document.querySelector("#app-status-badge").textContent.includes("Deploying"));
    assert.equal(await deploy.getAttribute("aria-selected"), "true");
    await deploy.locator(".run-tab-summary").getByText("Deploying…", { exact: true }).waitFor();
    assert.deepEqual(fixture.mutations.filter((item) => item.path === "/api/app-command").map((item) => item.body.operation),
      ["provision-cloud", "deploy-cloud"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test("Run tabs are single-panel, responsive, themed, and support roving keyboard navigation", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const fixture = await createRunSettingsFixture();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(fixture.origin + "/app-map");
    await page.locator("#manage-app").click();
    await page.getByRole("tab", { name: "Services", exact: true }).waitFor();
    const runTabs = page.locator(".run-tabs");
    assert.equal(await runTabs.locator('.studio-tab-icon[aria-hidden="true"]').count(), 4);
    assert.deepEqual(await runTabs.locator(".studio-tab-icon").evaluateAll((icons) =>
      icons.map((icon) => [...icon.classList].find((name) => name.startsWith("studio-tab-icon--")))),
    ["studio-tab-icon--output", "studio-tab-icon--services", "studio-tab-icon--operations", "studio-tab-icon--deployment"]);
    assert.equal(await runTabs.locator(".studio-tab-icon").evaluateAll((icons) =>
      icons.every((icon) => getComputedStyle(icon).webkitMaskImage !== "none")), true);
    for (const theme of ["light", "dark"]) {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
      await dialog.getByRole("combobox", { name: "Appearance" }).selectOption(theme);
      await page.waitForFunction((value) => document.documentElement.dataset.studioTheme === value, theme);
      await dialog.getByRole("button", { name: "Close settings" }).click();
      for (const width of [380, 620, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.mouse.move(0, 0);
        const services = page.getByRole("tab", { name: "Services", exact: true });
        assert.deepEqual(await services.evaluate((el) => {
          const press = (key) => document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true }),
          );
          const current = () => ({
            active: document.activeElement?.dataset.runTab,
            selected: document.querySelector('.run-tabs [role="tab"][aria-selected="true"]')?.dataset.runTab,
          });
          el.focus();
          press("Home");
          const home = current();
          press("ArrowRight");
          const right = current();
          press("End");
          const end = current();
          return { home, right, end };
        }), {
          home: { active: "output", selected: "output" },
          right: { active: "services", selected: "services" },
          end: { active: "deployment", selected: "deployment" },
        });
        assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
        for (const tab of await page.getByRole("tab").all()) {
          const style = await tab.evaluate((el) => {
            const css = getComputedStyle(el);
            const title = getComputedStyle(el.querySelector(".run-tab-label"));
            let backgroundNode = el;
            let background = css.backgroundColor;
            while (background === "rgba(0, 0, 0, 0)" && backgroundNode.parentElement) {
              backgroundNode = backgroundNode.parentElement;
              background = getComputedStyle(backgroundNode).backgroundColor;
            }
            const luminance = (color) => {
              const channels = color.match(/[\d.]+/g).slice(0, 3).map((value) => {
                const normalized = Number(value) / 255;
                return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
              });
              return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
            };
            const contrast = (color) => {
              const a = luminance(color);
              const b = luminance(background);
              return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            };
            return {
              selected: el.getAttribute("aria-selected") === "true",
              border: css.borderBottomWidth, borderColor: css.borderBottomColor, weight: Number(title.fontWeight),
              frameless: ["Top", "Right", "Left"].every((side) => css["border" + side + "Width"] === "0px"),
              radius: css.borderTopLeftRadius, bottomRadius: css.borderBottomLeftRadius, cursor: css.cursor,
              fill: css.backgroundColor,
              height: el.getBoundingClientRect().height, overflow: el.scrollWidth > el.clientWidth + 1,
              titleContrast: contrast(title.color),
              summaryContrast: contrast(getComputedStyle(el.querySelector(".run-tab-summary")).color),
            };
          });
          assert.equal(style.border, "3px");
          assert.equal(style.frameless, true);
          assert.equal(style.radius, "6px");
          assert.equal(style.bottomRadius, "0px");
          assert.equal(style.cursor, "pointer");
          assert.equal(style.borderColor === "rgba(0, 0, 0, 0)", !style.selected);
          assert.equal(style.fill === "rgba(0, 0, 0, 0)", !style.selected);
          assert.ok(style.weight >= 700 && style.height >= 44);
          assert.equal(style.overflow, false, `${theme} ${width}px tab overflow`);
          assert.ok(style.titleContrast >= 4.5 && style.summaryContrast >= 4.5,
            `${theme} tab contrast ${JSON.stringify(style)}`);
        }
        assert.equal(await runTabs.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
        assert.equal(await page.locator("#details").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
      }
    }
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    const services = page.getByRole("tab", { name: "Services", exact: true });
    assert.deepEqual(await services.evaluate((el) => {
      el.click();
      el.focus();
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      return {
        active: document.activeElement?.dataset.runTab,
        selected: document.querySelector('.run-tabs [role="tab"][aria-selected="true"]')?.dataset.runTab,
      };
    }), { active: "output", selected: "output" });
  } finally {
    await browser.close();
    await fixture.close();
  }
});
