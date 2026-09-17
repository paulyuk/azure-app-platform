import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { diffSource, parseUnifiedDiff, reviewBuildArtifact } from "./build-diff.mjs";
import { readBuildWorkspace } from "./build-workspace.mjs";
import { runCommand } from "./discovery.mjs";

test("Git-backed draft review reports changed lines, bounded context, empty files and final-newline changes", async () => {
  const before = Array.from({ length: 40 }, (_, index) => `line ${index + 1}\n`);
  const after = [...before];
  after[5] = "changed six\n";
  after[30] = "changed thirty-one\n";
  const diff = await diffSource(before.join(""), after.join(""));
  assert.equal(diff.additions, 2);
  assert.equal(diff.deletions, 2);
  assert.equal(diff.hunks.length, 2);
  assert.deepEqual(diff.hunks[0].lines.find((line) => line.kind === "removed"), { kind: "removed", oldLine: 6, newLine: null, text: "line 6" });
  assert.deepEqual(diff.hunks[0].lines.find((line) => line.kind === "added"), { kind: "added", oldLine: null, newLine: 6, text: "changed six" });
  assert.ok(diff.hunks.flatMap((hunk) => hunk.lines).length < 40);
  assert.equal((await diffSource("", "hello\n")).hunks[0].oldCount, 0);
  assert.equal((await diffSource("hello\n", "")).hunks[0].newCount, 0);
  assert.ok((await diffSource("hello", "hello\n")).hunks[0].lines.some((line) => line.kind === "notice"));
  assert.deepEqual(await diffSource("same", "same"), { additions: 0, deletions: 0, hunks: [] });
});

test("Diff temporary files are private, removed on success/failure, and never invoke external diff drivers", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "unity diff cleanup "));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  for (const fail of [false, true]) {
    const promise = diffSource("old\n", "new\n", {
      temporaryRoot,
      commandRunner: async (command, args, options) => {
        assert.equal(command, "git");
        for (const option of ["--no-index", "--no-ext-diff", "--no-textconv", "--text", "--unified=3"]) assert.ok(args.includes(option));
        const paths = args.slice(-2);
        assert.equal(await readFile(paths[0], "utf8"), "old\n");
        assert.equal(await readFile(paths[1], "utf8"), "new\n");
        if (process.platform !== "win32") {
          for (const path of paths) assert.equal((await stat(path)).mode & 0o777, 0o600);
        }
        return fail ? { ok: false, exitCode: 128, error: "Git unavailable." } : runCommand(command, args, options);
      },
    });

    if (fail) await assert.rejects(promise, /Git unavailable/);
    else await promise;
    assert.deepEqual(await readdir(temporaryRoot), []);
  }
  assert.throws(() => parseUnifiedDiff("@@ -1,2 +1 @@\n-old\n+new\n"), /incomplete/);
});

test("Review preserves blank context lines, significant trailing whitespace and CRLF source", async () => {
  for (const [before, after, tail] of [
    ["old\n\n", "new\n\n", ""],
    ["old\n   \n", "new\n   \n", "   "],
    ["old\r\nsame\r\n", "new\r\nsame\r\n", "same\r"],
  ]) {
    const diff = await diffSource(before, after);
    assert.equal(diff.hunks[0].lines.at(-1).text, tail);
    assert.equal(diff.hunks[0].lines.at(-1).kind, "context");
  }
  const spaces = await diffSource("old\n", "new  \t\n");
  assert.equal(spaces.hunks[0].lines.at(-1).text, "new  \t");
});

test("Build diff uses the allowlisted saved source, rejects stale/oversized drafts and leaves the file unchanged", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "unity review source "));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "src/agent/prompts"), { recursive: true });
  await mkdir(join(root, "src/tools/document-validation"), { recursive: true });
  const path = join(root, "src/agent/prompts/system.md");
  const original = "# Instructions\nUse the tool.\n";
  await writeFile(path, original);
  const { artifacts } = await readBuildWorkspace(root);
  const artifact = artifacts.find((item) => item.id === "instructions");
  const input = { id: artifact.id, baseSha: artifact.sha, content: "# Instructions\nUse the trusted tool.\n" };
  const review = await reviewBuildArtifact(root, input);
  assert.equal(review.baseSha, artifact.sha);
  assert.equal(review.additions, 1);
  assert.equal(review.deletions, 1);
  assert.equal(await readFile(path, "utf8"), original);
  await assert.rejects(reviewBuildArtifact(root, { ...input, baseSha: "stale" }), { statusCode: 409 });
  await assert.rejects(reviewBuildArtifact(root, { ...input, id: "../arbitrary" }), { statusCode: 400 });
  await assert.rejects(reviewBuildArtifact(root, { ...input, content: "x".repeat(96 * 1024 + 1) }), { statusCode: 400 });
});
