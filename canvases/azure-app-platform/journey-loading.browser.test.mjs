import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { renderStudioHtml } from "./studio-ui.mjs";
import { renderWorkspaceLoadingHtml } from "./journey-loading.mjs";
import { serveStudioAsset } from "./studio-assets.mjs";
import { EMPTY_TEMPLATE } from "./source-catalog.mjs";
import { DEFAULT_EDITOR_SETTINGS } from "./editor-settings.mjs";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let playwright;
try { playwright = requireWeb("playwright"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
const catalog = {
  templates: [EMPTY_TEMPLATE], diagnostics: [],
  apps: [{ name: "Document helper", path: "projects/document-helper", capabilityIds: ["agent"], lastOpenedAt: "2026-11-06T12:00:00Z" }],
  roots: [{ id: "source", name: "Synthetic project", path: "projects/source", branch: "fixture", dirty: false,
    implementations: [{ id: "agent-source", tierId: "agent", projectPath: "src/agent" }] }],
};

for (const engine of ["chromium", "webkit"]) test(`workspace readiness does not wait for Build source in ${engine}`, {
  skip: !playwright && "Install src/web dependencies to run browser coverage.", timeout: 20000,
}, async () => {
  const fixture = await createRunSettingsFixture();
  let browser, release;
  try {
    browser = await playwright[engine].launch({ headless: true });
    const page = await browser.newPage();
    await page.route("**/api/build-workspace*", async route => {
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ json: { artifacts: [], diagnostics: [] } });
    });
    const readiness = page.waitForResponse(response => new URL(response.url()).pathname === "/api/local-readiness");
    await page.goto(fixture.origin + "/app-map#build");
    await page.getByText("Loading app source...", { exact: true }).waitFor();
    await readiness;
    assert.equal(await page.locator("#workspace-navigation-mount").isVisible(), true);
    assert.equal(await page.locator("#header-runtime-action").getAttribute("aria-label"), "Stop app");
    release();
    await page.waitForFunction(() => window.appPlatformReady);
  } finally { release?.(); await browser?.close(); await fixture.close(); }
});

