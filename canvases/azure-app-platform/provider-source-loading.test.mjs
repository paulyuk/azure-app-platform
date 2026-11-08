import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const directory = fileURLToPath(new URL("./", import.meta.url));
const tokens = new Set();
let phase = "provider import";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

async function deadline(promise, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), 5_000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function catalogHarness() {
  const calls = [];
  const listeners = new Set();
  return {
    calls,
    begin(input) {
      const pending = deferred();
      const call = {
        input: { ...input, additionalRoots: [...input.additionalRoots] },
        index: calls.length + 1,
        settled: false,
        resolve(catalog) { call.settled = true; pending.resolve(catalog); },
        reject(error) { call.settled = true; pending.reject(error); },
      };
      calls.push(call);
      for (const listener of listeners) listener();
      return pending.promise;
    },
    async waitFor(count) {
      while (calls.length < count) {
        const changed = deferred();
        listeners.add(changed.resolve);
        try { await deadline(changed.promise, `Provider did not start fixture catalog ${count}`); }
        finally { listeners.delete(changed.resolve); }
      }
      return calls[count - 1];
    },
    settle(call) {
      if (!call.settled) call.resolve({
        generatedAt: `fixture-catalog-${call.index}`,
        roots: [],
        apps: [],
        templates: [],
        diagnostics: [],
      });
    },
    settleAll() { for (const call of calls) this.settle(call); },
  };
}

