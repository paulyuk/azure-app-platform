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

test("Build preserves newer and reverted drafts across pending saves and panel reloads", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  let artifact = {
    id: "instructions", title: "Agent instructions", path: "src/agent/prompts/system.md",
    customizationArea: "behavior", available: true, editable: true, content: "Original instructions.", sha: "base",
  };
  const runtimeArtifact = {
    id: "runtime", title: "Runtime", path: "config/runtime.json", customizationArea: "runtime",
    available: true, editable: true, content: '{"agentRuntime":"local"}', sha: "runtime-base",
  };
  const writes = [];
  let releaseSave;
  let saveStarted;
  let pendingSave;
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(`<div id="details"></div><script>
      ${BUILD_SYNTAX_SCRIPT}
      const panel = (${createBuildPanel.toString()})({
        container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
        onRun() {}, onModel() {},
        request: async (path, options) => (await fetch(path, options)).json()
      });
      panel.show();
    </script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") {
        await route.fulfill({ json: { artifacts: [artifact, runtimeArtifact], supportsDocuments: true } });
        return;
      }
      const input = route.request().postDataJSON();
      if (path === "/api/build-diff") {
        await route.fulfill({ json: buildDiffFixture({
          baseSha: input.baseSha, before: artifact.content, after: input.content,
        }) });
        return;
      }
      assert.equal(path, "/api/build-file");
      writes.push(input);
      saveStarted?.();
      await pendingSave;
      artifact = { ...artifact, content: input.content, sha: `saved-${writes.length}` };
      await route.fulfill({ json: artifact });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const editor = page.locator('textarea[aria-label="Agent instructions source"]');
    const review = page.locator("button").filter({ hasText: /^Review changes$/ });
    const discard = page.locator("button").filter({ hasText: /^Discard draft & reload$/ });
    const behaviorArea = page.locator('.build-area-button[data-area-id="behavior"]');
    for (const reloadDuringSave of [false, true]) {
      const original = artifact.content;
      const reviewed = `Reviewed revision ${writes.length}.`;
      const baseSha = artifact.sha;
      const started = new Promise((resolve) => { saveStarted = resolve; });
      pendingSave = new Promise((resolve) => { releaseSave = resolve; });
      await editor.fill(reviewed);
      assert.equal(await behaviorArea.getAttribute("aria-label"), "Agent behavior, Unsaved");
      await review.click();
      await page.getByRole("button", { name: "Save reviewed changes" }).click();
      await started;
      assert.equal(await behaviorArea.getAttribute("aria-label"), "Agent behavior, Saving");
      assert.equal(await review.isDisabled(), true);
      assert.equal(await discard.isDisabled(), true);
      if (reloadDuringSave) {
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await editor.waitFor();
        assert.equal(await review.isDisabled(), true);
      } else {
        await page.locator('.build-area-button[data-area-id="runtime"]').click();
        await page.locator('[data-artifact="runtime"]').waitFor();
        await behaviorArea.click();
        await editor.waitFor();
      }
      const newer = reloadDuringSave ? original : "Newer unsaved instructions.";
      await editor.fill(newer);
      const response = page.waitForResponse((response) => response.url().endsWith("/api/build-file"));
      releaseSave();
      await response;
      await page.waitForFunction(() => {
        const button = [...document.querySelectorAll("button")].find((button) => button.textContent === "Review changes");
        return button && !button.disabled;
      });
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await editor.waitFor();
      assert.equal(await editor.inputValue(), newer);
      assert.equal(await behaviorArea.getAttribute("aria-label"), "Agent behavior, Unsaved");
      assert.equal(writes.at(-1).baseSha, baseSha);
      assert.equal(writes.at(-1).content, reviewed);
      assert.equal(await page.getByText(/saved file changed in another editor/).count(), 0);
      const savedSha = artifact.sha;
      pendingSave = null;
      saveStarted = null;
      await review.click();
      await page.getByRole("button", { name: "Save reviewed changes" }).click();
      await page.getByText(/Saved\. Restart/).waitFor();
      assert.equal(writes.at(-1).baseSha, savedSha);
      assert.equal(writes.at(-1).content, newer);
    }
    assert.deepEqual(errors, []);
  } finally {
    releaseSave?.();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Build exposes one selected editor, launch actions, reviewed policy edits and external-edit conflicts", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifacts = [
    { id: "instructions", customizationArea: "behavior", title: "Agent instructions", path: "src/agent/prompts/system.md", editable: true, content: "Use the document tool." },
    { id: "tool", customizationArea: "tools", title: "Document validation tool", path: "src/tools/document-validation/main.py", editable: true, content: "def main(): pass" },
    { id: "contract", customizationArea: "tools", title: "Tool contract", path: "src/tools/document-validation/contract.json", editable: true, content: '{"additionalProperties":false}' },
    { id: "policy", customizationArea: "policies", title: "Enforcement policy", path: "config/document-policy.json", editable: true, content: '{"maxBytes":4096}' },
    { id: "runtime", customizationArea: "runtime", title: "Runtime & access", path: "config/runtime.json", editable: true, content: '{"agentRuntime":"local","other":"preserve"}' },
  ].map((item) => ({ ...item, description: item.title, available: true, sha: "base" }));
  artifacts.push(
    { id: "unknown-area", customizationArea: "advanced", title: "Unknown area", path: "config/advanced.json", available: true, content: "{}", sha: "base" },
    { id: "unavailable", customizationArea: "behavior", title: "Missing instructions", path: "src/missing.md", available: false, detail: "File is missing.", content: "", sha: "base" },
  );
  const saved = [];
  const opened = [];
  const openedWorkspaces = [];
  let codeFails = false;
  let saveFails;
  let workspaceFails = false;
  let supportsDocuments = true;
  let diagnostics = [];
  let workspaceEditorSettings;
  const html = `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style><aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/app", isActive: () => true, syntax: buildSyntax,
      onRun: () => { document.body.dataset.runRequested = "true"; }, onModel: () => {},
      request: async (path, options) => {
        const response = await fetch(path, options);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      }
    });

    panel.show();
    </script>`;
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end(html); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === "/api/build-workspace" && workspaceFails) {
        await route.fulfill({ status: 503, json: { error: "Source discovery unavailable." } });
        return;
      }
      if (path === "/api/build-workspace") body = {
        artifacts, supportsDocuments, diagnostics,
        ...(workspaceEditorSettings ? { editorSettings: workspaceEditorSettings } : {}),
      };
      else if (path === "/api/build-diff") {
        const input = route.request().postDataJSON();
        const artifact = artifacts.find((item) => item.id === input.id);
        body = buildDiffFixture({ baseSha: input.baseSha, before: artifact.content, after: input.content });
      }
      else if (path === "/api/build-file") {
        const input = route.request().postDataJSON();
        if (saveFails) {
          await route.fulfill({ status: 409, json: { error: saveFails } });
          return;
        }
        saved.push(input);
        body = Object.assign(artifacts.find((item) => item.id === input.id), { content: input.content, sha: "saved" });
      } else if (path === "/api/open-build-file") {
        opened.push(route.request().postDataJSON());
        if (codeFails) {
          await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "VS Code is unavailable." }) });
          return;
        }
        body = { outcome: "opened-in-vscode" };
      } else if (path === "/api/open-editor") {
        openedWorkspaces.push(route.request().postDataJSON());
        body = { outcome: "opened-in-editor", editorLabel: "Cursor" };
      } else throw new Error(`Unexpected route ${path}`);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const instructions = page.locator('[data-artifact="instructions"]');
    const selectArtifact = async (area, id) => {
      await page.locator(`.build-area-button[data-area-id="${area}"]`).click();
      const select = page.locator("select[data-build-file-select]");
      if (id && await select.count()) await select.selectOption(id);
    };
    await instructions.getByRole("textbox").waitFor();
    const customizations = page.getByRole("navigation", { name: "Customization areas" });
    assert.deepEqual(await customizations.locator(".build-area-button").evaluateAll((buttons) =>
      buttons.map((button) => button.dataset.areaId)), ["behavior", "tools", "runtime", "policies"]);
    assert.equal(await page.locator('[data-artifact="unknown-area"], [data-artifact="unavailable"]').count(), 0);
    assert.equal(await page.locator(".build-card").count(), 0);
    assert.equal(await page.locator(".build-header").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Edit on App Map", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Run/Debug", exact: true }).count(), 0);
    assert.equal(saved.length, 0);
    assert.equal(opened.length, 0);
    assert.equal(await page.getByRole("textbox").count(), 1);
    await selectArtifact("tools", "contract");
    const toolFiles = page.getByRole("combobox", { name: "Tools & contracts file" });
    assert.deepEqual(await toolFiles.locator("option").evaluateAll((options) => options.map((option) => option.value)), ["tool", "contract"]);
    await selectArtifact("behavior", "instructions");
    await selectArtifact("tools");
    assert.equal(await toolFiles.inputValue(), "contract");
    await selectArtifact("behavior", "instructions");
    for (const editor of await page.getByRole("textbox").all()) {
      assert.equal(await editor.getAttribute("readonly"), null);
      assert.ok((await editor.boundingBox()).height >= 240);
    }
    assert.equal(await instructions.getByRole("combobox", { name: "Supported editor" }).inputValue(), "vscode");
    await instructions.getByRole("button", { name: "Open in VS Code", exact: true }).click();
    await instructions.getByText(/Opened the worktree and file/).waitFor();
    assert.deepEqual(opened[0], { root: "/app", id: "instructions" });
    assert.equal(await instructions.locator(".code-edit svg").count(), 1);
    await instructions.getByRole("textbox").fill("Summarize only approved results.");
    assert.equal(saved.length, 0);
    await instructions.getByRole("button", { name: "Review changes" }).click();
    assert.equal(saved.length, 0);
    await instructions.getByRole("button", { name: "Save reviewed changes" }).click();
    await instructions.getByText(/Saved\. Restart/).waitFor();
    assert.equal(saved[0].baseSha, "base");
    assert.equal(saved[0].content, "Summarize only approved results.");
    const policy = page.locator('[data-artifact="policy"]');
    await selectArtifact("policies", "policy");
    await policy.getByRole("textbox").fill('{"maxBytes":2048}');
    await policy.getByRole("button", { name: "Review changes" }).click();
    assert.equal(saved.length, 1);
    await policy.getByRole("button", { name: "Save reviewed changes" }).click();
    await policy.getByText(/Saved\. Restart/).waitFor();
    assert.equal(saved[1].id, "policy");
    await policy.getByRole("textbox").fill('{"maxBytes":1024}');
    await policy.getByRole("button", { name: "Review changes" }).click();
    saveFails = "Policy save failed.";
    await policy.getByRole("button", { name: "Save reviewed changes" }).click();
    await policy.getByText("Policy save failed.", { exact: true }).waitFor();
    assert.equal(await page.locator('.build-area-button[data-area-id="policies"]').getAttribute("aria-label"),
      "Policies & limits, Save failed");
    await policy.getByRole("button", { name: "Back to editing" }).click();
    saveFails = undefined;
    await policy.getByRole("textbox").fill('{"maxBytes":2048}');
    assert.equal(await page.locator('.build-area-button[data-area-id="policies"]').getAttribute("aria-label"),
      "Policies & limits");
    codeFails = true;
    await policy.getByRole("button", { name: "Open in VS Code", exact: true }).click();
    await policy.getByText("VS Code is unavailable.", { exact: true }).waitFor();
    assert.equal(await policy.getByRole("button", { name: "Open in VS Code", exact: true }).isEnabled(), true);
    await selectArtifact("runtime", "runtime");
    await page.getByRole("combobox", { name: "Agent runtime" }).selectOption("copilot-sdk-sandbox");
    const runtime = page.locator('[data-artifact="runtime"]');
    const config = JSON.parse(await runtime.getByRole("textbox").inputValue());
    assert.equal(config.agentRuntime, "copilot-sdk-sandbox");
    assert.equal(config.other, "preserve");
    await selectArtifact("behavior", "instructions");
    await instructions.getByRole("textbox").fill("Unsaved inline draft.");
    codeFails = false;
    await instructions.getByRole("button", { name: "Open in VS Code", exact: true }).click();
    await instructions.getByText(/inline draft has not been saved/).waitFor();
    assert.equal(saved.length, 2);
    Object.assign(artifacts[0], { content: "Changed in VS Code.", sha: "external-change" });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await instructions.getByText(/saved file changed in another editor/).waitFor();
    assert.equal(await instructions.getByRole("textbox").inputValue(), "Unsaved inline draft.");
    await instructions.getByRole("button", { name: "Review changes" }).click();
    assert.equal(await instructions.getByRole("button", { name: "Save reviewed changes" }).count(), 0);
    await instructions.getByRole("button", { name: "Discard draft & reload" }).click();
    await page.waitForFunction(() => document.querySelector('[data-artifact="instructions"] textarea')?.value === "Changed in VS Code.");
    assert.equal(await page.getByRole("button", { name: "Invoke agent", exact: true }).count(), 0);
    await instructions.getByRole("button", { name: "Test with a document" }).click();
    assert.equal(await page.locator("body").getAttribute("data-run-requested"), "true");
    await selectArtifact("tools", "contract");
    const contract = page.locator('[data-artifact="contract"]');
    await contract.getByRole("textbox").fill('{"additionalProperties":true}');
    artifacts.splice(artifacts.findIndex((item) => item.id === "contract"), 1);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await contract.getByRole("textbox").waitFor();
    assert.equal(await contract.getByRole("textbox").inputValue(), '{"additionalProperties":true}');
    assert.equal(await contract.getByRole("textbox").getAttribute("readonly"), "");
    await contract.getByText(/no longer a recognized customization point/i).waitFor();
    await contract.getByRole("button", { name: "Discard draft & reload" }).click();
    await page.waitForFunction(() => !document.querySelector('[data-artifact="contract"]'));
    await selectArtifact("runtime", "runtime");
    await runtime.getByRole("button", { name: "Discard draft & reload" }).click();
    await page.waitForFunction(() => document.querySelector('[data-artifact="runtime"] textarea')?.value.includes('"agentRuntime":"local"'));
    supportsDocuments = false;
    artifacts.splice(0, artifacts.length, {
      id: "source-agent", path: "src/agent/main.py", title: "Agent implementation & instructions",
      customizationArea: "behavior",
      description: "Inline instructions and tool registrations.", available: true, editable: true,
      content: 'INSTRUCTIONS = "Find real inventory."\nagent = Agent(instructions=INSTRUCTIONS)',
      sha: "dealer-base",
    }, {
      id: "source-skill", path: "src/skills/inventory/function_app.py", title: "Inventory tool",
      customizationArea: "tools",
      description: "Registered inventory skill.", available: true, editable: true,
      content: "def inventory(): return []", sha: "skill-base",
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const dealer = page.locator('[data-artifact="source-agent"]');
    await dealer.getByRole("textbox").waitFor();
    assert.equal(await page.getByRole("button", { name: "Test with a document" }).count(), 0);
    assert.equal(await page.getByRole("combobox", { name: "Agent runtime" }).count(), 0);
    assert.equal(await page.locator(".build-warning").count(), 0);
    assert.equal(await page.getByRole("textbox").count(), 1);
    const skill = page.locator('[data-artifact="source-skill"]');
    await selectArtifact("tools", "source-skill");
    await skill.getByRole("textbox").fill("def inventory(): return ['real inventory']");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await skill.getByRole("textbox").waitFor();
    assert.equal(await skill.getByRole("textbox").inputValue(), "def inventory(): return ['real inventory']");
    assert.equal(await page.locator('.build-area-button[data-area-id="tools"]').getAttribute("aria-current"), "true");
    await skill.getByRole("button", { name: "Discard draft & reload" }).click();
    await page.waitForFunction(() => document.querySelector('[data-artifact="source-skill"] textarea')?.value === "def inventory(): return []");
    await selectArtifact("behavior", "source-agent");
    assert.match(await dealer.getByRole("textbox").inputValue(), /INSTRUCTIONS/);
    await dealer.getByRole("button", { name: "Open in VS Code", exact: true }).click();
    await dealer.getByText(/Opened the worktree and file/).waitFor();
    assert.deepEqual(opened.at(-1), { root: "/app", id: "source-agent" });
    await dealer.getByRole("textbox").fill('INSTRUCTIONS = "Never invent inventory."\nagent = Agent(instructions=INSTRUCTIONS)');
    await dealer.getByRole("button", { name: "Review changes" }).click();
    await dealer.getByRole("button", { name: "Save reviewed changes" }).click();
    await dealer.getByText(/Saved\. Restart/).waitFor();
    assert.equal(saved.at(-1).id, "source-agent");
    assert.equal(saved.at(-1).baseSha, "dealer-base");
    artifacts.splice(0);
    diagnostics = [{ path: "unity.app.yaml", message: "Agent path was not found." }];
    workspaceEditorSettings = {
      editorId: "cursor",
      editors: [{ id: "vscode", label: "VS Code" }, { id: "cursor", label: "Cursor" }],
    };
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByText(/No supported customization points were found/).waitFor();
    assert.equal(await page.getByRole("textbox").count(), 0);
    assert.equal(await page.getByText("unity.app.yaml: Agent path was not found.", { exact: true }).count(), 1);
    assert.equal(await page.getByText(/Not implemented in this app/).count(), 0);
    assert.equal(await page.locator(".build-header").count(), 0);
    await page.getByRole("button", { name: "Open in Cursor" }).click();
    await page.getByText("Opened the worktree in Cursor.", { exact: true }).waitFor();
    assert.deepEqual(openedWorkspaces, [{ root: "/app" }]);
    workspaceFails = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByText("Source discovery unavailable.", { exact: true }).waitFor();
    assert.equal(await page.locator(".build-header").count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
