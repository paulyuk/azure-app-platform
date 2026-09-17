import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { buildDiffFixture } from "./build-diff-test-fixture.mjs";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";
import { renderThemeStyles } from "./studio-theme.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

const longContext = `const inventory = ${JSON.stringify("vehicle ".repeat(32))};`;

function reviewFixture(baseSha) {
  return {
    baseSha,
    additions: 2,
    deletions: 2,
    hunks: [{
      oldStart: 1, oldCount: 7, newStart: 1, newCount: 7,
      lines: [
        { kind: "context", oldLine: 1, newLine: 1, text: "line 1" },
        { kind: "context", oldLine: 2, newLine: 2, text: "line 2" },
        { kind: "context", oldLine: 3, newLine: 3, text: longContext },
        { kind: "removed", oldLine: 4, newLine: null, text: "old line 4" },
        { kind: "added", oldLine: null, newLine: 4, text: "new line 4" },
        { kind: "context", oldLine: 5, newLine: 5, text: "line 5" },
        { kind: "context", oldLine: 6, newLine: 6, text: "line 6" },
        { kind: "context", oldLine: 7, newLine: 7, text: "line 7" },
      ],
    }, {
      oldStart: 10, oldCount: 5, newStart: 10, newCount: 5,
      lines: [
        { kind: "context", oldLine: 10, newLine: 10, text: "line 10" },
        { kind: "context", oldLine: 11, newLine: 11, text: "line 11" },
        { kind: "removed", oldLine: 12, newLine: null, text: "old line 12" },
        { kind: "added", oldLine: null, newLine: 12, text: "new line 12" },
        { kind: "context", oldLine: 13, newLine: 13, text: "line 13" },
        { kind: "context", oldLine: 14, newLine: 14, text: "line 14" },
        { kind: "notice", oldLine: null, newLine: null, text: "No newline at end of file" },
      ],
    }],
  };
}

function panelHtml() {
  return `<!doctype html><html data-studio-theme="light"><style>
    body { margin:0; } #details { height:100vh; }
    ${renderThemeStyles()} ${BUILD_PANEL_CSS}
    </style><aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
      onRun() {}, onModel() {}, onStructure() {},
      request: async (path, options) => {
        const response = await fetch(path, options);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      }
    });
    panel.show();
    </script></html>`;
}

