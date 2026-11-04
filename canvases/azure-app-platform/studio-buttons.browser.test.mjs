import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { createStudioButtons } from "./studio-buttons.mjs";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";
import { selectWorkspace } from "./workspace-navigation-test-helpers.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function contrastRatio(foreground, background) {
  const luminance = color => color.match(/\d+/g).slice(0, 3).map(Number)
    .map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return Number(((values[0] + .05) / (values[1] + .05)).toFixed(2));
}

test("real toolkit buttons preserve keyed roots, callbacks, keyboard, visibility, clear/reuse and failure recovery", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const fixture = await createRunSettingsFixture();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(fixture.origin + "/app-map");
    await page.waitForFunction(() => window.appPlatformReady);
    await page.evaluate(async factory => {
      const toolkit = await import("/canvas-ui/base.mjs");
      const create = (0, eval)(`(${factory})`);
      const buttons = create(toolkit);
      const host = document.createElement("span");
      host.hidden = true;
      const draft = document.createElement("textarea");
      draft.value = "Keep this draft";
      document.body.append(host, draft);
      const calls = [];
      const markup = document.createElement("section");
      markup.innerHTML = '<button data-studio-button="subtle" id="marked-action" disabled hidden aria-label="Inspect"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1h14"/></svg>Inspect</button>';
      document.body.append(markup);
      buttons.mountAll(markup);
      const marked = markup.querySelector("button");
      if (!marked.disabled || !marked.hidden || marked.dataset.appearance !== "subtle" ||
        marked.getAttribute("aria-label") !== "Inspect" || markup.querySelectorAll(".ct-button-icon svg").length !== 1) {
        throw new Error("Marked button lost its state, icon composition or accessible name");
      }
      buttons.update(marked, { disabled: false, hidden: false });
      if (marked.disabled || marked.hidden) throw new Error("Controlled native flags did not update");
      buttons.clear(markup);
      markup.remove();
      const first = buttons.renderButton(host, { children: "Run", onClick: () => calls.push("stale") });
      if (!host.hidden || host.querySelectorAll(".ct-provider").length !== 1) throw new Error("Mount changed visibility or provider ownership");
      host.hidden = false;
      first.focus();
      let mutations = 0;
      const observer = new MutationObserver(records => { mutations += records.length; });
      observer.observe(host, { childList: true, subtree: true, attributes: true, characterData: true });
      for (let index = 0; index < 20; index++) buttons.update(first, { children: "Run", onClick: () => calls.push("latest") });
      await Promise.resolve();
      if (mutations || document.activeElement !== first) throw new Error("Callback-only updates mutated DOM or lost focus");
      first.click();
      if (calls.join() !== "latest") throw new Error("A callback was stale or delivered twice");
      buttons.update(first, { disabled: true });
      first.click();
      if (calls.length !== 1 || !first.disabled || !first.matches(":disabled")) throw new Error("Toolkit native disabled behavior was bypassed");
      buttons.update(first, { disabled: false, children: "Resume" });
      if (host.querySelector("button") !== first || first.textContent !== "Resume") throw new Error("Updates replaced the control");
      buttons.update(first, { onClick: undefined });
      first.click();
      if (calls.length !== 1) throw new Error("Cleared callback was retained");
      buttons.clear(host);
      if (host.childNodes.length || draft.value !== "Keep this draft") throw new Error("Clear leaked roots or changed a neighboring draft");
      host.hidden = true;
      const reused = buttons.renderButton(host, { children: "Reused", onClick: () => calls.push("reused") });
      if (reused === first || !host.hidden) throw new Error("Cleared mount was not safely reusable");
      host.hidden = false;
      reused.focus();
      window.buttonKeyboardCalls = calls;
      window.buttonKeyboardControl = reused;
      window.buttonLifecycleCleanup = () => { observer.disconnect(); buttons.dispose(); host.remove(); draft.remove(); };
      let rejectMount = true;
      const retrying = create({ ...toolkit, mountCanvasComponent(...args) {
        if (rejectMount) throw new Error("Expected mount failure");
        return toolkit.mountCanvasComponent(...args);
      } });
      const retryHost = document.createElement("span");
      document.body.append(retryHost);
      let failed = false;
      try { retrying.renderButton(retryHost, { children: "Retry" }); }
      catch (error) { failed = error.message === "Expected mount failure"; }
      if (!failed || retryHost.childNodes.length) throw new Error("Mount failure was hidden or retained partial ownership");
      rejectMount = false;
      retrying.renderButton(retryHost, { children: "Retry" });
      retrying.dispose();
      if (retryHost.childNodes.length) throw new Error("Retry root was not disposed");
      retryHost.remove();
      const composition = document.createElement("section");
      document.body.append(composition);
      const field = buttons.field({ kind: "TextInput", label: "Block name", hint: "Keep it short.", required: true });
      buttons.append(composition, field);
      field.value = "retained-draft";
      buttons.update(field, { hint: "Use lowercase letters." });
      buttons.setDisabled(field, true);
      if (field.value !== "retained-draft" || !field.disabled || !field.required) {
        throw new Error("Toolkit field updates lost the draft or native state");
      }
      const group = buttons.actionGroup(composition);
      const action = buttons.create({ children: "Create" });
      buttons.append(group, action);
      const second = buttons.create({ children: "Cancel" });
      buttons.append(group, second);
      buttons.setText(action, "Create block");
      if (!group.contains(action) || action.textContent !== "Create block" ||
        composition.querySelectorAll(".ct-actions").length !== 1) {
        throw new Error("ActionGroup DOM interop replaced or lost an owned action");
      }
      let selected = "stack";
      const segmented = buttons.segmented({
        "aria-label": "Document layout", value: selected,
        items: [{ value: "stack", label: "Stack" }, { value: "page", label: "Page" }],
        onValueChange(value) { selected = value; buttons.update(segmented, { value }); },
      });
      buttons.append(composition, segmented);
      const choices = segmented.querySelectorAll("button");
      if (choices[0].getAttribute("aria-pressed") !== "true") throw new Error("Segmented control lost its initial selection");
      choices[1].click();
      if (selected !== "page" || choices[1].getAttribute("aria-pressed") !== "true") {
        throw new Error("Segmented control did not deliver or render its selection");
      }
      choices[1].focus();
      buttons.update(segmented, { value: "stack" });
      if (document.activeElement !== choices[1] || choices[0].getAttribute("aria-pressed") !== "true") {
        throw new Error("Segmented updates replaced controls or moved focus");
      }
      const splitCalls = [];
      const split = buttons.split({
        heading: "Open with", menuLabel: "Open with",
        button: { children: "VS Code", onClick: () => splitCalls.push("stale") },
        items: [{ id: "files", label: "Files", onClick() {} }],
      });
      buttons.append(group, split);
      const primary = split.querySelector("button");
      primary.focus();
      buttons.update(split, { button: { children: "Files", onClick: () => splitCalls.push("latest") } });
      primary.click();
      if (split.querySelector("button") !== primary || document.activeElement !== primary ||
        primary.textContent !== "Files" || splitCalls.join() !== "latest") {
        throw new Error("Split updates replaced its primary action, lost focus or retained a stale callback");
      }
      buttons.setDisabled(split, true);
      if ([...split.querySelectorAll("button")].some(button => !button.disabled)) {
        throw new Error("Split disabled state did not reach both canonical buttons");
      }
      buttons.clear(composition);
      if (composition.querySelector(".ct-provider")) throw new Error("Nested toolkit roots survived clear");
      let disposed = false;
      try { buttons.update(action, { children: "Stale" }); }
      catch { disposed = true; }
      if (!disposed) throw new Error("A nested action root retained ownership after clear");
      disposed = false;
      try { buttons.update(segmented, { value: "page" }); }
      catch { disposed = true; }
      if (!disposed) throw new Error("A segmented root retained ownership after clear");
      disposed = false;
      try { buttons.update(split, { disabled: false }); }
      catch { disposed = true; }
      if (!disposed) throw new Error("A split root retained ownership after clear");
      composition.remove();
      reused.focus();
    }, createStudioButtons.toString());
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    assert.deepEqual(await page.evaluate(() => window.buttonKeyboardCalls), ["latest", "reused", "reused"]);
    await page.evaluate(() => window.buttonLifecycleCleanup());
    const roots = await page.locator(".ct-button").count();
    assert.ok(roots > 0);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    assert.equal(await page.locator(".ct-button").count(), roots);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
    assert.equal(await page.locator(".ct-button").count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test("departing before the toolkit import resolves cannot attach late button roots", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const fixture = await createRunSettingsFixture();
  const browser = await chromium.launch();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    let started;
    const loading = new Promise(resolve => { started = resolve; });
    await page.route("**/canvas-ui/base.mjs", async route => {
      started();
      await gate;
      await route.continue();
    });
    const navigation = page.goto(fixture.origin + "/app-map");
    await loading;
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
    release();
    await navigation;
    await page.evaluate(async () => { await import("/canvas-ui/base.mjs"); });
    assert.equal(await page.locator(".ct-button, .ct-provider").count(), 0);
    assert.equal(await page.evaluate(() => Boolean(window.appPlatformButtons || window.appPlatformReady)), false);
    assert.deepEqual(errors, []);
  } finally {
    release();
    await browser.close();
    await fixture.close();
  }
});

