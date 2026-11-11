import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveRuntimeState } from "./runtime-state.mjs";

test("a running web process cannot mask missing expected agent and skill endpoints", () => {
  const registry = [{ name: "web", port: 3000, pid: 1 }];
  const endpoints = [
    { name: "web", port: 3000, ready: true, expected: true },
    { name: "agent", port: 8088, ready: false, expected: true },
    { name: "skill", port: 7071, ready: false, expected: true },
  ];
  assert.equal(deriveRuntimeState({ state: "running" }, registry, endpoints).state, "starting");
  endpoints[1].expected = endpoints[2].expected = false;
  assert.equal(deriveRuntimeState({ state: "running" }, registry, endpoints).state, "running");
});

test("extension startup and readiness probes avoid redundant CLI and gateway overhead", async () => {
  const extensionSource = await readFile(new URL("./extension.mjs", import.meta.url), "utf8");
  assert.match(
    extensionSource,
    /async function hasGatewayConfiguration\(root\)\s*\{[\s\S]*?evaluateGatewayReadiness\(agentConfiguration,\s*activeGateway,\s*isConfiguring\)\.gatewayConfigured/,
    "hasGatewayConfiguration should inspect local files/gateway state without calling localReadiness",
  );
  assert.doesNotMatch(
    extensionSource,
    /async function hasGatewayConfiguration\(root\)\s*\{\s*return \(await localReadiness\(root\)\)\.gatewayConfigured;/,
  );
  assert.match(extensionSource, /const inFlightLocalReadiness = new Map\(\);/);
  assert.match(extensionSource, /inFlightLocalReadiness\.delete\(root\);/);
  assert.match(extensionSource,
    /const pending = \(async \(\) => \{[\s\S]*?const inputCapabilities = await readAppInputCapabilities\(root, \{ agentConfiguration \}\);/);
  assert.match(extensionSource, /readBuildRuntime\(root, inputCapabilities\)/);
  assert.match(extensionSource, /hasDocumentTool: Boolean\(inputCapabilities\.documentInput\)/);
  assert.match(extensionSource, /\.\.\.inputCapabilities,/);
  assert.doesNotMatch(extensionSource, /documentInput: buildRuntime \?/);
  assert.match(extensionSource, /now - cachedPrerequisiteTimestamp < 300_000/);
  assert.match(
    extensionSource,
    /const azRes = azAccountRes\?\.ok \|\| azAigatewayRes\?\.ok\s*\?\s*\{\s*ok:\s*true,\s*stdout:\s*""\s*\}\s*:\s*await runCommand\("az",\s*\["--version"\]/,
  );
  assert.match(extensionSource, /setTimeout\(\(\) => controller\.abort\(\), 6_000\)/);
  assert.match(extensionSource, /max_output_tokens:\s*16/);
  assert.match(
    extensionSource,
    /const \[models, candidateKey\] = await Promise\.all\(\[\s*discoverGatewayModels\(azureBootstrapRunner, candidate\)\.catch\(\(\) => \[\]\),\s*fetchGatewayApiKey\(candidate\),\s*\]\);/,
  );
  assert.match(extensionSource, /cachedDefaultInfraNegativeUntil = resolved \? 0 : Date\.now\(\) \+ 45_000;/);
});

test("owned listening ports with failed HTTP health are not ready", () => {
  const state = deriveRuntimeState({ state: "running" }, [{ name: "agent", port: 8088, pid: 1 }],
    [{ name: "agent", port: 8088, ready: false, expected: true }],
    { ownershipAvailable: true, ownedPorts: new Set([8088]) });
  assert.notEqual(state.state, "running");
});

test("startup failure survives partial readiness and recovers only when everything is ready", () => {
  const failure = { state: "failed", error: "Skill did not become healthy" };
  const registry = [{ name: "web", port: 3000, pid: 1 }];
  const endpoints = [{ name: "web", port: 3000, ready: true }, { name: "agent", port: 8088, ready: false }];
  assert.deepEqual(deriveRuntimeState(failure, registry, endpoints), failure);
  endpoints[1].ready = true;
  assert.equal(deriveRuntimeState(failure, registry, endpoints).state, "running");
});

test("headless apps can recover from their owned expected agent endpoint", () => {
  const endpoints = [{ name: "agent", port: 8088, ready: true, expected: true }];
  assert.equal(deriveRuntimeState(null, [], endpoints,
    { ownershipAvailable: true, ownedPorts: new Set([8088]) }).state, "running");
});
