import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseEnvVariables, writeAppEnvConfiguration } from "./app-env-configuration.mjs";
import { deriveRuntimeState } from "./runtime-state.mjs";

test("app env writes sync gateway settings to hosted skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "azure-app-platform-env-"));
  try {
    const skillRoot = join(root, "src", "skills", "inventory-search");
    await mkdir(join(root, "src", "agent"), { recursive: true });
    await mkdir(skillRoot, { recursive: true });
    await writeFile(join(skillRoot, "local.settings.json"), JSON.stringify({
      IsEncrypted: false,
      Values: {
        AzureWebJobsStorage: "UseDevelopmentStorage=true",
        AZURE_FUNCTIONS_AGENTS_PROVIDER: "openai",
      },
    }));
    const envContent = [
      "# Generated gateway settings",
      "export AZURE_AI_GATEWAY_ENDPOINT = 'https://gateway.example.test/'",
      "AZURE_AI_GATEWAY_API_KEY=\"test-key\"",
      "AZURE_AI_GATEWAY_MINI_MODEL = gpt-test-mini",
      "",
    ].join("\n");

    assert.equal(await writeAppEnvConfiguration(root, envContent), true);
    assert.equal(await readFile(join(root, "src", "agent", ".env"), "utf8"), envContent);
    const settings = JSON.parse(await readFile(join(skillRoot, "local.settings.json"), "utf8"));
    assert.equal(settings.Values.OPENAI_BASE_URL, "https://gateway.example.test/default/models/openai/v1/");
    assert.equal(settings.Values.OPENAI_CUSTOM_HEADERS, "Api-Key: test-key");
    assert.equal(settings.Values.AZURE_FUNCTIONS_AGENTS_MODEL, "gpt-test-mini");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("env parsing ignores comments and invalid input while accepting exports and quoted values", () => {
  assert.deepEqual(parseEnvVariables(null), {});
  assert.deepEqual(parseEnvVariables(`
    # comment
    export VALID_NAME = " trimmed value "
    SINGLE_QUOTED='single'
    UNQUOTED=value with spaces
    1INVALID=ignored
  `), {
    VALID_NAME: "trimmed value",
    SINGLE_QUOTED: "single",
    UNQUOTED: "value with spaces",
  });
});

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
  assert.match(extensionSource, /const pending = \(async \(\) => \{[\s\S]*?readAppInputCapabilities\(root, \{ agentConfiguration \}\)/);
  assert.match(extensionSource, /readBuildRuntime\(root, inputCapabilities\)/);
  assert.match(extensionSource, /hasDocumentTool: Boolean\(inputCapabilities\.documentInput\)/);
  assert.match(extensionSource, /\.\.\.inputCapabilities,/);
  assert.doesNotMatch(extensionSource, /documentInput: buildRuntime \?/);
  assert.match(extensionSource, /now - cachedPrerequisiteTimestamp >= 300_000/);
  assert.match(
    extensionSource,
    /const azRes = azAccountRes\?\.ok \|\| azAigatewayRes\?\.ok\s*\?\s*\{\s*ok:\s*true,\s*stdout:\s*""\s*\}\s*:\s*await runCommand\("az",\s*\["--version"\]/,
  );
  assert.match(extensionSource, /setTimeout\(\(\) => controller\.abort\(\), 3_500\)/);
  assert.match(extensionSource, /max_output_tokens:\s*16/);
  assert.match(
    extensionSource,
    /const \[models, candidateKey\] = await Promise\.all\(\[\s*discoverGatewayModels\(azureBootstrapRunner, candidate\)\.catch\(\(\) => \[\]\),\s*fetchGatewayApiKey\(candidate\),\s*\]\);/,
  );
  assert.match(extensionSource, /cachedDefaultInfraNegativeUntil = resolved \? 0 : Date\.now\(\) \+ 45_000;/);
  assert.match(extensionSource, /async function inspectAppInfraNeeds\(root\)/);
  assert.match(
    extensionSource,
    /const prerequisitesPromise = infraNeeds\.needsGateway \|\| infraNeeds\.needsSandbox \|\| infraNeeds\.needsPython\s*\?\s*detectLocalPrerequisites\(\{ needsSandbox: infraNeeds\.needsSandbox \}\)\s*:\s*Promise\.resolve\(\{\s*ready:\s*true,\s*items:\s*\[\],\s*missingTools:\s*\[\]\s*\}\);/,
  );
  assert.match(
    extensionSource,
    /const infra = await discoverDefaultCanvasInfra\(\{ needsSandbox: resolvedNeeds\.needsSandbox \}\);/,
  );
  assert.match(
    extensionSource,
    /function isPidAlive\(pid\)\s*\{[\s\S]*?process\.kill\(pid,\s*0\);/,
  );
  assert.match(
    extensionSource,
    /if \(readyEntrypoints\.every\(\(entrypoint\) => registryOwnedPorts\.has\(entrypoint\.port\)\)\)/,
  );
  const gatewayStateSource = await readFile(new URL("./gateway-state.mjs", import.meta.url), "utf8");
  assert.match(
    gatewayStateSource,
    /const aliasPromise = commandRunner\("az", \["rest", "--method", "get", "--uri", aliasesUri, "-o", "json"\]\)\.catch\(\(\) => null\);/,
  );
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
