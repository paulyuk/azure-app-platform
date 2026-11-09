import { renderThemeStyles } from "./studio-theme.mjs";
import { getStudioPresentation, renderPresentationStyles } from "./studio-presentation.mjs";

export const JOURNEY_LOADING_STYLES = `
  .journey-loading { display: grid; gap: 12px; padding: 16px; }
  .journey-loading p { margin: 0; color: var(--canvas-muted, var(--studio-muted)); }
  .journey-skeleton-stack:not([hidden]) { display: grid; gap: 12px; }
  .journey-skeleton { display: grid; gap: 10px; padding: 16px; border: 1px solid var(--canvas-border, var(--studio-line)); border-radius: 10px; }
  .journey-skeleton span { display: block; height: 12px; border-radius: 4px; background: var(--canvas-tint, var(--studio-raised)); }
  .journey-skeleton span:last-child { width: 65%; }
  .journey-progress { display: flex; align-items: center; gap: 8px; }
  .creation-progress { position: sticky; top: 8px; z-index: 1; margin-block: 12px; padding: 12px; border: 1px solid var(--canvas-border, var(--studio-line)); border-radius: 6px; background: var(--canvas-bg, var(--studio-panel)); }
  .journey-spinner { flex: none; width: 16px; height: 16px; border: 2px solid var(--canvas-border, var(--studio-line)); border-top-color: var(--canvas-accent, var(--studio-accent)); border-radius: 50%; animation: journey-spin 1s linear infinite; }
  @keyframes journey-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .journey-spinner, .ct-provider .journey-spinner { animation: journey-spin 1s linear infinite !important; }
  }
`;

export function renderJourneySkeleton(count = 3) {
  return '<div class="journey-skeleton-stack" aria-hidden="true">' + Array.from({ length: count }, () =>
    '<div class="journey-skeleton"><span></span><span></span></div>').join("") + '</div>';
}

export function renderWorkspaceLoadingHtml(root, apiToken, { theme = "light", presentationProfile = "standalone" } = {}) {
  const presentation = getStudioPresentation(presentationProfile);
  const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  return `<!doctype html>
<html lang="en" class="${presentation.className}" data-studio-theme="${escape(theme)}" data-studio-presentation="${presentation.id}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening app workspace</title>
<link rel="stylesheet" href="/canvas-ui/styles.css"><link rel="stylesheet" href="/canvas-ui/base.css">
${presentation.stylesheet ? `<link rel="stylesheet" href="${presentation.stylesheet}">` : ""}
<style>${renderThemeStyles(presentation.id)}${renderPresentationStyles(presentation.id)}${JOURNEY_LOADING_STYLES}
body { margin: 0; padding: 24px; background: var(--studio-bg); color: var(--studio-ink); font: 14px/1.5 var(--font-sans, system-ui); }
main { max-width: 888px; margin: auto; } h1 { font-size: 20px; overflow-wrap: anywhere; } a { color: var(--studio-accent); }
button { font: inherit; padding: 8px 12px; color: inherit; background: var(--studio-panel); border: 1px solid var(--studio-line); border-radius: 6px; }
.workspace-placeholder-nav { display: flex; gap: 16px; flex-wrap: wrap; color: var(--studio-muted); padding-block: 16px; }
</style></head>
<body><main><a href="/">Back to Home</a><h1>Opening app workspace</h1>
<p>${escape(root)}</p><div class="workspace-placeholder-nav" aria-hidden="true"><span>Build</span><span>Connect</span><span>Run</span><span>Observe</span><span>Deploy</span></div>
<section id="workspace-loading" aria-busy="true" aria-label="App workspace">
<p id="workspace-loading-status" class="journey-progress" role="status"><span class="journey-spinner" aria-hidden="true"></span><span id="workspace-loading-message">Loading app components and workspace...</span></p>
${renderJourneySkeleton()}
</section><button id="retry-workspace" type="button" hidden>Retry opening workspace</button></main>
<script>
(() => {
  let loading = false;
  const message = document.getElementById("workspace-loading-message");
  const region = document.getElementById("workspace-loading");
  const placeholders = region.querySelector('div[aria-hidden="true"]');
  const retry = document.getElementById("retry-workspace");
  async function load() {
    if (loading) return;
    loading = true; retry.hidden = true; region.setAttribute("aria-busy", "true");
    placeholders.hidden = false;
    message.textContent = "Loading app components and workspace...";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch("/api/app-map-document?root=" + encodeURIComponent(${JSON.stringify(root).replaceAll("<", "\\u003c")}), {
        headers: { "X-App-Platform-Token": ${JSON.stringify(apiToken).replaceAll("<", "\\u003c")} }, signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not open the workspace.");
      }
      const html = await response.text();
      clearTimeout(timer);
      if (!html.startsWith("<!doctype html>")) throw new Error("The workspace response was invalid.");
      document.open(); document.write(html); document.close();
    } catch (error) {
      message.textContent = controller.signal.aborted ? "Opening the workspace took too long. Retry or return Home." : "Could not open the workspace: " + error.message;
      region.setAttribute("aria-busy", "false");
      placeholders.hidden = true;
      region.querySelector(".journey-spinner").hidden = true;
      retry.hidden = false;
    } finally { clearTimeout(timer); loading = false; }
  }
  retry.addEventListener("click", () => { region.querySelector(".journey-spinner").hidden = false; void load(); });
  void load();
})();
</script></body></html>`;
}

export async function readWorkspaceCreation(response, onProgress) {
  const validateResult = result => {
    if (!result || (!(typeof result.worktreePath === "string" && result.worktreePath.trim()) && result.outcome !== "workspace-requested")) {
      throw new Error("The workspace creation result was invalid.");
    }
    return result;
  };
  if (!response.ok || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
    try {
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.error || "Could not create the workspace.");
        error.creationFailed = true;
        throw error;
      }
      return validateResult(result);
    } catch (error) {
      if (!error.creationFailed) error.creationOutcomeUnknown = true;
      throw error;
    }
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const error = new Error("The workspace creation response was empty.");
    error.creationOutcomeUnknown = true;
    throw error;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      if (done && buffer.trim()) { lines.push(buffer); buffer = ""; }
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "progress" && typeof event.message === "string") onProgress(event.message);
        else if (event.type === "result") return validateResult(event.result);
        else if (event.type === "error") {
          const error = new Error(event.error);
          error.creationFailed = true;
          throw error;
        }
        else throw new Error("Invalid workspace progress response.");
      }
      if (done) throw new Error("Creation outcome is unknown. Use Open an app to check before trying to create it again.");
    }
  } catch (error) {
    if (!error.creationFailed) error.creationOutcomeUnknown = true;
    throw error;
  } finally { reader.releaseLock(); }
}
