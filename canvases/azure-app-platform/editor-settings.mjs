import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { studioPreferencesDirectory } from "./studio-theme.mjs";

export const EDITOR_CHOICES = Object.freeze([
  { id: "vscode", label: "VS Code" },
  { id: "vscode-insiders", label: "VS Code Insiders" },
  { id: "cursor", label: "Cursor" },
  { id: "windsurf", label: "Windsurf" },
  { id: "zed", label: "Zed" },
  { id: "sublime", label: "Sublime Text" },
].map(Object.freeze));

export const DEFAULT_EDITOR_SETTINGS = Object.freeze({ editorId: "vscode", editors: EDITOR_CHOICES });

export function getEditorChoice(editorId) {
  const editor = EDITOR_CHOICES.find((item) => item.id === editorId);
  if (!editor) {
    const error = new Error("Choose an editor from the supported editor list.");
    error.statusCode = 400;
    throw error;
  }
  return editor;
}

export async function readEditorSettings(directory = studioPreferencesDirectory()) {
  try {
    const data = JSON.parse(await readFile(join(directory, "editor-preferences.json"), "utf8"));
    const editor = getEditorChoice(data?.editorId);
    return { editorId: editor.id, editors: EDITOR_CHOICES };
  } catch (error) {
    if (error.code === "ENOENT") return { ...DEFAULT_EDITOR_SETTINGS };
    throw new Error(`Could not read the saved code editor: ${error.message}`, { cause: error });
  }
}

export async function writeEditorSettings(input, directory = studioPreferencesDirectory()) {
  const editor = getEditorChoice(input?.editorId);
  if (Object.keys(input).some((key) => key !== "editorId")) {
    const error = new Error("Editor settings accept only a supported editorId, not custom commands.");
    error.statusCode = 400;
    throw error;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `editor-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify({ editorId: editor.id }) + "\n", { mode: 0o600, flag: "wx" });
    await rename(temporary, join(directory, "editor-preferences.json"));
  } finally {
    await rm(temporary, { force: true });
  }
  return { editorId: editor.id, editors: EDITOR_CHOICES };
}
