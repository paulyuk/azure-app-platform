import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const requireWeb = createRequire(new URL("../../src/web/package.json", import.meta.url));
let playwright;
try { playwright = requireWeb("playwright"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
let provider;

async function loadProvider() {
  if (provider) return provider;
  const discovery = new URL("./discovery.mjs", import.meta.url).href;
  const instrumented = "data:text/javascript," + encodeURIComponent(`
    export * from ${JSON.stringify(discovery)};
    import { discoverRepository as discover, runCommand as run } from ${JSON.stringify(discovery)};
    export async function runCommand(command, args, options) {
      const state = globalThis.appRenameEndpointFixture;
      if (state && command === "git" && args[1] === state.root && args.includes("worktree") && args.includes("list")) {
        return { ok: true, stdout: state.worktrees, stderr: "" };
      }
      return run(command, args, options);
    }
    export async function discoverRepository(root, ...args) {
      const state = globalThis.appRenameEndpointFixture;
      state?.reads.push(root);
      if (state?.heldRoot === root) {
        state.entered();
        await state.hold;
      }
      return discover(root, ...args);
    }
  `);
  const sdk = "data:text/javascript," + encodeURIComponent(`
    export const createCanvas = options => options;
    export class CanvasError extends Error {}
    export async function joinSession({ canvases }) {
      globalThis.appRenameEndpointCanvas = canvases[0];
      return { sessionId: "app-rename-endpoint-test" };
    }
  `);
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      // Keep the HTTP handler, discovery, renderer, toolkit and identity writes real.
      if (specifier === "@github/copilot-sdk/extension") return { url: sdk, shortCircuit: true };
      const resolved = next(specifier, context);
      if (resolved.url === discovery && context.parentURL !== instrumented) {
        return { url: instrumented, shortCircuit: true };
      }
      return resolved;
    },
  });
  try {
    await import("./extension.mjs");
    provider = globalThis.appRenameEndpointCanvas;
    return provider;
  } finally { hooks.deregister(); }
}

