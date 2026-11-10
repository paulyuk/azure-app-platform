import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { renderStudioHtml } from "./studio-ui.mjs";
import { serveStudioAsset } from "./studio-assets.mjs";
import { EMPTY_TEMPLATE, APP_SERVICE_BUILDER_TEMPLATE, SANDBOX_GATEWAY_TEMPLATE } from "./source-catalog.mjs";
import { DEFAULT_EDITOR_SETTINGS } from "./editor-settings.mjs";
import { CREATE_GUIDANCE, createTemplateKind } from "./create-flow.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let playwright;
try { playwright = requireWeb("playwright"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
const templates = [SANDBOX_GATEWAY_TEMPLATE, APP_SERVICE_BUILDER_TEMPLATE, EMPTY_TEMPLATE, {
  id: "synthetic-pinned-reference", kind: "sample", name: "Dealership E2E Reference Sample",
  description: "Start with a complete, runnable reference app for the dealer workflow.",
  capabilityIds: ["web", "agent", "skills", "sandbox", "gateway", "workflows"],
}];

export async function verifyCreateFlowBrowser(engine, { channel, evidenceDir, baseline = false } = {}) {
  let theme = "light", profile = "github-app", sourceMode = "ready", catalog = templates, releaseSources, announceSources;
  const sourcesStarted = new Promise(resolve => { announceSources = resolve; });
  const browser = await engine.launch({ headless: true, channel, ignoreDefaultArgs: ["--hide-scrollbars"] });
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url, "http://localhost").pathname;
      if (await serveStudioAsset(request, response, path)) return;
      if (path !== "/") { response.writeHead(404).end(); return; }
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(renderStudioHtml("synthetic-create", "create-test-token", { theme, presentationProfile: profile }));
    })().catch(error => response.writeHead(500).end(error.message));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const page = await browser.newPage({ reducedMotion: "reduce", acceptDownloads: true, hasTouch: true });
  page.setDefaultTimeout(7000);
  const errors = [], mutations = [], suggestions = [], captures = [], checks = [];
  const check = (condition, name) => { assert.ok(condition, name); checks.push(name); };
  let releaseCreation, failCreation = true, announceCreation;
  let namingMode = "ready", releaseNaming, announceNaming;
  const namingStarted = new Promise(resolve => { announceNaming = resolve; });
  let creationStarted = new Promise(resolve => { announceCreation = resolve; });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/app-name") {
      suggestions.push({ token: request.headers()["x-app-platform-token"], body: request.postDataJSON() });
      if (namingMode === "loading") await new Promise(resolve => { releaseNaming = resolve; announceNaming(); });
      if (namingMode === "error") return route.fulfill({ status: 503, json: { error: "Synthetic AI naming unavailable; retry explicitly." } });
      const index = request.postDataJSON().instructions.match(/^Keep current instructions (\d)$/)?.[1];
      return route.fulfill({ json: { name: index === undefined ? "Document Review" : "Synthetic app " + index } });
    }
    if (request.method() !== "GET") mutations.push({ path, token: request.headers()["x-app-platform-token"], body: request.postDataJSON() });
    if (path === "/api/sources") {
      if (sourceMode === "loading") await new Promise(resolve => { releaseSources = resolve; announceSources(); });
      return route.fulfill(sourceMode === "error"
        ? { status: 503, json: { error: "Synthetic catalog unavailable." } }
        : { json: { roots: [], apps: [], templates: sourceMode === "empty" ? [] : catalog } });
    }
    if (path === "/api/editor-settings") return route.fulfill({ json: DEFAULT_EDITOR_SETTINGS });
    if (path === "/api/preferences") return route.fulfill({ json: { theme } });
    if (path === "/api/workspace-request") {
      await new Promise(resolve => { releaseCreation = resolve; announceCreation(); });
      return route.fulfill(failCreation ? { status: 503, json: { error: "Synthetic creation failed; retry explicitly." } }
        : { json: { worktreePath: "synthetic-created-workspace" } });
    }
    throw Error("Unexpected Create request: " + path);
  });
  await page.route("**/app-map?**", route => route.fulfill({ contentType: "text/html", body: "<h1>Synthetic created workspace</h1>" }));
  const origin = "http://127.0.0.1:" + server.address().port;
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function reviewReady() {
    await page.locator(".create-review").waitFor();
    await page.waitForFunction(() => document.querySelector(".create-review #app-name")?.disabled === false &&
      document.querySelector(".create-review #next")?.disabled === false);
  }
  async function verifyWizardNavigation(step) {
    check(await page.locator(".create-progress").evaluate((nav, currentStep) => {
      const bounds = nav.getBoundingClientRect();
      const steps = [...nav.children];
      const numbers = steps.map(item => item.querySelector(".create-step-number").getBoundingClientRect());
      return steps.length === 3 && nav.scrollWidth <= nav.clientWidth &&
        nav.querySelectorAll('[aria-current="step"]').length === 1 &&
        steps[currentStep - 1].getAttribute("aria-current") === "step" &&
        steps.every((item, index) => {
          const itemBounds = item.getBoundingClientRect();
          const label = item.lastElementChild.getBoundingClientRect();
          return numbers[index].left >= bounds.left && label.right <= itemBounds.right + 1 &&
            item.scrollWidth <= item.clientWidth + 1 && itemBounds.right <= bounds.right + 1 &&
            Math.abs(numbers[index].top - numbers[0].top) <= 1 &&
            (!index || numbers[index].left > numbers[index - 1].right) &&
            (bounds.width > 520 || label.top >= numbers[index].bottom);
        });
    }, step), `Step ${step}: all wizard numbers align and complete labels fit their tracks`);
  }
  async function bounded(promise, message) {
    let timeout;
    try {
      await Promise.race([promise, new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(Error(message)), 7000);
      })]);
    } finally { clearTimeout(timeout); }
  }
  async function load(width, tone, index = 0) {
    theme = tone;
    await page.setViewportSize({ width, height: 900 }); await page.goto(origin);
    await page.locator("#new-app").click(); await page.locator('input[name="template"]').nth(3).waitFor();
    await page.locator('input[name="template"]').nth(index).check(); await settle();
  }
  async function screenshot(name) {
    if (!evidenceDir) return;
    await mkdir(evidenceDir, { recursive: true });
    if (name.endsWith("-selection") || name.endsWith("-configuration")) {
      await page.evaluate(() => window.scrollTo(0, 0)); await settle();
    }
    const file = (baseline ? "before" : "after") + "-" + name + ".png";
    await page.screenshot({ path: join(evidenceDir, file) }); captures.push(file);
  }
  try {
    const blueprints = [];
    if (!baseline) for (let index = 0; index < templates.length; index++) {
      await load(980, "light", index);
      await settle();
      blueprints.push(await page.locator(".create-diagram svg text").allTextContents());
    }
    for (const tone of ["light", "dark"]) for (const width of [320, 360, 620, 980, 1440]) {
      await load(width, tone);
      await screenshot(`${tone}-${width}-selection`);
      if (baseline) {
        await page.locator("#next").click(); await page.locator("#agent-instructions").waitFor();
        await page.locator("#app-name").fill("Synthetic app 0");
        await page.locator("#agent-instructions").fill("Keep current instructions 0");
        await screenshot(`${tone}-${width}-configuration`); continue;
      }
      await verifyWizardNavigation(1);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tone}/${width}: selection fits`);
      check(await page.locator("#next").count() === 1, `${tone}/${width}: one Continue`);
      check(await page.locator("#next").evaluate(node => Boolean(node.closest(".create-starter-panel"))), `${tone}/${width}: Continue stays inside selected details`);
      for (let index = 0; index < templates.length; index++) {
        if (index) { await page.locator('input[name="template"]').nth(index).check(); await settle(); }
        const radio = page.locator('input[name="template"]').nth(index);
        check(await page.locator("#status").textContent() === "",
          `${tone}/${width}/${index}: selection does not repeat the template name below the layout`);
        if (width === 980) check(await page.locator(".create-selection").evaluate(layout => {
          const choices = layout.querySelector(".create-choices").getBoundingClientRect();
          const details = layout.querySelector("[data-create-context] > .create-starter-panel").getBoundingClientRect();
          return Math.abs(details.top - choices.top) <= 1 && details.bottom >= choices.bottom - 1;
        }), `${tone}/${width}/${index}: right-hand details cover the full starter stack height`);
        const detailView = page.locator(".create-starter-panel");
        const guidance = CREATE_GUIDANCE[createTemplateKind(templates[index])];
        check(await page.getByRole("button", { name: "View diagram", exact: true }).count() === 0 &&
          await detailView.locator("a, h3, .create-benefits, .create-starter-art, [data-create-section]").count() === 0,
          `${tone}/${width}/${index}: diagram links, value propositions and extra details are absent`);
        check(await detailView.locator(".create-caution").textContent() === guidance.introduction &&
          await detailView.evaluate(panel => {
            const intro = panel.querySelector(".create-caution"), figure = panel.querySelector("figure"), footer = panel.querySelector(".create-footer");
            const heading = panel.querySelector("h2");
            return panel.children.length === 4 && heading.textContent === "Starter architecture" &&
              heading.nextElementSibling === figure && figure.nextElementSibling === intro && intro.nextElementSibling === footer &&
              getComputedStyle(intro).borderLeftStyle === "solid" && parseFloat(getComputedStyle(intro).borderLeftWidth) > 0;
          }), `${tone}/${width}/${index}: preview heading, diagram, left-bar explanation and footer in order`);
        const previewActions = await detailView.getByRole("button").allTextContents();
        check(previewActions.length === 1 && previewActions[0] === "Continue" &&
          await page.getByRole("list", { name: "Included now", exact: true }).count() === 0,
          `${tone}/${width}/${index}: Continue is the only preview action, without an included-count popover`);
        await page.locator("#next").focus();
        check(await detailView.locator("#next").isVisible() && await radio.isChecked(),
          `${tone}/${width}/${index}: selection shows the complete diagram without an extra click`);
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tone}/${width}/${index}: diagram fits without panning`);
        const diagram = page.locator(".create-diagram svg");
        check(await diagram.locator("..").evaluate(stage =>
          stage.dataset.diagramLayout === (stage.clientWidth >= 560 ? "horizontal" : "compact")),
          `${tone}/${width}/${index}: diagram layout follows actual preview width`);
        if (width === 1440) {
          check(await diagram.evaluate(svg => svg.viewBox.baseVal.width > svg.viewBox.baseVal.height),
            `${tone}/${width}/${index}: expanded preview uses a landscape diagram`);
          await page.setViewportSize({ width: 360, height: 900 }); await settle();
          check(await page.locator(".create-diagram").getAttribute("data-diagram-layout") === "compact" &&
            await radio.isChecked(), `${tone}/${index}: shrinking the same preview restores compact layout and selection`);
          await page.setViewportSize({ width, height: 900 }); await settle();
          check(await page.locator(".create-diagram").getAttribute("data-diagram-layout") === "horizontal" &&
            await radio.isChecked(), `${tone}/${index}: expanding the same preview restores horizontal layout and selection`);
        }
        check(await diagram.getAttribute("role") === "img" && await diagram.locator("rect").count() === [3, 2, 5, 5][index], `${tone}/${width}/${index}: original blueprint boxes preserved`);
        assert.deepEqual((await diagram.locator("text").allTextContents()).map(text => text.replace(/\s+/g, " ").trim()),
          blueprints[index].map(text => text.replace(/\s+/g, " ").trim()), "Original diagram wording remains intact");
        check(await diagram.evaluate(svg => [...svg.querySelectorAll("text")].every(text => {
          const box = text.getBBox();
          return [...svg.querySelectorAll("rect")].some(rect => {
            const bounds = rect.getBBox();
            return box.x >= bounds.x - 1 && box.x + box.width <= bounds.x + bounds.width + 1 &&
              box.y >= bounds.y - 1 && box.y + box.height <= bounds.y + bounds.height + 1;
          });
        })), `${tone}/${width}/${index}: diagram labels stay within their boxes`);
        check(await page.getByRole("list", { name: "Blueprint relationships", exact: true }).getByRole("listitem").count() === [2, 1, 4, 4][index],
          `${tone}/${width}/${index}: diagram relationships have a text equivalent`);
        if (!index) await screenshot(`${tone}-${width}-details`);
        await page.locator("#next").click(); await page.locator("#agent-instructions").waitFor();
        check(await page.locator("#app-name").count() === 0, `${tone}/${width}/${index}: configuration asks for instructions, not an app name`);
        await page.locator("#agent-instructions").fill("Keep current instructions " + index);
        if (index === 2) await page.locator("#skill-name").fill("synthetic-tool");
        if (!index) await screenshot(`${tone}-${width}-configuration`);
        if (!index) {
          await page.locator("#agent-instructions").evaluate(node => node.setSelectionRange(3, 8));
          check(await page.locator("#agent-instructions").evaluate(node => node.value === "Keep current instructions 0" &&
            node.selectionStart === 3 && node.selectionEnd === 8), `${tone}/${width}: configuration details preserve draft and caret`);
        }
        check(await page.locator(".create-starter-art, .create-diagram").count() === 0,
          `${tone}/${width}/${index}: configuration does not repeat artwork or diagram`);
        check(await page.locator(".create-starter-panel, [data-create-context], [data-create-inline]").count() === 0 &&
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${tone}/${width}/${index}: configuration omits the duplicate inventory and fits`);
        check(await page.locator(".create-configure").evaluate(layout =>
          layout.getBoundingClientRect().width <= 640 &&
          layout.querySelector(".create-footer").getBoundingClientRect().width === layout.querySelector(".create-form").getBoundingClientRect().width),
          `${tone}/${width}/${index}: form and footer share a comfortable single-column width`);
        check(await page.locator(".create-configure h1").textContent() === "Describe your app" &&
          await page.locator("#review-notice").innerText() === "Creates a new Git worktree. No Azure resources are provisioned.",
          `${tone}/${width}/${index}: focused configuration keeps its title and creation boundary`);
        await verifyWizardNavigation(2);
        await page.locator("#next").click();
        const review = page.locator(".create-review"); await reviewReady();
        await verifyWizardNavigation(3);
        assert.deepEqual(await review.locator(".create-review-capabilities dt").allTextContents(), guidance.included.map(([name]) => name));
        check((await review.innerText()).includes(guidance.caution), `${tone}/${width}/${index}: review retains the starter limitation`);
        check(await review.getByLabel("App name", { exact: true }).inputValue() === "Synthetic app " + index &&
          (await review.innerText()).includes("Keep current instructions " + index), `${tone}/${width}/${index}: review reflects the AI suggestion and actual draft`);
        check(await page.locator(".create-progress [aria-current]").innerText() === "3\nReview app" &&
          await page.getByRole("dialog", { name: "Review app", exact: true }).count() === 0 &&
          !(await review.innerText()).includes("AI-suggested. Rename it if you prefer.") &&
          await review.getByRole("button", { name: "Create app", exact: true }).isEnabled() &&
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${tone}/${width}/${index}: review is the third page, fits the pane and omits the redundant name helper`);
        check(mutations.length === 0, `${tone}/${width}/${index}: review has no creation side effects`);
        if (!index) await screenshot(`${tone}-${width}-review`);
        await page.locator("#back").click(); await settle();
        check(await page.locator("#agent-instructions").inputValue() === "Keep current instructions " + index && await page.locator("#next").evaluate(node => node === document.activeElement), `${tone}/${width}/${index}: review Back preserves draft and focus`);
        const namingCount = suggestions.length;
        await page.locator("#next").click(); await reviewReady();
        check(suggestions.length === namingCount, `${tone}/${width}/${index}: reopening review reuses the existing name`);
        await page.locator("#back").click(); await settle();
        if (!index && width === 980 && tone === "light") {
          await page.locator("#agent-instructions").fill("A revised description for document review");
          await page.locator("#next").click(); await reviewReady();
          check(suggestions.length === namingCount + 1 &&
            suggestions.at(-1).body.instructions === "A revised description for document review",
            "Changed instructions regenerate an unedited AI suggestion from the exact current text");
          await page.locator("#back").click(); await settle();
        }
        await page.locator("#back").click(); await settle();
      }
    }
    if (!baseline) {
      await load(360, "light", 2);
      check(await page.locator("[data-create-disclosure]").count() === 0,
        "Compact selection has no disclosure controls");
      check(await page.locator(".create-diagram").isVisible() && await page.locator("#next").isVisible(),
        "Compact selection reveals its diagram and Continue without an extra click");
      const next = await page.locator("#next").elementHandle(); await next.focus();
      for (const width of [980, 360]) {
        await page.setViewportSize({ width, height: 900 }); await settle();
        check(await next.evaluate(node => node === document.querySelector("#next") && node === document.activeElement), `${width}: resize retains owned Continue and focus`);
      }
      check(await page.locator('input[name="template"]').count() === 4, "Responsive changes preserve all starter choices");
      check(await page.locator("#next").evaluate(node => Boolean(node.closest(".create-template:has(input:checked) .create-starter-panel"))),
        "Compact Continue remains directly below the selected diagram");
      await next.dispose();
      await page.locator("#next").click(); await page.locator("#agent-instructions").waitFor();
      await settle();
      const beforeValidation = suggestions.length;
      await page.locator("#agent-instructions").fill("");
      await page.locator("#next").click();
      check(await page.locator(".create-review").count() === 0 && suggestions.length === beforeValidation,
        "Instruction validation precedes AI naming and review");
      await page.locator("#next").click();
      check(await page.locator("#agent-instructions").evaluate(node => node === document.activeElement &&
        node.getAttribute("aria-invalid") === "true" && node.getAttribute("aria-describedby").includes("create-instruction-help")),
        "Repeated instruction validation retains its field help and focus");
      await page.locator("#agent-instructions").fill("Actual saved instructions");
      check(await page.locator("#agent-instructions-error").count() === 0, "Editing clears the instruction error");
      await page.locator("#skill-name").fill("Invalid skill"); await page.locator("#next").click();
      check(await page.locator("#skill-name").evaluate(node => node === document.activeElement && node.getAttribute("aria-invalid") === "true"), "Hosted Skill validation focuses the field");
      await page.locator("#skill-name").fill("request-tool");
      namingMode = "error";
      await page.locator("#next").click();
      await page.getByText("Synthetic AI naming unavailable; retry explicitly.", { exact: true }).waitFor();
      check(await page.locator("#app-name").inputValue() === "" &&
        await page.locator("#app-name").getAttribute("placeholder") === null,
        "Failed naming clears the generating placeholder without saving it as an app name");
      check(await page.locator("#next").isDisabled() && await page.locator("#retry-name").isVisible() &&
        (await page.locator(".create-review").innerText()).includes("Actual saved instructions") &&
        await page.locator(".create-progress [aria-current]").innerText() === "3\nReview app" &&
        mutations.length === 0, "Naming failure stays on step three with the instructions and explicit retry; creation remains disabled");
      namingMode = "loading";
      await page.locator("#retry-name").click();
      await page.waitForFunction(() => document.querySelector(".create-review").getAttribute("aria-busy") === "true");
      check(await page.locator("#app-name").getAttribute("placeholder") === "Generating app name..." &&
        await page.locator("#app-name").inputValue() === "",
        "Pending naming shows feedback inside the empty name field without changing its value");
      await page.locator("#retry-name").dispatchEvent("click");
      await page.locator("#next").dispatchEvent("click");
      check(await page.locator("#next").isDisabled() && await page.locator("#app-name").isDisabled() &&
        await page.locator("#back").isDisabled() && await page.locator("#top-back").isDisabled(),
        "Inline naming locks the name and navigation, and suppresses duplicate naming and creation requests");
      await bounded(namingStarted, "The AI naming request was not received.");
      check(suggestions.length === beforeValidation + 2, "Retry admits exactly one naming request");
      namingMode = "ready"; releaseNaming();
      const initialReview = page.locator(".create-review");
      await reviewReady();
      const editableName = initialReview.getByLabel("App name", { exact: true });
      check(await editableName.inputValue() === "Document Review" &&
        await editableName.getAttribute("placeholder") === null && suggestions.at(-1).token === "create-test-token",
        "Caller-bound AI suggestion is editable in review");
      await editableName.fill("");
      await initialReview.getByRole("button", { name: "Create app", exact: true }).click();
      check(await editableName.evaluate(node => node === document.activeElement && node.getAttribute("aria-invalid") === "true") &&
        mutations.length === 0, "Invalid review names cannot create an app");
      await editableName.fill("Synthetic request");
      check(await page.locator("#app-name-error").count() === 0, "Editing clears the review name error");
      await page.locator("#back").click();
      await page.locator("#back").click(); await page.locator('input[name="template"]').nth(1).check();
      await page.locator("#next").click(); await page.locator("#agent-instructions").waitFor();
      await page.locator("#agent-instructions").fill("Other instructions");
      await page.locator("#back").click(); await page.locator('input[name="template"]').nth(2).check(); await page.locator("#next").click();
      await page.locator("#skill-name").waitFor();
      check(await page.locator("#agent-instructions").inputValue() === "Actual saved instructions" &&
        await page.locator("#skill-name").inputValue() === "request-tool", "Switching starters restores their individual drafts");
      await page.locator("#agent-instructions").fill("Actual saved instructions with a revision");
      const beforeReopening = suggestions.length;
      await page.locator("#next").click();
      const review = page.locator(".create-review");
      await reviewReady();
      check(await review.getByLabel("App name", { exact: true }).inputValue() === "Synthetic request" &&
        suggestions.length === beforeReopening, "User-edited names survive description changes and switching starters");
      const confirm = review.getByRole("button", { name: "Create app", exact: true });
      await confirm.click(); await page.waitForFunction(() => window.__appPlatformSubmitting);
      check(await confirm.isDisabled(), "Pending creation suppresses repeated activation");
      await page.locator("#next").dispatchEvent("click");
      await page.locator("#back").dispatchEvent("click");
      await page.locator("#top-back").dispatchEvent("click");
      await page.keyboard.press("Escape");
      check(await review.isVisible() && await page.locator("#back").isDisabled() &&
        await page.locator("#top-back").isDisabled() && await editableName.isDisabled(),
        "Pending creation blocks both Back actions and repeated activation without leaving review");
      await bounded(creationStarted, "The confirmed workspace request was not received.");
      releaseCreation(); await review.getByText("Synthetic creation failed; retry explicitly.", { exact: true }).waitFor();
      check(mutations.length === 1 && mutations[0].token === "create-test-token", "One real handler request with original caller token");
      check(mutations[0].body.templateRootId === EMPTY_TEMPLATE.id && mutations[0].body.appName === "Synthetic request" &&
        mutations[0].body.templateInputs.hostedSkillName === "request-tool" &&
        mutations[0].body.templateInputs.agentInstructions === "Actual saved instructions with a revision", "Existing request contract preserves renamed app and template inputs");
      check(await confirm.evaluate(node => node === document.activeElement), "Creation failure restores focus inside review");
      await page.locator("#back").click();
      check(await page.locator("#agent-instructions").inputValue() === "Actual saved instructions with a revision", "Failure retains editable draft");
      failCreation = false; releaseCreation = undefined;
      creationStarted = new Promise(resolve => { announceCreation = resolve; });
      await page.locator("#next").click(); await reviewReady(); await page.getByRole("button", { name: "Create app", exact: true }).click();
      await bounded(creationStarted, "The confirmed retry was not received.");
      releaseCreation(); await page.getByRole("heading", { name: "Synthetic created workspace" }).waitFor();
      check(mutations.length === 2, "Retry is explicit and successful response uses existing App Map navigation");
      sourceMode = "empty"; await page.goto(origin); await page.locator("#new-app").click();
      await page.locator('input[name="template"]').nth(2).waitFor();
      check(await page.locator('input[name="template"]').count() === 3 && await page.locator("#next").isEnabled(), "Built-in starter templates remain available when catalog is empty");
      sourceMode = "error"; await page.goto(origin); await page.locator("#new-app").click();
      await page.locator("#retry-templates").waitFor();
      await page.getByText("Reference samples could not be refreshed. Starter templates are still available.", { exact: true }).waitFor();
      check(await page.locator("#next").isEnabled() && await page.getByText("Finding reference samples. Starter templates are ready to use.", { exact: true }).count() === 0, "Discovery failure is not displayed as still loading");
      sourceMode = "loading"; await page.locator("#retry-templates").click();
      await page.getByText("Finding reference samples. Starter templates are ready to use.", { exact: true }).waitFor();
      check(await page.locator("#next").isEnabled(), "Starter templates remain usable while sample discovery is in flight");
      await bounded(sourcesStarted, "The catalog discovery request was not received.");
      sourceMode = "ready"; releaseSources();
      await page.locator('input[name="template"]').nth(3).waitFor();
      check(await page.locator("#next").isEnabled(), "Explicit discovery retry recovers the real catalog");
      await page.locator("#top-back").click(); await page.locator("#assemble-app").click();
      await page.locator("#app-name").fill("Synthetic assembly"); await page.locator("#next").click();
      await page.getByRole("heading", { name: "Choose pieces", exact: true }).waitFor();
      check(await page.locator(".create-progress, .create-details, .create-starter-panel").count() === 0, "Assemble keeps its existing flow without stale Create controls");
      await page.goto(origin); await page.locator("#open-app").click();
      await page.getByRole("heading", { name: "Your next app starts here", exact: true }).waitFor();
      check(await page.locator(".create-progress, .create-details, .create-starter-panel").count() === 0, "Open keeps its existing flow");
      await page.goto(origin); await page.locator("#new-app").click(); await page.locator('input[name="template"]').nth(3).waitFor();
      check(await page.locator("#next").isEnabled() && mutations.length === 2, "Discovery completion performs no creation or Azure operation");
      await page.locator('input[name="template"]').first().focus(); await page.keyboard.press("ArrowDown"); await settle();
      check(await page.locator('input[name="template"]').nth(1).isChecked(), "Native arrow-key selection updates the selected starter");
      const longName = "Reference with a deliberately long product-owned catalog name that must wrap without clipping or horizontal panning";
      catalog = [...templates.slice(0, 3), { ...templates[3], name: longName }];
      await load(320, "dark", 3);
      check(await page.locator(".create-template:has(input:checked) strong").textContent() === longName &&
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Long catalog labels wrap in a compact selected card");
      await page.locator("#next").click(); await page.locator("#agent-instructions").waitFor();
      await page.locator("#agent-instructions").fill("LongWord".repeat(250));
      await page.locator("#next").click(); await reviewReady();
      await page.locator("#app-name").fill("A".repeat(80));
      const resizeNamingCount = suggestions.length;
      for (const width of [1440, 620, 360, 320, 980]) {
        await page.setViewportSize({ width, height: 900 }); await settle();
        await verifyWizardNavigation(3);
      }
      await page.locator(".create-progress").evaluate(nav => { nav.style.width = "280px"; });
      await verifyWizardNavigation(3);
      await page.locator(".create-progress").evaluate(nav => { nav.style.fontSize = "24px"; });
      await verifyWizardNavigation(3);
      check(await page.locator("#app-name").inputValue() === "A".repeat(80) &&
        suggestions.length === resizeNamingCount, "Wizard resizing and enlarged text preserve the name and do not regenerate it");
      await page.locator(".create-progress").evaluate(nav => { nav.style.removeProperty("width"); nav.style.removeProperty("font-size"); });
      await page.setViewportSize({ width: 320, height: 900 }); await settle();
      check(await page.locator(".create-review").evaluate(node => node.scrollWidth <= node.clientWidth) &&
        await page.locator("#app-name").getAttribute("maxlength") === "80",
        "Review wraps long draft content and retains the name limit");
      await page.locator("#top-back").click();
      check(await page.locator(".create-configure").evaluate(node => node.scrollWidth <= node.clientWidth) &&
        await page.locator("#agent-instructions").getAttribute("maxlength") === "2000" &&
        await page.locator("#agent-instructions").inputValue() === "LongWord".repeat(250),
        "Top Back restores the full instructions and their limit");
    }
    assert.deepEqual(errors, []);
    const result = { baseline, browser: await browser.version(), checks: checks.length, captures, errors,
      mutationCount: mutations.length, namingCount: suggestions.length };
    if (evidenceDir) await writeFile(join(evidenceDir, baseline ? "before.json" : "after.json"), JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error(JSON.stringify({ error: error.message, errors, status: await page.locator("#status").count() ? await page.locator("#status").textContent() : "unavailable",
      inlineDetails: await page.locator("[data-create-inline]").first().evaluate(node => node.outerHTML.slice(0, 2500)).catch(() => "unavailable") }));
    if (evidenceDir) await page.screenshot({ path: join(evidenceDir, "failure.png") });
    throw error;
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}

for (const name of ["chromium", "webkit"]) {
  test(`Create adoption preserves truthful compact guidance and real operation gates in ${name}`, {
    skip: !playwright && "Install src/web dependencies to run browser coverage.", timeout: 180000,
  }, async () => { await verifyCreateFlowBrowser(playwright[name]); });
}
