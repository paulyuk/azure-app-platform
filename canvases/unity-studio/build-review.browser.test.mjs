import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { buildDiffFixture } from "./build-diff-test-fixture.mjs";
import { BUILD_PANEL_CSS, createBuildPanel } from "./build-panel.mjs";
import { BUILD_REVIEW_SCRIPT } from "./build-review-editor.mjs";
import { BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";
import { renderThemeStyles } from "./studio-theme.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

const modifier = process.platform === "darwin" ? "Meta" : "Control";
const documentStart = process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home";
const documentEnd = process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End";
const redoKey = process.platform === "darwin" ? "Meta+Shift+z"
  : process.platform === "win32" ? "Control+y" : "Control+Shift+z";
const longContext = `const inventory = ${JSON.stringify("vehicle ".repeat(32))};`;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function sourceLines() {
  return Array.from({ length: 30 }, (_, index) => {
    const line = index + 1;
    if (line === 4) return "old line 4";
    if (line === 15) return longContext;
    if (line === 25) return "old line 25";
    return `line ${line}`;
  });
}

function detailedReviewFixture(baseSha) {
  const lines = sourceLines();
  return {
    baseSha,
    additions: 2,
    deletions: 2,
    hunks: [{
      oldStart: 1, oldCount: 7, newStart: 1, newCount: 7,
      lines: [
        ...lines.slice(0, 3).map((text, index) => ({ kind: "context", oldLine: index + 1, newLine: index + 1, text })),
        { kind: "removed", oldLine: 4, newLine: null, text: lines[3] },
        { kind: "added", oldLine: null, newLine: 4, text: "new line 4" },
        ...lines.slice(4, 7).map((text, index) => ({ kind: "context", oldLine: index + 5, newLine: index + 5, text })),
      ],
    }, {
      oldStart: 22, oldCount: 9, newStart: 22, newCount: 9,
      lines: [
        ...lines.slice(21, 24).map((text, index) => ({ kind: "context", oldLine: index + 22, newLine: index + 22, text })),
        { kind: "removed", oldLine: 25, newLine: null, text: lines[24] },
        { kind: "added", oldLine: null, newLine: 25, text: "new line 25" },
        ...lines.slice(25).map((text, index) => ({ kind: "context", oldLine: index + 26, newLine: index + 26, text })),
        { kind: "notice", oldLine: null, newLine: null, text: "No newline at end of file" },
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
    ${BUILD_REVIEW_SCRIPT}
    const panel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture", isActive: () => true, syntax: buildSyntax,
      createReviewEditor: createBuildReview,
      onRun() {}, onModel() {}, onStructure() {},
      request: async (path, options) => {
        const response = await fetch(path, options);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      }
    });
    window.buildPanel = panel;
    panel.show();
    </script></html>`;
}

async function selectionOffsets(content) {
  return content.evaluate((element) => {
    const selection = element.ownerDocument.getSelection();
    if (!selection?.rangeCount || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return null;
    const offset = (node, value) => {
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      range.setEnd(node, value);
      return range.toString().length;
    };
    return {
      anchor: offset(selection.anchorNode, selection.anchorOffset),
      focus: offset(selection.focusNode, selection.focusOffset),
    };
  });
}

test("Build review uses an editable unified CodeMirror while retaining the native source editor", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const savedLines = sourceLines();
  const draftLines = [...savedLines];
  draftLines[3] = "new line 4";
  draftLines[24] = "new line 25";
  const artifact = {
    id: "agent", title: "Agent source", path: "src/agent/main.py", description: "Agent implementation.",
    available: true, editable: true,
    content: savedLines.join("\r\n"),
    sha: "base",
  };
  const draft = draftLines.join("\n");
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
        await route.fulfill({ json: detailedReviewFixture("base") });
      } else throw new Error("Unexpected route " + path);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const card = page.locator('[data-artifact="agent"]');
    const editor = card.locator('textarea[aria-label="Agent source source"]');
    await editor.fill(draft);
    await editor.evaluate((element) => {
      element.setSelectionRange(12, 28, "forward");
      element.scrollTop = 36;
      element.scrollLeft = 5;
      element.dataset.identityProbe = "live-textarea";
    });
    const expectedEditorState = await editor.evaluate((element) => [
      element.selectionStart, element.selectionEnd, element.selectionDirection,
      element.scrollTop, element.scrollLeft,
    ]);

    await card.getByRole("button", { name: "Review changes" }).click();
    const diff = card.getByRole("region", { name: "Unified source changes" });
    const reviewEditor = card.locator('.cm-content[contenteditable="true"][aria-label="Agent source draft review"]');
    await reviewEditor.waitFor();
    assert.deepEqual(diffRequests[0], {
      root: "/fixture", id: "agent", baseSha: "base", content: draft,
    });
    assert.equal(await editor.count(), 1);
    assert.equal(await editor.isHidden(), true);
    assert.equal(await editor.getAttribute("data-identity-probe"), "live-textarea");
    assert.equal(await card.locator(".cm-editor").count(), 1);
    assert.equal(await reviewEditor.getAttribute("role"), "textbox");
    assert.equal(await card.getByText("+2 additions", { exact: true }).count(), 1);
    assert.equal(await card.getByText("-2 deletions", { exact: true }).count(), 1);
    assert.equal(await card.locator(".build-diff-hunk-header, .build-diff-row").count(), 0);

    const deleted = await card.locator(".cm-deletedChunk .cm-deletedLine").allTextContents();
    assert.ok(deleted.some((line) => line.includes("old line 4")));
    assert.ok(deleted.some((line) => line.includes("old line 25")));
    assert.equal(await card.locator(".cm-deletedChunk [contenteditable=true], .cm-deletedChunk input, .cm-deletedChunk textarea").count(), 0);
    assert.equal(await card.locator(".cm-chunkButtons, button[name=accept], button[name=reject]").count(), 0);
    const changed = await card.locator(".cm-changedLine").allTextContents();
    assert.ok(changed.some((line) => line.includes("new line 4")));
    assert.ok(changed.some((line) => line.includes("new line 25")));
    assert.ok(await card.locator(".cm-deletedText").count() > 0);
    assert.ok(await card.locator(".cm-changedText").count() > 0);
    const channels = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const deletedBackground = channels(await card.locator(".cm-deletedChunk").first()
      .evaluate((element) => getComputedStyle(element).backgroundColor));
    const changedBackground = channels(await card.locator(".cm-changedLine").first()
      .evaluate((element) => getComputedStyle(element).backgroundColor));
    const deletedCharacter = channels(await card.locator(".cm-deletedText").first()
      .evaluate((element) => getComputedStyle(element).backgroundColor));
    const changedCharacter = channels(await card.locator(".cm-changedText").first()
      .evaluate((element) => getComputedStyle(element).backgroundColor));
    assert.ok(deletedBackground[0] > deletedBackground[1], "Deleted chunks use the red review treatment");
    assert.ok(changedBackground[1] > changedBackground[0], "Changed lines use the green review treatment");
    assert.notDeepEqual(deletedCharacter, changedCharacter);

    const originalNumbers = await card.locator(".build-review-original-gutter .cm-gutterElement").allTextContents();
    const proposedNumbers = await card.locator(".cm-lineNumbers .cm-gutterElement").allTextContents();
    assert.ok(originalNumbers.some((value) => value.trim() === "4"));
    assert.ok(originalNumbers.some((value) => value.trim() === "25"));
    assert.ok(proposedNumbers.some((value) => value.trim() === "4"));
    assert.ok(proposedNumbers.some((value) => value.trim() === "25"));
    const markers = (await card.locator(".build-review-change-gutter .cm-gutterElement").allTextContents()).map((value) => value.trim());
    assert.ok(markers.includes("-"));
    assert.ok(markers.includes("+"));

    assert.equal(await card.locator(".build-diff-notice").textContent(),
      "Draft line endings are LF; the saved file contains CRLF. Saved file and draft have no final newline.");
    assert.equal(await card.locator(".cm-editor .build-diff-notice").count(), 0);

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
    await reviewEditor.waitFor();
    const collapsed = card.locator(".cm-collapsedLines");
    await collapsed.waitFor();
    assert.match(await collapsed.textContent(), /^\d+ unchanged lines$/);
    assert.equal(await collapsed.getAttribute("role"), "button");
    assert.match(await collapsed.getAttribute("aria-label"), /^Expand \d+ unchanged lines$/);
    const visibleLines = await card.locator(".cm-content > .cm-line").count();
    await collapsed.focus();
    await collapsed.press("Enter");
    await page.waitForFunction(() => !document.querySelector(".cm-collapsedLines"));
    assert.equal(await reviewEditor.evaluate((element) => element === document.activeElement), true);
    assert.ok(await card.locator(".cm-content > .cm-line").count() > visibleLines);

    await page.locator("#details").evaluate((element) => { element.style.width = "420px"; });
    await page.waitForFunction(() => document.querySelector(".build-workspace")?.dataset.compact === "true");
    const scroller = diff.locator(".cm-scroller");
    assert.ok(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth));
    assert.ok(await page.locator("#details").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));

    await card.getByRole("button", { name: "Back to editing" }).click();
    await editor.waitFor({ state: "visible" });
    await card.getByRole("button", { name: "Review changes" }).click();
    const spaceCollapsed = card.locator(".cm-collapsedLines");
    await spaceCollapsed.waitFor();
    await spaceCollapsed.focus();
    await spaceCollapsed.press("Space");
    await page.waitForFunction(() => !document.querySelector(".cm-collapsedLines"));
    assert.equal(await reviewEditor.evaluate((element) => element === document.activeElement), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Build review preserves real edits, history and the latest validation/save snapshot across races", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const artifacts = [{
    id: "agent", title: "Agent source", path: "src/agent/main.py", description: "Agent implementation.",
    available: true, editable: true, content: "alpha\nbeta\nomega\n", sha: "base",
  }, {
    id: "config", title: "Configuration", path: "config/app.json", description: "App configuration.",
    available: true, editable: true, content: '{"enabled":true}\n', sha: "config-base",
  }];
  const diffRequests = [];
  const writes = [];
  const diffGates = new Map();
  const allDiffGates = [];
  let saveGate;
  const holdDiff = (content) => {
    const gate = { started: deferred(), reply: deferred(), completed: deferred() };
    diffGates.set(content, gate);
    allDiffGates.push(gate);
    return gate;
  };
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(panelHtml());
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 980, height: 760 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") {
        await route.fulfill({ json: { artifacts } });
        return;
      }
      const input = route.request().postDataJSON();
      if (path === "/api/build-diff") {
        diffRequests.push(input);
        const artifact = artifacts.find((item) => item.id === input.id);
        const before = artifact.content;
        const gate = diffGates.get(input.content);
        if (gate) {
          diffGates.delete(input.content);
          gate.started.resolve();
          const result = await gate.reply.promise;
          if (result?.error) {
            await route.fulfill({ status: result.status ?? 500, json: { error: result.error } });
            gate.completed.resolve();
            return;
          }
          await route.fulfill({ json: result?.diff ?? buildDiffFixture({
            baseSha: input.baseSha, before, after: input.content,
          }) });
          gate.completed.resolve();
          return;
        }
        await route.fulfill({ json: buildDiffFixture({
          baseSha: input.baseSha, before, after: input.content,
        }) });
        return;
      }
      if (path === "/api/build-file") {
        writes.push(input);
        const gate = saveGate;
        gate?.started.resolve();
        const failure = gate ? await gate.reply.promise : undefined;
        if (failure?.error) {
          await route.fulfill({ status: failure.status ?? 500, json: { error: failure.error } });
        } else {
          const artifact = artifacts.find((item) => item.id === input.id);
          Object.assign(artifact, { content: input.content, sha: `saved-${writes.length}` });
          await route.fulfill({ json: artifact });
        }
        gate?.completed.resolve();
        return;
      }
      throw new Error("Unexpected route " + path);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const card = page.locator('[data-artifact="agent"]');
    const source = card.locator('textarea[aria-label="Agent source source"]');
    const initialDraft = "alpha changed\nbeta\nomega\n";
    await source.fill(initialDraft);
    await card.getByRole("button", { name: "Review changes" }).click();
    const region = card.getByRole("region", { name: "Unified source changes" });
    const reviewEditor = card.locator('.cm-content[contenteditable="true"][aria-label="Agent source draft review"]');
    const save = card.getByRole("button", { name: "Save reviewed changes" });
    const waitForSaveEnabled = () => page.waitForFunction(() => {
      const candidate = [...document.querySelectorAll("button")].find((button) => button.textContent === "Save reviewed changes");
      return candidate && !candidate.disabled;
    });
    await reviewEditor.waitFor();
    await waitForSaveEnabled();
    await card.locator(".cm-editor").evaluate((element) => { element.dataset.identityProbe = "retained-review"; });

    const typedDraft = initialDraft + "第二段落 😀\nπ = \"東京\"\n";
    const successGate = holdDiff(typedDraft);
    const requestsBeforeTyping = diffRequests.length;
    await reviewEditor.click();
    await page.keyboard.press(documentEnd);
    await page.keyboard.insertText("第二段落 😀\nπ = \"東京\"\n");
    await page.waitForFunction((expected) =>
      document.querySelector('[data-artifact="agent"] textarea')?.value === expected, typedDraft);
    assert.equal(await save.isDisabled(), true);
    await card.getByText("Checking changes...", { exact: true }).waitFor();
    await page.waitForTimeout(120);
    assert.equal(diffRequests.length, requestsBeforeTyping, "Review revalidation is debounced");
    await successGate.started.promise;
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    const successfulSelection = await selectionOffsets(reviewEditor);
    successGate.reply.resolve({});
    await successGate.completed.promise;
    await waitForSaveEnabled();
    assert.deepEqual(await selectionOffsets(reviewEditor), successfulSelection);
    assert.equal(await card.locator('.cm-editor[data-identity-probe="retained-review"]').count(), 1);

    await page.keyboard.press(`${modifier}+z`);
    await page.waitForFunction((expected) =>
      document.querySelector('[data-artifact="agent"] textarea')?.value === expected, initialDraft);
    await page.keyboard.press(redoKey);
    await page.waitForFunction((expected) =>
      document.querySelector('[data-artifact="agent"] textarea')?.value === expected, typedDraft);
    await waitForSaveEnabled();

    const failedDraft = typedDraft + "failed validation line\n";
    const failedGate = holdDiff(failedDraft);
    await reviewEditor.click();
    await page.keyboard.press(documentEnd);
    await page.keyboard.insertText("failed validation line\n");
    await failedGate.started.promise;
    assert.equal(await save.isDisabled(), true);
    await card.getByText("Checking changes...", { exact: true }).waitFor();
    const failedSelection = await selectionOffsets(reviewEditor);
    failedGate.reply.resolve({ error: "Diff service unavailable." });
    await failedGate.completed.promise;
    await card.getByRole("alert").filter({ hasText: "Diff service unavailable." }).waitFor();
    assert.equal(await region.isVisible(), true);
    assert.equal(await reviewEditor.getAttribute("contenteditable"), "true");
    assert.equal(await save.isDisabled(), true);
    assert.deepEqual(await selectionOffsets(reviewEditor), failedSelection);
    assert.equal(await card.locator('.cm-editor[data-identity-probe="retained-review"]').count(), 1);
    const retry = card.getByRole("button", { name: "Retry review" });
    await retry.click();
    await waitForSaveEnabled();
    assert.equal(await retry.count(), 0);
    assert.deepEqual(await selectionOffsets(reviewEditor), failedSelection);

    const oldDraft = failedDraft + "old request line\n";
    const oldGate = holdDiff(oldDraft);
    await reviewEditor.click();
    await page.keyboard.press(documentEnd);
    await page.keyboard.insertText("old request line\n");
    await oldGate.started.promise;
    const latestDraft = oldDraft + "latest request line\n";
    const latestGate = holdDiff(latestDraft);
    await page.keyboard.insertText("latest request line\n");
    await latestGate.started.promise;
    const latestSelection = await selectionOffsets(reviewEditor);
    latestGate.reply.resolve({});
    await latestGate.completed.promise;
    await waitForSaveEnabled();
    oldGate.reply.resolve({ error: "Old response must be ignored." });
    await oldGate.completed.promise;
    assert.equal(await card.getByRole("alert").filter({ hasText: "Old response must be ignored." }).count(), 0);
    assert.equal(await save.isEnabled(), true);
    assert.equal(await source.inputValue(), latestDraft);
    assert.deepEqual(await selectionOffsets(reviewEditor), latestSelection);
    assert.equal(await card.locator('.cm-editor[data-identity-probe="retained-review"]').count(), 1);

    await reviewEditor.click();
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.insertText(artifacts[0].content);
    await page.waitForFunction(() => {
      const summary = document.querySelector(".build-review-summary");
      return summary?.textContent === "No changes to save.";
    });
    assert.equal(await region.isVisible(), true);
    assert.equal(await reviewEditor.getAttribute("contenteditable"), "true");
    assert.equal(await save.isDisabled(), true);
    assert.equal(await card.getByRole("button", { name: "Retry review" }).count(), 0);

    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.insertText(latestDraft);
    await waitForSaveEnabled();
    const conflictDraft = latestDraft + "conflict probe\n";
    const conflictGate = holdDiff(conflictDraft);
    await page.keyboard.press(documentEnd);
    await page.keyboard.insertText("conflict probe\n");
    await conflictGate.started.promise;
    const conflictSelection = await selectionOffsets(reviewEditor);
    conflictGate.reply.resolve({ diff: buildDiffFixture({
      baseSha: "external-sha", before: artifacts[0].content, after: conflictDraft,
    }) });
    await conflictGate.completed.promise;
    await card.getByRole("alert").filter({ hasText: /saved file changed/i }).waitFor();
    assert.equal(await save.isDisabled(), true);
    assert.equal(await region.isVisible(), true);
    assert.equal(await reviewEditor.getAttribute("contenteditable"), "true");
    assert.deepEqual(await selectionOffsets(reviewEditor), conflictSelection);
    await card.getByRole("button", { name: "Retry review" }).click();
    await waitForSaveEnabled();

    saveGate = { started: deferred(), reply: deferred(), completed: deferred() };
    await save.click();
    await saveGate.started.promise;
    assert.deepEqual(writes[0], {
      root: "/fixture", id: "agent", baseSha: "base", content: conflictDraft,
    });
    saveGate.reply.resolve({ error: "Write failed after review." });
    await saveGate.completed.promise;
    await card.getByRole("alert").filter({ hasText: "Write failed after review." }).waitFor();
    assert.equal(await save.isDisabled(), true);
    assert.equal(await card.getByText("Recheck changes before retrying.", { exact: true }).count(), 1);
    assert.equal(await card.getByRole("button", { name: "Retry review" }).isVisible(), true);
    await card.getByRole("button", { name: "Retry review" }).click();
    await waitForSaveEnabled();

    saveGate = { started: deferred(), reply: deferred(), completed: deferred() };
    await save.click();
    await saveGate.started.promise;
    assert.deepEqual(writes[1], {
      root: "/fixture", id: "agent", baseSha: "base", content: conflictDraft,
    });
    assert.equal(await card.getByRole("button", { name: "Back to editing" }).isEnabled(), true);
    assert.equal(await save.isDisabled(), true);

    const newerDraft = conflictDraft + "newer during save 🧪\n";
    const newerGate = holdDiff(newerDraft);
    await reviewEditor.click();
    await page.keyboard.press(documentEnd);
    await page.keyboard.insertText("newer during save 🧪\n");
    await page.waitForFunction((expected) =>
      document.querySelector('[data-artifact="agent"] textarea')?.value === expected, newerDraft);
    await newerGate.started.promise;
    saveGate.reply.resolve({});
    await saveGate.completed.promise;
    await source.waitFor({ state: "visible" });
    assert.equal(await source.inputValue(), newerDraft);
    assert.match(await page.locator('[data-file-id="agent"]').getAttribute("aria-label"), /Unsaved/);
    newerGate.reply.resolve({});
    await newerGate.completed.promise;
    assert.equal(await card.getByRole("alert").filter({ hasText: /saved file changed/i }).count(), 0);

    await page.locator('[data-file-id="config"]').click();
    const configSource = page.locator('[data-artifact="config"] textarea[aria-label="Configuration source"]');
    await configSource.fill('{"enabled":false}\n');
    await page.locator('[data-file-id="agent"]').click();
    await source.waitFor({ state: "visible" });
    assert.equal(await source.inputValue(), newerDraft);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await source.waitFor({ state: "visible" });
    assert.equal(await page.locator('[data-file-id="agent"]').getAttribute("aria-current"), "true");
    assert.equal(await source.inputValue(), newerDraft);
    await card.getByRole("button", { name: "Review changes" }).click();
    await reviewEditor.waitFor();
    assert.deepEqual(diffRequests.at(-1), {
      root: "/fixture", id: "agent", baseSha: "saved-2", content: newerDraft,
    });
    await reviewEditor.focus();
    await page.keyboard.press(documentStart);
    for (let index = 0; index < 5; index++) await page.keyboard.press("ArrowRight");
    for (let index = 0; index < 5; index++) await page.keyboard.press("Shift+ArrowLeft");
    await card.getByRole("button", { name: "Back to editing" }).click();
    await page.waitForFunction(() =>
      document.querySelector('[data-artifact="agent"] textarea') === document.activeElement);
    assert.deepEqual(await source.evaluate((element) => [
      element.selectionStart, element.selectionEnd, element.selectionDirection,
    ]), [0, 5, "backward"]);

    await card.getByRole("button", { name: "Review changes" }).click();
    await reviewEditor.waitFor();
    const disposalDraft = newerDraft + "dispose pending validation\n";
    const disposalGate = holdDiff(disposalDraft);
    await reviewEditor.click();
    await page.keyboard.press(documentEnd);
    await page.keyboard.insertText("dispose pending validation\n");
    await disposalGate.started.promise;
    assert.equal(await source.inputValue(), disposalDraft);
    const detachedReview = await reviewEditor.elementHandle();
    assert.ok(detachedReview);
    await page.evaluate(() => window.buildPanel.hide());
    disposalGate.reply.resolve({});
    await disposalGate.completed.promise;
    assert.equal(await card.getByText("Checking changes...", { exact: true }).count(), 1);
    assert.equal(await reviewEditor.count(), 0);
    await detachedReview.evaluate((element) => {
      if (element.isConnected) throw new Error("The disposed review editor is still connected.");
      element.textContent = "detached editor mutation";
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "mutation" }));
    });
    await page.waitForTimeout(50);
    assert.equal(await source.inputValue(), disposalDraft);
    await detachedReview.dispose();
    assert.deepEqual(errors, []);
  } finally {
    for (const gate of allDiffGates) gate.reply.resolve({});
    saveGate?.reply.resolve({});
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