async function fixture(engine) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "app-rename-browser-")));
  const root = join(directory, "temporary app"), sibling = join(directory, "unrelated app");
  const previousHome = process.env.COPILOT_HOME;
  process.env.COPILOT_HOME = join(directory, "copilot");
  let browser, canvas;
  const instanceId = "rename-endpoint-" + engine;
  try {
    for (const [path, name] of [[root, "Temporary app"], [sibling, "Unrelated app"]]) {
      await mkdir(join(path, "src", "agent"), { recursive: true });
      await mkdir(join(path, ".azure-app-platform"));
      await writeFile(join(path, "azure-app.yaml"), "capabilities:\n  agent:\n    path: src/agent\n");
      await writeFile(join(path, "src", "agent", "agent.yaml"), "kind: hosted\n");
      await writeFile(join(path, ".azure-app-platform", "app.json"), JSON.stringify({ name, purpose: "Keep metadata" }));
    }
    await writeFile(join(root, ".azure-app-platform", "last-opened.json"), '{"lastOpenedAt":"2026-11-07T17:55:00Z"}');
    await execute("git", ["init", "--quiet", root]);
    const state = {
      root, reads: [], heldRoot: null,
      worktrees: `worktree ${root}\nbranch refs/heads/temporary-app\n\nworktree ${sibling}\nbranch refs/heads/unrelated-app\n`,
    };
    globalThis.appRenameEndpointFixture = state;
    canvas = await loadProvider();
    const opened = await canvas.open({ instanceId, input: {}, session: { workingDirectory: root } });
    browser = await playwright[engine].launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 380, height: 900 }, locale: "en-US", timezoneId: "UTC" });
    const errors = [], mutations = [];
    page.setDefaultTimeout(5000);
    await page.addInitScript(() => { Date.now = () => Date.parse("2026-11-07T18:00:00Z"); });
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      if (request.method() === "POST") mutations.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
    });
    return {
      page, state, root, sibling, errors, mutations,
      identity: () => readFile(join(root, ".azure-app-platform", "app.json"), "utf8").then(JSON.parse),
      async open(surface) {
        await writeFile(join(root, ".azure-app-platform", "app.json"), '{"name":"Temporary app","purpose":"Keep metadata"}');
        await page.goto(opened.url);
        await page.locator("[data-recent-app]").waitFor();
        if (surface === "open") {
          await page.locator("#open-app").click();
          await page.locator("[data-existing-app]").nth(1).waitFor();
        }
      },
      hold(path) {
        let release, entered;
        state.heldRoot = path;
        state.hold = new Promise(resolve => { release = resolve; });
        const waiting = new Promise(resolve => { entered = resolve; });
        state.entered = entered;
        return { waiting, release() { state.heldRoot = null; release(); } };
      },
      async close() {
        state.heldRoot = null;
        await browser.close();
        await canvas.onClose({ instanceId });
        delete globalThis.appRenameEndpointFixture;
        if (previousHome === undefined) delete process.env.COPILOT_HOME;
        else process.env.COPILOT_HOME = previousHome;
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await browser?.close();
    await canvas?.onClose({ instanceId });
    delete globalThis.appRenameEndpointFixture;
    if (previousHome === undefined) delete process.env.COPILOT_HOME;
    else process.env.COPILOT_HOME = previousHome;
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

for (const engine of ["chromium", "webkit"]) {
  test(`Shared Rename completes without inspecting an unrelated app and recovers through the real endpoint in ${engine}`, {
    skip: !playwright && "Install src/web dependencies to run browser coverage.",
    timeout: 60000,
  }, async () => {
    const f = await fixture(engine);
    let pending, gate;
    try {
      const { page, state } = f;
      for (const surface of ["home", "open"]) {
        await f.open(surface);
        const search = page.getByRole("searchbox", { name: surface === "home" ? "Find a recent app" : "Search apps" });
        await search.fill("temporary app");
        const menu = page.locator("[data-app-actions]");
        const openRename = async () => {
          await menu.click();
          await page.getByRole("menuitem", { name: "Rename app", exact: true }).click();
        };
        const dialog = page.getByRole("dialog", { name: "Rename app", exact: true });
        const input = dialog.getByRole("textbox", { name: "App name", exact: true });
        const save = dialog.getByRole("button", { name: "Save", exact: true });
        await openRename();
        await input.fill("Cancelled draft");
        const beforeCancel = f.mutations.length;
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        assert.equal(f.mutations.length, beforeCancel);
        assert.equal(await menu.evaluate(node => node === document.activeElement), true);

        await openRename();
        const name = "Renamed " + surface + " app";
        await input.fill(name);
        state.reads.length = 0;
        gate = f.hold(f.sibling);
        pending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/rename-app");
        await save.click();
        const outcome = await Promise.race([
          pending.then(response => ({ kind: "response", response })),
          gate.waiting.then(() => ({ kind: "unrelated-discovery" })),
        ]);
        if (outcome.kind !== "response") {
          const output = process.env.APP_RENAME_EVIDENCE_DIR;
          if (output) {
            await mkdir(output, { recursive: true });
            await page.screenshot({ path: join(output, `${engine}-${surface}-pending-save.png`) });
          }
          assert.equal(await dialog.getByRole("button", { name: "Saving...", exact: true }).isDisabled(), true);
          assert.equal((await f.identity()).name, "Temporary app", "The display-name write has not started");
        }
        assert.equal(outcome.kind, "response", "Save is blocked in source discovery for an unrelated worktree, before the display-name write");
        assert.equal(outcome.response.status(), 200);
        await page.getByRole("link", { name, exact: true }).waitFor();
        await dialog.waitFor({ state: "hidden" });
        assert.equal(state.reads.includes(f.sibling), false, "Saving a name must not scan other apps");
        assert.deepEqual(await f.identity(), { name, purpose: "Keep metadata" });
        await page.waitForFunction(() => document.activeElement?.hasAttribute("data-app-actions"));
        const output = process.env.APP_RENAME_EVIDENCE_DIR;
        if (output) {
          await mkdir(output, { recursive: true });
          await page.screenshot({ path: join(output, `${engine}-${surface}-saved.png`) });
        }
        gate.release();
        gate = null;
        pending = null;

        await openRename();
        await input.fill("../invalid");
        await save.click();
        await dialog.getByRole("alert").getByText(/Could not rename app: App name must start/).waitFor();
        assert.equal(await input.isEnabled(), true);
        assert.equal(await save.isEnabled(), true);
        assert.equal(await dialog.getByRole("button", { name: "Cancel", exact: true }).isEnabled(), true);
        assert.equal(await input.inputValue(), "../invalid");
        assert.equal((await f.identity()).name, name);
        await input.fill(name + " retry");
        gate = f.hold(f.root);
        pending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/rename-app");
        await save.click();
        const held = await Promise.race([gate.waiting.then(() => true), pending.then(() => false)]);
        assert.equal(held, true, "The failed attempt must release its app-mutation reservation before retry");
        assert.equal(await dialog.getByRole("button", { name: "Saving...", exact: true }).isDisabled(), true);
        assert.equal(await input.isDisabled(), true);
        assert.equal(await dialog.getByRole("button", { name: "Cancel", exact: true }).isDisabled(), true);
        await page.keyboard.press("Escape");
        assert.equal(await dialog.isVisible(), true, "An in-flight save must not silently dismiss");
        gate.release();
        gate = null;
        assert.equal((await pending).status(), 200);
        pending = null;
        await dialog.waitFor({ state: "hidden" });
        await page.getByRole("link", { name: name + " retry", exact: true }).waitFor();
        await page.waitForFunction(() => document.activeElement?.hasAttribute("data-app-actions"));
        assert.equal(await search.inputValue(), "temporary app");
        assert.equal(await page.locator(surface === "home" ? "#studio-home" : "#studio-open-apps").count(), 1);
      }
      assert.deepEqual(f.errors, []);
      assert.ok(f.mutations.every(item => item.path === "/api/rename-app" && item.body.root === f.root));
    } finally {
      gate?.release();
      await pending?.catch(() => {});
      await f.close();
    }
  });
}
