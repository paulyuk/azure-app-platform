import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { readAppInputCapabilities, readBuildRuntime, readBuildWorkspace } from "./build-workspace.mjs";

async function fixture(files, action) {
  const root = join(process.cwd(), ".canvas-input-test-" + randomUUID());
  try {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), content);
    }
    await action(root);
  } finally { await rm(root, { force: true, recursive: true }); }
}

const manifest = "capabilities:\n  agent:\n    path: src/custom-agent\n  sandbox:\n    path: src/tools/research\n";

test("readiness discovers custom sandbox contracts and bounded app-specific document metadata", async () => {
  const sample = { name: "research.md", content: "# Research record\n\nKeep scientific terminology." };
  await fixture({
    "azure-app.yaml": manifest,
    "src/tools/research/contract.json": JSON.stringify({ inputSchema: { type: "object", properties: { document: { type: "object", properties: { content: { type: "string" } } } } }, sampleDocument: { path: "samples/research.md" } }),
    "samples/research.md": sample.content,
    "config/runtime.json": '{"agentRuntime":"local"}',
  }, async root => {
    const readiness = await readAppInputCapabilities(root);
    assert.deepEqual(readiness.documentInput.sampleDocument, sample);
    assert.equal(readiness.sandboxBoundaryTest.mode, "document");
    assert.equal(readiness.sandboxBoundaryTest.execution, "app-sandbox");
    assert.equal((await readBuildRuntime(root)).agentRuntime, "local");
    const workspace = await readBuildWorkspace(root);
    assert.equal(workspace.supportsDocuments, true);
    assert.equal(workspace.artifacts.some(artifact => artifact.path.includes("document-validation")), false);
  });
});

test("a no-document prequal/code-interpreter sandbox never implies attachment support", async () => {
  await fixture({
    "azure-app.yaml": "capabilities:\n  agent:\n    path: src/custom-agent\n  sandbox:\n    path: src/sandbox/prequal\n",
    "src/sandbox/prequal/contract.json": '{"inputSchema":{"properties":{"code":{"type":"string"}}}}',
    "config/runtime.json": '{"agentRuntime":"local"}',
  }, async root => {
    const readiness = await readAppInputCapabilities(root);
    assert.equal(readiness.documentInput, null);
    assert.equal(readiness.sandboxBoundaryTest.available, true);
    assert.equal(readiness.sandboxBoundaryTest.mode, "prompt-or-code");
    assert.equal((await readBuildRuntime(root)).agentRuntime, "local");
  });
});

test("recognized agent invoke document handling and configured ACA groups are independent signals", async () => {
  await fixture({
    "azure-app.yaml": "capabilities:\n  agent:\n    path: src/custom-agent\n",
    "src/custom-agent/main.py": '@app.post("/invoke")\nasync def invoke():\n    document = payload.get("document")\n',
  }, async root => {
    const readiness = await readAppInputCapabilities(root);
    assert.ok(readiness.documentInput);
    assert.equal(readiness.sandboxBoundaryTest, null);
  });
  await fixture({ "README.md": "Calculator" }, async root => {
    const readiness = await readAppInputCapabilities(root, { agentConfiguration: 'ACA_SANDBOX_GROUP="calculator"\nAZURE_AI_GATEWAY_API_KEY=synthetic-secret-not-returned\n' });
    assert.equal(readiness.documentInput, null);
    assert.equal(readiness.sandboxBoundaryTest.mode, "prompt-or-code");
    assert.doesNotMatch(JSON.stringify(readiness), /calculator|synthetic-secret-not-returned/);
    assert.equal((await readAppInputCapabilities(root)).sandboxBoundaryTest, null);
  });
});

test("discovery recognizes sandbox evidence without a canonical template directory", async () => {
  await fixture({ "src/interpreter/main.py": "os.environ.get('ACA_SANDBOX_GROUP')\n# ACA sandbox lifecycle\n" }, async root => {
    const readiness = await readAppInputCapabilities(root);
    assert.equal(readiness.sandboxBoundaryTest?.available, true);
    assert.equal(readiness.documentInput, null);
  });
});

test("a resource-only sandbox capability exposes prompt tests without inventing attachment support", async () => {
  await fixture({ "azure-app.yaml": "capabilities:\n  sandbox:\n    resourceId: sandbox-resource\n" }, async root => {
    const readiness = await readAppInputCapabilities(root);
    assert.equal(readiness.documentInput, null);
    assert.equal(readiness.sandboxBoundaryTest.mode, "prompt-or-code");
  });
});

test("a code-only contract overrides legacy document directory naming", async () => {
  await fixture({
    "src/agent/main.py": "# Agent runtime",
    "src/sandbox/tool/contract.json": '{"inputSchema":{"properties":{"code":{"type":"string"}}}}',
  }, async root => {
    const readiness = await readAppInputCapabilities(root);
    assert.equal(readiness.documentInput, null);
    assert.equal(readiness.sandboxBoundaryTest.mode, "prompt-or-code");
  });
});

test("known starter documents and nested contract metadata remain app-specific", async () => {
  await fixture({
    "azure-app.yaml": manifest,
    "src/tools/research/contract.json": '{"parameters":{"properties":{"documentText":{"type":"string"}}}}',
    "samples/base-document.md": "# Research notes\n\nPreserve experimental observations.",
    "config/domain.json": "null",
  }, async root => {
    const readiness = await readAppInputCapabilities(root);
    assert.equal(readiness.documentInput.sampleDocument.name, "base-document.md");
    await writeFile(join(root, "src/tools/research/contract.json"), JSON.stringify({
      parameters: { properties: { documentText: { type: "string" } } },
      documentInput: { maxBytes: 512, sampleDocument: { name: "domain-record.md", content: "# Custom record" } },
    }));
    const nested = await readAppInputCapabilities(root);
    assert.equal(nested.documentInput.maxBytes, 512);
    assert.equal(nested.documentInput.sampleDocument.name, "domain-record.md");
  });
});

test("sample metadata rejects arbitrary paths, credentials, oversized files and symlinks", async () => {
  await fixture({
    "azure-app.yaml": manifest,
    "src/tools/research/contract.json": '{"inputSchema":{"properties":{"document":{"type":"object"}}}}',
    "src/custom-agent/.env": "SYNTHETIC=must-not-be-read",
    "samples/large.md": "x".repeat(100000),
    "samples/credential.md": "API_KEY=syntheticcredentialvalue",
  }, async root => {
    for (const value of [
      { path: "src/custom-agent/.env" }, { path: "../outside.md" },
      { path: "samples/large.md" }, { path: "samples/credential.md" },
      { name: "../leak.md", content: "unsafe name" },
    ]) {
      await mkdir(join(root, "config"), { recursive: true });
      await writeFile(join(root, "config/sandbox-boundary-test.json"), JSON.stringify({ sampleDocument: value }));
      assert.equal((await readAppInputCapabilities(root)).documentInput.sampleDocument, undefined);
    }
    await symlink(join(root, "src/custom-agent/.env"), join(root, "samples/linked.md"));
    await writeFile(join(root, "config/sandbox-boundary-test.json"), JSON.stringify({ sampleDocument: { path: "samples/linked.md" } }));
    await assert.rejects(readAppInputCapabilities(root), /not symlinks/);
  });
});
