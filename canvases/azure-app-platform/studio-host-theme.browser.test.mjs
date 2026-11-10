import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";
import { renderPresentationStyles } from "./studio-presentation.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

const palettes = {
  light: { page: "#ffffff", panel: "#f6f8fa", overlay: "#f0f3f6", ink: "#1f2328",
    muted: "#59636e", border: "#d1d9e0", accent: "#0969da",
    primary: "#1f883d", hover: "#1a7f37", active: "#116329" },
  dark: { page: "#0d1117", panel: "#151b23", overlay: "#010409", ink: "#f0f6fc",
    muted: "#9198a1", border: "#3d444d", accent: "#4493f8",
    primary: "#238636", hover: "#29903b", active: "#2e9a40" },
};
const styles = renderPresentationStyles("github-app");
const revision = createHash("sha256").update(styles).digest("hex").slice(0, 12);

for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
  test(`Copilot page surfaces, overlays and typography remain distinct in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    const fixture = await createRunSettingsFixture({ preview: true, presentationProfile: "github-app" });
    const browser = await engine.launch({ headless: true });
    const output = process.env.UNITY_THEME_EVIDENCE_DIR;
    const baselinePath = process.env.UNITY_THEME_BASELINE_CSS;
    const baseline = baselinePath ? await readFile(baselinePath, "utf8") : null;
    const evidence = [];
    try {
      if (output) await mkdir(output, { recursive: true });
      for (const width of [430, 1000]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.goto(fixture.origin + "/app-map");
          const prompt = page.getByRole("textbox", { name: "Agent message", exact: true });
          await prompt.fill("Find available vehicles within budget.");
          await page.getByRole("button", { name: "Invoke agent", exact: true }).click();
          await page.locator(".agent-response").filter({ hasText: "I found three vehicles within your budget." }).waitFor();
          const reference = await page.evaluate(() => {
            const element = document.createElement("span");
            element.id = "host-theme-reference";
            document.body.append(element);
            return element.id;
          });
          await page.evaluate(() => {
            const action = document.createElement("button");
            action.className = "primary";
            action.id = "legacy-primary-proof";
            action.textContent = "Primary action";
            action.style.cssText = "position:fixed;top:8px;right:8px;z-index:100";
            document.querySelector("#details").append(action);
          });
          for (const tone of ["light", "dark"]) {
            const palette = palettes[tone];
            await page.evaluate(({ tone, palette }) => {
              document.documentElement.dataset.themeTone = tone;
              document.querySelector("#host-theme-reference").style.removeProperty("color");
              let host = document.querySelector("#synthetic-host-theme");
              if (!host) {
                host = document.createElement("style");
                host.id = "synthetic-host-theme";
                document.head.prepend(host);
              }
              host.textContent = `:root {
                --background-color-default: ${palette.page};
                --background-color-muted: ${palette.panel};
                --background-color-overlay: ${palette.overlay};
                --text-color-default: ${palette.ink};
                --text-color-muted: ${palette.muted};
                --text-color-accent: ${palette.accent};
                --border-color-default: ${palette.border};
                --background-color-button-primary-rest: ${palette.primary};
                --background-color-button-primary-hover: ${palette.hover};
                --background-color-button-primary-active: ${palette.active};
                --text-color-button-primary-rest: #ffffff;
                --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                --text-body-medium: 14px;
                --leading-body-medium: 20px;
              }
              #host-theme-reference {
                background: var(--background-color-default);
                color: var(--text-color-default);
                font: var(--text-body-medium)/var(--leading-body-medium) var(--font-sans);
              }`;
            }, { tone, palette });
            await page.mouse.move(0, 899);
            const computed = selector => page.locator(selector).evaluate(element => {
              const style = getComputedStyle(element);
              return { background: style.backgroundColor, color: style.color, font: style.font };
            });
            const expected = await computed("#" + reference);
            for (const selector of ["body", "#details", ".studio-workspace-content", "#workspace-diagnostics"]) {
              const actual = await computed(selector);
              if (selector !== ".studio-workspace-content") assert.equal(actual.background, expected.background, `${tone} ${selector} uses page, not overlay`);
              if (selector !== "#workspace-diagnostics") assert.equal(actual.font, expected.font, `${tone} ${selector} inherits host typography`);
              assert.equal(actual.color, expected.color, `${tone} ${selector} inherits host foreground`);
            }
            const action = page.locator("#legacy-primary-proof");
            const colorOf = value => page.evaluate(value => {
              const probe = document.querySelector("#host-theme-reference");
              probe.style.color = value;
              return getComputedStyle(probe).color;
            }, value);
            assert.equal((await computed("#legacy-primary-proof")).background, await colorOf(palette.primary));
            await action.hover();
            assert.equal((await computed("#legacy-primary-proof")).background, await colorOf(palette.hover));
            await page.mouse.down();
            assert.equal((await computed("#legacy-primary-proof")).background, await colorOf(palette.active));
            await page.mouse.up();
            await page.mouse.move(0, 0);
            await page.evaluate(() => { document.querySelector("#legacy-primary-proof").hidden = true; });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            const capture = async (label, css) => {
              if (!output) return;
              await page.evaluate(({ current, replacement }) => {
                const sheet = [...document.querySelectorAll("style")].find(element => element.textContent.includes(current));
                if (!sheet) throw new Error("Presentation stylesheet not found.");
                sheet.textContent = sheet.textContent.replace(current, replacement);
              }, { current: styles, replacement: css });
              try {
                const filename = `${label}-${name}-${tone}-${width}-results.png`;
                await page.screenshot({ path: join(output, filename) });
                evidence.push({ filename, tone, width, height: 900, syntheticHost: true });
              } finally {
                await page.evaluate(({ current, replacement }) => {
                  const sheet = [...document.querySelectorAll("style")].find(element => element.textContent.includes(current));
                  if (!sheet) throw new Error("Presentation stylesheet not found.");
                  sheet.textContent = sheet.textContent.replace(current, replacement);
                }, { current: css, replacement: styles });
              }
            };
            if (baseline) await capture("before-" + baselinePath.split(/[\\/]/).at(-1).replace(/\.css$/, ""), baseline);
            await capture("after-" + revision, styles);
            await page.getByRole("button", { name: "Settings", exact: true }).click();
            assert.equal((await computed(".studio-settings")).background, await colorOf(palette.overlay));
            await page.getByRole("button", { name: "Close settings", exact: true }).click();
            await page.evaluate(() => { document.querySelector("#legacy-primary-proof").hidden = false; });
          }
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
      }
      if (output) await writeFile(join(output, `${name}-evidence.json`), JSON.stringify({
        presentationSha256: createHash("sha256").update(styles).digest("hex"),
        baselinePath, nativeHostDelivery: "not measured; synthetic host tokens only", evidence,
      }, null, 2) + "\n");
    } finally { await browser.close(); await fixture.close(); }
  });
}