for (const engine of ["chromium", "webkit"]) test(`scoped loading preserves journeys and recovery in ${engine}`, {
  skip: !playwright && "Install src/web dependencies to run browser coverage.", timeout: 120000,
}, async () => {
  let theme = "light";
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url, "http://localhost");
      if (await serveStudioAsset(request, response, url.pathname)) return;
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(url.pathname === "/app-map"
        ? renderWorkspaceLoadingHtml("projects/document-helper", "fixture", { theme })
        : renderStudioHtml("loading-fixture", "fixture", { theme }));
    })().catch(error => response.writeHead(500).end(error.message));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const releases = [];
  try {
    browser = await playwright[engine].launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    const page = await browser.newPage({ reducedMotion: "reduce" });
    const assertSpinnerAnimating = async () => {
      assert.deepEqual(await page.locator(".journey-spinner:visible").first().evaluate(element => {
        const style = getComputedStyle(element);
        return [style.animationName, style.animationDuration, style.animationIterationCount, style.animationPlayState];
      }), ["journey-spin", "1s", "infinite", "running"], "Loading spinners remain animated with reduced motion enabled");
    };
    const assertSkeletonGaps = async () => {
      const gaps = await page.locator(".journey-skeleton-stack:visible").evaluateAll(stacks =>
        stacks.flatMap(stack => [...stack.children].slice(1).map((block, index) =>
          block.getBoundingClientRect().top - stack.children[index].getBoundingClientRect().bottom)));
      assert.equal(gaps.length, 2);
      assert.deepEqual(gaps, [12, 12], "Stacked skeleton blocks must have a 12px gap");
    };
    await page.clock.install();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    let sourceMode = "pending", sourceRelease, creationMode = "failure", creationRelease, documentMode = "failure";
    let sourcesCalls = 0, creationCalls = 0, documentRelease, deleted = false;
    const wait = assign => new Promise(resolve => { releases.push(resolve); assign(resolve); });
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/sources") {
        sourcesCalls++;
        if (sourceMode === "pending") await wait(resolve => { sourceRelease = resolve; });
        if (sourceMode === "failure") return route.fulfill({ status: 503, json: { error: "Synthetic discovery unavailable" } });
        return route.fulfill({ json: deleted ? { ...catalog, apps: [] } : catalog });
      }
      if (path === "/api/delete-app") {
        deleted = true;
        return route.fulfill({ json: { outcome: "complete", worktreeRemoved: true, message: "App worktree deleted. Azure resources were not changed." } });
      }
      if (path === "/api/app-name") return route.fulfill({ json: { name: "Document helper" } });
      if (path === "/api/workspace-request") {
        creationCalls++;
        await wait(resolve => { creationRelease = resolve; });
        if (creationMode === "unknown") return route.fulfill({ contentType: "application/x-ndjson",
          body: '{"type":"progress","message":"Preparing template files..."}\n' });
        return route.fulfill({ contentType: "application/x-ndjson", body: [
          { type: "progress", message: "Creating app workspace..." },
          { type: "progress", message: "Preparing template files..." },
          creationMode === "failure" ? { type: "error", error: "Synthetic creation failed" }
            : { type: "result", result: { worktreePath: "projects/document-helper" } },
        ].map(event => JSON.stringify(event)).join("\n") + "\n" });
      }
      if (path === "/api/app-map-document") {
        await wait(resolve => { documentRelease = resolve; });
        if (documentMode === "failure") return route.fulfill({ status: 503, json: { error: "Synthetic workspace unavailable" } });
        return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Loaded workspace</title><h1>Loaded workspace</h1>" });
      }
      if (path === "/api/discovery") return route.fulfill({ json: { inventory: [{ id: "agent", implementations: [] }] } });
      if (path === "/api/preferences") return route.fulfill({ json: { theme } });
      if (path === "/api/editor-settings") return route.fulfill({ json: DEFAULT_EDITOR_SETTINGS });
      throw new Error("Unexpected loading fixture request: " + path);
    });
    const origin = "http://127.0.0.1:" + server.address().port;
    for (const tone of ["light", "dark"]) for (const width of [390, 900]) {
      theme = tone; sourceMode = "pending"; sourceRelease = null;
      await page.setViewportSize({ width, height: 800 });
      await page.goto(origin);
      await page.getByText("Finding your recent apps...", { exact: true }).waitFor();
      await assertSpinnerAnimating();
      await assertSkeletonGaps();
      assert.equal(await page.locator("#new-app").isEnabled(), true);
      assert.equal(await page.locator("#open-app").isEnabled(), true);
      assert.equal(await page.locator("#assemble-app").isEnabled(), true);
      assert.equal(await page.locator(".simple-home-recent").getAttribute("aria-busy"), "true");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator("#open-app").click();
      await page.getByRole("heading", { name: "Open an app", exact: true }).waitFor();
      assert.equal(await page.locator(".journey-skeleton").count(), 3);
      await assertSkeletonGaps();
      await page.locator("#top-back").click();
      await page.locator("#new-app").click();
      await page.locator('input[name="template"]').first().waitFor();
      await page.locator("#next").click();
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await page.locator("#agent-instructions").fill("Keep draft instructions");
      assert.equal(await page.locator("#agent-instructions").inputValue(), "Keep draft instructions");
      sourceMode = "ready"; sourceRelease();
      await page.waitForTimeout(100);
      assert.equal(await page.locator("#agent-instructions").inputValue(), "Keep draft instructions", "Background discovery must not replace a customization draft");
      await page.locator("#top-back").click();
      await page.locator("#top-back").click();
      sourceMode = "pending"; sourceRelease = null;
      await page.locator("#open-app").click();
      await page.getByRole("heading", { name: "Open an app", exact: true }).waitFor();
      await page.getByText("Finding your apps...", { exact: true }).waitFor();
      assert.equal(await page.locator("#top-back").isEnabled(), true);
      assert.equal(await page.locator("[data-existing-app]").isEnabled(), true);
      assert.equal(await page.locator("[data-app-actions]").isDisabled(), true);
      await page.locator("#top-back").click();
      sourceMode = "ready"; sourceRelease();
      await page.waitForTimeout(100);
      assert.equal(await page.getByRole("heading", { name: "What would you like to do?", exact: true }).count(), 1,
        "A stale picker response must not navigate the user away from Home");
    }
    sourceMode = "failure";
    await page.locator("#open-app").click();
    await page.locator("#retry-apps").waitFor();
    await page.locator("#top-back").click();
    await page.locator("#new-app").click();
    await page.locator("#retry-templates").waitFor();
    sourceMode = "pending"; sourceRelease = null;
    await page.locator("#retry-templates").click();
    await page.getByText("Finding reference samples. Starter templates are ready to use.", { exact: true }).waitFor();
    await page.locator("#next").click();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.locator("#agent-instructions").fill("Retry kept draft");
    sourceMode = "ready";
    sourceRelease();
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#agent-instructions").inputValue(), "Retry kept draft", "A sample retry must not return an advancing user to template selection");
    await page.locator("#top-back").click();
    await page.locator("#top-back").click();
    await page.locator("#open-app").click();
    await page.locator("[data-existing-app]").waitFor();
    await page.goto(origin);
    await page.locator("[data-recent-app]").waitFor();
    await page.locator("#assemble-app").click();
    await page.locator("#app-name").fill("assembled-fixture");
    await page.locator("#next").click();
    if (!await page.locator('[data-source-tier="agent"]').count()) await page.locator("#add-tier").selectOption("agent");
    await page.locator('[data-source-tier="agent"]').selectOption("agent-source");
    await page.locator("#next").click();
    await page.getByRole("heading", { name: "Map Azure resources", exact: false }).waitFor();
    await page.locator("#back").click();
    await page.locator("#back").click();
    await page.locator("#back").click();
    assert.equal(await page.locator("#new-app").isEnabled(), true, "Azure discovery must release global busy state");
    await page.locator("#new-app").click();
    await page.locator("#next").click();
    await page.locator("#agent-instructions").waitFor();
    await page.locator("#agent-instructions").fill("Validate uploaded borrower documents.");
    await page.locator("#next").click();
    await page.locator("#app-name").waitFor();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.locator("#app-name").fill("created-fixture");
    assert.equal(await page.locator("#app-name").inputValue(), "created-fixture");
    await page.locator("#next").click();
    await page.locator("#creation-stage").waitFor();
    await assertSpinnerAnimating();
    await page.clock.fastForward(15000);
    assert.match(await page.locator("#creation-stage").innerText(), /taking longer than expected/);
    assert.equal(await page.locator("#creation-stage").evaluate(node =>
      !node.closest('[aria-busy="true"]')), true, "Progress announcements must not be suppressed by the pending form region");
    assert.equal(await page.locator("#app").getAttribute("aria-busy"), "true");
    assert.equal(await page.locator("#next").isDisabled(), true);
    await page.locator("#next").click({ force: true });
    assert.equal(creationCalls, 1, "Creation cannot be submitted twice while pending");
    creationRelease();
    await page.getByText("Synthetic creation failed", { exact: true }).waitFor();
    assert.equal(await page.locator("#app-name").inputValue(), "created-fixture");
    assert.equal(await page.locator("#next").isEnabled(), true);
    creationMode = "unknown"; creationRelease = null;
    await page.locator("#next").click();
    await page.waitForFunction(() => document.querySelector("#creation-stage"));
    await page.waitForTimeout(50); creationRelease();
    await page.getByRole("button", { name: "Check existing apps", exact: true }).waitFor();
    await page.locator("#next").click();
    await page.getByRole("heading", { name: "Open an app", exact: true }).waitFor();
    assert.equal(creationCalls, 2, "Checking an unknown outcome must not create again");
    await page.locator("[data-existing-app]").click();
    await page.locator("#workspace-loading").waitFor();
    await assertSpinnerAnimating();
    await assertSkeletonGaps();
    assert.equal(await page.locator("#workspace-loading").getAttribute("aria-busy"), "true");
    await page.waitForTimeout(50); documentRelease();
    await page.locator("#retry-workspace:not([hidden])").waitFor();
    assert.equal(await page.locator("#workspace-loading .journey-skeleton:visible").count(), 0);
    documentMode = "ready"; documentRelease = null;
    await page.locator("#retry-workspace").click();
    assert.equal(await page.locator("#workspace-loading .journey-skeleton:visible").count(), 3);
    await assertSkeletonGaps();
    await page.waitForTimeout(50); documentRelease();
    await page.getByRole("heading", { name: "Loaded workspace", exact: true }).waitFor();
    await page.goto(origin);
    await page.locator("#new-app").click();
    await page.locator("#next").click();
    await page.locator("#agent-instructions").waitFor();
    await page.locator("#agent-instructions").fill("Validate uploaded borrower documents.");
    await page.locator("#next").click();
    await page.locator("#app-name").waitFor();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.locator("#app-name").fill("successful-fixture");
    creationMode = "ready"; creationRelease = null;
    await page.locator("#next").click();
    await page.locator("#creation-stage").waitFor();
    await page.waitForTimeout(50); creationRelease();
    await page.locator("#workspace-loading").waitFor();
    assert.equal(new URL(page.url()).hash, "#build", "Creation opens Build rather than changing the user's destination");
    await page.waitForTimeout(50); documentRelease();
    await page.getByRole("heading", { name: "Loaded workspace", exact: true }).waitFor();
    assert.equal(sourcesCalls > 1, true);
    await page.goto(origin);
    await page.locator("#open-app").click();
    await page.getByText("Finding your apps...", { exact: true }).waitFor({ state: "hidden" });
    await page.locator("[data-app-actions]").click();
    await page.getByRole("menuitem", { name: "Delete app", exact: true }).click();
    await page.locator("#confirm-delete").click();
    await page.getByRole("heading", { name: "Your next app starts here", exact: true }).waitFor();
    await page.locator("#top-back").click();
    assert.equal(await page.locator("#new-app").isEnabled(), true, "Post-deletion discovery must release the mutation busy state");
    assert.deepEqual(errors, []);
  } finally {
    for (const release of releases) release();
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("matched loading evidence uses the frozen baseline and identical synthetic fixtures", {
  skip: !playwright || !process.env.APP_LOADING_EVIDENCE_DIR && "Set APP_LOADING_EVIDENCE_DIR to capture evidence.",
  timeout: 120000,
}, async () => {
  const output = process.env.APP_LOADING_EVIDENCE_DIR;
  const baseline = await import(pathToFileURL(join(process.env.APP_LOADING_BASELINE_DIR, "studio-ui.mjs")));
  await mkdir(output, { recursive: true });
  let theme, version;
  const server = createServer((request, response) => {
    void (async () => {
      if (await serveStudioAsset(request, response, new URL(request.url, "http://localhost").pathname)) return;
      response.writeHead(200, { "Content-Type": "text/html" }).end(
        (version === "before" ? baseline.renderStudioHtml : renderStudioHtml)("evidence", "fixture", { theme }));
    })().catch(error => response.writeHead(500).end(error.message));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const captures = [];
  try {
    browser = await playwright.chromium.launch({ headless: true });
    for (theme of ["light", "dark"]) for (version of ["before", "after"]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 800 }, reducedMotion: "reduce" });
      let release, creationRelease;
      await page.route("**/api/sources", async route => {
        await new Promise(resolve => { release = resolve; });
        await route.fulfill({ json: catalog });
      });
      await page.route("**/api/workspace-request", async route => {
        await new Promise(resolve => { creationRelease = resolve; });
        await route.fulfill({ status: 500, json: { error: "Synthetic creation failure" } });
      });
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page.locator("#studio-home").waitFor();
      await page.waitForFunction(() => document.querySelector("#studio-home") && document.querySelector(".simple-home-recent"));
      await page.waitForTimeout(100);
      const capture = async state => {
        const file = `${version}-${state}-${theme}-390.png`;
        await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
        await page.screenshot({ path: join(output, file), fullPage: true });
        const html = (version === "before" ? baseline.renderStudioHtml : renderStudioHtml)("evidence", "fixture", { theme });
        captures.push({ file, version, state, theme, viewport: { width: 390, height: 800 }, build: version === "before" ? "62f5190" : "loading implementation",
          htmlSha256: createHash("sha256").update(html).digest("hex"),
          screenshotSha256: createHash("sha256").update(await readFile(join(output, file))).digest("hex") });
      };
      await capture("home-loading"); release();
      await page.locator("[data-recent-app]").waitFor();
      release = null;
      await page.locator("#open-app").click();
      await page.waitForTimeout(100);
      await capture("picker-loading"); release();
      await page.locator("[data-existing-app]").waitFor();
      await page.locator("#top-back").click();
      await page.locator("#new-app").click();
      await page.locator('input[value="builtin-empty-starter-v1"]').check();
      await page.locator("#next").click();
      await page.locator("#app-name").fill("Document helper");
      await page.locator("#next").click();
      await page.waitForTimeout(100);
      await capture("creation-loading"); creationRelease();
      await page.close();
    }
    await writeFile(join(output, "captures.json"), JSON.stringify({ baseline: "62f5190", final: "working tree", browser: await browser.version(), captures }, null, 2));
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