test("Build review replaces the editor with a themed unified diff and restores the live textarea", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifact = {
    id: "agent", title: "Agent source", path: "src/agent/main.py", description: "Agent implementation.",
    available: true, editable: true,
    content: [
      "line 1", "line 2", longContext, "old line 4", "line 5", "line 6", "line 7",
      "line 8", "line 9", "line 10", "line 11", "old line 12", "line 13", "line 14",
    ].join("\n"),
    sha: "base",
  };
  const diffRequests = [];
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(panelHtml());
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") await route.fulfill({ json: { artifacts: [artifact] } });
      else if (path === "/api/build-diff") {
        diffRequests.push(route.request().postDataJSON());
        await route.fulfill({ json: reviewFixture("base") });
      } else throw new Error("Unexpected route " + path);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const card = page.locator('[data-artifact="agent"]');
    const editor = card.locator('textarea[aria-label="Agent source source"]');
    const draft = artifact.content.replace("old line 4", "new line 4").replace("old line 12", "new line 12");
    await editor.fill(draft);
    await editor.evaluate((element) => {
      element.setSelectionRange(7, 17, "forward");
      element.scrollTop = 12;
      element.scrollLeft = 4;
      element.dataset.identityProbe = "live-textarea";
    });
    const expectedEditorState = await editor.evaluate((element) => [
      element.selectionStart, element.selectionEnd, element.selectionDirection,
      element.scrollTop, element.scrollLeft,
    ]);
    await card.getByRole("button", { name: "Review changes" }).click();
    const diff = card.getByRole("region", { name: "Unified source changes" });
    await diff.waitFor();
    assert.deepEqual(diffRequests[0], {
      root: "/fixture", id: "agent", baseSha: "base", content: draft,
    });
    assert.equal(await editor.count(), 1);
    assert.equal(await editor.isHidden(), true);
    assert.equal(await editor.getAttribute("data-identity-probe"), "live-textarea");
    assert.equal(await card.getByText("Current source", { exact: true }).count(), 0);
    assert.equal(await card.getByText("Proposed source", { exact: true }).count(), 0);
    assert.equal(await card.locator(".build-review pre").count(), 0);
    assert.equal(await card.getByText("+2 additions", { exact: true }).count(), 1);
    assert.equal(await card.getByText("-2 deletions", { exact: true }).count(), 1);
    assert.deepEqual(await card.locator(".build-diff-hunk-header").allTextContents(), [
      "@@ -1,7 +1,7 @@", "@@ -10,5 +10,5 @@",
    ]);
    assert.equal(await card.getByText("2 unchanged lines collapsed", { exact: true }).count(), 1);
    assert.equal(await card.locator('[data-diff-kind="context"]').count(), 10);
    assert.equal(await card.locator('[data-diff-kind="removed"]').count(), 2);
    assert.equal(await card.locator('[data-diff-kind="added"]').count(), 2);
    assert.equal(await card.locator('[data-diff-kind="notice"]').count(), 1);
    const removed = card.locator('[data-diff-kind="removed"]').first();
    const added = card.locator('[data-diff-kind="added"]').first();
    assert.deepEqual(await removed.locator(".build-diff-line-number").allTextContents(), ["4", ""]);
    assert.deepEqual(await added.locator(".build-diff-line-number").allTextContents(), ["", "4"]);
    assert.equal(await removed.locator(".build-diff-marker").textContent(), "-");
    assert.equal(await added.locator(".build-diff-marker").textContent(), "+");
    assert.equal(await card.locator('[data-diff-kind="notice"] .build-diff-marker').textContent(), "\\");
    const lightBackgrounds = [
      await removed.evaluate((element) => getComputedStyle(element).backgroundColor),
      await added.evaluate((element) => getComputedStyle(element).backgroundColor),
    ];
    assert.notEqual(lightBackgrounds[0], lightBackgrounds[1]);
    await page.locator("html").evaluate((element) => { element.dataset.studioTheme = "dark"; });
    const darkBackgrounds = [
      await removed.evaluate((element) => getComputedStyle(element).backgroundColor),
      await added.evaluate((element) => getComputedStyle(element).backgroundColor),
    ];
    assert.notEqual(darkBackgrounds[0], darkBackgrounds[1]);
    assert.notDeepEqual(darkBackgrounds, lightBackgrounds);

    await card.getByRole("button", { name: "Back to editing" }).click();
    await page.waitForFunction(() => document.querySelector('[data-artifact="agent"] textarea') === document.activeElement);
    assert.equal(await editor.isVisible(), true);
    assert.equal(await editor.inputValue(), draft);
    assert.equal(await editor.getAttribute("data-identity-probe"), "live-textarea");
    assert.deepEqual(await editor.evaluate((element) => [
      element.selectionStart, element.selectionEnd, element.selectionDirection,
      element.scrollTop, element.scrollLeft,
    ]), expectedEditorState);

    await card.getByRole("button", { name: "Review changes" }).click();
    await diff.waitFor();
    await page.locator("#details").evaluate((element) => { element.style.width = "420px"; });
    await page.waitForFunction(() => document.querySelector(".build-workspace")?.dataset.compact === "true");
    assert.ok(await diff.evaluate((element) => element.scrollWidth > element.clientWidth));
    assert.ok(await page.locator("#details").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Build review keeps failures and stale requests out of the diff and preserves newer edits during save", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  let artifact = {
    id: "agent", title: "Agent source", path: "src/agent/main.py", description: "Agent implementation.",
    available: true, editable: true, content: "original", sha: "base",
  };
  let diffFailure = "Diff service unavailable.";
  let diffGate = Promise.resolve();
  let diffStarted;
  let releaseDiff;
  let saveGate = Promise.resolve();
  let saveStarted;
  let releaseSave;
  const diffRequests = [];
  const writes = [];
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(panelHtml());
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") {
        await route.fulfill({ json: { artifacts: [artifact] } });
      } else if (path === "/api/build-diff") {
        const input = route.request().postDataJSON();
        diffRequests.push(input);
        diffStarted?.();
        await diffGate;
        if (diffFailure) await route.fulfill({ status: 500, json: { error: diffFailure } });
        else await route.fulfill({ json: buildDiffFixture({
          baseSha: input.baseSha, before: artifact.content, after: input.content,
        }) });
      } else if (path === "/api/build-file") {
        const input = route.request().postDataJSON();
        writes.push(input);
        saveStarted?.();
        await saveGate;
        artifact = { ...artifact, content: input.content, sha: `saved-${writes.length}` };
        await route.fulfill({ json: artifact });
      } else throw new Error("Unexpected route " + path);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const card = page.locator('[data-artifact="agent"]');
    const editor = card.locator('textarea[aria-label="Agent source source"]');
    await editor.fill("first draft");
    await card.getByRole("button", { name: "Review changes" }).click();
    await card.getByRole("alert").filter({ hasText: "Could not prepare review: Diff service unavailable." }).waitFor();
    assert.equal(await editor.isVisible(), true);
    assert.equal(await editor.inputValue(), "first draft");
    assert.equal(await card.locator(".build-diff").count(), 0);
    assert.equal(await card.getByRole("button", { name: "Save reviewed changes" }).count(), 0);

    diffFailure = undefined;
    const started = new Promise((resolve) => { diffStarted = resolve; });
    diffGate = new Promise((resolve) => { releaseDiff = resolve; });
    await editor.fill("review request draft");
    await card.getByRole("button", { name: "Review changes" }).click();
    await started;
    await editor.fill("newer while review loads");
    releaseDiff();
    await card.getByRole("alert").filter({ hasText: /draft changed while the review was loading/ }).waitFor();
    assert.equal(await editor.isVisible(), true);
    assert.equal(await editor.inputValue(), "newer while review loads");
    assert.equal(await card.locator(".build-diff").count(), 0);
    assert.equal(diffRequests.at(-1).content, "review request draft");

    diffGate = Promise.resolve();
    diffStarted = undefined;
    await card.getByRole("button", { name: "Review changes" }).click();
    await card.getByRole("region", { name: "Unified source changes" }).waitFor();
    await editor.evaluate((element) => {
      element.value = "changed after diff";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await card.getByRole("button", { name: "Save reviewed changes" }).click();
    await card.getByRole("alert").filter({ hasText: /Review the latest draft again before saving/ }).waitFor();
    assert.equal(writes.length, 0);
    assert.equal(await editor.isVisible(), true);
    assert.equal(await editor.inputValue(), "changed after diff");
    await card.getByRole("button", { name: "Review changes" }).click();
    await card.getByRole("region", { name: "Unified source changes" }).waitFor();
    const reviewed = "changed after diff";
    const savePending = new Promise((resolve) => { saveStarted = resolve; });
    saveGate = new Promise((resolve) => { releaseSave = resolve; });
    const back = card.getByRole("button", { name: "Back to editing" });
    await card.getByRole("button", { name: "Save reviewed changes" }).click();
    await savePending;
    assert.equal(await back.isEnabled(), true);
    assert.equal(await page.locator('[data-file-id="agent"]').getAttribute("aria-label"), "src/agent/main.py, Saving");
    await back.click();
    await page.waitForFunction(() => document.querySelector('[data-artifact="agent"] textarea') === document.activeElement);
    await editor.fill("newest unsaved draft");
    const saved = page.waitForResponse((response) => response.url().endsWith("/api/build-file"));
    releaseSave();
    await saved;
    await card.getByText(/Your newer edits are still unsaved/).waitFor();
    assert.deepEqual(writes[0], {
      root: "/fixture", id: "agent", baseSha: "base", content: reviewed,
    });
    assert.equal(await editor.isVisible(), true);
    assert.equal(await editor.inputValue(), "newest unsaved draft");
    assert.match(await page.locator('[data-file-id="agent"]').getAttribute("aria-label"), /Unsaved/);
    assert.deepEqual(errors, []);
  } finally {
    releaseDiff?.();
    releaseSave?.();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
