import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readStudioPreferences, renderThemeClientScript, renderThemeStyles, renderThemeToggle, writeStudioPreferences } from "./studio-theme.mjs";
import { renderStudioHtml } from "./studio-ui.mjs";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";

test("appearance defaults light and persists independently of app/server origin", async () => {
  const directory = await mkdtemp(join(tmpdir(), "unity-studio-theme-test-"));
  try {
    assert.deepEqual(await readStudioPreferences(directory), { theme: "light" });
    await writeStudioPreferences({ theme: "dark" }, directory);
    assert.deepEqual(await readStudioPreferences(directory), { theme: "dark" });
    assert.deepEqual(await readdir(directory), ["preferences.json"]);
    await assert.rejects(writeStudioPreferences({ theme: "system" }, directory), /Choose light or dark/);
    assert.deepEqual(JSON.parse(await readFile(join(directory, "preferences.json"), "utf8")), { theme: "dark" });
    await writeStudioPreferences({ theme: "light" }, directory);
    assert.deepEqual(await readStudioPreferences(directory), { theme: "light" });
    await writeFile(join(directory, "preferences.json"), "invalid");
    await assert.rejects(readStudioPreferences(directory), /Could not read Unity Studio preferences/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("home and map render explicit initial preference with shared toggle and authenticated persistence", () => {
  const graph = { root: "/app", nodes: [], edges: [], summary: { projectNodes: 0, operationNodes: 0, edges: 0 } };
  for (const theme of ["light", "dark"]) {
    for (const html of [
      renderStudioHtml("studio", "token", { theme }),
      renderInteractiveAppMapHtml(graph, { apiToken: "token", theme }),
    ]) {
      assert.match(html, new RegExp(`data-studio-theme="${theme}"`));
      assert.match(html, /aria-label="Unity Studio utilities"/);
      assert.match(html, /data-studio-theme-toggle/);
      assert.match(html, /class="studio-brand" href="\/" aria-label="Unity Studio home"/);
      assert.match(html, /class="studio-logo"[^>]+aria-hidden="true"/);
      assert.match(html, /title="Switch to (?:light|dark) mode"/);
      assert.doesNotMatch(html, />Light<\/button>|>Dark<\/button>/);
      assert.match(html, /\/api\/preferences/);
      assert.match(html, /X-Unity-Studio-Token/);
      for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
        assert.doesNotThrow(() => new Function(match[1]));
      }
    }
  }
  assert.match(renderStudioHtml("studio"), /data-studio-theme="light"/);
  assert.match(renderStudioHtml("studio"), /class="studio-site-nav" aria-label="Unity Studio navigation"/);
  const workspace = renderInteractiveAppMapHtml(graph);
  assert.match(workspace, /id="build-app"[^>]*>Build<\/button>/);
  assert.match(workspace, /id="manage-app"[^>]*>Run &amp; Debug<\/button>/);
  assert.match(workspace, /id="map-app"[^>]*>Observe<\/button>/);
  assert.match(workspace, /id="map-view"[^>]*>App Map<\/button>/);
  assert.match(workspace, /id="show-other-resources"/);
  assert.doesNotMatch(workspace, /id="implementation-view"/);
  assert.doesNotMatch(workspace, /component-requests|workspace-styles/);
  assert.doesNotMatch(renderThemeStyles(), /prefers-color-scheme/);
  assert.doesNotMatch(renderThemeClientScript("token"), /localStorage/);
  assert.throws(() => renderThemeToggle('"><script>'), /Choose light or dark/);
});

test("landing journeys share neutral styling in both themes", () => {
  for (const theme of ["light", "dark"]) {
    const html = renderStudioHtml("studio", "token", { theme });
    const cards = [...html.matchAll(/<button type="button" class="([^"]*)" id="(new-app|open-app|assemble-app)">/g)];
    assert.deepEqual(cards.map((card) => card[2]), ["new-app", "open-app", "assemble-app"]);
    assert.deepEqual(cards.map((card) => card[1]), ["journey", "journey", "journey"]);
    assert.doesNotMatch(html, /\.journey\.primary/);
  }
});

test("primary actions and selected navigation preserve contrasting theme styles", () => {
  const styles = renderThemeStyles();
  const variant = styles.match(/button\.primary,\s*button\.run-button-primary\s*\{([^}]+)\}/)?.[1];
  assert.ok(variant, "Both primary button classes need a parent-independent variant");
  assert.match(variant, /color:\s*var\(--studio-on-accent\)/);
  assert.match(variant, /background:\s*var\(--studio-accent\)/);
  assert.match(variant, /border-color:\s*var\(--studio-accent\)/);
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  for (const theme of ["light", "dark"]) {
    const palette = styles.match(new RegExp(`:root\\[data-studio-theme="${theme}"\\]\\s*\\{([^}]+)\\}`))[1];
    const colors = Object.fromEntries([...palette.matchAll(/--(studio-[\w-]+):\s*(#[\da-f]{6});/g)]
      .map((match) => [match[1], match[2]]));
    for (const [foreground, background] of [
      ["studio-on-accent", "studio-accent"],
      ["studio-on-accent", "studio-accent-2"],
      ["studio-edge-medium", "studio-blue-soft"],
      ["studio-edge-medium", "studio-raised"],
      ["studio-muted", "studio-raised"],
      ["studio-ok", "studio-raised"],
      ["studio-warn", "studio-raised"],
    ]) {
      const pair = [luminance(colors[foreground]), luminance(colors[background])];
      assert.ok((Math.max(...pair) + .05) / (Math.min(...pair) + .05) >= 4.5,
        `${theme} ${background} must preserve readable normal and hover labels`);
    }
  }
});
