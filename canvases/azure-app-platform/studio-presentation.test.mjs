import assert from "node:assert/strict";
import test from "node:test";
import { getStudioPresentation, renderPresentationStyles, STUDIO_PRESENTATION_IDS } from "./studio-presentation.mjs";
import { renderStudioHtml } from "./studio-ui.mjs";
import { renderInteractiveAppMapHtml } from "./interactive-app-map.mjs";
import { renderThemeToggle } from "./studio-theme.mjs";

test("presentation selection is explicit, validated and independent of appearance", () => {
  assert.deepEqual(STUDIO_PRESENTATION_IDS, ["standalone", "github-app"]);
  assert.equal(getStudioPresentation().id, "standalone");
  assert.throws(() => getStudioPresentation("vscode"), /Unsupported/);
  assert.throws(() => getStudioPresentation("claude"), /Unsupported/);
  assert.throws(() => getStudioPresentation("toString"), /Unsupported/);
  assert.throws(() => renderStudioHtml("fixture", "", { presentationProfile: '"><script>' }), /Unsupported/);
  const graph = { root: "/fixture", nodes: [], edges: [], summary: { projectNodes: 0, operationNodes: 0, edges: 0 } };
  for (const presentationProfile of STUDIO_PRESENTATION_IDS) {
    for (const theme of ["light", "dark"]) {
      for (const html of [
        renderStudioHtml("fixture", "", { presentationProfile, theme }),
        renderInteractiveAppMapHtml(graph, { presentationProfile, theme }),
      ]) {
        assert.match(html, new RegExp(`data-studio-presentation="${presentationProfile}"`));
        assert.match(html, new RegExp(`data-studio-theme="${theme}"`));
        assert.ok(html.indexOf("/canvas-ui/styles.css") < html.indexOf("/canvas-ui/base.css"));
        if (presentationProfile === "github-app") {
          assert.ok(html.indexOf("/canvas-ui/base.css") < html.indexOf("/canvas-ui/profiles/github-app.css"));
          assert.match(html, /class="studio-shared-presentation canvas-profile-github-app"/);
        } else {
          assert.doesNotMatch(html, /\/canvas-ui\/profiles\/github-app\.css/);
        }
        assert.doesNotMatch(html, /Aptos|coreai-azure\.css/);
      }
    }
  }
  assert.match(renderThemeToggle("light", "github-app"), /Copilot controls the embedded appearance/);
  assert.match(renderThemeToggle("light", "standalone"), /Applies to Azure App Platform across your apps/);
});

test("Copilot profile maps public toolkit hooks without private component selectors or a new palette", () => {
  const styles = renderPresentationStyles("github-app");
  assert.match(styles, /--studio-ink: var\(--canvas-fg\)/);
  assert.match(styles, /--studio-raised: var\(--canvas-bg\)/);
  assert.match(styles, /:is\(dialog, \[role="dialog"\]\)\s*\{\s*--studio-raised: var\(--canvas-overlay\)/);
  assert.match(styles, /:is\(button\.primary, button\.run-button-primary\)[\s\S]*?background: var\(--background-color-button-primary-rest/);
  assert.match(styles, /\.studio-workspace-content,/);
  assert.match(styles, /--studio-control-radius: var\(--canvas-radius-control\)/);
  assert.match(styles, /--studio-dialog-radius: var\(--canvas-radius-dialog\)/);
  assert.equal(getStudioPresentation("github-app").stylesheet, "/canvas-ui/profiles/github-app.css");
  assert.match(getStudioPresentation("github-app").className, /canvas-profile-github-app/);
  assert.doesNotMatch(styles, /--canvas-[\w-]+\s*:/, "Shared structural values must not be redefined in Unity");
  assert.doesNotMatch(styles, /\.ct-|#[\da-f]{3,8}\b|--(?:text-color|background-color|font-sans)\s*:/i);
  assert.doesNotMatch(styles, /:root\.studio-shared-presentation\s*\{[^}]*font-size:/);
  assert.match(styles, /input\[type="search"\][^\n]*:not\(:where\(#studio-home \*\)\)/, "Home inputs retain canonical search-icon spacing");
  assert.equal(renderPresentationStyles("standalone"), "");
});
