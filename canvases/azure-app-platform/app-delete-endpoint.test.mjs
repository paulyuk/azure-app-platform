import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
let provider;

async function loadProvider() {
  if (provider) return provider;
  const discovery = new URL("./discovery.mjs", import.meta.url).href;
  const runtime = new URL("./runtime-state.mjs", import.meta.url).href;
  const extension = new URL("./extension.mjs", import.meta.url).href;
  const instrumented = "data:text/javascript," + encodeURIComponent(`
    export * from ${JSON.stringify(discovery)};
    import { discoverRepository as discover, runCommand as run } from ${JSON.stringify(discovery)};
    export async function runCommand(command, args, options) {
      const state = globalThis.appDeleteFixture;
      if (state && command === "git" && (args.includes("remove") || args.includes("-D"))) {
        state.mutations.push(args);
        if (state.removeFails && args.includes("remove")) return { ok: false, stderr: "Worktree is locked." };
        if (state.branchFails && args.includes("-D")) return { ok: false, stderr: "Branch cleanup denied." };
      }
      return run(command, args, options);
    }
    export async function discoverRepository(root, ...args) {
      const state = globalThis.appDeleteFixture;
      state?.reads.push(root);
      if (state?.heldRoot === root) {
        state.entered();
        await state.hold;
      }
      return discover(root, ...args);
    }
  `);
  const instrumentedRuntime = "data:text/javascript," + encodeURIComponent(`
    export * from ${JSON.stringify(runtime)};
    import { deriveRuntimeState as derive } from ${JSON.stringify(runtime)};
    export function deriveRuntimeState(...args) {
      const state = globalThis.appDeleteFixture?.runtimeState;
      return state ? { state } : derive(...args);
    }
  `);
  const sdk = "data:text/javascript," + encodeURIComponent(`
    export const createCanvas = options => options;
    export class CanvasError extends Error {}
    export async function joinSession({ canvases }) {
      globalThis.appDeleteCanvas = canvases[0];
      return { sessionId: "app-delete-endpoint-test" };
    }
  `);
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@github/copilot-sdk/extension") return { url: sdk, shortCircuit: true };
      const resolved = next(specifier, context);
      if (resolved.url === discovery && context.parentURL !== instrumented) return { url: instrumented, shortCircuit: true };
      if (resolved.url === runtime && context.parentURL !== instrumentedRuntime) return { url: instrumentedRuntime, shortCircuit: true };
      return resolved;
    },
    load(url, context, next) {
      const loaded = next(url, context);
      if (url !== extension) return loaded;
      return { ...loaded, source: String(loaded.source) +
        "\nexport const deletionCaches = { appStates, appOutput, activeGateways, gatewayWriteQueues, pendingAppMutations };" };
    },
  });
  try {
    const module = await import("./extension.mjs");
    provider = { canvas: globalThis.appDeleteCanvas, caches: module.deletionCaches };
    return provider;
  } finally { hooks.deregister(); }
}

