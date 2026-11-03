import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Script } from "node:vm";
import test from "node:test";
import { OCTICONS, octiconMask, renderOcticon } from "./studio-icons.mjs";
import { NODE_TIER_ICONS, renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";
import { STUDIO_TAB_ICONS, STUDIO_TABS_CSS } from "./studio-tabs.mjs";
import { renderStudioHtml } from "./studio-ui.mjs";

const require = createRequire(import.meta.url);
const official = require("@primer/octicons");

test("shipped Octicons match the pinned official package and recorded bytes", async () => {
  const manifest = JSON.parse(await readFile(new URL("./vendor/octicons/provenance.json", import.meta.url)));
  const bytes = await readFile(new URL("./vendor/octicons/icons.json", import.meta.url));
  const lock = JSON.parse(await readFile(new URL("./package-lock.json", import.meta.url)));
  assert.equal(manifest.package, "@primer/octicons");
  assert.equal(manifest.version, require("@primer/octicons/package.json").version);
  assert.equal(manifest.integrity, lock.packages["node_modules/@primer/octicons"].integrity);
  assert.equal(manifest.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(manifest.icons, Object.keys(OCTICONS));
  for (const [name, icon] of Object.entries(OCTICONS)) {
    assert.equal(icon.path, official[name].heights[16].path, name);
    assert.equal(icon.width, official[name].heights[16].width, name);
    assert.equal(icon.height, 16);
    const markup = renderOcticon(name);
    assert.match(markup, /fill="currentColor" aria-hidden="true" focusable="false"/);
    assert.ok(markup.includes(icon.path));
  }
  assert.equal(await readFile(new URL("./vendor/octicons/LICENSE", import.meta.url), "utf8"),
    await readFile(new URL("./node_modules/@primer/octicons/LICENSE", import.meta.url), "utf8"));
});

test("icon helpers reject unknown names and preserve official geometry in CSS masks", () => {
  assert.throws(() => renderOcticon("not-an-octicon"), /Unknown shipped Octicon/);
  assert.throws(() => renderOcticon("gear", { className: '"><script>' }), /Invalid/);
  assert.throws(() => renderOcticon("gear", { size: -1 }), /Invalid/);
  for (const [tab, name] of Object.entries(STUDIO_TAB_ICONS)) {
    assert.ok(STUDIO_TABS_CSS.includes(`.studio-tab-icon--${tab} { --studio-tab-icon:${octiconMask(name)}; }`));
    const dataUrl = octiconMask(name).slice(5, -2);
    assert.equal(decodeURIComponent(dataUrl.split(",")[1]), renderOcticon(name));
  }
  assert.equal(Object.keys(NODE_TIER_ICONS).length, 9);
  for (const name of Object.values(NODE_TIER_ICONS)) assert.ok(OCTICONS[name]);
});

test("both real Studio renderers embed valid scripts and official control icons", () => {
  const graph = { root: "/fixture", nodes: [], edges: [], unresolved: [], diagnostics: [],
    summary: { projectNodes: 0, operationNodes: 0, edges: 0, unresolved: 0 } };
  for (const html of [renderStudioHtml("icons"), renderInteractiveAppMapHtml(graph)]) {
    for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => new Script(script));
    }
    assert.ok(html.includes(renderOcticon("gear", { size: 18 })));
    assert.ok(html.includes(renderOcticon("x")));
    assert.doesNotMatch(html, /fill:none;\s*stroke:currentColor/);
  }
});
