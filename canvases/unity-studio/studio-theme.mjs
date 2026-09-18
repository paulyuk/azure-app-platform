import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { SETTINGS_CSS, createStudioSettings } from "./studio-settings.mjs";

export function studioPreferencesDirectory() {
  return join(process.env.COPILOT_HOME || join(homedir(), ".copilot"), "extensions", "unity-studio", "artifacts");
}

function validateTheme(theme) {
  if (theme !== "light" && theme !== "dark") {
    const error = new Error("Choose light or dark for the Unity Studio theme.");
    error.statusCode = 400;
    throw error;
  }
  return theme;
}

export async function readStudioPreferences(directory = studioPreferencesDirectory()) {
  try {
    const preferences = JSON.parse(await readFile(join(directory, "preferences.json"), "utf8"));
    return { theme: validateTheme(preferences?.theme) };
  } catch (error) {
    if (error.code === "ENOENT") return { theme: "light" };
    throw new Error(`Could not read Unity Studio preferences: ${error.message}`, { cause: error });
  }
}

export async function writeStudioPreferences(input, directory = studioPreferencesDirectory()) {
  const preferences = { theme: validateTheme(input?.theme) };
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `preferences-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(preferences)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temporary, join(directory, "preferences.json"));
  } catch (error) {
    try {
      await unlink(temporary);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") {
        throw new AggregateError([error, cleanupError], "Could not save or clean up Unity Studio preferences.");
      }
    }
    throw new Error(`Could not save Unity Studio preferences: ${error.message}`, { cause: error });
  }
  return preferences;
}

export function renderThemeStyles() {
  return `
    :root[data-studio-theme="light"] {
      color-scheme: light;
      --studio-bg: #f6f8fa; --studio-panel: #f0f3f8; --studio-raised: #ffffff;
      --studio-line: #d1d9e0; --studio-ink: #1f2328; --studio-muted: #59636e;
      --studio-accent: #6b3fd6; --studio-accent-2: #5c2eb8; --studio-accent-soft: #f1eaff;
      --studio-ok: #137333; --studio-warn: #9a5100; --studio-danger: #b42318;
      --studio-focus: #0969da; --studio-edge-medium: #0969da; --studio-edge-low: #68717a;
      --studio-blue-soft: #e7f1ff;
      --studio-on-accent: #ffffff;
    }
    :root[data-studio-theme="dark"] {
      color-scheme: dark;
      --studio-bg: #15171c; --studio-panel: #20232b; --studio-raised: #1b1e25;
      --studio-line: #454b57; --studio-ink: #edf0f5; --studio-muted: #b6becb;
      --studio-accent: #c5a6ff; --studio-accent-2: #d6c0ff; --studio-accent-soft: #36264e;
      --studio-ok: #7bdba0; --studio-warn: #f0b563; --studio-danger: #ff9b91;
      --studio-focus: #81baff; --studio-edge-medium: #81baff; --studio-edge-low: #a6afbb;
      --studio-blue-soft: #182d46;
      --studio-on-accent: #20132f;
    }
    :root[data-studio-theme] {
      --bg: var(--studio-bg); --surface: var(--studio-raised); --surface-muted: var(--studio-panel);
      --border: var(--studio-line); --text: var(--studio-ink); --muted: var(--studio-muted);
      --accent: var(--studio-accent); --accent-soft: var(--studio-accent-soft); --focus: var(--studio-focus);
      --edge-high: var(--studio-accent); --edge-medium: var(--studio-edge-medium);
      --edge-low: var(--studio-edge-low); --danger: var(--studio-danger);
    }
    :root[data-studio-theme], :root[data-studio-theme] body {
      --background-color-default: var(--studio-raised); --border-color-default: var(--studio-line);
      --text-color-default: var(--studio-ink); --text-color-muted: var(--studio-muted);
      --color-focus-outline: var(--studio-focus); --true-color-purple: var(--studio-accent);
      --true-color-blue: var(--studio-edge-medium); --true-color-green: var(--studio-ok);
      --true-color-blue-muted: var(--studio-blue-soft);
      --true-color-red: var(--studio-danger); --true-color-orange: var(--studio-warn);
    }
    .studio-site-nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; }
    .studio-brand { display: inline-flex; align-items: center; gap: 8px; color: var(--studio-ink); font-size: 13px; font-weight: 600; text-decoration: none; white-space: nowrap; }
    .studio-logo { flex: 0 0 auto; width: 32px; height: 28px; object-fit: contain; }
    .studio-brand:focus-visible, .studio-theme-control a:focus-visible { outline: 2px solid var(--studio-focus); outline-offset: 3px; border-radius: 4px; }
    .studio-theme-control { display: flex; align-items: center; gap: 10px; position: relative; }
    .studio-theme-control .studio-docs { color: var(--studio-muted); font-size: 12px; text-decoration: none; }
    .studio-theme-control .studio-docs:hover { color: var(--studio-ink); text-decoration: underline; }
    .studio-theme-error { position: absolute; z-index: 10; top: 100%; right: 0; width: min(260px, calc(100vw - 32px)); padding: 8px; border: 1px solid var(--studio-line); border-radius: 4px; background: var(--studio-raised); color: var(--studio-danger); font-size: 12px; }
    .studio-theme-error:empty { display: none; }
    button.primary, button.run-button-primary { color: var(--studio-on-accent); background: var(--studio-accent); border-color: var(--studio-accent); }
    .actions button.primary, .header-actions > button.primary { color: var(--studio-on-accent); background: var(--studio-accent); border-color: var(--studio-accent); }
    #details[data-mode="manage"] button.primary, #details[data-mode="manage"] button.primary:hover:not(:disabled) { color: var(--studio-on-accent); }
    button.primary:hover, button.run-button-primary:hover { background: var(--studio-accent-2); border-color: var(--studio-accent-2); }
    button.run-button-danger { color: var(--studio-danger); border-color: var(--studio-danger); }
    button:disabled { cursor: not-allowed; opacity: .65; }
    button:focus-visible { outline: 2px solid var(--studio-focus); outline-offset: 3px; }
    .runtime-badge[data-tone="success"], .tool-status.ready { color: var(--studio-ok); border-color: var(--studio-ok); }
    .runtime-badge[data-tone="warning"] { color: var(--studio-warn); border-color: var(--studio-warn); }
    .node-visual { color: var(--studio-accent); }
    .node-visual[data-tier-id="web"], .node-visual[data-tier-id="workflows"], .node-visual[data-tier-id="gateway"], .node-visual[data-tier-id="connectors"] { color: var(--studio-edge-medium); }
    .node-visual[data-tier-id="agent"], .node-visual[data-tier-id="sre"] { color: var(--studio-accent); }
    .node-visual[data-tier-id="skills"], .node-visual[data-tier-id="data"] { color: var(--studio-ok); }
    .node-visual[data-tier-id="sandbox"] { color: var(--studio-muted); }
    a { color: var(--studio-accent); }
    ${SETTINGS_CSS}
  `;
}

export function renderThemeToggle(theme = "light") {
  validateTheme(theme);
  return `<div class="studio-theme-control" role="group" aria-label="Unity Studio utilities">
    <a class="studio-docs" href="https://github.com/coreai-microsoft/unity/tree/main/canvases/unity-studio#readme" target="_blank" rel="noopener noreferrer">Docs</a>
    <button class="studio-settings-toggle" type="button" data-studio-settings-toggle aria-label="Settings" title="Settings" aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-.7 2.4-2 .9L4 5.7 2 9l1.7 1.8v2.4L2 15l2 3.3 2.3-.6 2 .9L9 21h4l.7-2.4 2-.9 2.3.6 2-3.3-1.7-1.8v-2.4L20 9l-2-3.3-2.3.6-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/></svg>
    </button>
    <span class="studio-theme-error" role="status"></span>
    <dialog class="studio-settings" aria-labelledby="studio-settings-title">
      <div class="studio-settings-heading"><h2 id="studio-settings-title">Settings</h2><button type="button" class="studio-settings-close" data-settings-close aria-label="Close settings" autofocus>×</button></div>
      <div class="studio-settings-content">
        <label>Appearance<select aria-label="Appearance" data-studio-theme-select><option value="light"${theme === "light" ? " selected" : ""}>Light</option><option value="dark"${theme === "dark" ? " selected" : ""}>Dark</option></select></label>
        <p>Applies to Unity Studio across your apps.</p>
        <p class="error studio-settings-error" role="alert"></p>
        <div data-settings-app></div>
      </div>
    </dialog>
  </div>`;
}

export function renderThemeClientScript(apiToken) {
  const token = JSON.stringify(apiToken).replaceAll("<", "\\u003c");
  return `
    (() => {
      const controls = [...document.querySelectorAll("[data-studio-theme-select]")];
      const errorDisplay = document.querySelector(".studio-theme-error");
      const settingsError = document.querySelector(".studio-settings-error");
      const dialog = document.querySelector(".studio-settings");
      window.unityStudioSettings = (${createStudioSettings.toString()})({
        dialog, trigger: document.querySelector("[data-studio-settings-toggle]"),
      });
      window.dispatchEvent(new Event("unity-studio-settings-ready"));
      let saving = false;
      let epoch = 0;
      let confirmedTheme = document.documentElement.dataset.studioTheme;
      const reportError = (message) => {
        errorDisplay.textContent = dialog.open ? "" : message;
        settingsError.textContent = message;
      };
      const applyTheme = (theme) => {
        if (!["light", "dark"].includes(theme)) throw new Error("Studio returned an invalid appearance preference.");
        confirmedTheme = theme;
        document.documentElement.dataset.studioTheme = theme;
        for (const control of controls) control.value = theme;
      };
      for (const control of controls) control.addEventListener("change", async () => {
        if (saving) return;
        saving = true;
        epoch += 1;
        controls.forEach((button) => { button.disabled = true; });
        reportError("");
        try {
          const response = await fetch("/api/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Unity-Studio-Token": ${token} },
            body: JSON.stringify({ theme: control.value }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Appearance preference could not be saved.");
          applyTheme(result.theme);
        } catch (error) {
          applyTheme(confirmedTheme);
          reportError(error.message);
        } finally {
          saving = false;
          controls.forEach((button) => { button.disabled = false; });
        }
      });
      window.addEventListener("focus", async () => {
        if (saving) return;
        const readEpoch = ++epoch;
        try {
          const response = await fetch("/api/preferences", { headers: { "X-Unity-Studio-Token": ${token} } });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Appearance preference could not be read.");
          if (!saving && readEpoch === epoch) applyTheme(result.theme);
        } catch (error) { if (readEpoch === epoch) reportError(error.message); }
      });
    })();
  `;
}
