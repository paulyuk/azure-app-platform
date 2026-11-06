import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Idle and waiting SVGs retain the same theme-aware brand palette in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      for (const presentationProfile of ["standalone", "github-app"]) {
        for (const state of ["idle", "waiting"]) {
          const fixture = await createRunSettingsFixture({ preview: true, presentationProfile });
          const page = await browser.newPage({ viewport: { width: 430, height: 800 } });
          let release;
          try {
            await page.route("**/api/agent-invoke", async route => {
              await new Promise(resolve => { release = resolve; });
              await route.fulfill({ json: { response: "Complete" } });
            });
            await page.goto(fixture.origin + "/app-map");
            const svg = page.locator(".agent-response svg.agent-result-illustration");
            await svg.waitFor();
            if (state === "waiting") {
              await page.getByRole("textbox", { name: "Agent message", exact: true }).fill("Check the waiting illustration palette.");
              await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
              await page.locator('.agent-response[data-phase="waiting"]').waitFor();
            }
            const geometry = await svg.evaluate(node => [...node.querySelectorAll("path")].map(path => path.getAttribute("d")));
            const palettes = [];
            for (const theme of ["light", "dark"]) {
              if (presentationProfile === "github-app") {
                await page.evaluate(theme => {
                  const hostColors = theme === "light"
                    ? { "--background-color-overlay": "#fdf7e8", "--text-color-muted": "#805030",
                      "--text-color-accent": "#b02070", "--background-color-accent-muted": "#f8d0e8",
                      "--text-color-button-primary-rest": "#fffaf0", "--true-color-blue": "#1473e6" }
                    : { "--background-color-overlay": "#201d30", "--text-color-muted": "#d0b090",
                      "--text-color-accent": "#e090c0", "--background-color-accent-muted": "#403050",
                      "--text-color-button-primary-rest": "#302010", "--true-color-blue": "#82baff" };
                  for (const [token, value] of Object.entries(hostColors)) document.documentElement.style.setProperty(token, value);
                }, theme);
              }
              await page.evaluate(theme => { document.documentElement.dataset.studioTheme = theme; }, theme);
              const palette = await svg.evaluate((node, state) => {
                const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
                node.append(probe);
                const resolve = token => {
                  probe.setAttribute("fill", "var(" + token + ")");
                  return getComputedStyle(probe).fill;
                };
                const brand = state === "idle"
                  ? getComputedStyle(node.querySelector("#connection-dispatch > circle")).fill
                  : getComputedStyle(node.querySelector("#connection-route > path")).stroke;
                const colors = [
                  [getComputedStyle(node.querySelector("#subject-intake > use")).fill, resolve("--run-art-paper")],
                  [getComputedStyle(node.querySelector("#subject-intake > path")).stroke, resolve("--run-art-outline")],
                  [getComputedStyle(node.querySelector("#subject-task > path")).fill, resolve("--run-art-task")],
                  [brand, resolve("--true-color-blue")],
                  [getComputedStyle(node.querySelector("#subject-intake > path[fill]")).fill, resolve("--run-art-soft-blue")],
                ];
                if (state === "idle") colors.push([
                  getComputedStyle(node.querySelector("#connection-dispatch > path")).stroke,
                  resolve("--run-art-highlight"),
                ]);
                probe.remove();
                return colors;
              }, state);
              for (const [actual, expected] of palette) assert.equal(actual, expected, `${state} ${presentationProfile} ${theme} uses brand tokens`);
              palettes.push(palette.map(([actual]) => actual));
              assert.deepEqual(await svg.evaluate(node => [...node.querySelectorAll("path")].map(path => path.getAttribute("d"))), geometry);
              assert.equal(await svg.getAttribute("aria-hidden"), "true");
              assert.equal(await svg.getAttribute("focusable"), "false");
            }
            assert.notDeepEqual(palettes[0], palettes[1], `${state} ${presentationProfile} brand blue must follow theme colors`);
            for (const palette of palettes) {
              assert.deepEqual(palette.slice(0, 3), ["rgb(245, 245, 245)", "rgb(41, 68, 130)", "rgb(255, 228, 180)"],
                "Light object interiors, blue outlines and warm task color survive dark surfaces and purple UI accents");
              if (state === "idle") assert.equal(palette[5], "rgb(255, 255, 255)");
            }
            if (presentationProfile === "github-app") {
              assert.equal(palettes[0][3], "rgb(20, 115, 230)");
              assert.equal(palettes[1][3], "rgb(130, 186, 255)");
            }
            assert.equal(await svg.locator('[fill^="#"],[stroke^="#"]').count(), 0);
          } finally { release?.(); await page.close(); await fixture.close(); }
        }
      }
    } finally { await browser.close(); }
  });
}
