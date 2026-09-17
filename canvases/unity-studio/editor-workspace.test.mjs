import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EMPTY_TEMPLATE, resolveSourcePlan } from "./source-catalog.mjs";
import { buildWorkspaceRequestPrompt, normalizeWorkspaceRequest, requestAppWorkspace } from "./workspace-actions.mjs";

test("Workspace requests use only supported editor IDs and retain explicit legacy VS Code intent", () => {
  const input = { appName: "claims", purpose: "Review claims", tierIds: ["agent", "gateway"] };
  const request = normalizeWorkspaceRequest({ ...input, openInEditor: true, editorId: "zed", openInVsCode: true });
  assert.equal(request.openInEditor, true);
  assert.equal(request.openInVsCode, false);
  request.sourcePlan = resolveSourcePlan({ roots: [], templates: [EMPTY_TEMPLATE] }, request);
  const prompt = buildWorkspaceRequestPrompt(request, { baseBranch: "main", workspaceRoot: "/repo" });
  assert.match(prompt, /open_in_editor/);
  assert.match(prompt, /editorId "zed"/);
  assert.doesNotMatch(prompt, /code --new-window/);
  assert.throws(() => normalizeWorkspaceRequest({ ...input, openInEditor: true, editorId: "custom" }), /supported/i);
  assert.equal(normalizeWorkspaceRequest({ ...input, openInVsCode: true }).openInVsCode, true);
  assert.equal(normalizeWorkspaceRequest({ ...input, openInEditor: false, openInVsCode: true }).openInVsCode, false);
});

test("Template creation opens the selected editor, while launch failures retain the created app", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "unity editor creation "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source");
  await mkdir(source);
  for (const fail of [false, true]) {
    const commands = [];
    const result = await requestAppWorkspace({
      session: {}, workspaceRoot: source,
      input: { appName: "claims", purpose: "Review claims", tierIds: ["agent", "gateway"], openInEditor: true, editorId: "zed" },
      sourceCatalog: { roots: [], templates: [EMPTY_TEMPLATE] },
      commandRunner: async (command, args) => {
        commands.push([command, args]);
        if (command !== "git") return { ok: !fail, stdout: "", error: fail ? "Editor unavailable" : null };
        return { ok: true, stdout: args.includes("--show-current") ? "main" : "" };
      },
    });
    assert.equal(result.outcome, "workspace-created");
    assert.equal(result.editorId, "zed");
    assert.equal(result.openInEditor, true);
    assert.match(await readFile(join(result.worktreePath, ".unity-studio/app.json"), "utf8"), /claims/);
    assert.equal(commands.some(([command]) => command === "code"), false);
    if (fail) {
      assert.equal(result.editor, null);
      assert.match(result.editorWarning, /Zed did not open automatically/);
      assert.match(result.editorWarning, /The app was still created/);
    } else {
      assert.equal(result.editor.editorLabel, "Zed");
      assert.equal(result.editorWarning, null);
      assert.ok(commands.some(([command, args]) => ["zed", "zed.exe"].includes(command) && args[1] === result.worktreePath));
    }
  }
});
