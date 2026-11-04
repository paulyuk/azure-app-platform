import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCommandActivity } from "./command-activity.mjs";
import { createDiscoveryTracker } from "./discovery-tracker.mjs";
import { summarizeAgentResult } from "./agent-result.mjs";
import { discoverGatewayModels, gatewayCommandEnvironment, loadGatewayModelOptions } from "./gateway-state.mjs";

test("command activity records real transitions, bounds history, and redacts before persistence", async () => {
  const root = await mkdtemp(join(tmpdir(), "unity-activity-"));
  try {
    const file = join(root, "activity.json");
    const store = createCommandActivity(file);
    const id = await store.start({ kind: "http", label: "Invoke", command: "POST /invoke?code=very-secret Authorization: Bearer token-secret" });
    assert.equal((await store.list())[0].status, "running");
    await store.finish(id, { ok: false, note: "Api-Key: key-secret" });
    const [entry] = await store.list();
    assert.equal(entry.status, "failed");
    assert.ok(entry.durationMs >= 0);
    assert.doesNotMatch(await readFile(file, "utf8"), /very-secret|token-secret|key-secret/);
    assert.equal((await createCommandActivity(file).list())[0].status, "failed");
    await Promise.all(Array.from({ length: 65 }, (_, i) => store.start({ kind: "shell", label: `Run ${i}`, command: "echo ready" })));
    assert.equal((await store.list()).length, 60);
    assert.equal((await createCommandActivity(file).list())[0].status, "unknown");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("discovery is single-flight and rejects stale A/B/A results and manual-selection races", async () => {
  const tracker = createDiscoveryTracker();
  let finish;
  let loads = 0;
  const load = () => { loads += 1; return new Promise((resolve) => { finish = resolve; }); };
  const first = tracker.begin("a", load);
  const b = tracker.begin("b", async () => "b");
  const latest = tracker.begin("a", load);
  await Promise.resolve();
  finish("a");
  await Promise.all([first.promise, b.promise, latest.promise]);
  assert.equal(loads, 1);
  assert.equal(first.isCurrent(), false);
  assert.equal(b.isCurrent(), false);
  assert.equal(latest.isCurrent(), true);
  tracker.invalidate();
  assert.equal(latest.isCurrent(), false);
  const refresh = tracker.begin("a", async () => "new", true);
  assert.equal(await refresh.promise, "new");
  assert.equal(refresh.isCurrent(), true);
});

test("gateway models span providers and include callable aliases; empty gateways are skipped for new default selection", async () => {
  const gateways = ["empty", "ready"].map((name) => ({
    name, subscriptionId: "sub", resourceGroup: "rg", endpoint: `https://${name}.example`,
  }));
  const runner = async (_, args) => {
    const uri = args[args.indexOf("--uri") + 1];
    assert.ok(uri.includes("/workspaces/default/models?") || uri.includes("/workspaces/default/aliases?"));
    assert.ok(!uri.includes("/modelProviders/foundry"));
    if (uri.includes("/workspaces/default/aliases?")) {
      return {
        ok: true,
        stdout: JSON.stringify({
          value: uri.includes("/empty/")
            ? []
            : [{
                name: "primary-router",
                properties: {
                  aliasName: "gpt-latest",
                  backendModels: [{ resourceId: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.ApiManagement/aigateways/ready/workspaces/default/modelProviders/foundry/models/gpt-main" }],
                },
              }],
        }),
      };
    }
    return { ok: true, stdout: JSON.stringify({ value: uri.includes("/empty/")
      ? [] : [{ name: "gpt-main", properties: { displayName: "GPT Main" } }] }) };
  };
  const options = { gateways, active: null, suggested: gateways[0] };
  const result = await loadGatewayModelOptions(runner, options);
  assert.equal(result.suggested.name, "ready");
  assert.deepEqual(result.models.map((item) => item.id), ["gpt-latest", "gpt-main"]);
  assert.match(result.models[0].label, /gpt-latest · alias → gpt-main/);
  const saved = await loadGatewayModelOptions(runner, { ...options, active: gateways[0] });
  assert.equal(saved.suggested.name, "empty");
  assert.deepEqual(saved.models, []);
  const env = gatewayCommandEnvironment({ ...result.suggested, model: "gpt-main" });
  assert.equal(env.AZURE_AI_GATEWAY_MODEL, "gpt-main");
  assert.equal(env.AZURE_AI_GATEWAY_MINI_MODEL, "gpt-main");
  await assert.rejects(discoverGatewayModels(async () => ({ ok: false, stderr: "Forbidden" }), gateways[0]), /Forbidden/);
  const failure = await loadGatewayModelOptions(async () => ({ ok: false, stderr: "Forbidden" }), options);
  assert.ok(failure.warnings.every((warning) => warning.includes("Forbidden")));
});

test("agent digest extracts text while tool calls are never promoted to execution success", () => {
  const result = summarizeAgentResult({ output: [
    { type: "function_call", name: "inventory_search", status: "completed" },
    { type: "message", content: [{ type: "output_text", text: "Found a car." }] },
    { type: "message", content: [{ type: "output_text", text: "Ready for a quote." }] },
  ] });
  assert.equal(result.text, "Found a car.\n\nReady for a quote.");
  assert.deepEqual(result.tools, [{ name: "inventory_search", status: "Call reported" }]);
  assert.equal(summarizeAgentResult({ unexpected: { text: "not an assistant answer" } }).text, "");
});
