import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";
import { readFile } from "node:fs/promises";
import { inspectSpotArtwork } from "./spot-artwork-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Waiting line artwork follows distinct host color roles in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      for (const presentationProfile of ["standalone", "github-app"]) {
        for (const state of ["waiting"]) {
          const fixture = await createRunSettingsFixture({ preview: true, presentationProfile });
          const page = await browser.newPage({ viewport: { width: 430, height: 800 } });
          let release;
          try {
            await page.route("**/api/agent-invoke", async route => {
              await new Promise(resolve => { release = resolve; });
              await route.fulfill({ json: { response: "Complete" } });
            });
            await page.goto(fixture.origin + "/app-map");
            await inspectSpotArtwork(page, await readFile(new URL(`./assets/run-${state === "idle" ? "ready" : "working"}-spot.svg`, import.meta.url), "utf8"));
            await page.locator(".agent-result-idle-spinner .ct-spinner-ring").waitFor();
            if (state === "waiting") {
              await page.getByRole("textbox", { name: "Agent message", exact: true }).fill("Check the waiting illustration palette.");
              await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
              await page.locator('.agent-response[data-phase="waiting"]').waitFor();
            }
            const svg = page.locator(".agent-response svg.agent-result-illustration");
            await svg.waitFor();
            const geometry = await svg.evaluate(node => [...node.querySelectorAll("path")].map(path => path.getAttribute("d")));
            const palettes = [];
            for (const theme of ["light", "dark"]) {
              if (presentationProfile === "github-app") {
                await page.evaluate(theme => {
                  const hostColors = theme === "light"
                    ? { "--background-color-overlay": "#fdf7e8", "--text-color-default": "#302010", "--text-color-muted": "#805030",
                      "--text-color-accent": "#b02070", "--background-color-accent-muted": "#f8d0e8",
                      "--text-color-button-primary-rest": "#fffaf0", "--true-color-blue": "#1473e6" }
                    : { "--background-color-overlay": "#201d30", "--text-color-default": "#f0e0ff", "--text-color-muted": "#d0b090",
                      "--text-color-accent": "#e090c0", "--background-color-accent-muted": "#403050",
                      "--text-color-button-primary-rest": "#302010", "--true-color-blue": "#82baff" };
                  for (const [token, value] of Object.entries(hostColors)) document.documentElement.style.setProperty(token, value);
                }, theme);
              }
              await page.evaluate(theme => { document.documentElement.dataset.studioTheme = theme; }, theme);
              const palette = await svg.evaluate(node => {
                const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
                node.append(probe);
                const resolve = token => {
                  probe.setAttribute("fill", "var(" + token + ")");
                  return getComputedStyle(probe).fill;
                };
                const colors = [
                  [getComputedStyle(node.querySelector('[data-spot-role="outline"] path')).stroke, resolve("--studio-ink")],
                  [getComputedStyle(node.querySelector('[data-spot-role="supporting-detail"] path')).stroke, resolve("--studio-muted")],
                  [getComputedStyle(node.querySelector('[data-spot-role="accent"] path')).stroke, resolve("--studio-accent")],
                  [getComputedStyle(node.querySelector('[data-spot-part="port"]')).stroke, resolve("--studio-accent")],
                ];
                probe.remove();
                return colors;
              });
              for (const [actual, expected] of palette) assert.equal(actual, expected, `${state} ${presentationProfile} ${theme} uses semantic theme tokens`);
              palettes.push(palette.map(([actual]) => actual));
              assert.equal(new Set(palette.slice(0, 3).map(([actual]) => actual)).size, 3,
                "Neutral subject, supporting detail and selective accent remain distinct");
              assert.deepEqual(await svg.evaluate(node => [...node.querySelectorAll("path")].map(path => path.getAttribute("d"))), geometry);
              assert.equal(await svg.getAttribute("aria-hidden"), "true");
              assert.equal(await svg.getAttribute("focusable"), "false");
            }
            assert.notDeepEqual(palettes[0], palettes[1], `${state} ${presentationProfile} must follow live theme colors`);
            if (presentationProfile === "github-app") {
              assert.deepEqual(palettes[0], ["rgb(48, 32, 16)", "rgb(128, 80, 48)", "rgb(176, 32, 112)", "rgb(176, 32, 112)"]);
              assert.deepEqual(palettes[1], ["rgb(240, 224, 255)", "rgb(208, 176, 144)", "rgb(224, 144, 192)", "rgb(224, 144, 192)"]);
            }
          } finally { release?.(); await page.close(); await fixture.close(); }
        }
      }
    } finally { await browser.close(); }
  });
}
