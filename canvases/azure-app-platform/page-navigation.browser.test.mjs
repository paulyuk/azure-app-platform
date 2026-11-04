import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";
import { selectWorkspace } from "./workspace-navigation-test-helpers.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Compact navigation and history preserve task-driven workspaces in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    fixture.state.documentInput = true;
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
      page.setDefaultTimeout(7000);
      const errors = [], requests = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => requests.push(request.url()));
      await page.route("**/api/build-workspace*", route => route.fulfill({ json: { artifacts: [{
        id: "instructions", customizationArea: "behavior", title: "Agent instructions",
        path: "src/agent/prompts/system.md", projectPath: "src/agent", projectName: "Deal finder",
        available: true, content: "Use verified evidence.", sha: "fixture",
      }, {
        id: "configuration", customizationArea: "runtime", title: "App configuration",
        path: "src/agent/config.json", projectPath: "src/agent", projectName: "Deal finder",
        available: true, content: '{"port":8088}', sha: "fixture",
      }] } }));
      const origin = fixture.origin;
      await page.goto(origin + "/app-map");
      await page.waitForFunction(() => window.appPlatformReady);
      await page.getByText("Autonomous event / task payload", { exact: true }).waitFor();
      await page.locator("#header-open-app").waitFor();
      const nav = page.getByRole("navigation", { name: "App workspaces", exact: true });
      const history = page.getByRole("navigation", { name: "Workspace history", exact: true });
      const back = history.getByRole("button", { name: "Back", exact: true });
      const forward = history.getByRole("button", { name: "Forward", exact: true });
      const select = id => selectWorkspace(page, id);
      const mode = async expected => {
        await page.waitForFunction(value => document.body.dataset.workspace === value, expected);
      };
      assert.deepEqual(await nav.locator("li button").allTextContents(), ["Test agent", "Inspect app"]);
      assert.equal(await page.locator("#workspace-location").textContent(), "Test agent");
      assert.equal(await page.locator("#build-app").getAttribute("aria-haspopup"), "dialog");
      assert.equal(await page.locator("#build-app").getAttribute("aria-current"), null);
      assert.equal(await page.locator("#browse-workspaces,.ct-shell-navigation").count(), 0);
      assert.equal(await back.isDisabled(), true);
      assert.equal(await forward.isDisabled(), true);
      assert.equal(await page.locator("#workspace-navigation-mount > .ct-provider > .ct-shell").count(), 1);
      const positions = await page.evaluate(() => ({
        history: document.querySelector('[aria-label="Workspace history"]').getBoundingClientRect().right,
        logo: document.querySelector(".ct-header-home").getBoundingClientRect().left,
        open: document.querySelector("#header-open-app").getBoundingClientRect().right,
        deploy: document.querySelector("#deploy-app").getBoundingClientRect().left,
        adjacent: document.querySelector("#header-open-app").closest(".studio-button-mount")
          .nextElementSibling.querySelector("button").id,
      }));
      assert.ok(positions.history <= positions.logo);
      assert.ok(positions.open <= positions.deploy);
      assert.equal(positions.adjacent, "deploy-app");
      const guidedStage = await page.locator('[data-guide-stage][data-current="true"]').getAttribute("data-guide-stage");

      // Customize is independent of workspace history and retains its source view.
      await select("build-app");
      await page.locator(".build-source-preview").first().waitFor();
      await page.getByRole("tab", { name: "Runtime", exact: true }).click();
      const buildDisclosure = page.locator('.build-file[data-artifact="configuration"] .build-source-disclosure');
      if (await buildDisclosure.evaluate(node => node.open)) await buildDisclosure.locator("summary").click();
      await page.getByRole("button", { name: "Close Customize", exact: true }).click();
      await mode("manage");
      assert.equal(await nav.getByRole("button", { name: "Test agent", exact: true }).getAttribute("aria-pressed"), "true");
      await page.getByText("Autonomous event / task payload", { exact: true }).waitFor();
      await page.getByText("Event triggers:", { exact: true }).waitFor();
      await page.getByText("Autonomous run result", { exact: true }).waitFor();
      const draft = page.getByRole("textbox", { name: "Agent message", exact: true });
      await page.locator("[data-event-preset]").first().click();
      assert.match(await draft.inputValue(), /^Event \[/);
      assert.match(await page.locator(".document-input").innerText(), /sample-loan-note\.md/);
      await draft.fill("Preserve this event payload.");
      await draft.evaluate(node => {
        window.navigationDraft = node;
        window.navigationRoot = document.querySelector("#studio-workspace-navigation");
        node.setSelectionRange(3, 8);
      });
      for (const width of [1280, 1180, 1179, 800, 620, 380, 320]) {
        await page.setViewportSize({ width, height: 480 });
        for (const tone of ["light", "dark"]) {
          await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, tone);
          const geometry = await page.evaluate(() => {
            const main = document.querySelector("#app-workspace-main").getBoundingClientRect();
            const bar = document.querySelector("#workspace-runtime-bar").getBoundingClientRect();
            const header = document.querySelector("#studio-workspace-navigation > header");
            const nav = document.querySelector("#app-workspace-navigation").getBoundingClientRect();
            const group = document.querySelector(".workspace-view-switch").getBoundingClientRect();
            const menu = document.querySelector(".workspace-navigation-bar");
            const menuStyle = getComputedStyle(menu);
            return {
              overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
              mainHeight: main.height, barBottom: bar.bottom, mainTop: main.top,
              headerFits: header.scrollWidth <= header.clientWidth + 1,
              navRight: nav.right, groupWidth: group.width,
              menuHeight: menu.getBoundingClientRect().height,
              menuBorders: [menuStyle.borderTopWidth, menuStyle.borderBottomWidth,
                menuStyle.borderTopStyle, menuStyle.borderBottomStyle],
              menuBorderColors: [menuStyle.borderTopColor, menuStyle.borderBottomColor],
              themeBorder: getComputedStyle(document.querySelector("#workspace-runtime-bar")).borderBottomColor,
              buttons: [...menu.querySelectorAll("button")].map(button => {
                const style = getComputedStyle(button);
                return {
                  toolkit: button.classList.contains("ct-button"), size: button.dataset.size,
                  height: button.getBoundingClientRect().height, padding: style.padding,
                };
              }),
            };
          });
          assert.equal(geometry.overflow, false, JSON.stringify({ width, tone, geometry }));
          assert.equal(geometry.headerFits, true, JSON.stringify({ width, tone, geometry }));
          assert.ok(geometry.mainHeight > 150 && geometry.mainTop >= geometry.barBottom);
          assert.ok(geometry.navRight <= width && geometry.groupWidth < 300, "Destinations stay content-width");
          assert.deepEqual(geometry.menuBorders, ["1px", "1px", "solid", "solid"]);
          assert.deepEqual(geometry.menuBorderColors, [geometry.themeBorder, geometry.themeBorder]);
          assert.ok(geometry.menuHeight <= 44, JSON.stringify({ width, tone, geometry }));
          assert.equal(geometry.buttons.length, 3);
          for (const button of geometry.buttons) {
            assert.deepEqual(button, { toolkit: true, size: "small", height: 28, padding: "3px 8px" });
          }
        }
      }
      assert.equal(await draft.evaluate(node => node === window.navigationDraft && node === document.activeElement &&
        node.selectionStart === 3 && node.selectionEnd === 8), true);
      await page.evaluate(() => {
        window.navigationMutations = 0;
        window.navigationObserver = new MutationObserver(records => { window.navigationMutations += records.length; });
        window.navigationObserver.observe(document.querySelector("#app-workspace-navigation"),
          { subtree: true, childList: true, attributes: true, characterData: true });
      });
      await page.waitForResponse(response => new URL(response.url()).pathname === "/api/app-status");
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      assert.equal(await page.evaluate(() => window.navigationMutations), 0);
      assert.equal(await draft.evaluate(node => node === document.activeElement), true);
      await page.evaluate(() => window.navigationObserver.disconnect());

      await page.setViewportSize({ width: 620, height: 800 });
      await page.locator("#manage-app").focus();
      await page.keyboard.press(name === "WebKit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
      assert.equal(await page.locator("#map-app").evaluate(node => node === document.activeElement), true);
      await page.keyboard.press("Enter");
      await mode("map");
      await page.waitForFunction(() => document.querySelector("#viewport").hasAttribute("transform"));
      const camera = await page.locator("#viewport").getAttribute("transform");
      await page.getByRole("tab", { name: "Logs", exact: true }).click();
      await mode("logs");
      await page.locator("#details").filter({ hasText: "Connected to inventory_search" }).waitFor();
      await page.locator("#deploy-app").click();
      await mode("deploy");
      await page.getByRole("heading", { name: "Deploy to Azure", exact: true }).waitFor();
      await page.getByRole("button", { name: "Set up Azure resources", exact: true }).waitFor();
      await page.getByRole("button", { name: "Deploy latest app", exact: true }).waitFor();
      assert.deepEqual(fixture.mutations, [], "Navigation and Deploy entry never execute runtime/cloud operations");
      await back.click();
      await mode("logs");
      assert.equal(await page.getByRole("tab", { name: "Logs", exact: true }).getAttribute("aria-selected"), "true");
      await back.click();
      await mode("map");
      assert.equal(await page.locator("#viewport").getAttribute("transform"), camera);
      await back.click();
      await mode("manage");
      assert.equal(await draft.inputValue(), "Preserve this event payload.");
      assert.match(await page.locator(".document-input").innerText(), /sample-loan-note\.md/);
      assert.equal(await back.isDisabled(), true);
      await select("build-app");
      await mode("manage");
      await buildDisclosure.waitFor({ state: "attached" });
      assert.equal(await page.getByRole("tab", { name: "Runtime", exact: true }).getAttribute("aria-selected"), "true");
      assert.equal(await buildDisclosure.evaluate(node => node.open), false);
      assert.equal(await back.isDisabled(), true);
      await page.getByRole("button", { name: "Close Customize", exact: true }).click();
      assert.equal(await forward.isDisabled(), false, "Modal visits do not discard forward history");
      await forward.click();
      await mode("map");
      await select("manage-app");
      await mode("manage");
      assert.equal(await forward.isDisabled(), true, "New destinations discard only forward history");
      await page.waitForResponse(response => new URL(response.url()).pathname === "/api/app-status");
      await back.click();
      await mode("map");
      await back.click();
      await mode("manage");
      assert.equal(await draft.inputValue(), "Preserve this event payload.");
      assert.equal(await page.locator("#studio-workspace-navigation").evaluate(node => node === window.navigationRoot), true);
      assert.equal(await page.locator('[data-guide-stage][data-current="true"]').getAttribute("data-guide-stage"), guidedStage);

      // Existing settings and source handoff stay independent of destination history.
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("combobox", { name: "Appearance", exact: true }).waitFor();
      await page.getByRole("button", { name: "Close settings", exact: true }).click();
      assert.equal(await draft.inputValue(), "Preserve this event payload.");
      await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === "/api/open-entrypoint"),
        page.locator("#header-open-app").click(),
      ]);
      assert.deepEqual(fixture.mutations.map(item => item.path), ["/api/open-entrypoint"]);
      assert.equal(fixture.mutations[0].body.port, 3000);
      await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
      await page.getByRole("region", { name: "Agent response", exact: true }).filter({ hasText: "three vehicles" }).waitFor();
      assert.equal(fixture.mutations.at(-1).path, "/api/agent-invoke");
      assert.equal(fixture.mutations.at(-1).body.message, "Preserve this event payload.");
      assert.equal(fixture.mutations.at(-1).body.document.name, "sample-loan-note.md");
      assert.equal(await page.locator(".conversation-list,.chat-bubble").count(), 0);
      fixture.state.app = "stopped";
      await page.locator("#header-open-app").waitFor({ state: "hidden" });
      await page.locator("#deploy-app").click();
      await mode("deploy");
      assert.equal(fixture.mutations.some(item => item.path === "/api/app-command"), false);

      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
      assert.equal(await page.locator("#studio-workspace-navigation").count(), 1);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
      assert.equal(await page.locator("#studio-workspace-navigation").count(), 0);
      await page.evaluate(() => window.dispatchEvent(new Event("resize")));
      assert.equal(await page.locator("#studio-workspace-navigation").count(), 0);

      // A shared toolkit failure stays visible and retries without replacing content.
      await page.route("**/canvas-ui/base.mjs", route => route.abort());
      await page.goto(origin + "/app-map");
      await page.locator("#status").filter({ hasText: "Could not load Studio controls:" }).waitFor();
      assert.equal(await page.locator("#workspace-navigation-message").textContent(), "Workspace navigation is unavailable.");
      await page.locator("#workspace-content").evaluate(node => { window.retryContent = node; });
      await page.unroute("**/canvas-ui/base.mjs");
      await page.getByRole("button", { name: "Retry navigation", exact: true }).click();
      await page.locator("#studio-workspace-navigation").waitFor();
      await page.getByText("Autonomous event / task payload", { exact: true }).waitFor();
      assert.equal(await page.locator("#workspace-content").evaluate(node => node === window.retryContent), true);
      assert.equal(await page.locator("#workspace-loading-header").isVisible(), false);
      assert.deepEqual(errors, []);
      assert.ok(requests.some(url => url.endsWith("/canvas-ui/react-runtime.mjs")));
      assert.ok(requests.every(url => new URL(url).origin === origin), "Only same-origin shipped assets are used");
    } finally {
      await browser.close();
      await fixture.close();
    }
  });
}
