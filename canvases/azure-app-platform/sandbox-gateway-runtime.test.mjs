import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  "templates",
  "sandbox-gateway-minimal",
);

test("sandbox gateway runtime template has strict document and ACA contracts", async () => {
  const [
    runtime,
    contract,
    agent,
    tool,
    prompt,
    posixStart,
    powerShellStart,
    manifest,
    egressPolicy,
  ] = await Promise.all([
    readFile(join(root, "config", "runtime.json.template"), "utf8").then(JSON.parse),
    readFile(join(root, "src", "tools", "document-validation", "contract.json"), "utf8").then(JSON.parse),
    readFile(join(root, "src", "agent", "main.py.template"), "utf8"),
    readFile(join(root, "src", "tools", "document-validation", "main.py.template"), "utf8"),
    readFile(join(root, "src", "agent", "prompts", "system.md.template"), "utf8"),
    readFile(join(root, "scripts", "dev-start.sh"), "utf8"),
    readFile(join(root, "scripts", "dev-start.ps1.template"), "utf8"),
    readFile(join(root, "azure-app.yaml.template"), "utf8"),
    readFile(join(root, "src", "tools", "document-validation", "egress-policy.md.template"), "utf8"),
  ]);

  assert.equal(runtime.agentRuntime, "local");
  assert.equal(
    runtime.documentTool.aca.poolManagementEndpointEnv,
    "DOCUMENT_TOOL_SESSION_POOL_ENDPOINT",
  );
  assert.equal(
    runtime.copilotSdkSandbox.poolManagementEndpointEnv,
    "COPILOT_AGENT_SESSION_POOL_ENDPOINT",
  );
  assert.deepEqual(contract.allowedExtensions, [".md", ".markdown", ".txt"]);
  assert.equal(contract.limits.maxDocumentBytes, 65_536);
  assert.match(agent, /CopilotClient/);
  assert.match(agent, /mode="empty"/);
  assert.match(agent, /approved_document_result/);
  assert.match(agent, /local-process-simulation/);
  assert.doesNotMatch(agent, /def _call_gateway/);
  assert.match(tool, /limited-deterministic-patterns/);
  assert.match(prompt, /Never claim complete PII detection/);
  assert.match(posixStart, /uv run main\.py/);
  assert.match(posixStart, /--agent-runtime=/);
  assert.match(powerShellStart, /--agent-runtime=/);
  assert.match(manifest, /interface: subprocess/);
  assert.match(egressPolicy, /__EGRESS_ALLOW_DOMAIN__/);
  assert.match(egressPolicy, /default-deny/i);
});
