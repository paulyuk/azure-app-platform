import assert from "node:assert/strict";
import test from "node:test";
import { editorLaunchArguments, openWorkspaceInEditor } from "./editor-launcher.mjs";
import { runCommand } from "./discovery.mjs";

const editors = [
  ["vscode", "code", "VS Code", "Visual Studio Code"],
  ["vscode-insiders", "code-insiders", "VS Code Insiders", "Visual Studio Code - Insiders"],
  ["cursor", "cursor", "Cursor", "Cursor"],
  ["windsurf", "windsurf", "Windsurf", "Windsurf"],
  ["zed", "zed", "Zed", "Zed"],
  ["sublime", "subl", "Sublime Text", "Sublime Text"],
];

test("Each supported editor receives workspace and selected file as separate arguments", async () => {
  for (const [editorId, command, label] of editors) {
    const root = "/repo/work tree & project";
    const file = root + "/src/main.py";
    const expected = [editorId === "zed" ? "--new" : "--new-window", root,
      ...(["zed", "sublime"].includes(editorId) ? [] : ["--goto"]), file];
    const result = await openWorkspaceInEditor({
      root, file, editorId, platform: "linux",
      commandRunner: async (actual, args) => {
        assert.equal(actual, command);
        assert.deepEqual(args, expected);
        return { ok: true };
      },
    });
    assert.equal(result.editorId, editorId);
    assert.equal(result.editorLabel, label);
    assert.equal(result.outcome, "opened-in-editor");
    assert.deepEqual(editorLaunchArguments(editorId, root), expected.slice(0, 2));
  }
});

test("macOS falls back only to the selected app, and missing editors report remediation", async () => {
  for (const [editorId, command, label, app] of editors) {
    const calls = [];
    const result = await openWorkspaceInEditor({
      root: "/repo/app", file: "/repo/app/file.py", editorId, platform: "darwin",
      commandRunner: async (name, args) => { calls.push([name, args]); return { ok: name === "open", error: "CLI missing" }; },
    });
    assert.equal(calls[0][0], command);
    assert.deepEqual(calls[1], ["open", ["-a", app, "/repo/app", "/repo/app/file.py"]]);
    assert.equal(result.command, "open");
    await assert.rejects(openWorkspaceInEditor({
      root: "/repo/app", editorId, platform: "darwin",
      commandRunner: async () => ({ ok: false, error: "not installed" }),
    }), (error) => error.message.includes(label) && error.message.includes("PATH") && error.message.includes("choose another"));
  }
});

test("Windows launches Electron editor CLIs directly without a cmd shell or interpolated paths", async () => {
  for (const [editorId, command, , , executable] of [
    [...editors[0], "Code.exe"], [...editors[1], "Code - Insiders.exe"],
    [...editors[2], "Cursor.exe"], [...editors[3], "Windsurf.exe"],
  ]) {
    const installation = "C:\\Editors & tools\\Chosen editor";
    const root = "C:\\Work\\project & (notes) %PATH%";
    const file = root + "\\src\\main.py";
    const calls = [];
    const result = await openWorkspaceInEditor({
      root, file, editorId, platform: "win32", environment: {},
      fileExists: async (path) => [installation + "\\" + executable, installation + "\\resources\\app\\out\\cli.js"].includes(path),
      commandRunner: async (name, args, options) => {
        calls.push({ name, args, options });
        return name === "where.exe" ? { ok: true, stdout: installation + "\\bin\\" + command + ".cmd" } : { ok: true };
      },
    });
    assert.deepEqual(calls[0].args, [command + ".cmd"]);
    assert.equal(calls[1].name, installation + "\\" + executable);
    assert.deepEqual(calls[1].args, [installation + "\\resources\\app\\out\\cli.js", "--new-window", root, "--goto", file]);
    assert.deepEqual(calls[1].options.env, { ELECTRON_RUN_AS_NODE: "1" });
    assert.equal(result.editorId, editorId);
    assert.equal(calls.some((call) => /cmd\.exe|powershell/i.test(call.name)), false);
  }
});

test("Windows finds standard installations without PATH and supports native CLI executables", async () => {
  const calls = [];
  await openWorkspaceInEditor({
    root: "C:\\work", editorId: "cursor", platform: "win32",
    environment: { LOCALAPPDATA: "C:\\Users\\Example\\AppData\\Local" },
    fileExists: async () => true,
    commandRunner: async (command, args) => { calls.push([command, args]); return { ok: command !== "where.exe" }; },
  });
  assert.equal(calls[1][0], "C:\\Users\\Example\\AppData\\Local\\Programs\\Cursor\\Cursor.exe");
  for (const [editorId, command] of [["zed", "zed.exe"], ["sublime", "subl.exe"]]) {
    await openWorkspaceInEditor({
      root: "C:\\work", editorId, platform: "win32",
      commandRunner: async (name) => { assert.equal(name, command); return { ok: true }; },
    });
  }
});

test("Unsupported editors and option-like or control-character paths cannot launch commands", async () => {
  let called = false;
  for (const input of [
    { editorId: "custom", root: "/repo/app" },
    { editorId: "vscode", root: "--help" },
    { editorId: "cursor", root: "/repo/app", file: "/repo/file\nbad" },
  ]) {
    await assert.rejects(openWorkspaceInEditor({
      ...input, commandRunner: async () => { called = true; return { ok: true }; },
    }));
  }
  assert.equal(called, false);
});

test("Shared command runner supports explicit editor CLI environment without using a shell", async () => {
  const result = await runCommand(process.execPath, ["-e", "process.stdout.write(process.env.UNITY_EDITOR_TEST)"], {
    env: { UNITY_EDITOR_TEST: "argument-safe" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.stdout, "argument-safe");
});
