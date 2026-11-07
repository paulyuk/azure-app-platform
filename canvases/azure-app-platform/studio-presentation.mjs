import { getCanvasVisualProfile } from "./vendor/toolkit/ui/visual-profiles.mjs";

const copilotProfile = getCanvasVisualProfile("github-app");

const sharedPresentationStyles = `
  :root.studio-shared-presentation {
    --studio-bg: var(--canvas-bg);
    --studio-panel: var(--canvas-tint);
    --studio-raised: var(--canvas-overlay);
    --studio-line: var(--canvas-border);
    --studio-ink: var(--canvas-fg);
    --studio-muted: var(--canvas-muted);
    --studio-accent: var(--canvas-accent);
    --studio-accent-2: var(--canvas-accent);
    --studio-accent-soft: var(--canvas-selected);
    --studio-ok: var(--canvas-success);
    --studio-warn: var(--canvas-attention);
    --studio-danger: var(--canvas-danger);
    --studio-focus: var(--canvas-focus);
    --studio-edge-medium: var(--canvas-accent);
    --studio-edge-low: var(--canvas-muted);
    --studio-blue-soft: var(--canvas-selected);
    --studio-on-accent: var(--text-color-button-primary-rest, var(--canvas-button-primary-fg));
    --studio-control-radius: var(--canvas-radius-control);
    --studio-surface-radius: var(--canvas-radius-surface);
    --studio-dialog-radius: var(--canvas-radius-dialog);
    --studio-space-condensed: var(--canvas-spacing-condensed);
    --studio-space-normal: var(--canvas-spacing-normal);
    --studio-space-spacious: var(--canvas-spacing-spacious);
    --studio-control-height: var(--canvas-control-height);
    --studio-control-padding: var(--canvas-control-padding-block) var(--canvas-control-padding-inline);
    --studio-border-width: var(--canvas-border-width);
  }
  :root.studio-shared-presentation[data-theme-tone="light"],
  :root.studio-shared-presentation:not([data-theme-tone="light"]):not([data-theme-tone="dark"])[data-color-mode="light"] { color-scheme: light; }
  :root.studio-shared-presentation[data-theme-tone="dark"],
  :root.studio-shared-presentation:not([data-theme-tone="light"]):not([data-theme-tone="dark"])[data-color-mode="dark"] { color-scheme: dark; }
`;

const standaloneAliases = `
  :root[data-studio-theme="light"] {
    color-scheme: light;
    --studio-bg: #f6f8fa; --studio-panel: #f0f3f8; --studio-raised: #ffffff;
    --studio-line: #d1d9e0; --studio-ink: #1f2328; --studio-muted: #59636e;
    --studio-accent: #6b3fd6; --studio-accent-2: #5c2eb8; --studio-accent-soft: #f1eaff;
    --studio-ok: #137333; --studio-warn: #9a5100; --studio-danger: #b42318;
    --studio-focus: #0969da; --studio-edge-medium: #0969da; --studio-edge-low: #68717a;
    --studio-blue-soft: #e7f1ff; --studio-on-accent: #ffffff;
  }
  :root[data-studio-theme="dark"] {
    color-scheme: dark;
    --studio-bg: #15171c; --studio-panel: #20232b; --studio-raised: #1b1e25;
    --studio-line: #454b57; --studio-ink: #edf0f5; --studio-muted: #b6becb;
    --studio-accent: #c5a6ff; --studio-accent-2: #d6c0ff; --studio-accent-soft: #36264e;
    --studio-ok: #7bdba0; --studio-warn: #f0b563; --studio-danger: #ff9b91;
    --studio-focus: #81baff; --studio-edge-medium: #81baff; --studio-edge-low: #a6afbb;
    --studio-blue-soft: #182d46; --studio-on-accent: #20132f;
  }
  :root[data-studio-theme] body {
    --background-color-default: var(--studio-raised); --border-color-default: var(--studio-line);
    --text-color-default: var(--studio-ink); --text-color-muted: var(--studio-muted);
    --color-focus-outline: var(--studio-focus); --true-color-purple: var(--studio-accent);
    --true-color-blue: var(--studio-edge-medium); --true-color-green: var(--studio-ok);
    --true-color-blue-muted: var(--studio-blue-soft);
    --true-color-red: var(--studio-danger); --true-color-orange: var(--studio-warn);
  }
`;

