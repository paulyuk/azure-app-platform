import { installToolkitRoutes } from "./toolkit-test-fixture.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { renderStudioHtml } from "./studio-ui.mjs";
import { serveStudioAsset } from "./studio-assets.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium;
try { ({ chromium } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

test("Unity branding and opening animation work in the browser", {
  skip: !chromium && "Install src/web dependencies to run browser coverage.",
}, async (t) => {
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url, "http://localhost");
      if (await serveStudioAsset(request, response, url.pathname)) return;
      if (url.pathname === "/api/preferences") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ theme: "light" }));
        return;
      }
      if (url.pathname === "/api/editor-settings") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          editorId: "vscode",
          editors: [
            { id: "vscode", label: "VS Code" },
            { id: "cursor", label: "Cursor" },
          ],
        }));
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(renderStudioHtml("brand-fixture", "fixture", {
        theme: url.searchParams.get("theme") || "light",
        intro: url.searchParams.get("intro") === "1",
      }));
    })().catch((error) => { response.writeHead(500); response.end(error.message); });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  const scenario = async (name, run) => t.test(name, async () => {
    const page = await browser.newPage({ reducedMotion: "no-preference" });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try { await run(page); assert.deepEqual(errors, []); } finally { await page.close(); }
  });
  const rememberVideo = (page) => page.evaluate(() => { window.introVideo = document.querySelector("video"); });
  const assertFinished = async (page, warning = "") => {
    await page.locator(".studio-intro").waitFor({ state: "detached" });
    await page.locator("#new-app").waitFor();
    assert.equal(await page.locator("#new-app").evaluate((element) => element === document.activeElement), true);
    assert.match(await page.locator(".studio-intro-notice").textContent(), new RegExp(warning));
    assert.deepEqual(await page.evaluate(() => ({
      paused: window.introVideo.paused, source: window.introVideo.getAttribute("src"),
    })), { paused: true, source: null });
  };
  try {
    await scenario("real muted playback can be skipped immediately without replaying on navigation", async (page) => {
      await installToolkitRoutes(page);

      await page.goto(`${base}/?intro=1`);
      await page.waitForFunction(() => window.unityStudioReady);
      await rememberVideo(page);
      assert.equal(await page.getByRole("button", { name: "Skip", exact: true }).evaluate((element) => element === document.activeElement), true);
      await page.waitForFunction(() => document.querySelector("video")?.currentTime > .1);
      const media = await page.locator("video").evaluate((video) => ({
        duration: video.duration, muted: video.muted, inline: video.playsInline,
      }));
      assert.ok(Math.abs(media.duration - 12) < .1);
      assert.equal(media.muted, true);
      assert.equal(media.inline, true);
      await page.getByRole("button", { name: "Skip", exact: true }).click();
      await assertFinished(page);
      assert.equal(await page.locator(".studio-intro-notice").textContent(), "");
      assert.equal(await page.locator("html").getAttribute("data-studio-theme"), "light");
      assert.equal(new URL(page.url()).searchParams.has("intro"), false);
      await page.reload();
      await page.waitForFunction(() => window.unityStudioReady);
      assert.equal(await page.locator(".studio-intro").count(), 0);
      assert.equal(await page.getByRole("link", { name: "Unity Studio home" }).count(), 0);
      await page.getByRole("button", { name: /Assemble existing pieces/ }).click();
      assert.equal(await page.getByRole("link", { name: "Unity Studio home" }).isVisible(), true);
      assert.equal(await page.locator(".studio-welcome-brand").count(), 0);
      await page.locator("#back").click();
      assert.equal(await page.locator(".studio-intro").count(), 0);
      assert.equal(await page.locator(".studio-welcome-brand").count(), 1);
      assert.equal(await page.getByRole("link", { name: "Unity Studio home" }).count(), 0);
      await page.getByRole("button", { name: /Assemble existing pieces/ }).click();
      await page.getByRole("link", { name: "Unity Studio home" }).click();
      await page.waitForFunction(() => window.unityStudioReady);
      assert.equal(await page.locator(".studio-intro").count(), 0);
      assert.equal(await page.getByRole("link", { name: "Unity Studio home" }).count(), 0);
    });
    await scenario("real video completion opens the landing page automatically", async (page) => {
      await installToolkitRoutes(page);

      await page.goto(`${base}/?intro=1`);
      await page.waitForFunction(() => window.unityStudioReady);
      await rememberVideo(page);
      await page.evaluate(() => { window.introVideo.addEventListener("ended", () => { window.didEnd = true; }); });
      await page.waitForFunction(() => window.didEnd, { }, { timeout: 16000 });
      await assertFinished(page);
      assert.equal(await page.locator(".studio-intro-notice").textContent(), "");
      assert.equal(await page.locator("html").getAttribute("data-studio-theme"), "light");
    });
    await scenario("Escape dismisses the modal and keeps focus out of the background", async (page) => {
      await installToolkitRoutes(page);

      await page.goto(`${base}/?intro=1`);
      await page.waitForFunction(() => window.unityStudioReady);
      await rememberVideo(page);
      assert.equal(await page.locator(".studio-intro").evaluate((dialog) => dialog.matches(":modal")), true);
      await page.locator("#new-app").evaluate((button) => button.focus());
      assert.equal(await page.locator("#new-app").evaluate((button) => button === document.activeElement), false);
      await page.keyboard.press("Escape");
      await assertFinished(page);
    });
    await scenario("reduced motion never fetches the animation", async (page) => {
      let mediaRequests = 0;
      page.on("request", (request) => { if (request.url().endsWith(".mp4")) mediaRequests++; });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await installToolkitRoutes(page);

      await page.goto(`${base}/?intro=1`);
      await page.waitForFunction(() => window.unityStudioReady);
      assert.equal(await page.locator(".studio-intro").count(), 0);
      await page.locator("#new-app").waitFor();
      assert.equal(await page.getByRole("button", { name: "Create", exact: true }).isVisible(), true);
      assert.equal(mediaRequests, 0);
    });
    await scenario("switching to reduced motion ends active playback", async (page) => {
      await installToolkitRoutes(page);

      await page.goto(`${base}/?intro=1`);
      await page.waitForFunction(() => window.unityStudioReady);
      await rememberVideo(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await assertFinished(page);
    });
    await scenario("a missing video opens Studio with a clear notice", async (page) => {
      await page.route("**/assets/unity-intro.mp4", (route) => route.fulfill({ status: 404, body: "Not found" }));
      await page.addInitScript(() => {
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () { window.introVideo = this; return play.call(this); };
      });
      await installToolkitRoutes(page);

      await page.goto(`${base}/?intro=1`);
      await page.waitForFunction(() => window.unityStudioReady);
      await assertFinished(page, "could not");
    });
    await scenario("blocked autoplay does not trap the user", async (page) => {
      await page.addInitScript(() => {
        HTMLMediaElement.prototype.play = function () {
          window.introVideo = this;
          return Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
        };
      });
      await installToolkitRoutes(page);

      await page.goto(`${base}/?intro=1`);
      await page.waitForFunction(() => window.unityStudioReady);
      await assertFinished(page, "automatically");
    });
    await scenario("stalled loading times out instead of hiding the start page indefinitely", async (page) => {
      await page.route("**/assets/unity-intro.mp4", (route) => route.abort());
      await page.addInitScript(() => {
        HTMLMediaElement.prototype.play = function () {
          window.introVideo = this;
          this.removeAttribute("src");
          return new Promise(() => {});
        };
      });
      await page.clock.install();
      await installToolkitRoutes(page);

      await page.goto(`${base}/?intro=1`);
      await page.waitForFunction(() => window.unityStudioReady);
      await page.clock.fastForward(5001);
      await assertFinished(page, "too long");
    });
    await scenario("the supplied symbol and tagline fit compact light and dark start pages", async (page) => {
      for (const theme of ["light", "dark"]) {
        for (const width of [320, 400, 620, 840, 1440]) {
          await page.setViewportSize({ width, height: 740 });
          await installToolkitRoutes(page);

          await page.goto(`${base}/?theme=${theme}`);
          await page.waitForFunction(() => window.unityStudioReady);
          await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth === 394));
          assert.equal(await page.locator(".studio-brand img").getAttribute("src"), "/assets/unity-symbol.png");
          assert.equal(await page.locator(".studio-welcome-brand img").getAttribute("src"), "/assets/unity-symbol.png");
          assert.equal(await page.locator(".studio-brand").isVisible(), false);
          assert.equal(await page.locator("img:visible").count(), 1);
          assert.equal(await page.getByRole("link", { name: "Docs", exact: true }).isVisible(), true);
          assert.equal(await page.getByRole("button", { name: "Settings", exact: true }).isVisible(), true);
          if (width === 400) {
            await page.getByRole("button", { name: "Settings", exact: true }).click();
            const settings = page.getByRole("dialog", { name: "Settings", exact: true });
            assert.equal(await settings.getByRole("combobox", { name: "Appearance" }).inputValue(), theme);
            assert.equal(await settings.getByRole("combobox", {
              name: "Preferred external editor",
            }).inputValue(), "vscode");
            assert.equal(await settings.locator("[data-settings-section]").count(), 0);
            await page.keyboard.press("Escape");
          }
          const utilities = await page.locator(".studio-theme-control").boundingBox();
          const nav = await page.locator(".studio-site-nav").boundingBox();
          assert.ok(Math.abs(utilities.x + utilities.width - nav.x - nav.width) < 1, "Utilities remain right-aligned");
          assert.equal(await page.locator(".studio-tagline").textContent(), "The self-aware app platform");
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          const images = await page.locator("img").evaluateAll((images) => images.map((image) => ({
            fit: getComputedStyle(image).objectFit,
            ratio: image.getBoundingClientRect().width / image.getBoundingClientRect().height,
          })));
          for (const image of images) assert.ok(image.fit === "contain" || Math.abs(image.ratio - 394 / 338) < .01);
        }
        for (const [width, height] of [[320, 480], [620, 400], [1440, 900]]) {
          await page.setViewportSize({ width, height });
          await installToolkitRoutes(page);

          await page.goto(`${base}/?intro=1&theme=${theme}`);
          await page.waitForFunction(() => window.unityStudioReady);
          const bodyBackground = await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
          const appearance = await page.locator(".studio-intro").evaluate((dialog) => ({
            background: getComputedStyle(dialog).backgroundColor,
            backdrop: getComputedStyle(dialog, "::backdrop").backgroundColor,
            colorScheme: getComputedStyle(dialog).colorScheme,
            children: [...dialog.children].map((child) => child.tagName),
          }));
          assert.deepEqual(appearance, {
            background: "rgb(0, 0, 0)", backdrop: "rgb(0, 0, 0)", colorScheme: "dark", children: ["VIDEO", "BUTTON"],
          });
          assert.equal(await page.locator("html").getAttribute("data-studio-theme"), theme);
          const skip = await page.getByRole("button", { name: "Skip", exact: true }).boundingBox();
          assert.ok(skip.x >= 0 && skip.y >= 0 && skip.x + skip.width <= width && skip.y + skip.height <= height);
          assert.ok(skip.width <= 72 && skip.height <= 36, "Skip stays small without a footer");
          const video = await page.locator("video").boundingBox();
          assert.deepEqual(video, { x: 0, y: 0, width, height });
          assert.equal(await page.locator("video").evaluate((video) => getComputedStyle(video).objectFit), "contain");
          await page.getByRole("button", { name: "Skip", exact: true }).click();
          assert.equal(await page.locator("html").getAttribute("data-studio-theme"), theme);
          assert.equal(await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor), bodyBackground);
        }
      }
    });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
