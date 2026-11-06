import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_EXPLORER_CSS, BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";
import { BUILD_BLOCK_TEMPLATES } from "./build-blocks.mjs";
import { installToolkitRoutes, withToolkitButtons } from "./toolkit-test-fixture.mjs";
import { renderThemeStyles } from "./studio-theme.mjs";
import { renderOcticon, VSCODE_ICON_MARKUP } from "./studio-icons.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const mode of ["starter only", "AI retry", "AI success"]) {
const creationInstructions = mode === "starter only" ? "" : "Look up available inventory by category and return bounded results.";
test(`Build creates a template before editor or AI handoff (${mode})`, {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifacts = [
    { id: "agent", customizationArea: "behavior", path: "src/agent/prompts/system.md", title: "Agent instructions", content: "# Instructions\nBe helpful." },
    ...Array.from({ length: 32 }, (_, index) => ({
      id: `tool-${index}`, customizationArea: "tools", path: `src/skills/tool-${index}/function_app.py`,
      title: `Tool ${index}`, projectName: "Duplicate name", projectPath: `src/skills/tool-${index}`,
      content: `def invoke():\n    return ${index}\n`,
    })),
    { id: "web", path: "src/web/server.mjs", title: "Web implementation", content: "export const app = {};" },
    { id: "agent-code", customizationArea: "behavior", projectPath: "src/agent", projectName: "Agent",
      path: "src/agent/main.py", title: "Agent implementation", content: "print('agent')\n" },
    { id: "agent-manifest", customizationArea: "runtime", projectPath: "src/agent", projectName: "Agent",
      path: "src/agent/agent.yaml", title: "Agent manifest", content: "name: agent\n" },
  ].map(item => ({ ...item, available: true }));
  const mutations = [];
  let templateReads = 0, failTemplates = true, failCreate = true, failAI = mode !== "AI success";
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://build-browser.test/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/") return route.fulfill({ contentType: "text/html", body: withToolkitButtons(`<!doctype html>
        <style>${renderThemeStyles()} ${BUILD_PANEL_CSS} body { margin:0; } #details { height:100vh; }</style>
        <div id="details" data-mode="build"></div><script>
        ${BUILD_SYNTAX_SCRIPT}
        window.panel = (${createBuildPanel.toString()})({
          container: document.querySelector("#details"), root: "/fixture", isActive: () => true,
          syntax: buildSyntax, buttons: window.appPlatformButtons, helpIcon: ${JSON.stringify(renderOcticon("info"))}, vsCodeIconMarkup: ${JSON.stringify(VSCODE_ICON_MARKUP)},
          request: async (path, options) => {
            const response = await fetch(path, options);
            const value = await response.json();
            if (!response.ok) throw new Error(value.error);
            return value;
          }
        }); window.panel.show();
        </script>`) });
      if (path === "/api/build-workspace") return route.fulfill({ json: { artifacts } });
      if (path === "/api/build-templates") {
        templateReads++;
        if (failTemplates) return route.fulfill({ status: 500, json: { error: "Templates unavailable." } });
        return route.fulfill({ json: { templates: BUILD_BLOCK_TEMPLATES } });
      }
      const input = route.request().postDataJSON();
      mutations.push({ path, input });
      if (path === "/api/build-block") {
        if (failCreate) return route.fulfill({ status: 409, json: { error: "Choose another name." } });
        artifacts.push({
          id: "new-tool", customizationArea: "tools", path: "src/skills/lookup/function_app.py", title: "Lookup",
          projectName: "Lookup", projectPath: "src/skills/lookup", available: true, content: "def invoke():\n    return 501\n",
        });
        return route.fulfill({ json: { artifactId: "new-tool", projectPath: "src/skills/lookup", paths: ["src/skills/lookup/function_app.py"] } });
      }
      if (path === "/api/adjust-build-file" && failAI) return route.fulfill({ status: 503, json: { error: "Session unavailable." } });
      return route.fulfill({ json: { editorLabel: "VS Code", outcome: "requested" } });
    });
    await installToolkitRoutes(page);
    await page.goto("http://build-browser.test/");
    await page.addStyleTag({ content: BUILD_EXPLORER_CSS });
    await page.waitForFunction(() => window.appPlatformToolkitFixtureReady === true);
    assert.deepEqual(errors, []);
    const nav = page.getByRole("navigation", { name: "Build files", exact: true });
    await nav.waitFor();
    assert.equal(await nav.locator("[data-file-choice]").count(), 34);
    assert.deepEqual(await nav.locator("summary").allTextContents(), ["Agents (1)", "Tools (32)", "Source (1)"]);
    assert.equal(await page.locator(".build-source-preview:visible").count(), 3,
      "The default Stack view shows all files in the collection");
    assert.equal(await nav.getByRole("button", { name: "Agent", exact: true }).count(), 1);
    assert.equal(await nav.getByRole("button", { name: "system.md", exact: true }).count(), 0);
    assert.equal(await nav.locator(".build-collection-path").count(), 32, "Duplicate collection names show their project paths");
    const choice = id => nav.locator(`[data-file-choice="${id}"]`);
    const filter = page.getByRole("searchbox", { name: "Filter files", exact: true });
    assert.equal(await filter.getAttribute("aria-controls"), "build-file-results");
    if (mode === "starter only") {
      await page.locator(".build-source-preview").first().evaluate(node => { window.unfilteredPreview = node; });
      await nav.locator("summary").filter({ hasText: "Tools (32)" }).press("Enter");
      await page.waitForFunction(() => !document.querySelectorAll(".build-category")[1].open);
      await filter.fill(" SRC/SKILLS/TOOL-20/ ");
      assert.equal(await nav.locator("[data-file-choice]").count(), 1, "Filtering matches full paths without case or surrounding whitespace");
      assert.equal(await choice("tool-20").isVisible(), true, "Search expands matching collapsed categories");
      assert.deepEqual(await nav.locator("summary").allTextContents(), ["Tools (1)"]);
      assert.equal(await page.locator(".build-filter-status").textContent(), "1 of 34 collections");
      assert.ok(await page.locator(".build-source-preview").first().evaluate(node => node === window.unfilteredPreview),
        "Filtering leaves the selected source node intact even when its file is hidden");
      await filter.fill("DUPLICATE NAME");
      assert.equal(await nav.locator("[data-file-choice]").count(), 32, "Project names are searchable");
      await filter.fill("Web implementation");
      assert.equal(await choice("web").isVisible(), true, "File titles are searchable");
      assert.deepEqual(await nav.locator("summary").allTextContents(), ["Source (1)"]);
      await filter.fill("no-such-file");
      assert.equal(await nav.locator("[data-file-choice]").count(), 0);
      assert.equal(await nav.locator(".build-category").count(), 0);
      assert.equal(await nav.getByText("No matching collections.", { exact: true }).isVisible(), true);
      assert.ok(await page.locator(".build-source-preview").first().evaluate(node => node === window.unfilteredPreview));
      await filter.press("Escape");
      assert.equal(await filter.inputValue(), "");
      assert.equal(await nav.locator("[data-file-choice]").count(), 34);
      assert.equal(await choice("tool-20").isVisible(), false, "Clearing search restores category expansion preferences");
      await nav.locator("summary").filter({ hasText: "Tools (32)" }).press("Enter");
      await filter.fill("tool-20");
      artifacts[0].title = "Updated agent instructions";
      await page.getByRole("button", { name: "Refresh view", exact: true }).click();
      await page.getByRole("region", { name: "Updated agent instructions source preview", exact: true }).waitFor();
      assert.equal(await filter.inputValue(), "tool-20", "A changed source snapshot retains the filter");
      assert.equal(await choice("tool-20").isVisible(), true);
      await filter.fill("tool-2");
      assert.equal(await nav.locator("[data-file-choice]").count(), 11, "Partial names filter the file list");
      await choice("tool-20").press("ArrowDown");
      assert.equal(await choice("tool-21").getAttribute("aria-current"), "true",
        "Keyboard navigation selects from the filtered results");
      await filter.press("Escape");
      await choice("agent").click();
      const pages = page.getByRole("toolbar", { name: "File pages", exact: true });
      assert.deepEqual(await pages.getByRole("button").allTextContents(), ["system.md", "main.py", "agent.yaml"]);
      await filter.fill("agent.yaml");
      assert.equal(await nav.locator("[data-file-choice]").count(), 1);
      assert.deepEqual(await nav.locator("summary").allTextContents(), ["Agents (1)"],
        "Matching a runtime file does not move or duplicate its parent collection");
      await choice("agent").click();
      assert.equal(await pages.getByRole("button", { name: "agent.yaml", exact: true }).getAttribute("aria-pressed"), "true",
        "Searching for a file opens that file within its collection");
      assert.equal(await pages.getByRole("button").count(), 3, "Search retains all sibling files on the right");
      await filter.press("Escape");
      await pages.getByRole("button", { name: "main.py", exact: true }).click();
      assert.equal(await nav.locator('[aria-current="true"]').count(), 1);
      await choice("tool-20").click();
      await choice("agent").click();
      assert.equal(await pages.getByRole("button", { name: "main.py", exact: true }).getAttribute("aria-pressed"), "true",
        "Returning to a collection restores its selected file");
      artifacts.push(
        { id: "root-known", projectPath: ".", projectName: "Workspace", path: "main.py",
          title: "Root implementation", available: true, content: "print('root')\n" },
        { id: "root-file", customizationArea: "runtime", path: "azure-app.yaml",
          title: "App inventory", available: true, content: "name: example\n" },
      );
      await page.getByRole("button", { name: "Refresh view", exact: true }).click();
      const rootCollection = nav.getByRole("button", { name: "Workspace", exact: true });
      await rootCollection.waitFor();
      assert.equal(await nav.locator('[data-collection-path="."]').count(), 1,
        "Root-level files and an explicit root project share one collection");
      await rootCollection.click();
      assert.deepEqual(await pages.getByRole("button").allTextContents(), ["main.py", "azure-app.yaml"]);
    }
    await choice("tool-20").click();
    assert.equal(await choice("tool-20").getAttribute("aria-current"), "true");
    assert.equal(await page.locator(".build-file").count(), 1);
    assert.equal(await page.locator(".build-highlight").textContent(), artifacts[21].content);
    await choice("tool-20").press("ArrowDown");
    assert.equal(await choice("tool-21").getAttribute("aria-current"), "true");
    assert.equal(await choice("tool-21").evaluate(node => node === document.activeElement), true);
    await page.getByRole("button", { name: "Refresh view", exact: true }).click();
    assert.equal(await choice("tool-21").getAttribute("aria-current"), "true");
    await choice("web").click();
    assert.equal(await page.locator(".build-highlight").textContent(), "export const app = {};");
    for (const width of [380, 620, 1000]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.locator("#details").evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
      const toggle = page.getByRole("button", { name: "Files", exact: true });
      if (width === 380) {
        assert.equal(await toggle.isVisible(), true);
        assert.equal(await nav.isVisible(), false, "Compact panes reserve their width for source");
        await toggle.click();
        const [left, right] = await Promise.all([nav.boundingBox(), page.locator(".build-content").boundingBox()]);
        assert.ok(Math.abs(left.width - right.width) <= 1, "The compact file list opens at full width");
        assert.equal(await page.locator(".build-content").isVisible(), false);
        await filter.press("Escape");
        assert.equal(await page.locator(".build-content").isVisible(), true);
      } else {
        const [left, right] = await Promise.all([nav.boundingBox(), page.locator(".build-content").boundingBox()]);
        assert.ok(left.x + left.width <= right.x, "Wider panes retain the categorized list on the left");
      }
    }

    await page.getByRole("button", { name: "+ Add building block", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Templates unavailable." }).waitFor();
    failTemplates = false;
    await page.getByRole("button", { name: "Retry templates", exact: true }).click();
    await page.getByRole("combobox", { name: "Template", exact: true }).waitFor();
    assert.equal(templateReads, 2);
    assert.equal(await page.locator(".build-add-form .ct-field").count(), 3,
      "Template, name, and instructions use toolkit FormField");
    assert.equal(await page.locator(".build-add-form .ct-actions").count(), 1,
      "Creation actions use toolkit ActionGroup");
    assert.equal(await page.getByRole("textbox", { name: "Block name", exact: true })
      .evaluate(control => control.required), true);
    assert.ok(await page.getByRole("textbox", { name: "Instructions (optional)", exact: true }).evaluate(control =>
      control.getAttribute("aria-describedby")?.split(" ").some(id =>
        document.getElementById(id)?.textContent.includes("Leave blank for the starter only"))),
      "The toolkit associates instruction guidance with the field");
    for (const width of [380, 620, 1000]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.locator("#details").evaluate(node => node.scrollWidth <= node.clientWidth + 1), true,
        "Template creation must fit compact canvas panes");
    }
    await page.getByRole("textbox", { name: "Block name", exact: true }).fill("lookup");
    await page.getByRole("textbox", { name: "Instructions (optional)", exact: true }).fill(creationInstructions);
    await page.getByRole("textbox", { name: "Block name", exact: true })
      .evaluate(control => { window.retainedBlockName = control; });
    await filter.fill("no-such-file");
    assert.equal(await page.getByRole("textbox", { name: "Block name", exact: true }).inputValue(), "lookup",
      "Filtering the list does not discard the open creation form");
    await filter.press("Escape");
    await page.getByRole("separator", { name: "File list width", exact: true }).press("Shift+ArrowRight");
    assert.ok(await page.getByRole("textbox", { name: "Block name", exact: true })
      .evaluate(control => control === window.retainedBlockName && control.value === "lookup"),
    "Resizing does not remount form controls or discard drafts");
    assert.equal(await page.getByRole("textbox", { name: "Instructions (optional)", exact: true }).inputValue(), creationInstructions);
    await page.getByRole("button", { name: "Create from template", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Choose another name." }).waitFor();
    assert.equal(await page.locator('.build-add-form .ct-message[data-intent="error"]').count(), 1,
      "Creation failures use the canonical error MessageBar");
    assert.equal(await page.getByRole("textbox", { name: "Block name", exact: true }).inputValue(), "lookup");
    assert.equal(await page.getByRole("textbox", { name: "Instructions (optional)", exact: true }).inputValue(), creationInstructions);
    failCreate = false;
    await page.getByRole("button", { name: "Create from template", exact: true }).click();
    await page.locator('.build-file[data-artifact="new-tool"]').waitFor();
    assert.equal(await choice("new-tool").getAttribute("aria-current"), "true");
    await page.getByRole("status").filter({ hasText: "Template created." }).waitFor();
    assert.deepEqual(mutations.filter(item => item.path === "/api/build-block").map(item => item.input),
      [{ root: "/fixture", templateId: "hosted-skill", name: "lookup" }, { root: "/fixture", templateId: "hosted-skill", name: "lookup" }]);
    if (mode === "AI retry") {
      await page.getByRole("alert").filter({ hasText: "Template saved, but AI customization could not be requested" }).waitFor();
      assert.equal(await page.locator(".build-ai-form textarea").inputValue(), creationInstructions);
      assert.deepEqual(mutations.find(item => item.path === "/api/adjust-build-file").input,
        { root: "/fixture", id: "new-tool", instructions: creationInstructions });
      assert.equal(mutations.filter(item => item.path === "/api/build-block").length, 2,
        "AI failures must not retry template creation");
    } else {
      if (mode === "starter only") {
        assert.equal(mutations.some(item => item.path === "/api/adjust-build-file"), false,
          "Blank instructions create a starter without requesting AI");
      } else {
        await page.getByRole("status").filter({ hasText: "Requested in your app session." }).waitFor();
        assert.equal(await page.locator(".build-ai-form").count(), 0);
        assert.deepEqual(mutations.find(item => item.path === "/api/adjust-build-file").input,
          { root: "/fixture", id: "new-tool", instructions: creationInstructions });
      }
      await page.getByRole("button", { name: "Adjust with AI", exact: true }).click();
    }
    await page.getByRole("button", { name: "Edit in VS Code", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Opened the worktree and file" }).waitFor();
    await page.getByRole("textbox", { name: "What should change?", exact: true }).fill("Validate the request.");
    await filter.fill("server.mjs");
    assert.equal(await page.getByRole("textbox", { name: "What should change?", exact: true }).inputValue(), "Validate the request.",
      "Filtering does not discard an open AI adjustment draft");
    await filter.press("Escape");
    failAI = true;
    const aiForm = page.locator(".build-ai-form");
    await aiForm.getByRole("button", { name: "Adjust with AI", exact: true }).click();
    await aiForm.getByRole("alert").filter({ hasText: "Session unavailable." }).waitFor();
    assert.equal(await aiForm.locator("textarea").inputValue(), "Validate the request.");
    failAI = false;
    await aiForm.getByRole("button", { name: "Adjust with AI", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Requested in your app session." }).waitFor();
    assert.equal(await page.locator("textarea,[contenteditable=true]").count(), 0);
    assert.deepEqual(mutations.at(-1), { path: "/api/adjust-build-file", input: { root: "/fixture", id: "new-tool", instructions: "Validate the request." } });
    const divider = page.getByRole("separator", { name: "File list width", exact: true });
    const retainedWidth = await nav.evaluate(node => node.getBoundingClientRect().width);
    const handle = await divider.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
    await page.mouse.down();
    assert.equal(await divider.getAttribute("data-dragging"), "true");
    await page.evaluate(() => {
      window.disposedBuildDivider = document.querySelector(".build-divider");
      window.panel.hide();
    });
    assert.equal(await divider.getAttribute("data-dragging"), null, "Leaving Build cancels an active drag");
    await page.mouse.up();
    await divider.press("ArrowRight");
    assert.equal(await nav.evaluate(node => node.getBoundingClientRect().width), retainedWidth,
      "A departed splitter no longer responds to resize events");
    await page.evaluate(() => window.panel.show());
    await nav.waitFor();
    assert.ok(Math.abs(await nav.evaluate(node => node.getBoundingClientRect().width) - retainedWidth) <= 1,
      "Returning to Build restores the chosen split");
    await page.evaluate(() => window.disposedBuildDivider.dispatchEvent(new KeyboardEvent("keydown", { key: "End" })));
    assert.ok(Math.abs(await nav.evaluate(node => node.getBoundingClientRect().width) - retainedWidth) <= 1,
      "Detached splitters cannot affect the current workspace");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
}
