import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listSourceCatalog } from "./source-catalog.mjs";
import { renameAppWorkspace } from "./workspace-actions.mjs";

async function withApp(action) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "app-rename-")));
  try {
    await mkdir(join(root, "src", "agent"), { recursive: true });
    await writeFile(join(root, "azure-app.yaml"), "capabilities:\n  agent:\n    path: src/agent\n");
    await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("Renaming persists a display name, preserves identity and files, and refreshes discovery", async () => {
  await withApp(async root => {
    const identity = {
      name: "Original app", managedBranch: "original-branch", childSessionId: "original-session",
      runtime: { agentPort: 8088 }, purpose: "Keep this purpose",
    };
    const directory = join(root, ".azure-app-platform");
    await mkdir(directory);
    await writeFile(join(directory, "app.json"), JSON.stringify(identity));
    await writeFile(join(directory, "last-opened.json"), '{"lastOpenedAt":"2026-11-07T12:00:00Z"}');
    const manifest = await readFile(join(root, "azure-app.yaml"), "utf8");
    const result = await renameAppWorkspace({ root, name: "  My renamed app  " });
    assert.deepEqual(result, { outcome: "app-renamed", worktreePath: root, name: "My renamed app" });
    assert.deepEqual(JSON.parse(await readFile(join(directory, "app.json"), "utf8")),
      { ...identity, name: result.name });
    assert.equal(await readFile(join(root, "azure-app.yaml"), "utf8"), manifest);
    assert.equal(await readFile(join(directory, "last-opened.json"), "utf8"), '{"lastOpenedAt":"2026-11-07T12:00:00Z"}');
    assert.deepEqual((await readdir(directory)).sort(), ["app.json", "last-opened.json"]);
    const catalog = await listSourceCatalog({
      workspaceRoot: root,
      commandRunner: async (_command, args) => args.includes("list")
        ? { ok: true, stdout: `worktree ${root}\nbranch refs/heads/original-branch\n` }
        : { ok: false, stdout: "" },
    });
    assert.equal(catalog.apps[0].name, result.name);
    assert.equal(catalog.apps[0].path, root);
    assert.equal(catalog.apps[0].branch, "original-branch");
  });
});

test("Older apps can save a name; invalid names and malformed metadata never overwrite identity", async () => {
  await withApp(async root => {
    for (const name of [undefined, "", " ", "x".repeat(81), "../outside", "<script>", "bad\nname"]) {
      await assert.rejects(renameAppWorkspace({ root, name }));
    }
    await renameAppWorkspace({ root, name: "My app" });
    const identityPath = join(root, ".azure-app-platform", "app.json");
    assert.deepEqual(JSON.parse(await readFile(identityPath, "utf8")), { name: "My app" });
    for (const contents of ["broken json", "null", "[]", '"text"']) {
      await writeFile(identityPath, contents);
      await assert.rejects(renameAppWorkspace({ root, name: "Do not save" }));
      assert.equal(await readFile(identityPath, "utf8"), contents);
    }
  });
});

test("Renaming refuses linked identity directories without writing outside the app", async () => {
  await withApp(async root => {
    const outside = await mkdtemp(join(tmpdir(), "app-rename-outside-"));
    try {
      await writeFile(join(outside, "app.json"), '{"name":"Unchanged"}');
      await symlink(outside, join(root, ".azure-app-platform"), process.platform === "win32" ? "junction" : "dir");
      await assert.rejects(renameAppWorkspace({ root, name: "Do not save" }), /symbolic link/);
      assert.equal(await readFile(join(outside, "app.json"), "utf8"), '{"name":"Unchanged"}');
    } finally {
      await rm(join(root, ".azure-app-platform"), { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  });
});
