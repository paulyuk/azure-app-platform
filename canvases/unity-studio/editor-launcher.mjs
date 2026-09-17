import { stat } from "node:fs/promises";
import { isAbsolute, win32 } from "node:path";
import { runCommand } from "./discovery.mjs";
import { getEditorChoice, readEditorSettings } from "./editor-settings.mjs";

const launchers = {
  vscode: { command: "code", app: "Visual Studio Code", executable: "Code.exe", folder: "Microsoft VS Code", goto: true },
  "vscode-insiders": { command: "code-insiders", app: "Visual Studio Code - Insiders", executable: "Code - Insiders.exe", folder: "Microsoft VS Code Insiders", goto: true },
  cursor: { command: "cursor", app: "Cursor", executable: "Cursor.exe", folder: "Cursor", goto: true },
  windsurf: { command: "windsurf", app: "Windsurf", executable: "Windsurf.exe", folder: "Windsurf", goto: true },
  zed: { command: "zed", app: "Zed", newWindow: "--new" },
  sublime: { command: "subl", app: "Sublime Text" },
};

async function isFile(path) {
  try { return (await stat(path)).isFile(); }
  catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}

export function editorLaunchArguments(editorId, root, file) {
  getEditorChoice(editorId);
  for (const path of [root, ...(file ? [file] : [])]) {
    if (typeof path !== "string" || /[\u0000-\u001f\u007f]/.test(path) || (!isAbsolute(path) && !win32.isAbsolute(path))) {
      throw new Error("Editor targets must be absolute paths without control characters.");
    }
  }
  const launcher = launchers[editorId];
  return [launcher.newWindow ?? "--new-window", root, ...(file ? [...(launcher.goto ? ["--goto"] : []), file] : [])];
}

export async function openWorkspaceInEditor({
  root, file, editorId, commandRunner = runCommand, platform = process.platform,
  environment = process.env, fileExists = isFile,
}) {
  const selected = getEditorChoice(editorId ?? (await readEditorSettings()).editorId);
  const launcher = launchers[selected.id];
  const args = editorLaunchArguments(selected.id, root, file);
  const success = (command) => ({ outcome: "opened-in-editor", root, editorId: selected.id, editorLabel: selected.label, command });
  const failures = [];
  if (platform === "win32" && launcher.executable) {
    const found = await commandRunner("where.exe", [launcher.command + ".cmd"], { timeout: 10_000 });
    const directories = found.ok
      ? found.stdout.split(/\r?\n/).filter((path) => win32.isAbsolute(path.trim())).map((path) => win32.dirname(win32.dirname(path.trim())))
      : [];
    if (environment.LOCALAPPDATA) directories.push(win32.join(environment.LOCALAPPDATA, "Programs", launcher.folder));
    for (const base of [environment.ProgramFiles, environment["ProgramFiles(x86)"]]) {
      if (base) directories.push(win32.join(base, launcher.folder));
    }
    for (const directory of new Set(directories)) {
      const executable = win32.join(directory, launcher.executable);
      const cli = win32.join(directory, "resources", "app", "out", "cli.js");
      if (!await fileExists(executable) || !await fileExists(cli)) continue;
      // Run the bundled CLI through Electron's Node mode, never through a .cmd shell.
      const result = await commandRunner(executable, [cli, ...args], { timeout: 10_000, env: { ELECTRON_RUN_AS_NODE: "1" } });
      if (result.ok) return success(executable);
      failures.push(result.stderr || result.error || "The editor CLI failed.");
    }
  } else {
    const command = platform === "win32" ? launcher.command + ".exe" : launcher.command;
    const result = await commandRunner(command, args, { timeout: 10_000 });
    if (result.ok) return success(command);
    failures.push(result.stderr || result.error || "The editor command is unavailable.");
    if (platform === "darwin") {
      const fallback = await commandRunner("open", ["-a", launcher.app, root, ...(file ? [file] : [])], { timeout: 10_000 });
      if (fallback.ok) return success("open");
      failures.push(fallback.stderr || fallback.error || "The editor application could not be opened.");
    }
  }
  throw new Error(`Could not open ${selected.label}: ${failures.join(" ") || "The installed editor CLI could not be found."} Install ${selected.label} and enable the '${launcher.command}' command on PATH, or choose another supported editor.`);
}
