import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";
import { renderStudioHtml } from "./studio-ui.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

async function selectSection(page, section) {
  const picker = page.getByRole("combobox", { name: "Settings section", exact: true });
  if (await picker.isVisible()) await picker.selectOption(section);
  else await page.locator(`[data-settings-target="${section}"]`).click();
}

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Build page retains task/source state, history, scoped Settings and handoffs in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.documentInput = true;
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(7000);
      const errors = [], sourceRequests = [], invocations = [];
      let reads = 0, fail = false, holdNextRead;
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/build-workspace*", async route => {
        reads++;
        const hold = holdNextRead;
        holdNextRead = undefined;
        if (hold) await hold;
        await route.fulfill(fail ? { status: 503, json: { error: "Source discovery unavailable." } } : { json: {
          supportsDocuments: true,
          artifacts: [{
            id: "instructions", customizationArea: "behavior", title: "Agent instructions",
            path: "src/agent/prompts/system.md", projectPath: "src/agent", projectName: "Deal finder",
            available: true, content: "Use verified inventory evidence.", sha: "fixture",
          }, {
            id: "runtime", customizationArea: "runtime", title: "Runtime configuration",
            path: "src/agent/config.json", projectPath: "src/agent", projectName: "Deal finder",
            available: true, content: JSON.stringify({ agentRuntime: "local", notes: Array.from({ length: 60 }, (_, i) =>
              i + "long-value-".repeat(80)) }, null, 2), sha: "fixture",
          }],
        } });
      });
      await page.route("**/api/open-build-file", async route => {
        sourceRequests.push(route.request().postDataJSON());
        await route.fulfill({ json: { path: "src/agent/config.json", editorLabel: "VS Code" } });
      });
      await page.route("**/api/agent-invoke", async route => {
        invocations.push(route.request().postDataJSON());
        await route.fulfill({ json: {
          summary: { text: "Retained task result", tools: [{ name: "document_validation", status: "Call reported" }] },
          documentAssessment: { state: "approved", sanitizedText: "Verified fixture text",
            redactions: { email: 1 }, truncated: false },
        } });
      });
      await page.goto(fixture.origin + "/app-map");
      await page.waitForFunction(() => window.appPlatformReady);
      await page.getByText("Autonomous event / task payload", { exact: true }).waitFor();
      assert.equal(reads, 0);
      const prompt = page.getByRole("textbox", { name: "Agent message", exact: true });
      await page.locator("[data-event-preset]").first().click();
      await prompt.fill("Preserve this unattended event.");
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await page.locator('[data-document-assessment][data-state="approved"]').waitFor();
      await page.getByLabel("Document attachment", { exact: true }).click();
      await page.getByRole("button", { name: "Edit document", exact: true }).click();
      const text = page.getByLabel("Document text", { exact: true });
      const draft = "# Unsaved document edit\n\n" + "Keep this paragraph.\n".repeat(60);
      await text.fill(draft);
      await text.evaluate(node => { node.setSelectionRange(2, 8); node.scrollTop = 90; });
      const customize = page.locator("#build-workspace");
      const build = page.getByRole("region", { name: "Build workspace", exact: true });
      const content = page.locator("#customize-content");
      const history = page.getByRole("navigation", { name: "Workspace history", exact: true });
      const back = history.getByRole("button", { name: "Back", exact: true });
      const forward = history.getByRole("button", { name: "Forward", exact: true });
      await customize.click();
      await build.locator(".build-workspace").waitFor();
      assert.equal(await customize.getAttribute("aria-current"), "page");
      assert.equal(await customize.getAttribute("aria-haspopup"), null);
      assert.equal(await page.locator("#close-customize,dialog#app-customize").count(), 0);
      const disclosure = build.locator('[data-artifact="runtime"] .build-source-disclosure');
      const preview = build.getByRole("region", { name: "Runtime configuration source preview", exact: true });
      await build.getByRole("tab", { name: "Runtime", exact: true }).click();
      await disclosure.evaluate(node => { window.buildDisclosure = node; });
      for (const [width, height] of [[320, 480], [380, 480], [620, 800], [1280, 800]]) {
        await page.setViewportSize({ width, height });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, theme);
          const geometry = await build.evaluate(node => {
            const box = node.getBoundingClientRect();
            const shell = document.querySelector("#app-workspace-main").getBoundingClientRect();
            return { tag: node.tagName, dialogs: document.querySelectorAll("dialog[open]").length,
              inside: box.top >= shell.top && box.bottom <= shell.bottom + 1 && box.left >= 0 && box.right <= innerWidth,
              fits: node.scrollWidth <= node.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth,
              height: box.height };
          });
          assert.ok(geometry.tag === "SECTION" && geometry.dialogs === 0 && geometry.inside &&
            geometry.fits && geometry.height > 150, JSON.stringify({ width, theme, geometry }));
        }
        await page.locator("#header-open-app").evaluate(node => node.focus());
        assert.equal(await page.locator("#header-open-app").evaluate(node => node === document.activeElement), true,
          "Build does not trap focus away from the shell");
        await page.keyboard.press("Escape");
        assert.equal(await build.isVisible(), true, "Escape never closes a workspace page");
        assert.equal(await build.getByRole("tab", { name: "Runtime", exact: true })
          .evaluate(node => getComputedStyle(node).borderBottomWidth), "3px", "Moving source controls retains flat tab styling");
        assert.equal(await disclosure.evaluate(node => node === window.buildDisclosure), true);
        await build.getByRole("button", { name: "Model connection", exact: true }).click();
        const settings = page.getByRole("dialog", { name: "Settings", exact: true });
        await settings.getByRole("combobox", { name: "AI Gateway", exact: true }).waitFor();
        assert.equal(await settings.evaluate(node => node.matches(":modal")), true);
        await page.keyboard.press("Escape");
        await settings.waitFor({ state: "hidden" });
        await page.waitForFunction(() => document.activeElement?.dataset.focusKey === "model");
        assert.equal(await build.getByRole("button", { name: "Model connection", exact: true })
          .evaluate(node => node === document.activeElement), true);
        assert.equal(await disclosure.evaluate(node => node === window.buildDisclosure), true);
        if (width === 620) {
          fixture.state.health = "Readiness changed while customizing";
          await page.waitForResponse(response => new URL(response.url()).pathname === "/api/app-status");
          assert.equal(await disclosure.evaluate(node => node === window.buildDisclosure), true);
          assert.equal(await build.getByRole("button", { name: "Model connection", exact: true })
            .evaluate(node => node === document.activeElement), true);
        }
        if (width === 1280) {
          await build.getByRole("button", { name: "Open in VS Code", exact: true }).click();
          await build.getByText("Opened the worktree and file in VS Code.", { exact: true }).waitFor();
          assert.equal(sourceRequests.length, 1);
          assert.deepEqual(sourceRequests[0], { root: "/fixture/dealer", id: "runtime" });
          fail = true;
          await page.getByRole("button", { name: "Refresh view", exact: true }).click();
          await build.getByRole("alert").filter({ hasText: "Source discovery unavailable." }).waitFor();
          fail = false;
          await page.getByRole("button", { name: "Refresh view", exact: true }).click();
          await build.getByRole("alert").waitFor({ state: "hidden" });
        }
        if (!(await disclosure.evaluate(node => node.open))) await disclosure.locator("summary").click();
        await preview.focus();
        await preview.evaluate(node => { node.scrollTop = 70; node.scrollLeft = 100; });
        const scroll = await content.evaluate(node => node.scrollTop);
        await page.locator("#manage-app").click();
        await build.waitFor({ state: "hidden" });
        assert.equal(await prompt.inputValue(), "Preserve this unattended event.");
        assert.equal(await text.inputValue(), draft);
        assert.deepEqual(await text.evaluate(node => [node.selectionStart, node.selectionEnd, node.scrollTop]), [2, 8, 90]);
        assert.equal(await page.locator('[data-document-assessment][data-state="approved"]').count(), 1);
        assert.equal(await page.locator(".agent-response").textContent(), "Retained task result");
        assert.match(await page.locator(".document-input").textContent(), /sample-loan-note\.md/);
        await back.click();
        await build.waitFor();
        await page.waitForFunction(() => document.activeElement?.dataset.focusKey === "preview-runtime");
        assert.equal(await content.evaluate(node => node.scrollTop), scroll);
        assert.deepEqual(await preview.evaluate(node => [node.scrollTop, node.scrollLeft]), [70, 100]);
        assert.equal(await forward.isDisabled(), false, "Build participates in Back/Forward history");
      }
      await build.getByRole("tab", { name: "Behavior", exact: true }).click();
      await build.getByRole("button", { name: "Test with a document", exact: true }).click();
      await build.waitFor({ state: "hidden" });
      assert.equal(await prompt.evaluate(node => node === document.activeElement), true);
      await customize.click();
      await build.getByRole("button", { name: "+ Add building block", exact: true }).click();
      await build.waitFor({ state: "hidden" });
      await page.locator("#structure-guidance").waitFor();
      assert.equal(await page.locator("#structure-guidance").evaluate(node => node === document.activeElement), true);
      assert.equal(await page.locator("#map-app").getAttribute("aria-current"), "page");
      await page.locator("#manage-app").click();
      await page.getByRole("button", { name: "Cancel document edit", exact: true }).click();
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await page.locator('.agent-status-brief[data-state="succeeded"]').waitFor();
      assert.deepEqual(fixture.mutations, []);
      assert.equal(invocations.length, 2);
      assert.equal(invocations[1].message, "Preserve this unattended event.");
      assert.equal(invocations[1].document.name, "sample-loan-note.md");
      let releaseRead;
      holdNextRead = new Promise(resolve => { releaseRead = resolve; });
      const request = page.waitForRequest("**/api/build-workspace*");
      await customize.click();
      await request;
      await page.locator("#manage-app").click();
      await prompt.focus();
      const response = page.waitForResponse("**/api/build-workspace*");
      releaseRead();
      await response;
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await build.isVisible(), false, "Late source discovery cannot reopen a departed page");
      assert.equal(await prompt.evaluate(node => node === document.activeElement), true,
        "Late source discovery cannot steal task focus");
      assert.equal(await page.locator("#manage-app").getAttribute("aria-current"), "page");
      assert.equal(await page.locator(".conversation-list,.chat-bubble").count(), 0);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await fixture.close();
    }
  });

  test(`Settings scope, discovery, prerequisites and modal focus in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(7000);
      const errors = [];
      let discovery = 0, prereqFailure = false;
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => { if (new URL(request.url()).pathname === "/api/gateway-options") discovery++; });
      await page.route("**/api/local-readiness*", async route => {
        if (prereqFailure && new URL(route.request().url()).searchParams.has("refresh")) {
          await route.fulfill({ status: 503, json: { error: "Prerequisite check unavailable." } });
          return;
        }
        const response = await route.fetch();
        await route.fulfill({ json: { ...await response.json(), prerequisites: { ready: false, items: [{
          id: "aca", label: "ACA CLI", ready: false,
          command: "curl -fsSL https://aka.ms/aca-cli-install | bash",
          actionOperation: "install-aca", actionLabel: "Install ACA CLI",
        }], missingTools: [] } } });
      });
      await page.goto(fixture.origin + "/app-map");
      await page.waitForFunction(() => window.appPlatformReady);
      await page.getByRole("button", { name: "Open connections", exact: true }).waitFor();
      const prompt = page.getByRole("textbox", { name: "Agent message", exact: true });
      await prompt.fill("Keep the event draft.");
      const trigger = page.getByRole("button", { name: "Settings", exact: true });
      const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
      const initialDiscovery = discovery;
      await trigger.click();
      await dialog.getByRole("combobox", { name: "Appearance", exact: true }).waitFor();
      assert.equal(discovery, initialDiscovery, "Opening General never starts additional discovery beyond existing Environment setup");
      assert.equal(await dialog.locator('[data-settings-section]:visible').count(), 1);
      fixture.state.preferenceError = true;
      await dialog.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("dark");
      await dialog.getByRole("alert").filter({ hasText: "Could not save appearance." }).waitFor();
      assert.equal(await dialog.getByRole("combobox", { name: "Appearance", exact: true }).inputValue(), "light");
      fixture.state.preferenceError = false;
      await dialog.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("dark");
      await page.waitForFunction(() => document.documentElement.dataset.studioTheme === "dark");
      await dialog.getByRole("combobox", { name: "Preferred external editor", exact: true }).selectOption("cursor");
      await page.waitForFunction(() => !document.querySelector("[data-studio-editor-select]").disabled);
      assert.equal(fixture.state.editorId, "cursor");
      await selectSection(page, "connection");
      await dialog.getByRole("combobox", { name: "AI Gateway", exact: true }).waitFor();
      assert.ok(discovery >= initialDiscovery);
      await page.evaluate(() => {
        window.appPlatformSettings.close();
        window.appPlatformSettings.open("connection");
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await dialog.evaluate(node => node.open && node.contains(document.activeElement)), true,
        "Queued close handlers must not clear a newly reopened dialog");
      const gatewayNode = await dialog.getByRole("combobox", { name: "AI Gateway", exact: true }).elementHandle();
      await selectSection(page, "prereqs");
      await dialog.getByText("This device · Requirements for Dealer · UI preview", { exact: true }).waitFor();
      await dialog.getByText("curl -fsSL https://aka.ms/aca-cli-install | bash", { exact: true }).waitFor();
      assert.equal(await dialog.getByRole("button", { name: "Install ACA CLI", exact: true }).isVisible(), true);
      prereqFailure = true;
      await dialog.getByRole("button", { name: "Re-check prerequisites", exact: true }).click();
      await page.locator("#status").filter({ hasText: "Prerequisite check unavailable." }).waitFor();
      await selectSection(page, "connection");
      assert.equal(await gatewayNode.evaluate(node => node.isConnected), true, "Section switches retain loaded controls");
      await selectSection(page, "ports");
      assert.equal(await dialog.getByRole("button", { name: "Pick available ports", exact: true }).isDisabled(), true);
      await selectSection(page, "danger");
      assert.equal(await dialog.getByRole("button", { name: "Delete local app...", exact: true }).count(), 0);
      await selectSection(page, "preferences");
      for (const [width, height] of [[320, 480], [620, 800], [1280, 480]]) {
        await page.setViewportSize({ width, height });
        assert.deepEqual(await dialog.evaluate(node => {
          const box = node.getBoundingClientRect();
          const content = node.querySelector(".studio-settings-content");
          return {
            full: box.x === 0 && box.y === 0 && Math.abs(box.width - innerWidth) < 1 && Math.abs(box.height - innerHeight) < 1,
            fits: node.scrollWidth <= node.clientWidth + 1 && content.scrollWidth <= content.clientWidth + 1,
          };
        }), { full: true, fits: true });
        const close = dialog.getByRole("button", { name: "Close settings", exact: true });
        await close.focus();
        await page.keyboard.press("Shift+Tab");
        assert.ok(await dialog.evaluate(node => node.contains(document.activeElement)));
        await page.keyboard.press("Tab");
        assert.equal(await close.evaluate(node => node === document.activeElement), true);
        await selectSection(page, "prereqs");
        assert.equal(await dialog.locator('[data-settings-section]:visible').count(), 1);
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
      assert.equal(await prompt.inputValue(), "Keep the event draft.");
      assert.equal(fixture.mutations.some(item => item.path === "/api/app-command"), false);
      await page.locator("#run-diagnostics-toggle").click();
      await page.getByRole("tab", { name: "Environment", exact: true }).click();
      await page.getByRole("tabpanel", { name: "Environment", exact: true })
        .getByRole("heading", { name: "Prerequisites & CLI tools", exact: true }).waitFor();
      await page.setViewportSize({ width: 620, height: 800 });
      fixture.state.app = "stopped";
      await page.waitForFunction(() => document.querySelector("#header-runtime-action").textContent === "Run app");
      await trigger.click();
      await selectSection(page, "ports");
      assert.equal(await dialog.getByRole("button", { name: "Pick available ports", exact: true }).isEnabled(), true);
      await selectSection(page, "danger");
      await dialog.getByRole("button", { name: "Delete local app...", exact: true }).click();
      assert.equal(fixture.mutations.some(item => item.path === "/api/delete-app"), false);
      await dialog.getByRole("button", { name: "Cancel deletion", exact: true }).click();
      await dialog.getByRole("button", { name: "Delete local app...", exact: true }).click();
      fixture.state.deleteError = true;
      await dialog.getByRole("button", { name: "Delete local worktree", exact: true }).click();
      await dialog.getByRole("alert").filter({ hasText: "Local worktree could not be deleted." }).waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await page.route("**/api/gateway-options*", route => route.fulfill({
        status: 503, json: { error: "Gateway discovery unavailable." },
      }));
      await trigger.click();
      await selectSection(page, "connection");
      await dialog.getByText("Gateway discovery unavailable.", { exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.deepEqual(fixture.mutations.filter(item => item.path === "/api/delete-app").map(item => item.body),
        [{ root: "/fixture/dealer", confirmed: true }]);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await fixture.close();
    }
  });

  test(`Home Settings exposes only global preferences in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 380, height: 640 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/home-settings", route => route.fulfill({
        contentType: "text/html", body: renderStudioHtml("settings-home", "fixture"),
      }));
      await page.route("**/api/sources", route => route.fulfill({ json: { roots: [], apps: [], templates: [] } }));
      await page.goto(fixture.origin + "/home-settings");
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
      await dialog.getByRole("combobox", { name: "Preferred external editor", exact: true }).waitFor();
      assert.deepEqual(await dialog.locator("[data-settings-section]").evaluateAll(nodes =>
        nodes.map(node => node.dataset.settingsSection)), ["preferences"]);
      assert.deepEqual(await dialog.getByRole("combobox", { name: "Settings section", exact: true })
        .locator("option").allTextContents(), ["General · Across all apps"]);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await page.getByRole("button", { name: "Settings", exact: true })
        .evaluate(node => node === document.activeElement), true);
      assert.deepEqual(fixture.mutations, []);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await fixture.close();
    }
  });
}