async function verifyProvider(root) {
  const extensionUrl = new URL("./extension.mjs", import.meta.url).href;
  const catalogUrl = new URL("./source-catalog.mjs", import.meta.url).href;
  const harness = catalogHarness();
  globalThis.sourceLoadingCatalogHarness = harness;
  const sdk = "data:text/javascript," + encodeURIComponent(`
    export const createCanvas = (options) => options;
    export class CanvasError extends Error {
      constructor(code, message) { super(message); this.code = code; }
    }
    export async function joinSession({ canvases }) {
      globalThis.sourceLoadingCanvases = canvases;
      return { sessionId: "source-loading-fixture", rpc: {} };
    }
  `);
  const catalog = "data:text/javascript," + encodeURIComponent(`
    export * from ${JSON.stringify(catalogUrl)};
    export function listSourceCatalog(input) {
      return globalThis.sourceLoadingCatalogHarness.begin(input);
    }
  `);
  // Keep all provider modules real except the host SDK and this extension's catalog read.
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@github/copilot-sdk/extension") return { url: sdk, shortCircuit: true };
      if (specifier === "./source-catalog.mjs" && context.parentURL === extensionUrl) {
        return { url: catalog, shortCircuit: true };
      }
      return next(specifier, context);
    },
  });
  const requests = [];
  const opened = [];
  let canvas;
  try {
    await import(extensionUrl);
    [canvas] = globalThis.sourceLoadingCanvases;
    assert.equal(canvas.id, "azure-app-platform");
    const workspace = await realpath(join(root, "workspace"));
    const otherWorkspace = await realpath(join(root, "other-workspace"));
    const extraRoot = await realpath(join(root, "explicit-source"));
    async function open(instanceId, workingDirectory) {
      const context = { instanceId, input: {}, session: { workingDirectory } };
      const result = await canvas.open(context);
      opened.push(context);
      assert.equal(new URL(result.url).hostname, "127.0.0.1");
      const response = await fetch(result.url, { signal: AbortSignal.timeout(8_000) });
      assert.equal(response.status, 200);
      const html = await response.text();
      const match = /const apiToken = (".*?");/.exec(html);
      assert.ok(match, "Real provider HTML must contain its loopback authorization token");
      const token = JSON.parse(match[1]);
      tokens.add(token);
      return { url: result.url, token, context };
    }
    phase = "opening isolated providers";
    const first = await open("source-loading-first", workspace);
    const second = await open("source-loading-second", workspace);
    const other = await open("source-loading-other", otherWorkspace);

    function request(provider, path = "/api/sources", options = {}) {
      const state = { settled: false };
      const promise = new Promise((resolveResponse, rejectResponse) => {
        const outgoing = httpRequest(new URL(path, provider.url), {
          method: options.method ?? "GET",
          headers: {
            "x-app-platform-token": provider.token,
            Connection: "close",
            ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
          },
          signal: AbortSignal.timeout(8_000),
        }, (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("error", rejectResponse);
          response.on("end", () => {
            try {
              const contentType = response.headers["content-type"] ?? "";
              const text = Buffer.concat(chunks).toString("utf8");
              const body = contentType.includes("application/json") ? JSON.parse(text) : text;
              state.settled = true;
              resolveResponse({ status: response.statusCode, body, contentType });
            } catch (error) { rejectResponse(error); }
          });
        });
        outgoing.on("error", rejectResponse);
        outgoing.end(options.body !== undefined ? JSON.stringify(options.body) : undefined);
      });
      promise.catch(() => {});
      requests.push(promise);
      return { promise, state };
    }

    async function fence(provider) {
      const responses = await Promise.all([
        request(provider, "/").promise,
        request(provider, "/canvas-ui/base.css").promise,
        request(provider, "/api/overview").promise,
      ]);
      for (const response of responses) assert.equal(response.status, 200);
      assert.ok(/Create a new app/.test(responses[0].body), "Home remains usable while catalogs are held pending");
      assert.ok(responses[1].contentType.startsWith("text/css"));
      assert.ok(responses[1].body.length > 0);
      assert.ok(responses[2].body && typeof responses[2].body === "object");
      assert.equal((await request(provider, "/api/overview").promise).status, 200);
    }

    for (const headers of [
      { "x-app-platform-token": "" },
      { "x-app-platform-token": "fixture-invalid-token" },
      { "x-app-platform-token": second.token },
      { Origin: "https://untrusted.example.test" },
      { Host: "untrusted.example.test" },
    ]) {
      phase = `unauthorized request with ${Object.keys(headers).join(", ")}`;
      assert.equal((await request(first, "/api/sources", { headers }).promise).status, 403);
    }
    phase = "POST content-type authorization";
    assert.equal((await request(first, "/api/sources", {
      method: "POST", body: { path: extraRoot }, headers: { "Content-Type": "text/plain" },
    }).promise).status, 415);
    assert.equal(harness.calls.length, 0, "Authorization must precede any coalesced catalog read");

    phase = "matching GETs and responsive static routes";
    const matching = Array.from({ length: 6 }, () => request(first));
    const initialCall = await harness.waitFor(1);
    await fence(first);
    assert.equal(harness.calls.length, 1, "Matching GET requests must share only the in-flight catalog");
    assert.ok(matching.every((item) => !item.state.settled), "Static responses must precede catalog completion");
    harness.settle(initialCall);
    const initial = await Promise.all(matching.map((item) => item.promise));
    assert.ok(initial.every((response) => response.status === 200));
    assert.deepEqual(initial.map((response) => response.body.generatedAt), Array(6).fill("fixture-catalog-1"));

    phase = "fresh read after success";
    const refreshed = request(first);
    const refreshedCall = await harness.waitFor(2);
    assert.equal(refreshedCall.input.workspaceRoot, workspace);
    assert.deepEqual(refreshedCall.input.additionalRoots, []);
    harness.settle(refreshedCall);
    assert.equal((await refreshed.promise).body.generatedAt, "fixture-catalog-2",
      "A settled GET must not become a stale result cache");

    phase = "shared rejection and recovery";
    const failures = [request(first), request(first)];
    const failureCall = await harness.waitFor(3);
    await fence(first);
    assert.equal(harness.calls.length, 3);
    failureCall.reject(new Error("fixture source read rejected"));
    const failed = await Promise.all(failures.map((item) => item.promise));
    for (const response of failed) {
      assert.equal(response.status, 500);
      assert.equal(response.body.error, "fixture source read rejected");
    }
    const recovered = request(first);
    const recoveryCall = await harness.waitFor(4);
    harness.settle(recoveryCall);
    assert.equal((await recovered.promise).body.generatedAt, "fixture-catalog-4",
      "Rejected catalog work must release its in-flight entry for a fresh read");

    phase = "instance and workspace isolation";
    const isolated = [request(first), request(second), request(other)];
    await harness.waitFor(7);
    const isolatedCalls = harness.calls.slice(4, 7);
    assert.deepEqual(isolatedCalls.map((call) => call.input.workspaceRoot).sort(),
      [workspace, workspace, otherWorkspace].sort());
    assert.ok(isolatedCalls.every((call) => call.input.additionalRoots.length === 0));
    await Promise.all([fence(first), fence(second), fence(other)]);
    assert.equal(harness.calls.length, 7, "Matching roots in different provider instances must not share reads");
    for (const call of isolatedCalls) harness.settle(call);
    const isolatedResults = await Promise.all(isolated.map((item) => item.promise));
    assert.ok(isolatedResults.every((response) => response.status === 200));
    assert.equal(new Set(isolatedResults.map((response) => response.body.generatedAt)).size, 3);

    phase = "scope change and fresh POST isolation";
    const oldScope = request(first);
    const oldCall = await harness.waitFor(8);
    assert.deepEqual(oldCall.input.additionalRoots, []);
    const added = request(first, "/api/sources", { method: "POST", body: { path: extraRoot } });
    const addedCall = await harness.waitFor(9);
    assert.deepEqual(addedCall.input.additionalRoots, [extraRoot]);
    const newScope = [request(first), request(first)];
    const newCall = await harness.waitFor(10);
    assert.deepEqual(newCall.input.additionalRoots, [extraRoot]);
    await fence(first);
    assert.equal(harness.calls.length, 10, "A changed authorized-root scope must not share the old GET");
    assert.equal(oldScope.state.settled, false);
    assert.ok(newScope.every((item) => !item.state.settled));

    const addedAgain = request(first, "/api/sources", { method: "POST", body: { path: extraRoot } });
    const addedAgainCall = await harness.waitFor(11);
    assert.deepEqual(addedAgainCall.input.additionalRoots, [extraRoot]);
    assert.equal((await request(first, "/api/sources", {
      headers: { "x-app-platform-token": "" },
    }).promise).status, 403);
    assert.equal(harness.calls.length, 11, "An unauthorized caller cannot join pending authorized work");
    for (const call of [addedCall, addedAgainCall]) harness.settle(call);
    const postResults = await Promise.all([added.promise, addedAgain.promise]);
    assert.deepEqual(postResults.map((response) => response.body.generatedAt),
      ["fixture-catalog-9", "fixture-catalog-11"],
      "POST source registration must use fresh catalogs, never GET or matching-POST sharing");
    harness.settle(newCall);
    assert.deepEqual((await Promise.all(newScope.map((item) => item.promise)))
      .map((response) => response.body.generatedAt), ["fixture-catalog-10", "fixture-catalog-10"]);
    assert.equal(oldScope.state.settled, false, "Completing new-scope reads must not resolve the older scope");
    harness.settle(oldCall);
    assert.equal((await oldScope.promise).body.generatedAt, "fixture-catalog-8");

    phase = "fresh scoped read and changed workspace";
    const finalRead = request(first);
    const finalCall = await harness.waitFor(12);
    assert.deepEqual(finalCall.input.additionalRoots, [extraRoot]);
    harness.settle(finalCall);
    assert.equal((await finalRead.promise).body.generatedAt, "fixture-catalog-12");
    const replaced = await open(first.context.instanceId, otherWorkspace);
    const replacedRead = request(replaced);
    const replacedCall = await harness.waitFor(13);
    assert.equal(replacedCall.input.workspaceRoot, otherWorkspace);
    assert.deepEqual(replacedCall.input.additionalRoots, [], "Changing workspace must not retain the previous server's source scope");
    harness.settle(replacedCall);
    assert.equal((await replacedRead.promise).body.generatedAt, "fixture-catalog-13");
    assert.equal(harness.calls.length, 13);
  } finally {
    harness.settleAll();
    await Promise.allSettled(requests);
    harness.settleAll();
    if (canvas) {
      for (const instanceId of new Set(opened.map((context) => context.instanceId))) {
        await canvas.onClose({ instanceId });
      }
    }
    hooks.deregister();
    delete globalThis.sourceLoadingCatalogHarness;
    delete globalThis.sourceLoadingCanvases;
  }
}

