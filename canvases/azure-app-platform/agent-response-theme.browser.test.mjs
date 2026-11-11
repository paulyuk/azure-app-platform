import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Execution layers retain semantic host colors in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      for (const presentationProfile of ["standalone", "github-app"]) {
        const fixture = await createRunSettingsFixture({ preview: true, presentationProfile });
        const page = await browser.newPage({ viewport: { width: 430, height: 800 } });
        let release;
        try {
          await page.route("**/api/agent-invoke", async route => {
            await new Promise(resolve => { release = resolve; });
            await route.fulfill({ json: { response: "Complete" } });
          });
          await page.goto(fixture.origin + "/app-map");
          await page.getByRole("textbox", { name: "Agent message", exact: true })
            .fill("Check execution layer theme colors.");
          await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
          const view = page.getByRole("region", { name: "Run execution", exact: true });
          const active = view.locator('.run-execution-layer[data-state="active"]');
          await active.waitFor();
          const palettes = [];
          for (const theme of ["light", "dark"]) {
            const expected = theme === "light"
              ? { overlay: "rgb(253, 247, 232)", text: "rgb(48, 32, 16)",
                muted: "rgb(128, 80, 48)", accent: "rgb(176, 32, 112)" }
              : { overlay: "rgb(32, 29, 48)", text: "rgb(250, 240, 224)",
                muted: "rgb(208, 176, 144)", accent: "rgb(224, 144, 192)" };
            if (presentationProfile === "github-app") {
              await page.evaluate(({ theme, expected }) => {
                const hostColors = {
                  "--background-color-overlay": expected.overlay,
                  "--text-color-default": expected.text,
                  "--text-color-muted": expected.muted,
                  "--text-color-accent": expected.accent,
                };
                for (const [token, value] of Object.entries(hostColors)) {
                  document.documentElement.style.setProperty(token, value);
                }
                document.documentElement.dataset.themeTone = theme;
                document.documentElement.dataset.colorMode = theme;
              }, { theme, expected });
            }
            await page.evaluate(theme => { document.documentElement.dataset.studioTheme = theme; }, theme);
            const palette = await view.evaluate(node => {
              const active = node.querySelector('.run-execution-layer[data-state="active"]');
              return {
                overlay: getComputedStyle(node.querySelector(".run-execution-view")).backgroundColor,
                text: getComputedStyle(active.querySelector(".run-execution-label")).color,
                muted: getComputedStyle(active.querySelector(".run-execution-detail")).color,
                accent: getComputedStyle(active).borderColor,
                trail: getComputedStyle(active.querySelector(".run-execution-trail rect")).stroke,
                mark: getComputedStyle(active.querySelector(".run-execution-mark")).color,
              };
            });
            assert.equal(palette.accent, palette.trail);
            assert.equal(palette.accent, palette.mark);
            if (presentationProfile === "github-app") {
              assert.deepEqual(palette, { ...expected, trail: expected.accent, mark: expected.accent });
            }
            palettes.push(palette);
          }
          assert.notDeepEqual(palettes[0], palettes[1],
            `${presentationProfile} execution colors must follow the active theme.`);
        } finally { release?.(); await page.close(); await fixture.close(); }
      }
    } finally { await browser.close(); }
  });
}
