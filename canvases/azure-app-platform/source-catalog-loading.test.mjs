import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { LOCAL_TEMPLATES, findSourceApp, listSourceCatalog } from "./source-catalog.mjs";

const directory = fileURLToPath(new URL("./", import.meta.url));
const hashId = (...values) => createHash("sha256").update(values.join("\0")).digest("hex").slice(0, 20);
const success = (stdout = "") => ({ ok: true, stdout, stderr: "" });
const failure = () => ({ ok: false, stdout: "", stderr: "fixture unavailable" });

async function withRoots(count, action) {
  const fixture = await mkdtemp(join(directory, ".source-catalog-loading-"));
  try {
    const roots = await Promise.all(Array.from({ length: count }, async (_, index) => {
      const root = join(fixture, `app-${String(index).padStart(2, "0")}`);
      await Promise.all([
        mkdir(join(root, "src", "web"), { recursive: true }),
        mkdir(join(root, "src", "agent"), { recursive: true }),
        mkdir(join(root, ".azure-app-platform"), { recursive: true }),
      ]);
      const lastOpenedAt = new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString();
      await Promise.all([
        writeFile(join(root, "azure-app.yaml"), "capabilities:\n  web:\n    path: src/web\n  agent:\n    path: src/agent\n"),
        writeFile(join(root, "src", "web", "package.json"), '{"dependencies":{"vite":"fixture"}}\n'),
        writeFile(join(root, "src", "agent", "agent.yaml"), `name: fixture-${index}\nkind: hosted\n`),
        writeFile(join(root, ".azure-app-platform", "app.json"), JSON.stringify({ name: `Fixture ${index}` })),
        writeFile(join(root, ".azure-app-platform", "last-opened.json"), JSON.stringify({ lastOpenedAt })),
      ]);
      return {
        path: await realpath(root),
        branch: `fixture-${index}`,
        commit: (index + 1).toString(16).padStart(40, "0"),
        index,
        lastOpenedAt,
      };
    }));
    await action(roots, fixture);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

function fixtureRunner(roots, { listed = roots, gate, statusUnknown = new Set() } = {}) {
  const byPath = new Map(roots.map((root) => [root.path, root]));
  const state = { current: 0, peak: 0, calls: [], listingCount: 0, dirty: false };
  const listeners = new Set();
  const runner = async (command, args) => {
    assert.equal(command, "git", "Source listing must not invoke external inventory");
    const operation = args[2];
    if (operation === "worktree") {
      state.listingCount += 1;
      return success(listed.map((root) =>
        `worktree ${root.path}\nHEAD ${root.commit}\n${root.branch ? `branch refs/heads/${root.branch}` : "detached"}\n`).join("\n"));
    }
    if (operation === "rev-parse" || operation === "branch") {
      const canonical = await realpath(args[1]);
      const root = roots.find((candidate) => canonical === candidate.path
        || canonical.startsWith(candidate.path + (process.platform === "win32" ? "\\" : "/")));
      if (!root) return failure();
      if (args.includes("--show-toplevel")) return success(root.path);
      if (args.includes("HEAD")) return success(root.commit);
      if (args.includes("--show-current")) return success(root.branch ?? "");
    }
    const root = byPath.get(args[1]);
    assert.ok(root, "Metadata commands must use a canonical fixture path");
    state.calls.push({ root: root.path, operation, args });
    state.current += 1;
    state.peak = Math.max(state.peak, state.current);
    for (const listener of listeners) listener();
    try {
      if (gate) await gate.promise;
      await nextTurn();
      if (operation === "status") return statusUnknown.has(root.path)
        ? failure() : success(state.dirty || root.index % 3 === 0 ? " M src/web/package.json\n" : "");
      if (operation === "config") return success("git@example.test:fixtures/source.git\n");
      if (operation === "show") return success(String(1_700_000_000 + root.index));
      if (operation === "merge-base" || operation === "cat-file") return failure();
      assert.fail(`Unexpected fixture Git operation: ${operation}`);
    } finally {
      state.current -= 1;
    }
  };
  return {
    runner,
    state,
    async waitForCurrent(count) {
      if (state.current >= count) return;
      let timer;
      let listener;
      try {
        await new Promise((resolveProgress, rejectProgress) => {
          listener = () => { if (state.current >= count) resolveProgress(); };
          listeners.add(listener);
          timer = setTimeout(() => rejectProgress(new Error("Fixture metadata batches did not make progress")), 5_000);
        });
      } finally {
        clearTimeout(timer);
        listeners.delete(listener);
      }
    },
  };
}

function assertInventory(catalog, roots, { dirty = false, statusUnknown = new Set() } = {}) {
  assert.deepEqual(catalog.diagnostics, []);
  assert.deepEqual(catalog.roots.map((root) => root.path), roots.map((root) => root.path),
    "Bounded inspection must retain porcelain order, not completion order");
  assert.deepEqual(catalog.apps.map((app) => app.path), [...roots].reverse().map((root) => root.path),
    "Recent apps must retain persisted recency ordering");
  assert.deepEqual(catalog.templates.map((template) => template.id), LOCAL_TEMPLATES.map((template) => template.id));
  for (const [index, actual] of catalog.roots.entries()) {
    const expected = roots[index];
    assert.equal(actual.id, hashId(expected.path, expected.commit));
    assert.equal(actual.name, `Fixture ${expected.index}`);
    assert.equal(actual.kind, "git-worktree");
    assert.equal(actual.branch, expected.branch);
    assert.equal(actual.commit, expected.commit);
    assert.equal(actual.commitTimestamp, 1_700_000_000 + expected.index);
    assert.equal(actual.lastOpenedAt, expected.lastOpenedAt);
    assert.equal(actual.declaredApp, true);
    assert.equal(actual.statusKnown, !statusUnknown.has(expected.path));
    assert.equal(actual.dirty, dirty || expected.index % 3 === 0 || statusUnknown.has(expected.path));
    assert.equal(actual.repository, "https://example.test/fixtures/source.git");
    assert.equal(actual.runnableSample, false);
    assert.equal(actual.approvedSampleAncestry, false);
    assert.deepEqual(actual.capabilityIds, ["agent", "web"]);
    assert.deepEqual(actual.implementations.map((item) => item.projectPath), ["src/agent", "src/web"]);
    for (const implementation of actual.implementations) {
      assert.equal(implementation.id, hashId(expected.path, expected.commit, implementation.tierId, implementation.projectPath));
      assert.ok(implementation.matchedFiles.some((file) => file.path === "azure-app.yaml"),
        "Declared capability evidence must survive bounded inspection");
    }
  }
}

test("24-root source catalog bounds metadata work and preserves complete app contracts", async () => {
  await withRoots(24, async (roots) => {
    let release;
    const gate = { promise: new Promise((resolveGate) => { release = resolveGate; }) };
    const { runner, state, waitForCurrent } = fixtureRunner(roots, { gate });
    const pending = listSourceCatalog({ workspaceRoot: roots[0].path, commandRunner: runner });
    try {
      await waitForCurrent(20);
      assert.equal(state.current >= 20, true, "Two metadata batches must make progress while held by the fixture gate");
      for (let turn = 0; turn < 20; turn += 1) await nextTurn();
      assert.ok(state.peak <= 20, `Expected at most 20 in-flight metadata commands; observed ${state.peak}`);
    } finally {
      release();
      await pending;
    }
    const catalog = await pending;
    assert.equal(state.calls.length, 24 * 10);
    assert.equal(state.current, 0);
    assert.ok(state.peak <= 20, "Later roots must remain inside the same inspection budget");
    for (const root of roots) assert.equal(state.calls.filter((call) => call.root === root.path).length, 10);
    assertInventory(catalog, roots);
  });
});

test("simultaneous catalogs share the inspection budget without sharing stale inventory", async () => {
  await withRoots(24, async (roots) => {
    const { runner, state } = fixtureRunner(roots);
    const catalogs = await Promise.all([
      listSourceCatalog({ workspaceRoot: roots[0].path, commandRunner: runner }),
      listSourceCatalog({ workspaceRoot: roots[0].path, commandRunner: runner }),
    ]);
    assert.equal(state.listingCount, 2, "Only provider GET requests, not catalog scans, may coalesce");
    assert.equal(state.calls.length, 2 * 24 * 10);
    assert.ok(state.peak <= 20, `Concurrent catalogs exceeded the shared metadata budget: ${state.peak}`);
    for (const catalog of catalogs) assertInventory(catalog, roots);
    state.dirty = true;
    const refreshed = await listSourceCatalog({ workspaceRoot: roots[0].path, commandRunner: runner });
    assert.equal(state.listingCount, 3);
    assert.equal(state.calls.length, 3 * 24 * 10);
    assertInventory(refreshed, roots, { dirty: true });
    assert.deepEqual(refreshed.roots.map((root) => root.id), catalogs[0].roots.map((root) => root.id));
  });
});

test("failed roots retain diagnostics and do not discard successful or status-unknown apps", async () => {
  await withRoots(4, async (roots, fixture) => {
    await writeFile(join(roots[1].path, ".azure-app-platform", "last-opened.json"), '{"lastOpenedAt":"invalid"}');
    const missing = { path: join(fixture, "missing"), commit: "f".repeat(40), branch: "missing" };
    const statusUnknown = new Set([roots[2].path]);
    const { runner, state } = fixtureRunner(roots, { listed: [roots[0], missing, ...roots.slice(1)], statusUnknown });
    const catalog = await listSourceCatalog({ workspaceRoot: roots[0].path, commandRunner: runner });
    assert.deepEqual(catalog.roots.map((root) => root.path), [roots[0], roots[2], roots[3]].map((root) => root.path));
    assert.equal(catalog.diagnostics.length, 2);
    assert.ok(catalog.diagnostics.every((diagnostic) => diagnostic.level === "warning"));
    assert.ok(catalog.diagnostics.some((diagnostic) => diagnostic.message.includes("last-opened")));
    assert.ok(catalog.diagnostics.some((diagnostic) => diagnostic.message.includes("missing")));
    const unknown = catalog.roots.find((root) => root.path === roots[2].path);
    assert.equal(unknown.statusKnown, false);
    assert.equal(unknown.dirty, true);
    assert.deepEqual(unknown.capabilityIds, ["agent", "web"]);
    assert.ok(state.peak <= 20);
    await writeFile(join(roots[1].path, ".azure-app-platform", "last-opened.json"),
      JSON.stringify({ lastOpenedAt: roots[1].lastOpenedAt }));
    const recovered = await listSourceCatalog({ workspaceRoot: roots[0].path, commandRunner: runner });
    assert.deepEqual(recovered.roots.map((root) => root.path), roots.map((root) => root.path));
    assert.equal(recovered.diagnostics.length, 1, "A missing worktree remains diagnostic on a fresh read");
  });
});

test("listed/native/subdirectory aliases deduplicate before inspection and retain Git identity", async () => {
  await withRoots(2, async (roots) => {
    const porcelainPath = process.platform === "win32" ? roots[0].path.replaceAll("\\", "/") : roots[0].path;
    const { runner, state } = fixtureRunner(roots, {
      listed: [{ ...roots[0], path: porcelainPath }, roots[1]],
    });
    const catalog = await listSourceCatalog({
      workspaceRoot: roots[0].path,
      additionalRoots: [roots[0].path, join(roots[0].path, "."), join(roots[0].path, "src", "web"), roots[1].path],
      commandRunner: runner,
    });
    assertInventory(catalog, roots);
    assert.equal(state.calls.length, 20, "One physical root must not issue duplicate metadata batches");
    assert.equal(new Set(catalog.roots.map((root) => root.id)).size, 2);
  });
});

test("an unavailable additional folder is diagnostic without hiding other explicitly selected sources", async () => {
  await withRoots(3, async (roots, fixture) => {
    const { runner, state } = fixtureRunner(roots, { listed: roots.slice(0, 2) });
    const catalog = await listSourceCatalog({
      workspaceRoot: roots[0].path,
      additionalRoots: [join(fixture, "missing-additional"), roots[2].path, join(roots[2].path, "src", "web")],
      commandRunner: runner,
    });
    assert.equal(catalog.diagnostics.length, 1);
    assert.equal(catalog.diagnostics[0].level, "warning");
    assert.ok(catalog.diagnostics[0].message.includes("missing-additional"));
    assertInventory({ ...catalog, diagnostics: [] }, roots);
    assert.equal(state.calls.length, 30, "Additional-root failures or aliases must not duplicate or skip valid roots");
    const refreshed = await listSourceCatalog({
      workspaceRoot: roots[0].path,
      additionalRoots: [roots[2].path],
      commandRunner: runner,
    });
    assertInventory(refreshed, roots);
    assert.equal(state.calls.length, 60);
  });
});

test("selected-app lookup retains canonical identity without inspecting failed or unrelated catalog entries", async () => {
  await withRoots(3, async (roots, fixture) => {
    const selected = roots[1];
    const porcelainPath = process.platform === "win32" ? selected.path.replaceAll("\\", "/") : selected.path;
    await writeFile(join(roots[0].path, ".azure-app-platform", "last-opened.json"), '{"lastOpenedAt":"invalid"}');
    const { runner, state } = fixtureRunner(roots, {
      listed: [
        { path: join(fixture, "missing"), commit: "f".repeat(40), branch: "missing" },
        roots[0],
        { ...selected, path: porcelainPath },
        { ...selected, branch: "duplicate-must-not-replace-selected-branch" },
        roots[2],
      ],
    });
    const app = await findSourceApp({
      root: selected.path,
      workspaceRoot: roots[0].path,
      commandRunner: runner,
    });
    assert.equal(app.path, selected.path);
    assert.equal(app.id, hashId(selected.path, selected.commit));
    assert.equal(app.branch, selected.branch);
    assert.equal(app.declaredApp, true);
    assert.equal(state.calls.length, 10, "Rename lookup must inspect exactly one canonical app");
    assert.ok(state.calls.every(call => call.root === selected.path), "Unrelated apps must not enter discovery");
  });
});

test("physical directory aliases and duplicate porcelain entries retain one canonical source", async (t) => {
  await withRoots(1, async (roots, fixture) => {
    const alias = join(fixture, "app-alias");
    try {
      await symlink(roots[0].path, alias, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
        t.skip("Directory links are unavailable on this host");
        return;
      }
      throw error;
    }
    assert.equal(await realpath(alias), roots[0].path);
    const { runner, state } = fixtureRunner(roots, {
      listed: [roots[0], { ...roots[0], path: resolve(alias), branch: "alias-must-not-replace-git-branch" }],
    });
    const catalog = await listSourceCatalog({
      workspaceRoot: roots[0].path,
      additionalRoots: [alias, join(alias, "src", "agent")],
      commandRunner: runner,
    });
    assertInventory(catalog, roots);
    assert.equal(state.calls.length, 10);
    assert.equal(basename(catalog.roots[0].path), "app-00");
  });
});

test("standalone chat folder without a Git repository opens catalog without failing", async () => {
  await withRoots(1, async (roots, fixture) => {
    const standaloneChatDir = join(fixture, "standalone-chat");
    await mkdir(standaloneChatDir, { recursive: true });
    const { runner } = fixtureRunner(roots);
    const nonGitRunner = async (command, args) => {
      if (command === "git" && args[0] === "-C" && args[1] === standaloneChatDir) {
        return { ok: false, stderr: "fatal: not a git repository (or any of the parent directories): .git" };
      }
      return runner(command, args);
    };
    const catalog = await listSourceCatalog({
      workspaceRoot: standaloneChatDir,
      additionalRoots: [roots[0].path],
      commandRunner: nonGitRunner,
    });
    assert.equal(catalog.diagnostics.length, 0);
    assert.ok(catalog.roots.some((root) => root.path === roots[0].path));
    assert.ok(catalog.templates.length >= 2);
  });
});