test("runtime actions use canonical geometry and live host tokens in compact light/dark panes with responsive navigation", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const fixture = await createRunSettingsFixture();
  const browser = await chromium.launch();
  const captures = [];
  const fallbackStates = [];
  const hostStates = [];
  const output = process.env.UNITY_BUTTON_EVIDENCE_DIR;
  try {
    if (output) await mkdir(output, { recursive: true });
    const page = await browser.newPage({ reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const tone of ["light", "dark"]) {
      for (const width of [320, 900]) {
        fixture.state.theme = tone;
        await page.setViewportSize({ width, height: 900 });
        await page.goto(fixture.origin + "/app-map");
        await page.waitForFunction(() => window.appPlatformReady);
        await page.waitForFunction(expected => document.documentElement.dataset.studioTheme === expected, tone);
        await selectWorkspace(page, "manage-app");
        const invoke = page.getByRole("button", { name: "Invoke agent", exact: true });
        await invoke.waitFor();
        assert.match(await invoke.getAttribute("class"), /\bct-button\b/);
        assert.equal(await page.locator('[role="tab"].ct-button, .header-actions .ct-button').count(), 0);
        await page.getByRole("textbox", { name: "Agent message", exact: true }).fill("Keep my unsent draft");
        assert.equal(await page.locator("#details").evaluate(element => element.scrollWidth <= element.clientWidth), true);
        await invoke.evaluate(element => { window.savedPrimaryButton = element; });
        await page.evaluate(() => document.documentElement.style.setProperty("--text-color-accent", "rgb(255, 0, 255)"));
        const measure = async state => {
          const colors = await invoke.evaluate(element => ({
            foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor,
            active: element.matches(":active"), hovered: element.matches(":hover"),
            sameControl: element === window.savedPrimaryButton,
          }));
          const ratio = contrastRatio(colors.foreground, colors.background);
          assert.ok(ratio >= 4.5, `${tone}/${width}/${state}: ${ratio}:1 must meet normal-text AA`);
          assert.equal(colors.background, tone === "light" ? "rgb(9, 105, 218)" : "rgb(121, 184, 255)");
          assert.equal(colors.foreground, tone === "light" ? "rgb(255, 255, 255)" : "rgb(13, 17, 23)");
          assert.equal(colors.sameControl, true);
          assert.equal(colors.hovered, state !== "rest");
          assert.equal(colors.active, state === "active");
          fallbackStates.push({ tone, width, state, ...colors, contrastRatio: ratio });
        };
        await page.mouse.move(0, 0);
        await measure("rest");
        await invoke.hover();
        await measure("hover");
        await page.mouse.down();
        assert.equal(await invoke.evaluate(element => element.matches(":active")), true);
        await measure("active");
        await page.mouse.move(0, 0);
        await page.mouse.up();
        await page.evaluate(() => document.documentElement.style.removeProperty("--text-color-accent"));
        if (output) {
          const label = `after-runtime-${tone}-${width}`;
          const html = await page.content();
          await page.screenshot({ path: join(output, label + ".png"), fullPage: true });
          const button = await invoke.evaluate(element => ({
            foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor,
            appearance: element.dataset.appearance,
          }));
          captures.push({ label, synthetic: true, htmlSha256: hash(html),
            screenshotSha256: hash(await readFile(join(output, label + ".png"))),
            button: { ...button, contrastRatio: contrastRatio(button.foreground, button.background) } });
        }
        await page.getByRole("button", { name: "Settings", exact: true }).click();
        await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(tone === "light" ? "dark" : "light");
        await page.getByRole("button", { name: "Close settings", exact: true }).click();
        await page.waitForFunction(() => document.activeElement?.classList.contains("studio-settings-toggle"));
        assert.equal(await page.getByRole("textbox", { name: "Agent message", exact: true }).inputValue(), "Keep my unsent draft");
      }
    }
    // Synthetic delivery proves CSS inheritance, not the native host adapter.
    await page.evaluate(() => {
      const button = window.appPlatformButtons.create({ children: "Host action", appearance: "primary", id: "host-action" });
      const secondary = window.appPlatformButtons.create({ children: "Secondary", appearance: "secondary", id: "host-secondary" });
      const subtle = window.appPlatformButtons.create({ children: "Subtle", appearance: "subtle", id: "host-subtle" });
      window.appPlatformButtons.append(document.body, secondary, subtle, button);
      button.scrollIntoView();
      button.focus();
      window.hostAction = button;
      window.hostSecondary = secondary;
      window.hostSubtle = subtle;
      for (const [name, value] of Object.entries({
        "--background-color-button-primary-rest": "rgb(31, 83, 121)",
        "--text-color-button-primary-rest": "rgb(244, 249, 253)",
        "--background-color-button-default-rest": "rgb(229, 239, 247)",
        "--text-color-button-default-rest": "rgb(39, 50, 73)",
        "--border-color-button-default-rest": "rgb(41, 106, 77)",
        "--text-color-default": "rgb(17, 83, 121)",
        "--font-sans": '"Courier New", monospace', "--text-body-medium": "17px",
        "--leading-body-medium": "26px", "--color-focus-outline": "rgb(193, 47, 150)",
      })) document.documentElement.style.setProperty(name, value);
    });
    await page.locator("#host-action").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => {
      const action = document.querySelector("#host-action");
      return document.activeElement === action && getComputedStyle(action).outline === "rgb(193, 47, 150) solid 2px";
    });
    const readStyle = () => page.locator("#host-action").evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, foreground: style.color, size: style.fontSize,
        lineHeight: style.lineHeight, family: style.fontFamily, outline: style.outline,
        focused: document.activeElement === element };
    });
    const initial = await readStyle();
    assert.equal(initial.background, "rgb(31, 83, 121)");
    assert.equal(initial.foreground, "rgb(244, 249, 253)");
    assert.equal(initial.size, "17px");
    assert.equal(initial.lineHeight, "26px");
    assert.match(initial.family, /Courier New/);
    assert.equal(initial.outline, "rgb(193, 47, 150) solid 2px");
    assert.equal(initial.focused, true);
    assert.ok(contrastRatio(initial.foreground, initial.background) >= 4.5);
    const hostButton = page.locator("#host-action");
    const measureHostState = async (label, background) => {
      const style = await readStyle();
      assert.equal(style.background, background);
      assert.equal(style.foreground, "rgb(244, 249, 253)");
      assert.equal(style.focused, true);
      assert.equal(await hostButton.evaluate(element => element === window.hostAction), true);
      hostStates.push({ label, ...style });
    };
    await hostButton.hover();
    await measureHostState("missing-hover-retains-rest", "rgb(31, 83, 121)");
    await page.mouse.down();
    await measureHostState("missing-active-retains-rest", "rgb(31, 83, 121)");
    await page.mouse.up();
    await page.evaluate(() => document.documentElement.style.setProperty("--background-color-button-primary-hover", "rgb(22, 61, 93)"));
    await measureHostState("delivered-hover", "rgb(22, 61, 93)");
    await page.mouse.down();
    await measureHostState("delivered-hover-while-pressed", "rgb(22, 61, 93)");
    await page.mouse.up();
    await page.evaluate(() => document.documentElement.style.setProperty("--background-color-button-primary-hover", "rgb(30, 45, 80)"));
    await measureHostState("late-hover", "rgb(30, 45, 80)");
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.documentElement.style.removeProperty("--background-color-button-primary-hover"));
    const readSecondary = () => page.evaluate(() => {
      const style = getComputedStyle(window.hostSecondary);
      return { background: style.backgroundColor, foreground: style.color, border: style.borderTopColor,
        subtleForeground: getComputedStyle(window.hostSubtle).color };
    });
    const secondaryInitial = await readSecondary();
    assert.deepEqual(secondaryInitial, {
      background: "rgb(229, 239, 247)", foreground: "rgb(39, 50, 73)",
      border: "rgb(41, 106, 77)", subtleForeground: "rgb(17, 83, 121)",
    });
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--background-color-button-primary-rest", "rgb(83, 31, 121)");
      document.documentElement.style.setProperty("--text-color-button-primary-rest", "rgb(245, 231, 253)");
      document.documentElement.style.setProperty("--text-body-medium", "16px");
      document.documentElement.style.setProperty("--text-color-button-default-rest", "rgb(51, 41, 106)");
      document.documentElement.style.setProperty("--text-color-default", "rgb(87, 47, 150)");
    });

    const late = await readStyle();
    assert.equal(late.background, "rgb(83, 31, 121)");
    assert.equal(late.foreground, "rgb(245, 231, 253)");
    assert.equal(late.size, "16px");
    assert.equal(late.focused, true);
    assert.equal(await page.locator("#host-action").evaluate(element => element === window.hostAction), true);
    const secondaryLate = await readSecondary();
    assert.equal(secondaryLate.foreground, "rgb(51, 41, 106)");
    assert.equal(secondaryLate.subtleForeground, "rgb(87, 47, 150)");
    assert.equal(await page.locator("#host-secondary").evaluate(element => element === window.hostSecondary), true);
    assert.equal(await page.locator("#host-subtle").evaluate(element => element === window.hostSubtle), true);
    assert.deepEqual(errors, []);
    if (output) {
      const sources = {};
      for (const name of ["studio-ui.mjs", "interactive-app-map.mjs", "studio-buttons.mjs", "studio-theme.mjs",
        "build-panel.mjs", "app-logs-panel.mjs", "component-logs-panel.mjs", "studio-settings.mjs", "run-workspace.mjs", "studio-notice.mjs",
        "studio-buttons.browser.test.mjs", "scripts/prepare-toolkit-assets.mjs"]) {
        sources[name] = hash(await readFile(new URL(name, import.meta.url)));
      }
      await writeFile(join(output, "button-evidence.json"), JSON.stringify({
        baselineCommit: process.env.UNITY_BUTTON_BASELINE_COMMIT ?? null,
        browser: await browser.version(), synthetic: true, sources,
        toolkit: JSON.parse(await readFile(new URL("./vendor/toolkit/provenance.json", import.meta.url))),
        captures, fallbackStates, hostTokens: { initial, late, secondaryInitial, secondaryLate, states: hostStates, sameControl: true },
        primaryFallbackContrastBelowAA: fallbackStates.some(state => state.contrastRatio < 4.5),
        limitations: ["Native host delivery and VS Code adapter not verified", "No assistive-technology announcement claim"],
      }, null, 2) + "\n");
    }
  } finally {
    await browser.close();
    await fixture.close();
  }
});
