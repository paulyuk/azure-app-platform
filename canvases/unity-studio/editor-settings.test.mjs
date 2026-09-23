import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EDITOR_CHOICES, readEditorSettings, writeEditorSettings } from "./editor-settings.mjs";
import { readStudioPreferences, writeStudioPreferences } from "./studio-theme.mjs";

test("Supported editor preferences persist independently of appearance and never accept custom commands", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "unity editor settings "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.equal((await readEditorSettings(directory)).editorId, "vscode");
  assert.deepEqual(EDITOR_CHOICES.map((editor) => editor.id), ["vscode", "vscode-insiders", "cursor", "windsurf", "zed", "sublime"]);
  await writeStudioPreferences({ theme: "dark" }, directory);
  for (const editor of EDITOR_CHOICES) {
    assert.equal((await writeEditorSettings({ editorId: editor.id }, directory)).editorId, editor.id);
    assert.equal((await readEditorSettings(directory)).editorId, editor.id);
  }
  assert.deepEqual(await readStudioPreferences(directory), { theme: "dark" });
  await writeStudioPreferences({ theme: "light" }, directory);
  assert.equal((await readEditorSettings(directory)).editorId, "sublime");
  for (const input of [undefined, { editorId: "other" }, { editorId: "../code" }, { editorId: "cursor; echo bad" }, { editorId: "zed", command: "/tmp/custom" }]) {
    await assert.rejects(writeEditorSettings(input, directory), { statusCode: 400 });
  }
  assert.deepEqual(JSON.parse(await readFile(join(directory, "editor-preferences.json"), "utf8")), { editorId: "sublime" });
  await writeFile(join(directory, "editor-preferences.json"), '{"editorId":"unknown"}');
  await assert.rejects(readEditorSettings(directory), /Could not read the saved code editor/);
  await writeFile(join(directory, "editor-preferences.json"), "not json");
  await assert.rejects(readEditorSettings(directory), /Could not read the saved code editor/);
});
