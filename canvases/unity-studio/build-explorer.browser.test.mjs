import { installToolkitRoutes, withToolkitButtons } from "./toolkit-test-fixture.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("Build focuses one category and selected tool while preserving preview and picker state", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const tools = Array.from({ length: 32 }, (_, index) => ({
    id: `tool-${index}`, customizationArea: "tools",
    path: `src/skills/tool-${index}/main.py`,
    title: `Tool ${index} entry point`,
    projectPath: `src/skills/tool-${index}`,
    projectName: index === 30 || index === 31 ? "Duplicate tool" : `Tool ${index}`,
  }));
  const artifacts = [
    {
      id: "agent", customizationArea: "behavior", path: "src/agent/main.py", title: "Agent behavior",
      projectPath: "src/agent", projectName: "Deal agent",
    },
    ...tools,
    { id: "config", customizationArea: "runtime", path: "config/settings.json", title: "App settings" },
    { id: "policy-a", customizationArea: "policies", path: "config/a/policy.json", title: "Policy A",
      projectPath: "config/a", projectName: "Policy set" },
    { id: "policy-b", customizationArea: "policies", path: "config/b/policy.json", title: "Policy B",
      projectPath: "config/b", projectName: "Policy set" },
  ].map((item) => ({
    ...item, available: true, description: `${item.title} description.`,
    content: `${item.title}\n${Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join("\n")}`, sha: "base",
  }));
  let workspaceReads = 0;
  const html = `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style>
    <aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    window.panelActive = true;
    window.buildPanel = (${createBuildPanel.toString()})({ buttons: window.unityStudioButtons,
      container: document.querySelector("#details"), root: "/fixture", isActive: () => window.panelActive, syntax: buildSyntax,
      onRun() {}, onModel() {},
      request: async (path, options) => {
        const response = await fetch(path, options);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      }
    });
    window.buildPanel.show();
    </script>`;
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(withToolkitButtons(html));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      if (new URL(route.request().url()).pathname === "/api/build-workspace") {
        workspaceReads++;
        await route.fulfill({ json: { artifacts } });
      } else {
        throw new Error(`Unexpected route ${new URL(route.request().url()).pathname}`);
      }
    });
    await installToolkitRoutes(page);

    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const tablist = page.getByRole("tablist", { name: "App customization areas", exact: true });
    await tablist.waitFor();
    const tabs = tablist.getByRole("tab");
    const area = (id) => page.locator(`.build-area[data-area-id="${id}"]`);
    const row = (id) => page.locator(`.build-file[data-artifact="${id}"]`);
    assert.deepEqual(await tabs.allTextContents(), ["Behavior", "Tools", "Runtime", "Policies"]);
    assert.equal(await tablist.locator('.studio-tab-icon[aria-hidden="true"]').count(), 4);
    assert.deepEqual(await tablist.locator(".studio-tab-icon").evaluateAll((icons) =>
      icons.map((icon) => [...icon.classList].find((name) => name.startsWith("studio-tab-icon--")))),
    ["studio-tab-icon--behavior", "studio-tab-icon--tools", "studio-tab-icon--runtime", "studio-tab-icon--policies"]);
    assert.equal(await tablist.locator(".studio-tab-icon").evaluateAll((icons) =>
      icons.every((icon) => getComputedStyle(icon).webkitMaskImage !== "none")), true);
    assert.equal(await area("behavior").isVisible(), true);
    assert.equal(await row("agent").count(), 1);
    assert.equal(await row("agent").locator(".build-source-disclosure").evaluate((element) => element.open), true);
    await tabs.first().press("ArrowRight");
    assert.equal(await tabs.nth(1).getAttribute("aria-selected"), "true");

    const picker = area("tools").getByRole("combobox", { name: "Tool", exact: true });
    await picker.waitFor();
    assert.equal(await area("tools").locator(".build-project-list").count(), 0);
    assert.equal(await picker.locator("option").count(), 32);
    assert.equal(await picker.locator('option[value="src/skills/tool-30"]').textContent(),
      "Duplicate tool (src/skills/tool-30)");
    assert.equal(await picker.locator('option[value="src/skills/tool-31"]').textContent(),
      "Duplicate tool (src/skills/tool-31)");
    assert.equal(await picker.inputValue(), "src/skills/tool-0");
    assert.equal(await area("tools").locator(".build-customization").getAttribute("data-project-path"),
      "src/skills/tool-0");
    assert.equal(await row("tool-0").count(), 1);
    assert.equal(await row("tool-1").count(), 0);
    const pickerHeight = (await picker.boundingBox()).height;
    assert.ok(pickerHeight >= 34 && pickerHeight <= 40, "Many tools remain a fixed-height native control");

    const firstDisclosure = row("tool-0").locator(".build-source-disclosure");
    assert.equal(await firstDisclosure.evaluate((element) => element.open), true);
    const firstPreview = row("tool-0").locator(".build-source-preview");
    await firstPreview.waitFor();
    await firstDisclosure.locator(":scope > summary").click();
    assert.equal(await firstDisclosure.evaluate((element) => element.open), false);

    await picker.selectOption("src/skills/tool-20");
    assert.equal(await picker.inputValue(), "src/skills/tool-20");
    assert.equal(await picker.evaluate((element) => element === document.activeElement), true);
    assert.equal(await area("tools").locator(".build-customization").getAttribute("data-project-path"),
      "src/skills/tool-20");
    assert.equal(await row("tool-0").count(), 0);
    assert.equal(await row("tool-20").count(), 1);
    assert.equal(await row("tool-20").locator(".build-source-disclosure").evaluate((element) => element.open), true,
      "A different tool uses its own default preview state");
    assert.equal(await row("tool-20").locator(".build-handoff-feedback").innerText(), "");

    const refreshResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/build-workspace");
    await page.getByRole("button", { name: "Refresh source", exact: true }).click();
    await refreshResponse;
    assert.equal(await picker.inputValue(), "src/skills/tool-20");

    await tabs.nth(2).click();
    const runtimeDisclosure = row("config").locator(".build-source-disclosure");
    assert.equal(await runtimeDisclosure.evaluate((element) => element.open), true);
    await runtimeDisclosure.locator(":scope > summary").click();
    assert.equal(await runtimeDisclosure.evaluate((element) => element.open), false);

    await tabs.nth(3).click();
    const projectList = area("policies").locator(".build-project-list");
    const projectButtons = projectList.locator("button[data-project-path]");
    assert.equal(await projectButtons.count(), 2);
    assert.deepEqual(await projectButtons.evaluateAll((items) => items.map((item) => ({
      text: item.childNodes[0].textContent,
      qualifier: item.querySelector("small")?.textContent,
    }))), [
      { text: "Policy set", qualifier: "config/a" },
      { text: "Policy set", qualifier: "config/b" },
    ]);
    assert.deepEqual(await projectButtons.evaluateAll((items) =>
      items.map((item) => item.getAttribute("aria-current"))), ["true", "false"]);
    await projectButtons.nth(1).click();
    assert.equal(await area("policies").locator(".build-customization").getAttribute("data-project-path"), "config/b");

    await tabs.nth(1).click();
    assert.equal(await picker.inputValue(), "src/skills/tool-20");
    await picker.selectOption("src/skills/tool-0");
    assert.equal(await firstDisclosure.evaluate((element) => element.open), false,
      "An explicit collapsed state survives project switching");
    await tabs.nth(2).click();
    assert.equal(await runtimeDisclosure.evaluate((element) => element.open), false,
      "An explicit collapsed state survives area switching");

    await page.evaluate(() => {
      window.panelActive = false;
      window.buildPanel.hide();
      window.panelActive = true;
      window.buildPanel.show();
    });
    assert.equal(await tabs.nth(2).getAttribute("aria-selected"), "true");
    assert.equal(await runtimeDisclosure.evaluate((element) => element.open), false);

    await tabs.nth(1).click();
    for (const width of [380, 620, 1200]) {
      await page.setViewportSize({ width, height: 900 });
      await page.mouse.move(0, 0);
      assert.ok(await page.locator("#details").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
      assert.ok(await picker.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
      assert.equal(Math.round((await picker.boundingBox()).height), Math.round(pickerHeight));
      const tabBounds = await tablist.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        scrollWidth: element.scrollWidth,
        tabs: [...element.querySelectorAll('[role="tab"]')].map((tab) => ({
          height: tab.getBoundingClientRect().height,
          right: tab.getBoundingClientRect().right,
          parentRight: element.getBoundingClientRect().right,
        })),
      }));
      assert.ok(tabBounds.scrollWidth <= tabBounds.width + 1);
      assert.ok(tabBounds.tabs.every((tab) => tab.height >= 48 && tab.right <= tab.parentRight + 1));
      const selectedStyle = await tablist.locator('[role="tab"][aria-selected="true"]').evaluate((tab) => {
        const style = getComputedStyle(tab);
        return { border: style.borderBottomWidth, fill: style.backgroundColor, color: style.color };
      });
      const otherStyle = await tablist.locator('[role="tab"][aria-selected="false"]').first().evaluate((tab) => {
        const style = getComputedStyle(tab);
        return {
          fill: style.backgroundColor, color: style.color, border: style.borderTopWidth,
          radius: style.borderTopLeftRadius, bottomRadius: style.borderBottomLeftRadius, cursor: style.cursor,
        };
      });
      assert.equal(selectedStyle.border, "3px");
      assert.equal(otherStyle.border, "0px");
      assert.equal(otherStyle.radius, "6px");
      assert.equal(otherStyle.bottomRadius, "0px");
      assert.equal(otherStyle.cursor, "pointer");
      assert.equal(otherStyle.fill, "rgba(0, 0, 0, 0)");
      assert.notEqual(selectedStyle.fill, otherStyle.fill);
      assert.notEqual(selectedStyle.color, otherStyle.color);
    }
    assert.ok(workspaceReads >= 2);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
