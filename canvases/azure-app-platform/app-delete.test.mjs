import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deleteAppWorkspace } from "./workspace-actions.mjs";

test("Deletion distinguishes failed worktree removal from complete and partial branch cleanup", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "app-delete-unit-")));
  const workspaceRoot = join(directory, "canvas"), root = join(directory, "app");
  let branch = "managed-app";
  try {
    await mkdir(join(root, ".azure-app-platform"), { recursive: true });
    const identity = join(root, ".azure-app-platform", "app.json");
    await writeFile(identity, JSON.stringify({ name: "App", managedBranch: branch }));
    let registered = true, matches = true, removeFails = false, branchFails = false, branchThrows = false;
    const calls = [];
    const commandRunner = async (command, args) => {
      assert.equal(command, "git");
      calls.push(args);
      if (args.includes("list")) return { ok: true, stdout: registered
        ? `worktree ${root}\nbranch refs/heads/${matches ? branch : "other-branch"}\n` : "" };
      if (args.includes("worktree")) return { ok: !removeFails, stderr: "Worktree is locked." };
      if (branchThrows) throw new Error("Branch runner failed.");
      return { ok: !branchFails, stderr: "Branch is in use." };
    };
    const remove = () => deleteAppWorkspace({ workspaceRoot, root, confirmed: true, commandRunner });
    await assert.rejects(deleteAppWorkspace({ workspaceRoot, root, commandRunner }), /explicit confirmation/);
    await assert.rejects(deleteAppWorkspace({ workspaceRoot, root: workspaceRoot, confirmed: true, commandRunner }), /Canvas workspace/);
    registered = false;
    await assert.rejects(remove(), /registered app worktree/);
    registered = true;
    matches = false;
    await assert.rejects(remove(), /managed branch does not match/);
    assert.ok(calls.every(args => !args.includes("remove") && !args.includes("-D")));
    matches = true;
    removeFails = true;
    const failed = await remove();
    assert.equal(failed.outcome, "failed");
    assert.equal(failed.worktreeRemoved, false);
    assert.match(failed.error, /Worktree is locked/);
    assert.equal(calls.some(args => args.includes("-D")), false);
    assert.equal(JSON.parse(await readFile(identity)).managedBranch, branch);
    removeFails = false;
    for (const throws of [false, true]) {
      branchFails = true;
      branchThrows = throws;
      const before = calls.length;
      const partial = await remove();
      assert.equal(partial.outcome, "partial");
      assert.equal(partial.worktreeRemoved, true);
      assert.equal(partial.remainingBranch, branch);
      assert.equal(partial.recoveryCommand, "git branch -D 'managed-app'");
      assert.match(partial.message, throws ? /Branch runner failed/ : /Branch is in use/);
      assert.match(partial.message, /Azure resources were not changed/);
      assert.deepEqual(calls.slice(before), [
        ["-C", workspaceRoot, "worktree", "list", "--porcelain"],
        ["-C", workspaceRoot, "worktree", "remove", "--force", root],
        ["-C", workspaceRoot, "branch", "-D", branch],
      ], "Destructive commands are never automatically retried");
    }
    branchFails = branchThrows = false;
    const complete = await remove();
    assert.equal(complete.outcome, "complete");
    assert.equal(complete.worktreeRemoved, true);
    assert.equal(complete.branch, branch);
    assert.equal(complete.remainingBranch, undefined);
    branch = "app'with$quoted";
    await writeFile(identity, JSON.stringify({ managedBranch: branch }));
    branchFails = true;
    const quoted = await remove();
    assert.equal(quoted.recoveryCommand, process.platform === "win32"
      ? "git branch -D 'app''with$quoted'"
      : "git branch -D 'app'\\''with$quoted'");
    assert.deepEqual(calls.at(-1), ["-C", workspaceRoot, "branch", "-D", branch]);
    await writeFile(identity, "{}");
    const before = calls.length;
    const unmanaged = await remove();
    assert.equal(unmanaged.outcome, "complete");
    assert.equal(unmanaged.branch, null);
    assert.equal(calls.slice(before).some(args => args.includes("-D")), false, "Unmanaged branches are not deleted");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
