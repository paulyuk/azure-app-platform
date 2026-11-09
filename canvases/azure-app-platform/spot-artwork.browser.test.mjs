import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_EDITOR_SETTINGS } from "./editor-settings.mjs";
import { serveStudioAsset } from "./studio-assets.mjs";
import { renderStudioHtml } from "./studio-ui.mjs";
import { inspectSpotArtwork } from "./spot-artwork-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let playwright;
try { playwright = requireWeb("playwright"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const engine of ["chromium", "webkit"]) {
  test(`Cloud-component artwork preserves metaphors without timeline dots in ${engine}`, {
    skip: !playwright && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const browser = await playwright[engine].launch({ headless: true });
    try {
      const page = await browser.newPage();
      for (const [file, portCount] of [
        ["homepage-create.svg", 0], ["homepage-create-dark.svg", 0],
        ["homepage-open.svg", 0], ["homepage-open-dark.svg", 0],
        ["homepage-assemble.svg", 2], ["homepage-assemble-dark.svg", 2],
        ["open-app-empty-light.svg", 0], ["open-app-empty-dark.svg", 0],
        ["run-ready-spot.svg", 1], ["run-working-spot.svg", 1],
      ]) {
        const source = await readFile(new URL(`./assets/${file}`, import.meta.url), "utf8");
        await inspectSpotArtwork(page, source);
        const observed = await page.evaluate(source => {
          const svg = new DOMParser().parseFromString(source, "image/svg+xml");
          return {
            filledDots: svg.querySelectorAll("circle[fill]").length,
            ports: [...svg.querySelectorAll('[data-spot-part="port"]')].map(node => ({
              tag: node.localName,
              x: Number(node.getAttribute("x")), y: Number(node.getAttribute("y")),
              width: Number(node.getAttribute("width")), height: Number(node.getAttribute("height")),
              role: node.parentElement.getAttribute("data-spot-role"),
            })),
            accentCircles: svg.querySelectorAll('[data-spot-role="accent"] circle').length,
            componentSlots: svg.querySelectorAll('[data-spot-role="supporting-detail"] rect').length,
            description: svg.querySelector("desc").textContent,
          };
        }, source);
        assert.equal(observed.filledDots, 0, `${file} has no commit/timeline dots`);
        assert.equal(observed.ports.length, portCount, `${file} has only meaningful component ports`);
        for (const port of observed.ports) {
          assert.equal(port.tag, "rect");
          assert.equal(port.role, "accent");
          assert.equal(port.width, 24);
          assert.equal(port.height, 24);
          if (file.startsWith("homepage-assemble")) assert.equal(port.x + port.width / 2, 280, "Port attaches to the app boundary");
          if (file === "run-working-spot.svg") assert.equal(port.y + port.height / 2, 232, "Port attaches to the empty result window");
          if (file === "run-ready-spot.svg") assert.equal(port.x + port.width / 2, 304, "Port attaches to the task card");
        }
        if (file.startsWith("homepage-create")) assert.equal(observed.componentSlots, 1, "Create keeps one empty component slot");
        if (file.startsWith("open-app-empty")) assert.equal(observed.accentCircles, 1, "The circular add action is not a timeline dot");
        if (file === "run-working-spot.svg") assert.match(observed.description, /empty.*not success/);
      }
    } finally { await browser.close(); }
  });

  test(`Home and empty-state spot artwork follows live host roles in ${engine}`, {
    skip: !playwright && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const server = createServer((request, response) => {
      void (async () => {
        if (await serveStudioAsset(request, response, new URL(request.url, "http://localhost").pathname)) return;
        response.setHeader("Content-Type", "text/html");
        response.end(renderStudioHtml("spot-colors", "fixture", { theme: "light", presentationProfile: "github-app" }));
      })().catch(error => response.writeHead(500).end(error.message));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    let browser;
    try {
      browser = await playwright[engine].launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 380, height: 800 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => {
        const path = new URL(route.request().url()).pathname;
        const json = path === "/api/sources" ? { roots: [], apps: [], templates: [] }
          : path === "/api/editor-settings" ? DEFAULT_EDITOR_SETTINGS : path === "/api/preferences" ? { theme: "light" } : null;
        assert.ok(json, "No unexpected operations while viewing artwork: " + path);
        return route.fulfill({ json });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator("#new-app:not(:disabled)").waitFor();
      for (const surface of ["home", "empty"]) {
        if (surface === "empty") {
          await page.locator("#open-app").click();
          await page.getByRole("heading", { name: "Your next app starts here", exact: true }).waitFor();
        }
        const selector = surface === "home" ? ".simple-home-art svg:visible" : ".open-app-empty-art svg:visible";
        const button = surface === "home" ? "#new-app" : ".open-app-welcome button";
        const geometry = await page.locator(selector).evaluateAll(images =>
          images.map(image => [...image.querySelectorAll("path")].map(path => path.getAttribute("d"))));
        await page.locator(button).focus();
        for (const [tone, foreground, muted, accent, surfaceColor] of [
          ["light", "#302010", "#805030", "#b02070", "#fdf7e8"],
          ["dark", "#f0e0ff", "#d0b090", "#e090c0", "#201d30"],
        ]) {
          await page.evaluate(({ tone, foreground, muted, accent, surfaceColor }) => {
            const root = document.documentElement;
            root.dataset.themeTone = tone;
            for (const [token, value] of Object.entries({
              "--text-color-default": foreground, "--text-color-muted": muted,
              "--text-color-accent": accent, "--background-color-overlay": surfaceColor,
            })) root.style.setProperty(token, value);
          }, { tone, foreground, muted, accent, surfaceColor });
          const observed = await page.locator(selector).evaluateAll(images => images.map(image => {
            const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
            image.append(probe);
            const resolve = token => {
              probe.setAttribute("fill", `var(${token})`);
              return getComputedStyle(probe).fill;
            };
            const roles = [["outline", "--studio-ink"], ["supporting-detail", "--studio-muted"], ["accent", "--studio-accent"]];
            const colors = roles.map(([role, token]) => [getComputedStyle(image.querySelector(`[data-spot-role="${role}"] path, [data-spot-role="${role}"] rect`)).stroke, resolve(token)]);
            for (const circle of image.querySelectorAll("circle[fill]")) {
              const role = circle.getAttribute("data-spot-role") || circle.parentElement.getAttribute("data-spot-role");
              colors.push([getComputedStyle(circle).fill, resolve(role === "surface" ? "--studio-raised" : role === "accent" ? "--studio-accent" : "--studio-muted")]);
            }
            probe.remove();
            return { colors, decorative: image.getAttribute("aria-hidden"), focusable: image.getAttribute("focusable") };
          }));
          assert.equal(observed.length, surface === "home" ? 3 : 1);
          for (const image of observed) {
            for (const [actual, expected] of image.colors) assert.equal(actual, expected, `${surface}/${tone} maps every semantic role`);
            assert.equal(new Set(image.colors.slice(0, 3).map(([actual]) => actual)).size, 3);
            assert.equal(image.decorative, "true");
            assert.equal(image.focusable, "false");
          }
          assert.deepEqual(await page.locator(selector).evaluateAll(images =>
            images.map(image => [...image.querySelectorAll("path")].map(path => path.getAttribute("d")))), geometry);
          assert.equal(await page.locator(button).evaluate(node => node === document.activeElement), true);
          assert.equal(await page.evaluate(() => {
            const ids = [...document.querySelectorAll("[id]")].map(node => node.id);
            return ids.length === new Set(ids).size;
          }), true);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
      }
      assert.deepEqual(errors, []);
    } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  });
}
