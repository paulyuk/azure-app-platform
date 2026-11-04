import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";
import { serveStudioAsset } from "./studio-assets.mjs";
import { createRunSettingsFixture } from "./run-settings-test-fixture.mjs";
import { selectWorkspace } from "./workspace-navigation-test-helpers.mjs";

const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let chromium, webkit;
try { ({ chromium, webkit } = requireWeb("playwright")); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

const graph = {
  root: "/fixture/dealer",
  nodes: ["web", "agent"].map(id => ({
    id, tierId: id, kind: "project", name: `Fixture ${id}`, projectPath: `src/${id}`, badges: [], evidence: [],
  })),
  edges: [{
    id: "web:agent", from: "web", to: "agent", kind: "http-call", confidence: "high",
    evidence: [{ path: "src/web/page.tsx", line: 1 }],
  }],
  unresolved: [], summary: { projectNodes: 2, operationNodes: 0, edges: 1 },
};
const hostPalettes = {
  light: { surface: "#f9f4ee", panel: "#e5eff7", text: "#5a3612", muted: "#43576b", accent: "#7c2f96" },
  dark: { surface: "#1c142b", panel: "#283644", text: "#e0cdf5", muted: "#a4b7ca", accent: "#d2aaef" },
};
const contrast = (foreground, background) => {
  const luminance = rgb => {
    const channels = rgb.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / (rgb.startsWith("color(srgb ") ? 1 : 255))
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const pair = [luminance(foreground), luminance(background)];
  return (Math.max(...pair) + .05) / (Math.min(...pair) + .05);
};

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  test(`Observe SVG follows Studio and late host tokens in ${name}`, {
    skip: !engine && "Install src/web dependencies to run browser coverage.",
  }, async () => {
    let server, browser, fixture;
    const errors = [];
    const output = process.env.UNITY_APP_MAP_THEME_EVIDENCE_DIR;
    try {
      fixture = await createRunSettingsFixture();
      server = createServer((request, response) => void (async () => {
        const url = new URL(request.url, "http://localhost");
        if (await serveStudioAsset(request, response, url.pathname)) return;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(renderInteractiveAppMapHtml(graph, {
          apiToken: "fixture", theme: fixture.state.theme,
          presentationProfile: url.searchParams.get("profile") || "standalone",
        }));
      })().catch(error => { response.writeHead(500); response.end(error.message); }));
      await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
      browser = await engine.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 640, height: 700 } });
      page.setDefaultTimeout(7000);
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", async route => {
        const request = route.request();
        const response = await fetch(fixture.origin + new URL(request.url()).pathname, {
          method: request.method(), headers: { "X-App-Platform-Token": "fixture" },
          ...(request.postData() ? { body: request.postData() } : {}),
        });
        assert.ok(response.ok, `Unexpected fixture request ${request.url()}: ${response.status}`);
        await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
      });
      const origin = `http://127.0.0.1:${server.address().port}`;
      async function readSvg(label) {
        const result = await page.evaluate(() => {
          const color = value => {
            const probe = document.createElement("span");
            probe.style.color = value;
            document.body.append(probe);
            const computed = getComputedStyle(probe).color;
            probe.remove();
            return computed;
          };
          const tokens = Object.fromEntries([
            "raised", "panel", "ink", "muted", "line", "accent", "accent-soft", "focus", "edge-medium", "edge-low",
          ].map(token => [token, color(`var(--studio-${token})`)]));
          const styles = Object.fromEntries([
            ".flow-region > rect", ".flow-region-title", ".flow-region-role",
            ".flow-connect rect", ".flow-connect text", '.node[data-node-id="web"] > rect',
            '.node[data-node-id="agent"] > rect',
            ".node-title", ".node-meta", ".edge path", ".edge text",
            "#arrow-high path", "#arrow-medium path", "#arrow-low path", ".node-visual .octicon",
          ].map(selector => {
            const element = document.querySelector(selector);
            if (!element) throw new Error(`Missing rendered SVG surface: ${selector}`);
            const style = getComputedStyle(element);
            return [selector, { fill: style.fill, stroke: style.stroke, color: style.color }];
          }));
          const shell = document.querySelector("#graph-shell").getBoundingClientRect();
          return {
            tokens, styles,
            focused: document.activeElement === window.savedThemeNode,
            sameNode: document.querySelector('[data-node-id="agent"]') === window.savedThemeNode,
            sameNavigation: document.querySelector("#studio-workspace-navigation") === window.savedThemeNavigation,
            selected: window.savedThemeNode.classList.contains("selected"),
            overflow: document.documentElement.scrollWidth > innerWidth,
            graphWidth: shell.width, graphHeight: shell.height,
          };
        });
        if (output) {
          await mkdir(output, { recursive: true });
          const hash = bytes => createHash("sha256").update(bytes).digest("hex");
          await page.screenshot({ path: join(output, `${name}-${label}.png`) });
          await writeFile(join(output, `${name}-${label}.json`), JSON.stringify({
            synthetic: true, label, result, htmlSha256: hash(await page.content()),
            themeSourceSha256: hash(await readFile(new URL("./studio-theme.mjs", import.meta.url))),
          }, null, 2) + "\n");
        }
        const { styles, tokens } = result;
        for (const [selector, property, token] of [
          [".flow-region > rect", "fill", "raised"], [".flow-region > rect", "stroke", "line"],
          [".flow-region-title", "fill", "ink"], [".flow-region-role", "fill", "muted"],
          [".flow-connect rect", "fill", "accent-soft"], [".flow-connect rect", "stroke", "accent"],
          [".flow-connect text", "fill", "accent"], ['.node[data-node-id="web"] > rect', "fill", "raised"],
          ['.node[data-node-id="web"] > rect', "stroke", "accent"], [".node-title", "fill", "ink"],
          ['.node[data-node-id="agent"] > rect', "stroke", "focus"],
          [".node-meta", "fill", "muted"],
          [".edge path", "stroke", "accent"], [".edge text", "fill", "accent"],
          [".edge text", "stroke", "panel"], ["#arrow-high path", "fill", "accent"],
          ["#arrow-medium path", "fill", "edge-medium"], ["#arrow-low path", "fill", "edge-low"],
          [".node-visual .octicon", "color", "edge-medium"],
        ]) {
          assert.equal(styles[selector][property], tokens[token], `${label}: ${selector} ${property}`);
        }
        assert.equal(styles[".edge path"].fill, "none");
        for (const [selector, background] of [
          [".node-title", "raised"], [".node-meta", "raised"], [".flow-region-title", "raised"],
          [".flow-region-role", "raised"], [".edge text", "panel"],
          [".flow-connect text", "accent-soft"],
        ]) {
          assert.ok(contrast(styles[selector].fill, tokens[background]) >= 4.5, `${label}: readable ${selector}`);
        }
        assert.ok(result.sameNode && result.sameNavigation && result.focused && result.selected, label);
        assert.equal(result.overflow, false, label);
        assert.ok(result.graphWidth > 250 && result.graphHeight > 100, label);
        return result;
      }
      async function deliverHost(tone) {
        await page.evaluate(({ tone, palette }) => {
          document.documentElement.dataset.themeTone = tone;
          // A conflicting fallback preference must not override delivered host colors.
          document.documentElement.dataset.studioTheme = tone === "light" ? "dark" : "light";
          let style = document.querySelector("#synthetic-map-host");
          if (!style) { style = document.createElement("style"); style.id = "synthetic-map-host"; document.head.prepend(style); }
          style.textContent = `:root {
            --background-color-default: ${palette.surface}; --background-color-overlay: ${palette.surface};
            --background-color-muted: ${palette.panel}; --text-color-default: ${palette.text};
            --text-color-muted: ${palette.muted}; --text-color-accent: ${palette.accent};
            --border-color-default: #296a4d; --color-focus-outline: #0969da;
          }`;
        }, { tone, palette: hostPalettes[tone] });
      }
      for (const profile of ["standalone", "github-app"]) {
        for (const tone of ["light", "dark"]) {
          fixture.state.theme = tone;
          await page.goto(`${origin}/app-map?profile=${profile}`);
          await selectWorkspace(page, "map-app");
          await page.locator('[data-node-id="agent"]').press("Enter");
          await page.evaluate(() => {
            window.savedThemeNode = document.querySelector('[data-node-id="agent"]');
            window.savedThemeNavigation = document.querySelector("#studio-workspace-navigation");
          });
          for (const width of [380, 640, 1280]) {
            await page.setViewportSize({ width, height: 700 });
            await page.waitForFunction(() => document.querySelector("#app-workspace-navigation").getBoundingClientRect().right <= innerWidth);
            const result = await readSvg(`${profile}-${tone}-${width}-fallback`);
            assert.equal(result.tokens.raised, tone === "light" ? "rgb(255, 255, 255)" :
              profile === "standalone" ? "rgb(27, 30, 37)" : "rgb(13, 17, 23)");
            assert.equal(result.tokens.ink, tone === "light" ? "rgb(31, 35, 40)" :
              profile === "standalone" ? "rgb(237, 240, 245)" : "rgb(230, 237, 243)");
          }
          if (profile === "github-app") {
            for (const hostTone of ["light", "dark"]) {
              await deliverHost(hostTone);
              for (const width of [380, 640, 1280]) {
                await page.setViewportSize({ width, height: 700 });
                await page.waitForFunction(() => document.querySelector("#app-workspace-navigation").getBoundingClientRect().right <= innerWidth);
                const result = await readSvg(`${profile}-${tone}-${width}-host-${hostTone}`);
                assert.equal(result.tokens.raised, hostTone === "light" ? "rgb(249, 244, 238)" : "rgb(28, 20, 43)");
                assert.equal(result.tokens.ink, hostTone === "light" ? "rgb(90, 54, 18)" : "rgb(224, 205, 245)");
                assert.equal(result.tokens.line, "rgb(41, 106, 77)");
                assert.equal(result.tokens.accent, hostTone === "light" ? "rgb(124, 47, 150)" : "rgb(210, 170, 239)");
              }
            }
          }
          const transform = await page.locator("#viewport").getAttribute("transform");
          await page.getByRole("button", { name: "Zoom in", exact: true }).click();
          assert.notEqual(await page.locator("#viewport").getAttribute("transform"), transform);
          await page.getByRole("button", { name: "Fit map", exact: true }).click();
          await page.locator('[data-node-id="web"]').press("Space");
          assert.equal(await page.locator("#details h2").textContent(), "Fixture web");
          await page.locator('[data-node-id="agent"]').press("Enter");
          assert.equal(await page.locator("#details h2").textContent(), "Fixture agent");
          assert.equal(await page.locator("#map-view").getAttribute("aria-selected"), "true");
        }
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(fixture.mutations, [], "Theme and map interactions must not run app operations.");
    } finally {
      await browser?.close();
      if (server) await new Promise(resolve => server.close(resolve));
      await fixture?.close();
    }
  });
}
