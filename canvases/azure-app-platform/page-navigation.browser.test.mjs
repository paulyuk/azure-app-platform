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
      await page.addStyleTag({ content: "::-webkit-scrollbar{width:16px;height:16px}" });
      await page.getByText("Autonomous event / task payload", { exact: true }).waitFor();
      await page.locator("#header-open-app").waitFor();
      const nav = page.getByRole("navigation", { name: "App workspaces", exact: true });
      const history = page.getByRole("navigation", { name: "Workspace history", exact: true });
      const back = history.getByRole("button", { name: "Back", exact: true });
      const forward = history.getByRole("button", { name: "Forward", exact: true });
      const select = id => selectWorkspace(page, id);
      const mode = async expected => {
        await page.waitForFunction(value => document.body.dataset.workspace === value, expected);
        const action = page.locator(".workspace-lifecycle-actions #header-runtime-action");
        assert.equal(await action.innerText(), fixture.state.app === "stopped" ? "Run app" : "Stop app");
        assert.equal(await action.locator('svg[data-octicon="play"]').count(), fixture.state.app === "stopped" ? 1 : 0);
        assert.equal(await action.getAttribute("data-appearance"), "primary");
        assert.equal(await action.evaluate(node => node === window.navigationRuntimeAction), true);
        assert.equal(await page.locator("#workspace-runtime-bar").isVisible(), false);
      };
      assert.deepEqual(await nav.locator("li button").allTextContents(), ["Build", "Connect", "Run", "Observe", "Deploy"]);
      assert.equal(await page.locator("#workspace-location").textContent(), "Run");
      assert.equal(await page.locator("#build-workspace").getAttribute("aria-haspopup"), null);
      assert.equal(await page.locator("#build-workspace").getAttribute("aria-current"), null);
      assert.equal(await page.locator("#build-app").count(), 0);
      assert.equal(await page.getByRole("button", { name: "Customize", exact: true }).count(), 0);
      assert.equal(await page.locator("#deploy-app").count(), 0);
      assert.equal(await page.getByRole("button", { name: "Deploy", exact: true }).count(), 1);
      assert.deepEqual(await page.locator("#workspace-runtime-actions button").allTextContents(), ["Open app"]);
      await page.locator("#header-runtime-action").evaluate(node => { window.navigationRuntimeAction = node; });
      assert.equal(await page.locator("#browse-workspaces,.ct-shell-navigation").count(), 0);
      assert.equal(await back.isDisabled(), true);
      assert.equal(await forward.isDisabled(), true);
      assert.equal(await page.locator("#workspace-navigation-mount > .ct-provider > .ct-shell").count(), 1);
      const positions = await page.evaluate(() => ({
        history: document.querySelector('[aria-label="Workspace history"]').getBoundingClientRect().right,
        logo: document.querySelector(".ct-header-home").getBoundingClientRect().left,
      }));
      assert.ok(positions.history <= positions.logo);
      assert.equal(await page.locator("#workspace-status-footer,#action-center,#guide-rail").count(), 0);

      // Build is a normal retained source workspace in destination history.
      await select("build-workspace");
      await mode("build");
      assert.equal(await page.locator("#build-workspace").getAttribute("aria-current"), "page");
      assert.equal(await page.locator("dialog[open]").count(), 0);
      await page.locator(".build-source-preview").first().waitFor();
      await page.getByRole("toolbar", { name: "File pages", exact: true })
        .getByRole("button", { name: "config.json", exact: true }).click();
      const buildSource = page.locator('.build-file[data-artifact="configuration"] .build-file-source');
      await buildSource.waitFor();
      await buildSource.evaluate(node => { window.retainedBuildSource = node; });
      await back.click();
      await mode("manage");
      assert.equal(await nav.getByRole("button", { name: "Run", exact: true }).getAttribute("aria-pressed"), "true");
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
            const action = document.querySelector("#header-runtime-action").getBoundingClientRect();
            const logs = document.querySelector("#run-diagnostics-toggle").getBoundingClientRect();
            const first = document.querySelector("#build-workspace").getBoundingClientRect();
            return {
              overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
              mainHeight: main.height, barBottom: bar.bottom, mainTop: main.top,
              headerFits: header.scrollWidth <= header.clientWidth + 1,
              navRight: nav.right, groupWidth: group.width,
              menuHeight: menu.getBoundingClientRect().height,
              belowMenu: action.top >= group.bottom + 4,
              besideMenu: action.left >= group.right + 7 && Math.abs(action.top - first.top) <= 1,
              actionsTogether: Math.abs(action.top - logs.top) <= 1 && action.right < logs.left,
              rightAligned: Math.abs(logs.right - (menu.getBoundingClientRect().right - 12)) <= 1,
              primaryActions: [...menu.querySelectorAll('button[data-appearance="primary"]')].map(button => button.id),
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
          assert.ok(geometry.navRight <= width && geometry.groupWidth < 400, "Destinations stay content-width");
          assert.deepEqual(geometry.menuBorders, ["1px", "1px", "solid", "solid"]);
          assert.deepEqual(geometry.menuBorderColors, [geometry.themeBorder, geometry.themeBorder]);
          assert.ok(geometry.menuHeight <= (width <= 680 ? 108 : 44), JSON.stringify({ width, tone, geometry }));
          assert.ok((width <= 680 ? geometry.belowMenu : geometry.besideMenu) &&
            geometry.actionsTogether && geometry.rightAligned, JSON.stringify({ width, tone, geometry }));
          assert.equal(geometry.buttons.length, 7);
          assert.deepEqual(geometry.primaryActions, ["header-runtime-action"]);
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
      await select("deploy-workspace");
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
      await select("build-workspace");
      await mode("build");
      await buildSource.waitFor();
      assert.equal(await page.getByRole("toolbar", { name: "File pages", exact: true })
        .getByRole("button", { name: "config.json", exact: true }).getAttribute("aria-pressed"), "true");
      assert.equal(await buildSource.evaluate(node => node === window.retainedBuildSource), true);
      const divider = page.getByRole("separator", { name: "File list width", exact: true });
      await divider.focus();
      const retainedWidth = Number(await divider.getAttribute("aria-valuenow"));
      await page.keyboard.press("ArrowRight");
      assert.ok(Number(await divider.getAttribute("aria-valuenow")) > retainedWidth,
        "Retained Build panes remain resizable after navigation");
      assert.equal(await back.isDisabled(), false);
      assert.equal(await forward.isDisabled(), true, "Build is a new history destination");
      await back.click();
      await mode("manage");
      assert.equal(await forward.isDisabled(), false);
      await forward.click();
      await mode("build");
      await select("manage-app");
      await mode("manage");
      assert.equal(await forward.isDisabled(), true, "New destinations discard only forward history");
      await select("map-app");
      await mode("map");
      await page.waitForResponse(response => new URL(response.url()).pathname === "/api/app-status");
      await back.click();
      await mode("manage");
      assert.equal(await draft.inputValue(), "Preserve this event payload.");
      assert.equal(await page.locator("#studio-workspace-navigation").evaluate(node => node === window.navigationRoot), true);
      assert.equal(await page.locator("#workspace-status-footer,#action-center,#guide-rail").count(), 0);

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
      await page.goto(origin + "/app-map?created=1#build");
      await page.waitForFunction(() => window.appPlatformReady && document.body.dataset.workspace === "build");
      await page.locator("#header-runtime-action").evaluate(node => { window.navigationRuntimeAction = node; });
      assert.equal(await page.locator("#workspace-location").textContent(), "Build");
      assert.equal(new URL(page.url()).hash, "", "The one-time creation destination is consumed");
      assert.equal(await back.isDisabled(), true, "Creation starts history at Build, not an unseen Run page");
      await page.locator(".build-source-preview").first().waitFor();
      await select("manage-app");
      await mode("manage");
      await back.click();
      await mode("build");
      fixture.state.app = "stopped";
      await page.locator("#header-open-app").waitFor({ state: "hidden" });
      await select("deploy-workspace");
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
      assert.equal(await page.locator("#status").getAttribute("role"), "alert");
      assert.equal(await page.locator("#status").isVisible(), true);
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

  test(`All five workflow destinations stay reachable with correct history in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture();
    const browser = await engine.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: 380, height: 800 } });
      page.setDefaultTimeout(7000);
      await page.goto(fixture.origin + "/app-map");
      await page.waitForFunction(() => window.appPlatformReady);
      const nav = page.getByRole("navigation", { name: "App workspaces", exact: true });
      const labels = ["Build", "Connect", "Run", "Observe", "Deploy"];
      const select = label => nav.getByRole("button", { name: label, exact: true }).click();
      const selected = label => nav.getByRole("button", { name: label, exact: true })
        .getAttribute("aria-current");
      const draft = page.getByRole("textbox", { name: "Agent message", exact: true });
      await draft.fill("Keep this unattended event payload.");
      for (const width of [320, 380, 620, 1280]) {
        await page.setViewportSize({ width, height: 480 });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(value => { document.documentElement.dataset.studioTheme = value; }, theme);
          assert.deepEqual(await nav.getByRole("button").allTextContents(), labels);
          const geometry = await nav.evaluate(element => ({
            overflow: document.documentElement.scrollWidth > innerWidth,
            targets: [...element.querySelectorAll("button")].map(button => {
              const rect = button.getBoundingClientRect();
              return {
                label: button.textContent, width: rect.width, height: rect.height,
                inViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
                reachable: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
              };
            }),
          }));
          assert.equal(geometry.overflow, false, JSON.stringify({ width, theme, geometry }));
          assert.ok(geometry.targets.every(target => target.inViewport && target.reachable &&
            target.width >= 28 && target.height >= 28), JSON.stringify({ width, theme, geometry }));
        }
      }
      await page.setViewportSize({ width: 380, height: 800 });
      await select("Build");
      await page.getByRole("region", { name: "Build workspace", exact: true }).waitFor();
      assert.equal(await selected("Run"), null);
      assert.equal(await selected("Build"), "page");
      await page.keyboard.press("Escape");
      assert.equal(await selected("Build"), "page", "Escape does not close a page");
      assert.equal(await page.locator("#observe-views").isVisible(), false);
      await select("Connect");
      await page.getByRole("heading", { name: "Gateway connections", exact: true }).waitFor();
      await page.getByRole("combobox", { name: "AI Gateway", exact: true }).waitFor();
      assert.equal(await selected("Connect"), "page");
      assert.equal(await page.locator("#observe-views").isVisible(), false);
      await page.locator("#build-workspace").click();
      await page.getByRole("region", { name: "Build workspace", exact: true }).waitFor();
      await page.getByRole("navigation", { name: "Workspace history", exact: true }).getByRole("button", { name: "Back", exact: true }).click();
      assert.equal(await selected("Connect"), "page");
      assert.equal(await page.getByRole("heading", { name: "Gateway connections", exact: true }).isVisible(), true);
      await select("Run");
      assert.equal(await draft.inputValue(), "Keep this unattended event payload.");
      await select("Observe");
      await page.getByRole("tab", { name: "App Map", exact: true }).waitFor();
      await page.getByRole("tab", { name: "Logs", exact: true }).click();
      await page.locator("#details[data-mode='logs']").waitFor();
      await select("Deploy");
      await page.getByRole("heading", { name: "Deploy to Azure", exact: true }).waitFor();
      assert.equal(await selected("Deploy"), "page");
      assert.deepEqual(fixture.mutations, [], "Workflow navigation never starts local or cloud execution");
      const history = page.getByRole("navigation", { name: "Workspace history", exact: true });
      const back = history.getByRole("button", { name: "Back", exact: true });
      const forward = history.getByRole("button", { name: "Forward", exact: true });
      for (const label of ["Observe", "Observe", "Run", "Connect", "Build", "Run"]) {
        await back.click();
        assert.equal(await selected(label), "page");
      }
      assert.equal(await back.isDisabled(), true);
      assert.equal(await draft.inputValue(), "Keep this unattended event payload.");
      await forward.click();
      assert.equal(await selected("Build"), "page");
      await select("Build");
      await page.keyboard.press("Escape");
      assert.equal(await forward.isDisabled(), false, "Re-selecting Build does not add a visit");
      await forward.click();
      assert.equal(await selected("Connect"), "page");
      await select("Build");
      assert.equal(await forward.isDisabled(), true, "Build navigation after Back discards forward visits");
      await select("Observe");
      assert.equal(await page.getByRole("tab", { name: "App Map", exact: true }).getAttribute("aria-selected"), "true");
      assert.equal(await forward.isDisabled(), true);
      await page.getByRole("tab", { name: "Logs", exact: true }).click();
      await select("Build");
      await page.keyboard.press("Escape");
      await select("Observe");
      assert.equal(await page.getByRole("tab", { name: "Logs", exact: true }).getAttribute("aria-selected"), "true");
      await page.getByRole("tab", { name: "App Map", exact: true }).click();
      await page.locator(".map-tools > summary").click();
      await page.getByRole("button", { name: "Review source connections", exact: true }).click();
      await page.getByRole("heading", { name: "Connection review", exact: true }).waitFor();
      assert.equal(await selected("Observe"), "page", "Source review stays within Observe, not gateway Connect");
      assert.deepEqual(fixture.mutations, []);
    } finally {
      await browser.close();
      await fixture.close();
    }
  });
}
