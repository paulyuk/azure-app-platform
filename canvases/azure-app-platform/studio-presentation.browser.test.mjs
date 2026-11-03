import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { EMPTY_TEMPLATE } from "./source-catalog.mjs";
import { DEFAULT_EDITOR_SETTINGS } from "./editor-settings.mjs";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";
import { selectWorkspace } from "./workspace-navigation-test-helpers.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const graph = {
  root: "/fixture/dealer", nodes: [
    { id: "agent", tierId: "agent", kind: "project", name: "Claims agent", projectPath: "src/agent", badges: [], evidence: [] },
    { id: "inventory", tierId: "skills", kind: "project", name: "Claim lookup", projectPath: "src/skills/inventory", badges: [], evidence: [] },
  ], edges: [], summary: { projectNodes: 2, operationNodes: 0, edges: 0 },
};

test("packaged presentation follows late host delivery without remounting controls or changing the journey", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "unity-presentation-browser-"));
  const payload = join(root, "installed plugin");
  let server, browser, fixture;
  const evidence = [];
  const hostProof = [];
  try {
    await cp(fileURLToPath(new URL("./", import.meta.url)), payload, {
      recursive: true,
      filter: file => !["node_modules", ".git"].includes(basename(file)) && !file.endsWith(".test.mjs"),
    });
    const { renderStudioHtml } = await import(pathToFileURL(join(payload, "studio-ui.mjs")));
    const { renderInteractiveAppMapHtml } = await import(pathToFileURL(join(payload, "interactive-app-map.mjs")));
    const { serveStudioAsset } = await import(pathToFileURL(join(payload, "studio-assets.mjs")));
    const provenance = JSON.parse(await readFile(join(payload, "vendor", "toolkit", "provenance.json")));
    for (const file of provenance.files) {
      assert.equal(hash(await readFile(join(payload, "vendor", "toolkit", file.file))), file.sha256);
    }
    let baseline;
    if (process.env.UNITY_PRESENTATION_BASELINE_DIR) {
      baseline = {
        ...await import(pathToFileURL(join(process.env.UNITY_PRESENTATION_BASELINE_DIR, "studio-ui.mjs"))),
        ...await import(pathToFileURL(join(process.env.UNITY_PRESENTATION_BASELINE_DIR, "interactive-app-map.mjs"))),
        ...await import(pathToFileURL(join(process.env.UNITY_PRESENTATION_BASELINE_DIR, "studio-assets.mjs"))),
      };
    }
    fixture = await createRunSettingsFixture();
    let renderingBaseline = false;
    server = createServer((request, response) => {
      void (async () => {
        const url = new URL(request.url, "http://localhost");
        if (url.pathname === "/" || url.pathname === "/app-map") renderingBaseline = url.searchParams.has("baseline");
        if (await (renderingBaseline && baseline ? baseline.serveStudioAsset : serveStudioAsset)(request, response, url.pathname)) return;
        const theme = url.searchParams.get("theme") || "light";
        const options = { theme, apiToken: "fixture", appName: "Claims · synthetic fixture",
          presentationProfile: url.searchParams.get("profile") || "github-app" };
        const renderer = url.searchParams.has("baseline") ? baseline : { renderStudioHtml, renderInteractiveAppMapHtml };
        if (!renderer) throw new Error("No baseline source was supplied.");
        const html = url.pathname === "/app-map"
          ? renderer.renderInteractiveAppMapHtml(graph, options)
          : renderer.renderStudioHtml("presentation-proof", "fixture", options);
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(html);
      })().catch(error => { response.writeHead(500); response.end(error.message); });
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ reducedMotion: "reduce" });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path === "/api/sources") {
        await route.fulfill({ json: { roots: [], apps: [], templates: [EMPTY_TEMPLATE] } }); return;
      }
      if (path === "/api/editor-settings") {
        await route.fulfill({ json: DEFAULT_EDITOR_SETTINGS }); return;
      }
      if (path === "/api/build-workspace") {
        await route.fulfill({ json: { artifacts: [{
          id: "agent", customizationArea: "behavior", title: "Agent instructions", path: "src/agent/main.py",
          projectPath: "src/agent", projectName: "Claims agent", available: true, sha: "fixture",
          content: 'def main():\n    return "Review verified claims"\n',
        }], editorSettings: DEFAULT_EDITOR_SETTINGS } }); return;
      }
      const forwarded = await fetch(fixture.origin + new URL(request.url()).pathname, {
        method: request.method(), headers: { "X-App-Platform-Token": "fixture" },
        ...(request.postData() ? { body: request.postData() } : {}),
      });
      await route.fulfill({ status: forwarded.status, contentType: "application/json", body: await forwarded.text() });
    });
    const output = process.env.UNITY_PRESENTATION_EVIDENCE_DIR;
    if (output) await mkdir(output, { recursive: true });
    async function capture(label) {
      if (!output) return;
      const screenshot = await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
      evidence.push({ label, synthetic: true, screenshotSha256: hash(screenshot), htmlSha256: hash(await page.content()) });
    }
    async function openReview(query) {
      await page.goto(origin + "/" + query);
      await page.locator("#new-app").click();
      await page.locator('input[name="template"]').waitFor();
      await page.locator("#app-name").fill("claims-app");
      await page.locator("#purpose").fill("Review claims safely.");
      await page.locator("#next").click();
      await page.locator("#agent-instructions").fill("Use verified tool results.");
      await page.locator("#next").click();
      await page.locator("#review-notice .ct-message").waitFor();
    }
    // This is the documented non-nonced style-element delivery shape, not native-host proof.
    async function deliverHost(tone, late = false) {
      await page.evaluate(({ tone, late }) => {
        const root = document.documentElement;
        root.dataset.themeTone = tone;
        root.dataset.colorMode = tone === "light" ? "dark" : "light";
        let style = document.querySelector("#synthetic-host");
        if (!style) { style = document.createElement("style"); style.id = "synthetic-host"; document.head.prepend(style); }
        const dark = tone === "dark";
        const background = late ? (dark ? "rgb(28, 20, 43)" : "rgb(249, 244, 238)") :
          (dark ? "rgb(31, 45, 59)" : "rgb(244, 249, 253)");
        const foreground = late ? (dark ? "rgb(224, 205, 245)" : "rgb(90, 54, 18)") :
          (dark ? "rgb(193, 214, 235)" : "rgb(17, 83, 121)");
        style.textContent = `:root {
          --background-color-default: ${background};
          --background-color-overlay: ${background};
          --text-color-default: ${foreground};
          --text-color-muted: ${dark ? "rgb(164, 183, 202)" : "rgb(67, 87, 107)"};
          --text-color-accent: ${dark ? "rgb(210, 170, 239)" : "rgb(124, 47, 150)"};
          --border-color-default: rgb(41, 106, 77);
          --background-color-muted: ${dark ? "rgb(40, 54, 68)" : "rgb(229, 239, 247)"};
          --background-color-button-primary-rest: rgb(36, 76, 116);
          --text-color-button-primary-rest: rgb(250, 251, 252);
          --font-sans: ${late ? '"Trebuchet MS", sans-serif' : '"Courier New", monospace'};
          --text-body-medium: ${late ? "18px" : "17px"};
          --leading-body-medium: ${late ? "28px" : "26px"};
        }`;
      }, { tone, late });
    }
    for (const tone of ["light", "dark"]) {
      for (const width of [320, 1000]) {
        await page.setViewportSize({ width, height: 900 });
        if (baseline) {
          await openReview(`?theme=${tone}&baseline=1`);
          await capture(`before-afdb270-${tone}-${width}-review`);
          await page.goto(origin + `/app-map?theme=${tone}&baseline=1`);
          await page.waitForFunction(() => window.appPlatformReady);
          await page.locator(".build-file").waitFor();
          await capture(`before-afdb270-${tone}-${width}-build`);
          await page.locator("#manage-app").click();
          await page.getByRole("textbox", { name: "Agent message", exact: true }).waitFor();
          await capture(`before-afdb270-${tone}-${width}-run`);
          await page.locator("#map-app").click();
          await capture(`before-afdb270-${tone}-${width}-observe`);
        }
        await openReview(`?theme=${tone}&profile=standalone`);
        assert.equal(await page.locator("html").getAttribute("data-studio-presentation"), "standalone");
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), "16px");
        await capture(`standalone-${tone}-${width}-review`);
        await deliverHost(tone);
        assert.equal(await page.locator("html").getAttribute("data-studio-presentation"), "standalone",
          "Host-like attributes must never select an integration");
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).color),
          tone === "light" ? "rgb(31, 35, 40)" : "rgb(237, 240, 245)");
        await openReview(`?theme=${tone}`);
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).color),
          tone === "light" ? "rgb(31, 35, 40)" : "rgb(230, 237, 243)");
        await capture(`github-app-fallback-${tone}-${width}-review`);
        const next = page.locator("#next");
        await next.focus();
        await page.locator("#open-editor").uncheck();
        await next.focus();
        await page.evaluate(() => {
          window.presentationSavedButton = document.querySelector("#next");
          window.presentationSavedMessage = document.querySelector("#review-notice .ct-message");
        });
        await deliverHost(tone);
        const read = () => page.evaluate(() => {
          const body = getComputedStyle(document.body), message = getComputedStyle(document.querySelector("#review-notice .ct-message"));
          const button = getComputedStyle(document.querySelector("#next"));
          return {
            color: body.color, background: body.backgroundColor, family: body.fontFamily, size: body.fontSize,
            lineHeight: body.lineHeight,
            scheme: getComputedStyle(document.documentElement).colorScheme, rootSize: getComputedStyle(document.documentElement).fontSize,
            messageColor: message.color, messagePadding: message.padding, messageRadius: message.borderRadius,
            buttonColor: button.color, buttonBackground: button.backgroundColor, buttonRadius: button.borderRadius,
            buttonWeight: button.fontWeight, buttonPadding: button.padding,
            reviewRadius: getComputedStyle(document.querySelector(".review-row")).borderRadius,
            reviewPadding: getComputedStyle(document.querySelector(".review-row")).padding,
            sameButton: document.querySelector("#next") === window.presentationSavedButton,
            sameMessage: document.querySelector("#review-notice .ct-message") === window.presentationSavedMessage,
            focused: document.activeElement === window.presentationSavedButton,
          };
        });
        const initial = await read();
        assert.equal(initial.color, tone === "light" ? "rgb(17, 83, 121)" : "rgb(193, 214, 235)");
        assert.equal(initial.background, tone === "light" ? "rgb(244, 249, 253)" : "rgb(31, 45, 59)");
        assert.match(initial.family, /Courier New/);
        assert.equal(initial.size, "17px");
        assert.equal(initial.lineHeight, "26px");
        assert.equal(initial.messageColor, initial.color);
        assert.equal(initial.messagePadding, "16px");
        assert.equal(initial.messageRadius, "6px");
        assert.equal(initial.buttonRadius, "6px");
        assert.equal(initial.buttonWeight, "500");
        assert.equal(initial.buttonPadding, "5px 12px");
        assert.equal(initial.reviewRadius, "6px");
        assert.equal(initial.reviewPadding, "16px");
        assert.equal(initial.buttonBackground, "rgb(36, 76, 116)");
        assert.equal(initial.buttonColor, "rgb(250, 251, 252)");
        assert.equal(initial.scheme, tone);
        assert.equal(initial.rootSize, "16px");
        assert.ok(initial.sameButton && initial.sameMessage && initial.focused);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await capture(`github-app-${tone}-${width}-review`);
        await page.evaluate(() => {
          const alternate = document.createElement("style");
          alternate.id = "synthetic-alternate-presentation";
          alternate.textContent = `:root.synthetic-alternate-presentation {
            --canvas-button-radius: 0px;
            --canvas-button-padding-inline: 1.25rem;
            --canvas-message-radius: .75rem;
            --canvas-message-padding: 1.5rem;
            --canvas-radius-surface: 0px;
            --canvas-spacing-normal: 1.5rem;
          }`;
          document.head.append(alternate);
          document.documentElement.classList.add("synthetic-alternate-presentation");
        });
        const alternate = await read();
        assert.equal(alternate.buttonRadius, "0px");
        assert.equal(alternate.buttonPadding, "5px 20px");
        assert.equal(alternate.messageRadius, "12px");
        assert.equal(alternate.messagePadding, "24px");
        assert.equal(alternate.reviewRadius, "0px");
        assert.equal(alternate.reviewPadding, "24px");
        assert.equal(alternate.color, initial.color, "Structural profile switching must not replace the live host palette");
        assert.ok(alternate.sameButton && alternate.sameMessage && alternate.focused);
        assert.equal(await page.locator("#open-editor").isChecked(), false);
        await page.evaluate(() => {
          document.documentElement.classList.remove("synthetic-alternate-presentation");
          document.querySelector("#synthetic-alternate-presentation").remove();
        });
        const restored = await read();
        assert.equal(restored.buttonRadius, initial.buttonRadius);
        assert.equal(restored.messagePadding, initial.messagePadding);
        assert.equal(restored.reviewRadius, initial.reviewRadius);
        assert.equal(restored.reviewPadding, initial.reviewPadding);
        assert.ok(restored.sameButton && restored.sameMessage && restored.focused);
        await page.evaluate(() => {
          const scale = document.createElement("style");
          scale.id = "synthetic-root-scale";
          scale.textContent = ":root.studio-shared-presentation { font-size: 20px; }";
          document.head.append(scale);
        });
        const scaled = await read();
        assert.equal(scaled.rootSize, "20px");
        assert.equal(scaled.buttonRadius, "7.5px");
        assert.equal(scaled.messagePadding, "20px");
        assert.equal(scaled.reviewPadding, "20px");
        assert.ok(scaled.sameButton && scaled.sameMessage && scaled.focused);
        await page.evaluate(() => document.querySelector("#synthetic-root-scale").remove());
        await deliverHost(tone === "light" ? "dark" : "light", true);
        const late = await read();
        assert.equal(late.color, tone === "light" ? "rgb(224, 205, 245)" : "rgb(90, 54, 18)");
        assert.match(late.family, /Trebuchet/);
        assert.equal(late.size, "18px");
        assert.equal(late.lineHeight, "28px");
        assert.equal(late.scheme, tone === "light" ? "dark" : "light");
        assert.ok(late.sameButton && late.sameMessage && late.focused);
        hostProof.push({ tone, width, initial, alternate, restored, scaled, late });
        assert.equal(await page.locator("#open-editor").isChecked(), false);
        await page.evaluate(() => {
          document.documentElement.dataset.themeTone = "invalid";
          document.documentElement.dataset.colorMode = "dark";
        });
        assert.equal((await read()).scheme, "dark");
        // A saved preference update cannot change integration identity or override the host.
        await page.getByRole("button", { name: "Settings", exact: true }).click();
        await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(tone === "light" ? "dark" : "light");
        await page.getByRole("button", { name: "Close settings", exact: true }).click();
        assert.equal((await read()).color, late.color);
        assert.equal(await page.locator("html").getAttribute("data-studio-presentation"), "github-app");
        await page.goto(origin + `/app-map?theme=${tone}`);
        await page.waitForFunction(() => window.appPlatformReady);
        await page.locator(".build-file").waitFor();
        await capture(`github-app-fallback-${tone}-${width}-build`);
        await deliverHost(tone);
        await page.locator(".build-file").waitFor();
        assert.equal(await page.locator(".build-file").evaluate(element => getComputedStyle(element).borderRadius), "6px");
        await capture(`github-app-${tone}-${width}-build`);
        await selectWorkspace(page, "manage-app");
        const prompt = page.getByRole("textbox", { name: "Agent message", exact: true });
        await prompt.waitFor();
        await prompt.fill("Preserve this claims draft.");
        await prompt.focus();
        await deliverHost(tone, true);
        assert.equal(await prompt.inputValue(), "Preserve this claims draft.");
        assert.equal(await prompt.evaluate(element => element === document.activeElement), true);
        assert.equal(await page.locator("#details").evaluate(element => getComputedStyle(element).color),
          tone === "light" ? "rgb(90, 54, 18)" : "rgb(224, 205, 245)");
        await capture(`github-app-${tone}-${width}-run`);
        await selectWorkspace(page, "map-app");
        await capture(`github-app-${tone}-${width}-observe`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    }
    assert.deepEqual(errors, []);
    if (output) {
      const sourceFiles = ["studio-presentation.mjs", "studio-theme.mjs", "studio-ui.mjs", "interactive-app-map.mjs", "extension.mjs"];
      await writeFile(join(output, "evidence.json"), JSON.stringify({
        nativeHostDelivery: "not measured; synthetic non-nonced delivery only",
        baselineCommit: baseline ? "afdb270e7985adbc2ef7d852e33c1bbbe6174dfa" : null,
        toolkit: provenance,
        hostProof,
        sourceHashes: Object.fromEntries(await Promise.all(sourceFiles.map(async file =>
          [file, hash(await readFile(join(payload, file)))]))),
        evidence,
      }, null, 2) + "\n");
    }
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await fixture?.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