if (process.argv[2] === "--provider-source-fixture") {
  try {
    await verifyProvider(process.argv[3]);
    process.stdout.write("Provider source loading scenarios passed.\n");
  } catch (error) {
    let message = error.stack ?? String(error);
    for (const token of tokens) message = message.replaceAll(token, "[redacted loopback token]");
    process.stderr.write(`Provider scenario: ${phase}\n${message}\n`);
    process.exitCode = 1;
  }
} else {
  test("real HTTP provider coalesces only matching in-flight source GETs with responsive UI and unchanged authorization",
    { timeout: 45_000 }, async () => {
      const fixture = await mkdtemp(join(directory, ".provider-source-loading-"));
      try {
        const workspace = join(fixture, "workspace");
        await Promise.all([
          mkdir(workspace),
          mkdir(join(fixture, "other-workspace")),
          mkdir(join(fixture, "explicit-source")),
          mkdir(join(fixture, "copilot-home")),
        ]);
        const { stdout, stderr } = await execute(process.execPath, [
          fileURLToPath(import.meta.url), "--provider-source-fixture", fixture,
        ], {
          cwd: workspace,
          env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "", COPILOT_HOME: join(fixture, "copilot-home") },
          timeout: 35_000,
          maxBuffer: 256 * 1024,
        });
        assert.equal(stderr, "");
        assert.equal(stdout.trim(), "Provider source loading scenarios passed.");
      } finally {
        await rm(fixture, { recursive: true, force: true });
      }
    });
}