async function fixture(action) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "app-delete-endpoint-")));
  const workspace = join(directory, "canvas"), root = join(directory, "selected app"), sibling = join(directory, "unrelated app");
  const previousHome = process.env.COPILOT_HOME;
  process.env.COPILOT_HOME = join(directory, "copilot");
  let canvas, gate;
  const instanceId = "delete-test";
  try {
    await mkdir(workspace);
    await execute("git", ["init", "--quiet", workspace]);
    await writeFile(join(workspace, "tracked.txt"), "Committed fixture content");
    await execute("git", ["-C", workspace, "add", "tracked.txt"]);
    await execute("git", ["-C", workspace, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "commit", "--quiet", "--allow-empty", "-m", "Synthetic deletion fixture"]);
    for (const [path, branch] of [[root, "managed-app"], [sibling, "sibling-app"]]) {
      await execute("git", ["-C", workspace, "worktree", "add", "--quiet", "-b", branch, path]);
      await mkdir(join(path, ".azure-app-platform"));
      await mkdir(join(path, "src", "agent"), { recursive: true });
      await writeFile(join(path, "azure-app.yaml"), "capabilities:\n  agent:\n    path: src/agent\n");
      await writeFile(join(path, ".azure-app-platform", "app.json"), JSON.stringify({ name: "Duplicate name", managedBranch: branch }));
      await writeFile(join(path, "untracked.txt"), "Synthetic local files only");
      await writeFile(join(path, "tracked.txt"), "Uncommitted fixture changes");
    }
    const state = { reads: [], mutations: [], heldRoot: null, runtimeState: "stopped" };
    globalThis.appDeleteFixture = state;
    const loaded = await loadProvider();
    canvas = loaded.canvas;
    const opened = await canvas.open({ instanceId, input: {}, session: { workingDirectory: workspace } });
    const html = await (await fetch(opened.url)).text();
    const apiToken = JSON.parse(/const apiToken = (".*?");/.exec(html)[1]);
    const api = async (path, body) => {
      const response = await fetch(new URL(path, opened.url), {
        headers: { "X-App-Platform-Token": apiToken, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await api("/api/sources")).status, 200);
    await action({
      root, workspace, sibling, state, api, caches: loaded.caches,
      hold(path) {
        let release, entered;
        state.heldRoot = path;
        state.hold = new Promise(resolve => { release = resolve; });
        const waiting = new Promise(resolve => { entered = resolve; });
        state.entered = entered;
        gate = { waiting, release() { state.heldRoot = null; release(); } };
        return gate;
      },
    });
  } finally {
    gate?.release();
    await canvas?.onClose({ instanceId });
    delete globalThis.appDeleteFixture;
    if (previousHome === undefined) delete process.env.COPILOT_HOME;
    else process.env.COPILOT_HOME = previousHome;
    await rm(directory, { recursive: true, force: true });
  }
}

test("Delete completes through the real endpoint without inspecting a controlled slow sibling", { timeout: 30000 }, async () => {
  await fixture(async f => {
    f.state.reads.length = 0;
    const gate = f.hold(f.sibling);
    const pending = f.api("/api/delete-app", { root: f.root, confirmed: true });
    try {
      const outcome = await Promise.race([pending, gate.waiting.then(() => ({ unrelatedDiscovery: true }))]);
      assert.equal(outcome.unrelatedDiscovery, undefined, "Delete must not wait on unrelated worktree inspection");
      assert.equal(outcome.status, 200);
      assert.equal(outcome.body.outcome, "complete");
      assert.equal(outcome.body.worktreeRemoved, true);
      assert.equal(f.state.reads.includes(f.sibling), false);
      await assert.rejects(access(f.root), { code: "ENOENT" });
      await access(join(f.sibling, "untracked.txt"));
      assert.equal(await readFile(join(f.sibling, "tracked.txt"), "utf8"), "Uncommitted fixture changes");
      const listed = await execute("git", ["-C", f.workspace, "branch", "--list", "managed-app"]);
      assert.equal(listed.stdout.trim(), "");
      const catalog = f.api("/api/sources");
      await gate.waiting;
      gate.release();
      assert.equal((await catalog).body.apps.some(app => app.path === f.root), false);
    } finally { gate.release(); await pending; }
  });
});

test("Delete rejects unauthorized, Canvas, unconfirmed, busy and mismatched roots without mutations", { timeout: 30000 }, async () => {
  await fixture(async f => {
    for (const root of [f.workspace, join(f.workspace, "unauthorized")]) {
      await mkdir(root, { recursive: true });
      const result = await f.api("/api/delete-app", { root, confirmed: true });
      assert.equal(result.status, 403);
      assert.equal(result.body.outcome, "failed");
    }
    const unconfirmed = await f.api("/api/delete-app", { root: f.root, confirmed: false });
    assert.equal(unconfirmed.body.outcome, "failed");
    assert.match(unconfirmed.body.error, /explicit confirmation/);
    for (const state of ["running", "starting", "stopping", "configuring", "provisioning", "deploying"]) {
      f.state.runtimeState = state;
      f.caches.appStates.delete(f.root);
      const result = await f.api("/api/delete-app", { root: f.root, confirmed: true });
      assert.equal(result.status, 409, state);
      assert.equal(result.body.worktreeRemoved, false);
    }
    f.state.runtimeState = "stopped";
    f.caches.appStates.delete(f.root);
    const identity = join(f.root, ".azure-app-platform", "app.json");
    await writeFile(identity, '{"managedBranch":"wrong-branch"}');
    const mismatch = await f.api("/api/delete-app", { root: f.root, confirmed: true });
    assert.equal(mismatch.body.outcome, "failed");
    assert.match(mismatch.body.error, /managed branch does not match/);
    assert.deepEqual(f.state.mutations, []);
    assert.equal(f.caches.pendingAppMutations.has(f.root), false);
  });
});

test("Worktree failure releases the mutation slot and retains app state; concurrent deletion is excluded", { timeout: 30000 }, async () => {
  await fixture(async f => {
    f.state.removeFails = true;
    const gate = f.hold(f.root);
    const pending = f.api("/api/delete-app", { root: f.root, confirmed: true });
    await gate.waiting;
    const concurrent = await f.api("/api/delete-app", { root: f.root, confirmed: true });
    assert.equal(concurrent.status, 409);
    assert.equal(concurrent.body.outcome, "failed");
    gate.release();
    const result = await pending;
    assert.equal(result.status, 500);
    assert.equal(result.body.outcome, "failed");
    assert.equal(result.body.worktreeRemoved, false);
    await access(join(f.root, "untracked.txt"));
    assert.equal(f.caches.appStates.has(f.root), true);
    assert.equal(f.caches.pendingAppMutations.has(f.root), false);
    assert.equal((await f.api("/api/rename-app", { root: f.root, name: "Still intact" })).status, 200);
    assert.equal(f.state.mutations.length, 1, "Failed destructive operations are not retried");
  });
});

test("Partial deletion reconciles all app caches and canonical authorization while retaining branch recovery", { timeout: 30000 }, async () => {
  await fixture(async f => {
    f.state.branchFails = true;
    f.caches.appStates.set(f.root, { state: "stopped" });
    f.caches.appOutput.set(f.root, ["fixture output"]);
    f.caches.activeGateways.set(f.root, { name: "fixture-gateway" });
    f.caches.gatewayWriteQueues.set(f.root, Promise.resolve());
    const alias = join(f.workspace, "selected-alias");
    await symlink(f.root, alias, process.platform === "win32" ? "junction" : "dir");
    const result = await f.api("/api/delete-app", { root: alias, confirmed: true });
    assert.equal(result.status, 200);
    assert.equal(result.body.outcome, "partial");
    assert.equal(result.body.worktreeRemoved, true);
    assert.equal(result.body.worktreePath, f.root);
    assert.equal(result.body.remainingBranch, "managed-app");
    assert.equal(result.body.recoveryCommand, "git branch -D 'managed-app'");
    assert.equal(f.state.mutations.length, 2);
    await assert.rejects(access(f.root), { code: "ENOENT" });
    assert.notEqual((await execute("git", ["-C", f.workspace, "branch", "--list", "managed-app"])).stdout.trim(), "");
    for (const cache of Object.values(f.caches)) assert.equal(cache.has(f.root), false);
    assert.equal((await f.api("/api/sources")).body.apps.some(app => app.path === f.root), false);
    await mkdir(f.root);
    const unauthorized = await f.api("/api/rename-app", { root: f.root, name: "Must not return" });
    assert.notEqual(unauthorized.status, 200, "Deleted roots lose authorization even if the directory reappears");
    assert.equal(f.state.mutations.length, 2);
    await access(join(f.sibling, "untracked.txt"));
  });
});
