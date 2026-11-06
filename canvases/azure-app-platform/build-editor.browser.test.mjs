import { installToolkitRoutes, withToolkitButtons } from "./toolkit-test-fixture.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { renderOcticon, VSCODE_ICON_MARKUP } from "./studio-icons.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

const editors = [
  { id: "vscode", label: "VS Code" },
  { id: "cursor", label: "Cursor" },
  { id: "zed", label: "Zed" },
];

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function pageHtml() {
  return `<!doctype html><style>body { margin:0; } #details { height:100vh; } ${BUILD_PANEL_CSS}</style>
    <aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    window.buildPanel = (${createBuildPanel.toString()})({ buttons: window.appPlatformButtons, helpIcon: ${JSON.stringify(renderOcticon("info"))}, vsCodeIconMarkup: ${JSON.stringify(VSCODE_ICON_MARKUP)},
      container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
      editorSettings: ${JSON.stringify({ editorId: "vscode", editors })},
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
}

function artifacts() {
  return [
    {
      id: "agent", title: "Agent source", path: "src/agent/main.py", description: "Agent implementation.",
      projectPath: "src/agent", projectName: "Deal agent", customizationArea: "behavior",
      available: true, content: "print('agent')\n", sha: "base",
    },
    {
      id: "tool", title: "Inventory entry point", path: "src/skills/inventory/main.py",
      description: "Inventory implementation.", projectPath: "src/skills/inventory",
      projectName: "Inventory search", customizationArea: "tools",
      available: true, content: "print('tool')\n", sha: "base",
    },
  ];
}

test("Build scopes native Files handoff state per artifact and suppresses duplicate launches", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const filesRequests = [];
  const editorRequests = [];
  const pending = new Map();
  const fail = new Set();
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(withToolkitButtons(pageHtml()));
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
        await route.fulfill({ json: { artifacts: artifacts(), editorSettings: { editorId: "vscode", editors } } });
      } else if (path === "/api/open-build-file-canvas") {
        const input = route.request().postDataJSON();
        filesRequests.push(input);
        const gate = deferred();
        pending.set(input.id, gate);
        await gate.promise;
        if (fail.has(input.id)) await route.fulfill({ status: 500, json: { error: `${input.id} Files failed.` } });
        else await route.fulfill({ json: {
          path: artifacts().find((artifact) => artifact.id === input.id).path,
          canvas: { canvasId: "editor", instanceId: `build-file-${input.id}`, scope: "repo" },
        } });
      } else if (path === "/api/open-build-file") {
        editorRequests.push(route.request().postDataJSON());
        await route.fulfill({ json: { editorLabel: "VS Code" } });
      } else {
        throw new Error(`Unexpected route ${path}`);
      }
    });
    await installToolkitRoutes(page);

    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const agentRow = page.locator('.build-file[data-artifact="agent"]');
    const toolRow = page.locator('.build-file[data-artifact="tool"]');
    const agentLaunch = agentRow.locator('[data-files-launch][data-artifact-id="agent"]');
    const toolLaunch = toolRow.locator('[data-files-launch][data-artifact-id="tool"]');
    await agentRow.getByRole("button", { name: "Open with", exact: true }).click();
    const openMenu = page.getByRole("menu", { name: "Open with", exact: true });
    assert.equal(await openMenu.getByText("Open with", { exact: true }).count(), 1);
    assert.ok(await openMenu.getByRole("menuitem", { name: "Files", exact: true }).locator('[aria-hidden="true"]').count() > 0);
    assert.equal(await openMenu.getByRole("menuitem", { name: "VS Code", exact: true }).locator("svg").count(), 1);
    for (const logo of [
      agentRow.getByRole("button", { name: "Edit in VS Code", exact: true }).locator(".vscode-icon"),
      openMenu.getByRole("menuitem", { name: "VS Code", exact: true }).locator(".vscode-icon"),
    ]) {
      assert.equal(await logo.getAttribute("viewBox"), "0 0 100 100");
      assert.deepEqual(await logo.locator("path").evaluateAll(paths => paths.map(path => path.getAttribute("fill"))),
        ["#0065A9", "#007ACC", "#1F9CF0"]);
      assert.equal(await logo.getAttribute("aria-hidden"), "true");
    }
    assert.deepEqual(await agentRow.getByRole("button", { name: "Edit in VS Code", exact: true }).locator(".vscode-icon").evaluate(logo => {
      const bounds = logo.getBoundingClientRect();
      const button = logo.closest("button").getBoundingClientRect();
      return { size: [bounds.width, bounds.height], overflow: getComputedStyle(logo).overflow,
        contained: bounds.left >= button.left && bounds.right <= button.right &&
          bounds.top >= button.top && bounds.bottom <= button.bottom };
    }), { size: [14, 14], overflow: "visible", contained: true });
    assert.equal(await openMenu.locator(".build-icon-files").evaluate(icon =>
      getComputedStyle(icon).maskImage !== "none" && icon.getBoundingClientRect().width === 16), true,
    "The Files destination retains its visible icon inside the toolkit menu");
    await openMenu.getByRole("menuitem", { name: "Files", exact: true }).click();
    await agentLaunch.waitFor();

    assert.equal(await agentLaunch.getAttribute("aria-label"), "Edit in Files");
    await agentLaunch.click({ force: true });
    await page.locator('[data-file-choice="tool"]').click();
    await toolLaunch.waitFor();
    await toolLaunch.click();
    await page.waitForFunction(() => document.querySelectorAll("[data-files-launch]:disabled").length === 1);
    assert.deepEqual(filesRequests, [
      { root: "/fixture", id: "agent" },
      { root: "/fixture", id: "tool" },
    ], "The same artifact is suppressed while another artifact may launch independently");

    pending.get("tool").resolve();
    await toolRow.locator('.build-handoff-feedback[data-artifact-id="tool"]').filter({ hasText: /Opened in Files/ }).waitFor();
    assert.equal(await toolLaunch.isEnabled(), true);
    await page.locator('[data-file-choice="agent"]').click();
    assert.equal(await agentRow.locator('.build-handoff-feedback[data-artifact-id="agent"]').innerText(), "");
    assert.equal(await agentLaunch.isDisabled(), true);

    pending.get("agent").resolve();
    await page.waitForFunction(() =>
      document.querySelector('.build-handoff-feedback[data-artifact-id="agent"]')
        ?.textContent.includes("Opened in Files"));
    fail.add("agent");
    await agentLaunch.click();
    await page.waitForFunction(() => document.querySelector('[data-files-launch][data-artifact-id="agent"]')?.disabled);
    pending.get("agent").resolve();
    await agentRow.getByRole("status").filter({ hasText: "Opened the worktree and file in VS Code instead." }).waitFor();
    assert.equal(await agentRow.locator("[data-editor-launch]").isEnabled(), true);
    assert.equal(await agentRow.locator("[data-files-launch]").count(), 0,
      "Unavailable Files falls back to the editor and no longer remains the default");
    await page.locator('[data-file-choice="tool"]').click();
    assert.match(await toolRow.locator('.build-handoff-feedback[data-artifact-id="tool"]').innerText(), /Opened in Files/,
      "Failure feedback cannot leak into another artifact");
    await toolRow.getByRole("button", { name: "Open with", exact: true }).click();
    await page.getByRole("menuitem", { name: "VS Code", exact: true }).click();
    const external = toolRow.getByRole("button", { name: "Edit in VS Code", exact: true });
    await toolRow.getByRole("status").filter({ hasText: /Opened the worktree and file in VS Code/ }).waitFor();
    await external.click();
    await page.waitForFunction(() => !document.querySelector('[data-editor-launch]')?.disabled);
    assert.deepEqual(editorRequests, [{ root: "/fixture", id: "agent" }, { root: "/fixture", id: "tool" }, { root: "/fixture", id: "tool" }],
      "Choosing an editor opens the exact file and makes it the next primary action");

    assert.equal(await page.locator("textarea,[contenteditable=true]").count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    for (const gate of pending.values()) gate.resolve();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

for (const status of [400, 503]) {
  test(`Build falls back from unavailable Files (${status}) and reports dual handoff failures`, {
    skip: !chromium && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const calls = [];
    let failEditor = false;
    let gate;
    const server = createServer((_request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end(withToolkitButtons(pageHtml()));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 380, height: 800 } });
      await installToolkitRoutes(page);
      await page.route("**/api/**", async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/build-workspace") return route.fulfill({ json: { artifacts: artifacts() } });
        calls.push({ path, ...route.request().postDataJSON() });
        if (path === "/api/open-build-file-canvas") {
          return route.fulfill({ status, json: { error: status === 400 ? "Source is outside the session working tree." : "Editor canvas unavailable." } });
        }
        assert.equal(path, "/api/open-build-file");
        gate = deferred();
        await gate.promise;
        return route.fulfill(failEditor ? { status: 500, json: { error: "Editor executable unavailable." } } : { json: { editorLabel: "VS Code" } });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const row = page.locator('.build-file[data-artifact="agent"]');
      const edit = row.getByRole("button", { name: "Edit in VS Code", exact: true });
      await edit.waitFor();
      assert.equal(await edit.innerText(), "Edit", "The primary label stays visible in compact panes");
      assert.equal(await edit.getAttribute("data-appearance"), "primary");
      assert.equal(await row.locator(".build-preview-badge .build-icon-preview").count(), 1);
      assert.match(await row.locator(".build-source-preview").getAttribute("title"), /Preview.*Edit.*VS Code/);
      for (const fail of [false, true]) {
        failEditor = fail;
        const prior = calls.length;
        await row.getByRole("button", { name: "Open with", exact: true }).click();
        await page.getByRole("menuitem", { name: "Files", exact: true }).click();
        await page.waitForFunction(() => document.querySelector("[data-editor-launch]")?.disabled === true);
        assert.equal(calls.length, prior + 2, "A failed Files request starts exactly one external handoff");
        assert.equal(await edit.isDisabled(), true);
        assert.equal(await row.getByRole("button", { name: "Open with", exact: true }).isDisabled(), true,
          "Neither destination can be relaunched during the fallback");
        gate.resolve();
        const feedback = row.getByRole(fail ? "alert" : "status");
        await feedback.filter({ hasText: fail ? "Editor executable unavailable." : "instead." }).waitFor();
        assert.match(await feedback.textContent(), status === 400 ? /outside the session working tree/ : /Editor canvas unavailable/);
        assert.equal(await edit.isEnabled(), true);
        assert.equal(await row.locator("[data-files-launch]").count(), 0);
        assert.equal(calls.length, prior + 2);
      }
      assert.ok(calls.every(call => call.root === "/fixture" && call.id === "agent"));
    } finally {
      gate?.resolve();
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    }
  });
}

test("Build follows shared editor settings without owning a picker or accepting stale workspace preferences", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const workspaceEditorSettings = { editorId: "vscode", editors };
  let workspaceGate;
  let selectedEditor = "vscode";
  const opened = [];
  const requests = [];
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(withToolkitButtons(pageHtml()));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push({ path, method: route.request().method() });
      if (path === "/api/build-workspace") {
        if (workspaceGate) {
          const current = workspaceGate;
          current.started.resolve();
          await current.reply.promise;
          await route.fulfill({ json: { artifacts: artifacts(), editorSettings: workspaceEditorSettings } });
          current.completed.resolve();
        } else {
          await route.fulfill({ json: { artifacts: artifacts(), editorSettings: workspaceEditorSettings } });
        }
      } else if (path === "/api/open-build-file") {
        const input = route.request().postDataJSON();
        opened.push(input);
        if (input.id === "tool") await route.fulfill({ status: 400, json: { error: "Cursor is unavailable." } });
        else await route.fulfill({ json: {
          outcome: "opened-in-editor", editorId: selectedEditor,
          editorLabel: editors.find((editor) => editor.id === selectedEditor)?.label,
        } });
      } else {
        throw new Error(`Unexpected route ${path}`);
      }
    });
    await installToolkitRoutes(page);

    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const launches = page.locator("[data-editor-launch]");
    const launchLabels = () => launches.evaluateAll(elements => elements.map(element => element.getAttribute("aria-label")));
    const agentRow = page.locator('.build-file[data-artifact="agent"]');
    await launches.first().waitFor();
    assert.equal(await page.locator(".build-discovery,[data-editor-select]").count(), 0);
    assert.deepEqual(await launchLabels(), ["Edit in VS Code"]);

    workspaceGate = { started: deferred(), reply: deferred(), completed: deferred() };
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await workspaceGate.started.promise;
    selectedEditor = "cursor";
    await page.evaluate((settings) => window.buildPanel.setEditorSettings({ settings, busy: true }),
      { editorId: "cursor", editors });
    assert.deepEqual(await launchLabels(), ["Edit in Cursor"]);
    assert.equal(await launches.first().isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Open with", exact: true }).isDisabled(), true,
      "The canonical split button is unavailable while its selected editor is being saved");
    await page.evaluate((settings) => window.buildPanel.setEditorSettings({ settings, busy: false }),
      { editorId: "cursor", editors });
    workspaceGate.reply.resolve();
    await workspaceGate.completed.promise;
    workspaceGate = undefined;
    assert.deepEqual(await launchLabels(), ["Edit in Cursor"],
      "A stale workspace response cannot replace a newer settings event");
    assert.equal(await launches.first().isEnabled(), true);
    await page.setViewportSize({ width: 380, height: 800 });
    await page.getByRole("button", { name: "Open with", exact: true }).click();
    assert.equal(await page.getByRole("menuitem", { name: "Cursor", exact: true }).isEnabled(), true,
      "The split menu follows the shared editor preference without adding an editor picker");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1000, height: 800 });

    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/open-build-file"),
      launches.first().click(),
    ]);
    assert.deepEqual(opened[0], { root: "/fixture", id: "agent" });
    await page.locator('[data-file-choice="tool"]').click();
    const toolLaunch = page.locator('[data-editor-launch][data-artifact-id="tool"]');
    await toolLaunch.click();
    await page.locator('.build-file[data-artifact="tool"] .build-handoff-feedback [role="alert"]')
      .filter({ hasText: "Cursor is unavailable." }).waitFor();
    assert.equal(await toolLaunch.isEnabled(), true);

    selectedEditor = "zed";
    await page.evaluate((settings) => window.buildPanel.setEditorSettings({ settings, busy: true }),
      { editorId: "zed", editors });
    assert.equal(await toolLaunch.getAttribute("aria-label"), "Edit in Zed");
    assert.equal(await toolLaunch.isDisabled(), true);
    await page.evaluate((settings) => window.buildPanel.setEditorSettings({ settings, busy: false }),
      { editorId: "zed", editors });
    assert.equal(await toolLaunch.isEnabled(), true);
    await page.locator('[data-file-choice="agent"]').click();
    assert.equal(await page.locator('[data-editor-launch][data-artifact-id="agent"]').getAttribute("aria-label"), "Edit in Zed");
    assert.equal(await agentRow.locator(".build-handoff-feedback").innerText(), "Opened the worktree and file in Cursor.",
      "Tool handoff failure does not replace another artifact's feedback");
    assert.equal(requests.some(({ path }) => path === "/api/editor-settings"), false,
      "Build does not own editor preference reads or writes");
    assert.deepEqual(errors, []);
  } finally {
    workspaceGate?.reply.resolve();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
