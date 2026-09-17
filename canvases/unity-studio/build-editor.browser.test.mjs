import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { buildDiffFixture } from "./build-diff-test-fixture.mjs";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

const editors = [
  { id: "vscode", label: "VS Code" },
  { id: "vscode-insiders", label: "VS Code Insiders" },
  { id: "cursor", label: "Cursor" },
  { id: "windsurf", label: "Windsurf" },
  { id: "zed", label: "Zed" },
  { id: "sublime", label: "Sublime Text" },
];

test("Build persists supported editor choices without disturbing drafts or review state", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifact = {
    id: "agent", title: "Agent source", path: "src/agent/main.py", description: "Agent implementation.",
    available: true, editable: true, content: "print('original')\n", sha: "base",
  };
  let editorSettings = { editorId: "vscode", editors };
  let settingsGate = Promise.resolve();
  let settingsStarted;
  let releaseSettings;
  let settingsFailure;
  const settingsWrites = [];
  const opened = [];
  const html = `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style>
    <aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
      editorSettings: ${JSON.stringify({ editorId: "vscode", editors })},
      onRun() {}, onModel() {}, onStructure() {},
      request: async (path, options) => {
        const response = await fetch(path, options);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      }
    });
    panel.show();
    </script>`;
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") {
        await route.fulfill({ json: { artifacts: [artifact], editorSettings } });
      } else if (path === "/api/build-diff") {
        const input = route.request().postDataJSON();
        await route.fulfill({ json: buildDiffFixture({
          baseSha: input.baseSha, before: artifact.content, after: input.content,
        }) });
      } else if (path === "/api/editor-settings") {
        const input = route.request().postDataJSON();
        settingsWrites.push(input);
        settingsStarted?.();
        await settingsGate;
        if (settingsFailure) await route.fulfill({ status: 500, json: { error: settingsFailure } });
        else {
          editorSettings = { editorId: input.editorId, editors };
          await route.fulfill({ json: editorSettings });
        }
      } else if (path === "/api/open-build-file") {
        opened.push(route.request().postDataJSON());
        await route.fulfill({
          json: {
            outcome: "opened-in-editor", root: "/fixture", editorId: editorSettings.editorId,
            editorLabel: "Zed", command: "zed",
          },
        });
      } else {
        throw new Error("Unexpected route " + path);
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const card = page.locator('[data-artifact="agent"]');
    const source = card.locator('textarea[aria-label="Agent source source"]');
    const select = card.getByRole("combobox", { name: "Supported editor" });
    const split = card.getByRole("group", { name: "Code editor", exact: true });
    await split.waitFor();
    assert.equal(await split.locator(".build-editor-launch-label").textContent(), "VS Code");
    assert.ok((await split.boundingBox()).width < 180, "Editor actions form one compact split button");
    const openBounds = await split.getByRole("button", { name: "Open in VS Code", exact: true }).boundingBox();
    const pickerBounds = await select.boundingBox();
    assert.equal(pickerBounds.width, 28);
    assert.equal(pickerBounds.height, openBounds.height);
    assert.ok(Math.abs(pickerBounds.x - (openBounds.x + openBounds.width)) < 1);
    await split.getByRole("button", { name: "Open in VS Code", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await select.evaluate((element) => element === document.activeElement), true);
    assert.equal(await select.evaluate((element) => getComputedStyle(element.parentElement).outlineStyle), "solid");
    const picker = split.locator(".build-editor-picker");
    const background = (control) => control.evaluate((element) => getComputedStyle(element).backgroundColor);
    const launch = split.getByRole("button", { name: "Open in VS Code", exact: true });
    const normalBackground = await background(launch);
    await launch.hover();
    const hoverBackground = await background(launch);
    assert.notEqual(hoverBackground, normalBackground);
    await picker.hover();
    assert.equal(await background(picker), hoverBackground);
    assert.deepEqual(await select.locator("option").evaluateAll((options) =>
      options.map((option) => ({ id: option.value, label: option.textContent }))), editors);
    await source.fill("print('draft')\n");
    await card.getByRole("button", { name: "Review changes" }).click();
    const reviewedSave = card.getByRole("button", { name: "Save reviewed changes" });
    await reviewedSave.waitFor();
    await source.evaluate((element) => { element.dataset.identityProbe = "retained"; });

    const started = new Promise((resolve) => { settingsStarted = resolve; });
    settingsGate = new Promise((resolve) => { releaseSettings = resolve; });
    await select.selectOption("cursor");
    await started;
    const open = card.getByRole("button", { name: "Open in Cursor" });
    assert.equal(await select.isDisabled(), true);
    assert.equal(await open.isDisabled(), true);
    await picker.hover();
    assert.equal(await background(picker), normalBackground);
    assert.equal(await picker.evaluate((element) => getComputedStyle(element).opacity),
      await open.evaluate((element) => getComputedStyle(element).opacity));
    assert.equal(await source.inputValue(), "print('draft')\n");
    assert.equal(await source.getAttribute("data-identity-probe"), "retained");
    assert.equal(await reviewedSave.count(), 1);
    const savedPreference = page.waitForResponse((response) => response.url().endsWith("/api/editor-settings"));
    releaseSettings();
    await savedPreference;
    await open.waitFor();
    assert.equal(await select.isEnabled(), true);
    assert.deepEqual(settingsWrites[0], { editorId: "cursor" });
    assert.equal(await select.inputValue(), "cursor");
    assert.equal(await source.getAttribute("data-identity-probe"), "retained");
    assert.equal(await reviewedSave.count(), 1);

    await open.click();
    await card.getByText("Opened the worktree and file in Zed. Your inline draft has not been saved.", { exact: true }).waitFor();
    assert.deepEqual(opened[0], { root: "/fixture", id: "agent" });

    settingsFailure = "Windsurf could not be saved.";
    const failedStarted = new Promise((resolve) => { settingsStarted = resolve; });
    settingsGate = new Promise((resolve) => { releaseSettings = resolve; });
    await select.selectOption("windsurf");
    await failedStarted;
    assert.equal(await select.isDisabled(), true);
    assert.equal(await card.getByRole("button", { name: "Open in Windsurf" }).isDisabled(), true);
    releaseSettings();
    await card.getByRole("alert").filter({ hasText: /Could not save editor preference/ }).waitFor();
    assert.equal(await select.inputValue(), "cursor");
    assert.equal(await card.getByRole("button", { name: "Open in Cursor" }).isEnabled(), true);
    assert.equal(await source.inputValue(), "print('draft')\n");
    assert.equal(await source.getAttribute("data-identity-probe"), "retained");
    assert.equal(await reviewedSave.count(), 1);
    assert.deepEqual(settingsWrites[1], { editorId: "windsurf" });

    settingsFailure = undefined;
    editorSettings = { editorId: "sublime", editors };
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await source.waitFor();
    assert.equal(await source.inputValue(), "print('draft')\n");
    assert.equal(await card.getByRole("combobox", { name: "Supported editor" }).inputValue(), "sublime");
    assert.equal(await card.getByRole("button", { name: "Open in Sublime Text" }).count(), 1);
    const currentOpen = card.getByRole("button", { name: "Open in Sublime Text", exact: true });
    await currentOpen.focus();
    await page.keyboard.press("Tab");
    assert.equal(await select.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("Shift+Tab");
    assert.equal(await currentOpen.evaluate((element) => element === document.activeElement), true);
    assert.equal(await source.inputValue(), "print('draft')\n");
    assert.deepEqual(errors, []);
  } finally {
    releaseSettings?.();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
