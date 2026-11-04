import assert from "node:assert/strict";
import test from "node:test";
import { discoverGatewayOptions, discoverSandboxGroups, evaluateGatewayReadiness } from "./gateway-state.mjs";

const subscriptions = [
  { id: "sub-a", name: "Default", state: "Enabled", isDefault: true },
  { id: "sub-b", name: "Saved", state: "Enabled" },
  { id: "disabled", name: "Disabled", state: "Disabled" },
];
function gateway(name, subscription = "sub-a") {
  return { name, id: `/subscriptions/${subscription}/resourceGroups/rg/providers/Microsoft.ApiManagement/service/${name}`,
    properties: { gatewayUrl: `https://${name}.azure-api.net` } };
}
function runner(calls, gateways = [gateway("z"), gateway("a")]) {
  return async (command, args) => {
    calls.push([command, args]);
    return { ok: true, stdout: JSON.stringify(args[0] === "account" ? subscriptions : gateways) };
  };
}

test("gateway discovery picks current subscription and a deterministic valid gateway without mutating Azure", async () => {
  const calls = [];
  const options = await discoverGatewayOptions(runner(calls));
  assert.equal(options.subscription.id, "sub-a");
  assert.equal(options.suggested.name, "a");
  assert.equal(options.active, null);
  assert.equal(options.subscriptions.length, 2);
  assert.deepEqual(calls[1], ["az", ["aigateway", "list", "--subscription", "sub-a", "-o", "json"]]);
  assert.ok(calls.every(([, args]) => args.includes("list")));
});

test("saved gateway wins over default and duplicate names match subscription and resource group", async () => {
  const active = { name: "a", resourceGroup: "rg", subscriptionId: "sub-b" };
  const options = await discoverGatewayOptions(runner([], [gateway("a", "sub-b")]), active);
  assert.equal(options.subscription.id, "sub-b");
  assert.equal(options.suggested.subscriptionId, "sub-b");
  assert.deepEqual(options.active, active);
});

test("explicit subscription selection is scoped and unavailable subscriptions fail", async () => {
  const options = await discoverGatewayOptions(runner([], []), null, "sub-b");
  assert.equal(options.subscription.id, "sub-b");
  assert.equal(options.suggested, null);
  await assert.rejects(discoverGatewayOptions(runner([]), null, "disabled"), /unavailable/);
});

test("Azure errors and malformed results remain errors", async () => {
  await assert.rejects(discoverGatewayOptions(async () => ({ ok: false, stderr: "Please sign in" })), /sign in/);
  await assert.rejects(discoverGatewayOptions(async () => ({ ok: true, stdout: "not json" })));
});

test("readiness exposes model but never API key and never treats partial configuration as valid", () => {
  const config = "AZURE_AI_GATEWAY_MODEL=gpt-5-mini\nAZURE_AI_GATEWAY_API_KEY=secret";
  const readiness = evaluateGatewayReadiness(config, null);
  assert.equal(readiness.model, "gpt-5-mini");
  assert.equal(readiness.gatewayConfigured, false);
  assert.ok(!JSON.stringify(readiness).includes("secret"));
});

test("sandbox group discovery supports independent subscription and cross-subscription Resource Graph fallback", async () => {
  const calls = [];
  const crossSubRunner = async (command, args) => {
    calls.push([command, args]);
    if (args[0] === "resource" && args[1] === "list") {
      return { ok: true, stdout: "[]" };
    }
    if (args[0] === "rest" && args.includes("https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01")) {
      return {
        ok: true,
        stdout: JSON.stringify({
          data: [
            {
              id: "/subscriptions/sub-shared/resourceGroups/rg-aca-sandboxes-alexbritez/providers/Microsoft.App/sandboxGroups/aca-sandboxes-alexbritez",
              name: "aca-sandboxes-alexbritez",
              resourceGroup: "rg-aca-sandboxes-alexbritez",
              location: "eastus2",
              subscriptionId: "sub-shared",
            },
          ],
        }),
      };
    }
    return { ok: false, stderr: "unexpected call" };
  };
  const fallbackResult = await discoverSandboxGroups(crossSubRunner, "sub-a", null, {
    includeAll: true,
    fallbackAllSubscriptions: true,
  });
  assert.equal(fallbackResult.subscriptionId, "*");
  assert.equal(fallbackResult.sandboxGroups.length, 1);
  assert.equal(fallbackResult.sandboxGroups[0].name, "aca-sandboxes-alexbritez");
  assert.equal(fallbackResult.sandboxGroups[0].subscriptionId, "sub-shared");

  const allSubsResult = await discoverSandboxGroups(crossSubRunner, "*", null, { includeAll: true });
  assert.equal(allSubsResult.subscriptionId, "*");
  assert.equal(allSubsResult.suggested?.name, "aca-sandboxes-alexbritez");
});
