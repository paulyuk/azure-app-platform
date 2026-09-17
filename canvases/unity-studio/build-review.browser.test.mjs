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
const browserOptions = { skip: !chromium && "Install src/web dependencies to run browser coverage." };

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function withPanel(artifacts, routeApi, action) {
  const html = `<!doctype html><html data-studio-theme="light"><style>
    body { margin:0; } #details { height:100vh; }
    ${renderThemeStyles()} ${BUILD_PANEL_CSS}
    </style><aside id="details" data-mode="build"></aside><script>
    ${BUILD_SYNTAX_SCRIPT}
    window.panelActive = true;
    window.buildPanel = (${createBuildPanel.toString()})({
      container: document.querySelector("#details"), root: "/fixture",
      isActive: () => window.panelActive, syntax: buildSyntax,
      onRun() {}, onModel() {},
      request: async (path, options) => {
        const response = await fetch(path, options);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      }
    });
    window.buildPanel.show();
    </script></html>`;
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/build-workspace") await route.fulfill({ json: { artifacts } });
      else await routeApi(route, path, route.request().postDataJSON());
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator(".build-source-editor textarea").waitFor();
    await action(page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

function agent(content = "alpha\nbeta\nomega\n") {
  return {
    id: "agent", title: "Agent instructions", path: "src/agent/prompts/system.md",
    customizationArea: "behavior", available: true, editable: true, content, sha: "base",
  };
}

test("Build shows read-only unified hunks and restores the same native draft, selection and scrolling", browserOptions, async () => {
  const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);
  lines[25] = "Long unchanged context: " + "inventory ".repeat(70);
  const artifact = agent(lines.join("\r\n"));
  const draftLines = [...lines];
  draftLines[3] = 'new line 4 <img src=x onerror="window.injected=true">';
  draftLines[24] = "new line 25";
  const draft = draftLines.join("\n");
  const requests = [];
  const context = (start, end) => lines.slice(start - 1, end).map((text, index) => ({
    kind: "context", oldLine: start + index, newLine: start + index, text,
  }));
  const changed = (line) => [
    { kind: "removed", oldLine: line, newLine: null, text: lines[line - 1] },
    { kind: "added", oldLine: null, newLine: line, text: draftLines[line - 1] },
  ];
  await withPanel([artifact], async (route, path, input) => {
    assert.equal(path, "/api/build-diff");
    requests.push(input);
    await route.fulfill({ json: {
      baseSha: "base", additions: 2, deletions: 2, hunks: [
        { oldStart: 1, oldCount: 7, newStart: 1, newCount: 7, lines: [...context(1, 3), ...changed(4), ...context(5, 7)] },
        { oldStart: 22, oldCount: 9, newStart: 22, newCount: 9, lines: [
          ...context(22, 24), ...changed(25), ...context(26, 30),
          { kind: "notice", oldLine: null, newLine: null, text: "No newline at end of file" },
        ] },
      ],
    } });
  }, async (page) => {
    const source = page.locator(".build-source-editor textarea");
    const review = page.getByRole("button", { name: "Review changes", exact: true });
    const diff = page.getByRole("region", { name: "Unified source changes" });
    await source.fill(draft);
    await source.evaluate((element) => {
      element.setSelectionRange(12, 28, "backward");
      element.scrollTop = 36;
      element.scrollLeft = 5;
      element.dataset.identityProbe = "retained";
    });
    const editorState = () => source.evaluate((element) => [
      element.selectionStart, element.selectionEnd, element.selectionDirection, element.scrollTop, element.scrollLeft,
    ]);
    const expected = await editorState();
    await review.click();
    await diff.waitFor();
    assert.deepEqual(requests[0], { root: "/fixture", id: "agent", baseSha: "base", content: draft });
    assert.equal(await source.isHidden(), true);
    assert.equal(await source.count(), 1);
    assert.equal(await page.locator('[data-identity-probe="retained"]').count(), 1);
    assert.equal(await diff.locator("textarea,input,[contenteditable=true]").count(), 0);
    assert.equal(await page.locator(".cm-editor").count(), 0);
    assert.equal(await diff.locator("img").count(), 0);
    assert.equal(await page.getByText("+2 additions", { exact: true }).count(), 1);
    assert.equal(await page.getByText("-2 deletions", { exact: true }).count(), 1);
    assert.deepEqual(await diff.locator(".build-diff-hunk-header").allTextContents(), ["@@ -1,7 +1,7 @@", "@@ -22,9 +22,9 @@"]);
    assert.equal(await diff.locator(".build-diff-gap").textContent(), "14 unchanged lines omitted");
    assert.deepEqual(await diff.locator('[data-diff-kind="removed"] .build-diff-marker').allTextContents(), ["-", "-"]);
    assert.deepEqual(await diff.locator('[data-diff-kind="added"] .build-diff-marker').allTextContents(), ["+", "+"]);
    assert.deepEqual(await diff.locator('[data-diff-kind="removed"] .build-diff-line-number').allTextContents(), ["4", "", "25", ""]);
    assert.deepEqual(await diff.locator('[data-diff-kind="added"] .build-diff-line-number').allTextContents(), ["", "4", "", "25"]);
    assert.equal(await diff.getByText("No newline at end of file", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Draft line endings are LF; the saved file contains CRLF.", { exact: true }).count(), 1);
    const readOnlyContent = await diff.textContent();
    await diff.focus();
    await page.keyboard.insertText("This cannot edit the review.");
    assert.equal(await diff.textContent(), readOnlyContent);
    assert.equal(await source.inputValue(), draft);
    assert.equal(requests.length, 1, "Read-only review does not perform live revalidation");
    await page.getByRole("button", { name: "Back to editing" }).click();
    assert.equal(await source.evaluate((element) => element === document.activeElement), true);
    assert.deepEqual(await editorState(), expected);
    assert.equal(await source.inputValue(), draft);
    for (const theme of ["light", "dark"]) {
      await page.locator("html").evaluate((element, value) => { element.dataset.studioTheme = value; }, theme);
      await review.click();
      await diff.waitFor();
      for (const width of [320, 460, 800]) {
        await page.locator("#details").evaluate((element, value) => { element.style.width = value + "px"; }, width);
        await page.waitForFunction((value) => document.querySelector(".build-workspace").dataset.compact === String(value < 600), width);
        assert.ok(await diff.evaluate((element) => element.scrollWidth > element.clientWidth));
        assert.ok(await page.locator("#details").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
      }
      await page.getByRole("button", { name: "Back to editing" }).click();
      assert.equal(await source.inputValue(), draft);
    }
  });
});

test("Build rejects stale, failed or invalid reviews and ignores responses after selection or lifecycle changes", browserOptions, async () => {
  const artifacts = [agent(), { ...agent("{}\n"), id: "config", title: "Runtime", path: "config/app.json", customizationArea: "runtime" }];
  let gate;
  await withPanel(artifacts, async (route, path, input) => {
    assert.equal(path, "/api/build-diff", "No invalid or stale review may reach the save endpoint");
    gate.started.resolve();
    const result = await gate.reply.promise;
    await route.fulfill(result.error
      ? { status: 500, json: { error: result.error } }
      : { json: result.diff ?? buildDiffFixture({ baseSha: "base", before: artifacts[0].content, after: input.content }) });
    gate.completed.resolve();
  }, async (page) => {
    const source = page.locator('[data-artifact="agent"] textarea');
    const review = page.getByRole("button", { name: "Review changes", exact: true });
    const save = page.getByRole("button", { name: "Save reviewed changes" });
    const prepare = async (draft) => {
      gate = { started: deferred(), reply: deferred(), completed: deferred() };
      await source.fill(draft);
      await review.click();
      await gate.started.promise;
    };
    await prepare("First draft.");
    await source.fill("Newer draft while preparing.");
    gate.reply.resolve({});
    await gate.completed.promise;
    await page.getByRole("alert").filter({ hasText: "draft changed while the review was loading" }).waitFor();
    assert.equal(await save.count(), 0);
    assert.equal(await source.inputValue(), "Newer draft while preparing.");
    for (const result of [
      { error: "Diff service unavailable." },
      { diff: { hunks: "invalid", additions: 1, deletions: 1 } },
      { diff: { baseSha: "base", additions: 1, deletions: 1, hunks: [{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1, lines: [{ kind: "unsupported" }] }] } },
      { diff: buildDiffFixture({ baseSha: "changed", before: "alpha", after: "beta" }) },
    ]) {
      await prepare("Keep this unsaved draft.");
      gate.reply.resolve(result);
      await gate.completed.promise;
      await page.getByRole("alert").waitFor();
      assert.equal(await save.count(), 0);
      assert.equal(await source.inputValue(), "Keep this unsaved draft.");
      assert.equal(await review.isEnabled(), true);
    }
    await prepare("Offscreen review.");
    await page.locator('[data-file-id="config"]').click();
    gate.reply.resolve({ error: "Ignore this obsolete error." });
    await gate.completed.promise;
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.equal(await save.count(), 0);
    await page.locator('[data-file-id="agent"]').click();
    assert.equal(await source.inputValue(), "Offscreen review.");
    await prepare("Review canceled by leaving Build.");
    await page.evaluate(() => { window.panelActive = false; window.buildPanel.hide(); });
    gate.reply.resolve({});
    await gate.completed.promise;
    assert.equal(await save.count(), 0);
    await page.evaluate(() => { window.panelActive = true; window.buildPanel.show(); });
    await source.waitFor();
    assert.equal(await source.inputValue(), "Review canceled by leaving Build.");
  });
});

test("Build saves only the reviewed snapshot and preserves newer native edits while a save is pending", browserOptions, async () => {
  const artifact = agent();
  const writes = [];
  let saveGate;
  await withPanel([artifact], async (route, path, input) => {
    if (path === "/api/build-diff") {
      await route.fulfill({ json: buildDiffFixture({ baseSha: input.baseSha, before: artifact.content, after: input.content }) });
      return;
    }
    assert.equal(path, "/api/build-file");
    writes.push(input);
    saveGate?.started.resolve();
    const result = saveGate ? await saveGate.reply.promise : {};
    if (result.error) await route.fulfill({ status: 409, json: { error: result.error } });
    else {
      Object.assign(artifact, { content: input.content, sha: `saved-${writes.length}` });
      await route.fulfill({ json: artifact });
    }
    saveGate?.completed.resolve();
  }, async (page) => {
    const source = page.locator(".build-source-editor textarea");
    const review = page.getByRole("button", { name: "Review changes", exact: true });
    const save = page.getByRole("button", { name: "Save reviewed changes" });
    await source.fill("Approved draft.");
    await review.click();
    await save.waitFor();
    await source.evaluate((element) => {
      element.value = "Changed outside the reviewed snapshot.";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await save.click();
    await page.getByRole("alert").filter({ hasText: "The draft changed." }).waitFor();
    assert.equal(writes.length, 0);
    assert.equal(await source.isVisible(), true);
    await review.click();
    saveGate = { started: deferred(), reply: deferred(), completed: deferred() };
    await save.click();
    await saveGate.started.promise;
    assert.equal(await save.isDisabled(), true);
    saveGate.reply.resolve({ error: "Saved source changed externally." });
    await saveGate.completed.promise;
    await page.getByRole("alert").filter({ hasText: "Saved source changed externally." }).waitFor();
    assert.equal(await save.isDisabled(), true);
    await page.getByRole("button", { name: "Back to editing" }).click();
    await review.click();
    saveGate = { started: deferred(), reply: deferred(), completed: deferred() };
    await save.click();
    await saveGate.started.promise;
    await page.getByRole("button", { name: "Back to editing" }).click();
    await source.fill("Newer unsaved instructions.");
    assert.equal(await review.isDisabled(), true);
    saveGate.reply.resolve({});
    await saveGate.completed.promise;
    await page.getByText(/Your newer edits are still unsaved/).waitFor();
    assert.equal(await source.inputValue(), "Newer unsaved instructions.");
    assert.deepEqual(writes[1], {
      root: "/fixture", id: "agent", baseSha: "base", content: "Changed outside the reviewed snapshot.",
    });
    saveGate = undefined;
    await review.click();
    await save.click();
    await page.getByText(/Saved\. Restart/).waitFor();
    assert.equal(writes[2].baseSha, "saved-2");
    assert.equal(writes[2].content, "Newer unsaved instructions.");
    assert.equal(await source.inputValue(), artifact.content);
  });
});