// Product-owned geometry only. Canonical component geometry uses public toolkit tokens.
const sharedPresentationLayout = `
  :root.studio-shared-presentation { font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif); }
  :root.studio-shared-presentation body { background: var(--studio-bg); }
  :root.studio-shared-presentation :is(#details, #customize-content) code {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  }
  :root.studio-shared-presentation body,
  :root.studio-shared-presentation :is(#details, #customize-content)[data-mode="build"],
  :root.studio-shared-presentation #details[data-mode="manage"],
  :root.studio-shared-presentation .studio-settings {
    font: var(--text-body-medium, 14px)/var(--leading-body-medium, 1.25rem) var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  }
  :root.studio-shared-presentation :is(input, textarea, select):not(:where(#studio-home *)),
  :root.studio-shared-presentation #details :is(input, textarea, select),
  :root.studio-shared-presentation .studio-settings :is(input, textarea, select) {
    border-width: var(--studio-border-width);
    border-radius: var(--studio-control-radius);
    font-family: inherit;
    font-size: var(--text-body-ui, var(--text-body-medium, 14px));
    line-height: var(--leading-body-ui, var(--leading-body-medium, 1.25rem));
  }
  :root.studio-shared-presentation :is(input[type="text"], input[type="search"], select):not(:where(#studio-home *)),
  :root.studio-shared-presentation #details :is(input[type="text"], input[type="search"], select),
  :root.studio-shared-presentation .studio-settings select {
    min-height: var(--studio-control-height); padding: var(--studio-control-padding);
  }
  :root.studio-shared-presentation :is(.journey, .choice, .capability, .mapping, .review-row, .surface, .subsurface, .tier-card, .map-node, .map-empty, .map-loading, .header-actions, .endpoint-row, .action-card, .management-section),
  :root.studio-shared-presentation #details :is(.run-card, .agent-response, .document-assessment, .command-output, .action-card, .management-section) {
    border-radius: var(--studio-surface-radius);
  }
  :root.studio-shared-presentation :is(.journey, .choice, .capability, .mapping, .review-row, .subsurface, .tier-card),
  :root.studio-shared-presentation #details :is(.run-card, .agent-response, .document-assessment) {
    padding: var(--studio-space-normal);
  }
  :root.studio-shared-presentation :is(.studio-settings, .confirm-dialog) { border-radius: var(--studio-dialog-radius); }
  :root.studio-shared-presentation :is(.studio-settings-heading, .studio-settings-content, .confirm-dialog) { padding: var(--studio-space-normal); }
  :root.studio-shared-presentation :is(.journeys, .actions, .actions-right) { gap: var(--studio-space-condensed); }
  :root.studio-shared-presentation :is(#details, #customize-content) .build-workspace { padding: var(--studio-space-spacious) var(--studio-space-spacious) 0; }
  :root.studio-shared-presentation #details[data-mode="manage"] { padding: var(--studio-space-spacious); }
  @container build-panel (max-width: 620px) {
    :root.studio-shared-presentation :is(#details, #customize-content) .build-workspace { padding: var(--studio-space-normal) var(--studio-space-normal) 0; }
  }
  @media (max-width: 620px) {
    :root.studio-shared-presentation #details[data-mode="manage"] { padding: var(--studio-space-normal); }
  }
`;

const profiles = Object.freeze({
  standalone: Object.freeze({
    id: "standalone", className: "", stylesheet: null, styles: "", legacyStyles: standaloneAliases,
    appearanceDescription: "Applies to Azure App Platform across your apps.",
  }),
  "github-app": Object.freeze({
    id: copilotProfile.id, className: `studio-shared-presentation ${copilotProfile.className}`,
    stylesheet: `/${copilotProfile.stylesheet}`,
    styles: sharedPresentationStyles + sharedPresentationLayout, legacyStyles: "",
    appearanceDescription: "Fallback appearance when the host has not supplied a theme. Copilot controls the embedded appearance.",
  }),
});

export const STUDIO_PRESENTATION_IDS = Object.freeze(Object.keys(profiles));
export const COPILOT_PRESENTATION = "github-app";

export function getStudioPresentation(id = "standalone") {
  if (!Object.hasOwn(profiles, id)) {
    throw new RangeError(`Unsupported Canvas presentation profile: ${String(id)}`);
  }
  return profiles[id];
}

export function renderPresentationStyles(id = "standalone") {
  return getStudioPresentation(id).styles;
}
