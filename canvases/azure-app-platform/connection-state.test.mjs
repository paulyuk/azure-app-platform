import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readLocalConnectionState } from "./connection-state.mjs";

async function fixture(files, action) {
  const root = await mkdtemp(fileURLToPath(new URL("../../.connection-state-", import.meta.url)));
  try {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), content);
    }
    await action(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

const active = {
  name: "known-gateway", resourceGroup: "gateway-rg", subscriptionId: "gateway-sub", location: "",
  endpoint: "https://known.example.test", model: "gpt-6.1-sol", configurationStatus: "ready",
  sandboxGroup: { name: "known-sandbox", resourceGroup: "sandbox-rg", subscriptionId: "sandbox-sub", location: "eastus2" },
};
const env = [
  "AI_GATEWAY_NAME=known-gateway", "AI_GATEWAY_RESOURCE_GROUP=gateway-rg", "AZURE_SUBSCRIPTION_ID=gateway-sub",
  "AZURE_AI_GATEWAY_ENDPOINT=https://known.example.test", "AZURE_AI_GATEWAY_API_KEY=synthetic-secret",
  "AZURE_AI_GATEWAY_MODEL=gpt-6.1-sol",
].join("\n");

test("local connection state returns an empty app immediately without discovering or creating infrastructure", async () => {
  await fixture({}, async root => {
    const before = performance.now();
    assert.deepEqual(await readLocalConnectionState(root), {
      activeGateway: null, gatewayConfigured: false, model: null, sandboxGroup: null, agentRuntime: null,
    });
    assert.ok(performance.now() - before < 1000);
    assert.deepEqual(await readdir(root), [], "Reading Connect must not bootstrap or write app configuration");
  });
});

test("local connection state shows saved validated selection without returning credentials or private record fields", async () => {
  await fixture({ "src/agent/.env": env, "config/runtime.json": '{"agentRuntime":"copilot-sdk-sandbox"}' }, async root => {
    const before = performance.now();
    const result = await readLocalConnectionState(root, { activeGateway: { ...active, apiKey: "private-record-secret" } });
    assert.ok(performance.now() - before < 1000);
    assert.deepEqual(result, { activeGateway: active, gatewayConfigured: true, model: active.model,
      sandboxGroup: active.sandboxGroup, agentRuntime: "copilot-sdk-sandbox" });
    assert.doesNotMatch(JSON.stringify(result), /synthetic-secret|private-record-secret|apiKey/);
    assert.equal(await readFile(join(root, "src/agent/.env"), "utf8"), env);
    const configuring = await readLocalConnectionState(root, { activeGateway: active, configuring: true });
    assert.equal(configuring.gatewayConfigured, false);
    assert.equal(configuring.activeGateway.configurationStatus, "configuring");
  });
});

test("blank env values stay unconfigured instead of reading the following line", async () => {
  const emptyEnv = [
    "AZURE_AI_GATEWAY_ENDPOINT=", "AZURE_AI_GATEWAY_API_KEY=", "AZURE_AI_GATEWAY_MODEL=",
    "AI_GATEWAY_BASE_URL= ", "AI_GATEWAY_MODEL=", "ACA_SANDBOX_GROUP=", "ACA_RESOURCE_GROUP=",
    "ACA_SUBSCRIPTION=", "ACA_REGION=", "UNRELATED_KEY=synthetic-secret", "",
  ].join("\r\n");
  await fixture({ "src/agent/.env": emptyEnv }, async root => {
    assert.deepEqual(await readLocalConnectionState(root), {
      activeGateway: null, gatewayConfigured: false, model: null, sandboxGroup: null, agentRuntime: null,
    });
  });
});

test("local connection state reads env-only configuration without claiming that it has been validated", async () => {
  await fixture({ "src/agent/.env": env + "\nACA_SANDBOX_GROUP=env-sandbox\nACA_RESOURCE_GROUP=env-rg\nACA_SUBSCRIPTION=env-sub\n" }, async root => {
    const result = await readLocalConnectionState(root);
    assert.equal(result.activeGateway.name, active.name);
    assert.equal(result.activeGateway.endpoint, active.endpoint);
    assert.equal(result.activeGateway.model, active.model);
    assert.equal(result.activeGateway.configurationStatus, "local");
    assert.equal(result.gatewayConfigured, false);
    assert.equal(result.sandboxGroup.name, "env-sandbox");
    assert.equal(result.sandboxGroup.subscriptionId, "env-sub");
    assert.doesNotMatch(JSON.stringify(result), /synthetic-secret/);
  });
});

test("runtime gateway env mappings and default model are available without ARM metadata", async () => {
  await fixture({
    "config/runtime.json": JSON.stringify({ agentRuntime: "local", gateway: {
      baseUrlEnv: "CUSTOM_GATEWAY_URL", modelEnv: "CUSTOM_MODEL", defaultModel: "gpt-5-mini",
      apiKeyEnv: "CUSTOM_KEY", apiKey: "private-runtime-secret",
    } }),
    "src/agent/.env": 'CUSTOM_GATEWAY_URL="https://custom.example.test/openai/v1"\nCUSTOM_KEY=synthetic-secret\n',
  }, async root => {
    const result = await readLocalConnectionState(root);
    assert.equal(result.activeGateway.name, "custom.example.test");
    assert.equal(result.activeGateway.endpoint, "https://custom.example.test/openai/v1");
    assert.equal(result.activeGateway.model, "gpt-5-mini");
    assert.equal(result.gatewayConfigured, false);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-secret|private-runtime-secret/);
  });
});

test("explicitly cleared sandbox selection is not replaced by stale env configuration", async () => {
  await fixture({ "src/agent/.env": env + "\nACA_SANDBOX_GROUP=stale-sandbox\n" }, async root => {
    const result = await readLocalConnectionState(root, { activeGateway: { ...active, sandboxGroup: null } });
    assert.equal(result.activeGateway.sandboxGroup, null);
    assert.equal(result.sandboxGroup, null);
  });
});

test("invalid local configuration stays an explicit error and endpoint credentials are never returned", async () => {
  await fixture({ "config/runtime.json": '{"apiKey":"private-broken-json"' }, async root => {
    await assert.rejects(readLocalConnectionState(root), error => {
      assert.ok(error instanceof SyntaxError);
      assert.doesNotMatch(error.message, /private-broken-json|apiKey/);
      return /config\/runtime\.json must contain valid JSON/.test(error.message);
    });
  });
  for (const endpoint of ["https://user:secret@example.test", "https://example.test?api-key=secret", "https://example.test#secret"]) {
    await fixture({ "src/agent/.env": `AI_GATEWAY_BASE_URL=${endpoint}` }, async root => {
      await assert.rejects(readLocalConnectionState(root), error => {
        assert.doesNotMatch(error.message, /secret/);
        return /without credentials/.test(error.message);
      });
    });
  }
});
