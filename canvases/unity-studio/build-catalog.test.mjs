import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { documentDeploymentBlocker, readBuildRuntime, readBuildWorkspace, resolveBuildArtifactPath, saveBuildArtifact } from "./build-workspace.mjs";

async function fixture(files, action) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "unity-build-catalog-")));
  try {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), content);
    }
    await action(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("Dealer Build shows inline agent source and actual skills, not document template placeholders", async () => {
  const source = 'INSTRUCTIONS = "Find a vehicle."\ndef build_agent():\n    return Agent(instructions=INSTRUCTIONS)\n';
  await fixture({
    "src/agent/agent.yaml": "kind: hosted\nname: deal-finder\n",
    "src/agent/main.py": source,
    "src/skills/inventory/function_app.py": "import azure.functions as func\napp = func.FunctionApp()\n",
    "src/skills/inventory/agents.config.yaml": "agents: []\n",
    "src/skills/inventory/host.json": '{"version":"2.0"}',
    "src/web/package.json": '{"dependencies":{"next":"1.0"}}',
    "src/web/src/app/page.tsx": "export default function Page() { return null; }",
    "config/runtime.json": '{"unrelatedSetting":true}',
    "src/agent/.env": "SECRET=must-not-be-exposed",
    "src/skills/inventory/local.settings.json": '{"Values":{"secret":"must-not-be-exposed"}}',
  }, async (root) => {
    const state = await readBuildWorkspace(root);
    assert.equal(state.kind, "source");
    assert.equal(state.supportsDocuments, false);
    assert.ok(state.artifacts.length >= 5);
    assert.ok(state.artifacts.every((item) => item.available));
    const paths = state.artifacts.map((item) => item.path);
    assert.ok(paths.includes("src/agent/main.py"));
    assert.ok(paths.includes("src/skills/inventory/function_app.py"));
    assert.ok(paths.includes("src/web/src/app/page.tsx"));
    assert.equal(new Set(paths).size, paths.length);
    assert.ok(!paths.some((path) => /document|prompts\/system|local\.settings|\.env$/.test(path)));
    const agent = state.artifacts.find((item) => item.path === "src/agent/main.py");
    assert.match(agent.title, /instructions/);
    assert.equal(agent.content, source);
    assert.equal(await resolveBuildArtifactPath(root, agent.id), join(root, agent.path));
    const next = source.replace("Find a vehicle.", "Only describe real inventory.");
    await saveBuildArtifact(root, { id: agent.id, content: next, baseSha: agent.sha });
    assert.equal(await readFile(join(root, agent.path), "utf8"), next);
    await assert.rejects(saveBuildArtifact(root, { id: agent.id, content: source, baseSha: agent.sha }), { statusCode: 409 });
    assert.equal(await readBuildRuntime(root), null);
    assert.equal(await documentDeploymentBlocker(root), null);
    await assert.rejects(resolveBuildArtifactPath(root, "contract"), /known Build artifact/);
    await assert.rejects(saveBuildArtifact(root, { id: "../.env", content: "stolen" }), /not editable/);
  });
});

test("Empty Unity Build includes the prompt, starter runtime and declared skill without document actions", async () => {
  await fixture({
    "unity.app.yaml": "capabilities:\n  agent:\n    path: src/agent\n  skills:\n    path: src/skills/look-up\n",
    "src/agent/agent.yaml": "kind: hosted\n",
    "src/agent/main.py": "ThreadingHTTPServer(('127.0.0.1', 8088), Handler).serve_forever()",
    "src/agent/prompts/system.md": "Define this app's behavior.",
    "src/skills/look-up/function_app.py": "import azure.functions as func\napp = func.FunctionApp()\n",
    "config/domain.json": '{"name":"lookup"}',
  }, async (root) => {
    const state = await readBuildWorkspace(root);
    assert.equal(state.supportsDocuments, false);
    assert.ok(state.artifacts.every((item) => item.available));
    for (const path of ["src/agent/prompts/system.md", "src/agent/main.py", "src/skills/look-up/function_app.py", "config/domain.json", "unity.app.yaml"]) {
      assert.ok(state.artifacts.some((item) => item.path === path), path);
    }
    assert.ok(!state.artifacts.some((item) => item.id === "policy" || item.id === "runtime"));
  });
});

test("custom declared paths scope read, open and save away from unrelated apps and leftover document files", async () => {
  await fixture({
    "unity.app.yaml": "components:\n  - tier: agent\n    path: services/assistant\n",
    "services/assistant/agent.yaml": "name: custom\nkind: hosted\n",
    "services/assistant/worker.ts": "const agent = new Agent({ instructions: 'Custom' });",
    "unrelated/agent.yaml": "name: another\n",
    "unrelated/main.py": "agent = Agent()",
    "src/tools/document-validation/main.py": "print('unrelated document tool')",
    "config/document-policy.json": "{}",
    "config/runtime.json": '{"agentRuntime":"local"}',
  }, async (root) => {
    const state = await readBuildWorkspace(root);
    assert.equal(state.supportsDocuments, false);
    assert.ok(state.artifacts.every((item) => item.path.startsWith("services/assistant/") || item.path === "unity.app.yaml"));
    const worker = state.artifacts.find((item) => item.path === "services/assistant/worker.ts");
    assert.ok(worker);
    assert.equal(await resolveBuildArtifactPath(root, worker.id), join(root, worker.path));
    assert.equal(await readBuildRuntime(root), null);
    const inventory = state.artifacts.find((item) => item.id === "app-inventory");
    await assert.rejects(saveBuildArtifact(root, {
      id: inventory.id, baseSha: inventory.sha,
      content: "capabilities:\n  agent:\n    path: ../outside\n",
    }), /app-relative path/);
    await assert.rejects(saveBuildArtifact(root, {
      id: inventory.id, baseSha: inventory.sha, content: "name: not-an-inventory\n",
    }), /declare capabilities or components/);
    await writeFile(join(root, "unity.app.yaml"), "capabilities:\n  agent:\n    path: unrelated\n");
    await assert.rejects(resolveBuildArtifactPath(root, worker.id), /known Build artifact/);
    await assert.rejects(saveBuildArtifact(root, { id: worker.id, content: "changed", baseSha: worker.sha }), /not editable/);
  });
});

test("generic source IDs remain bound to paths and cannot follow swapped symlinks", async () => {
  await fixture({
    "src/agent/agent.yaml": "kind: hosted\n",
    "src/agent/main.py": "agent = Agent()",
    "private.txt": "not source",
  }, async (root) => {
    const before = (await readBuildWorkspace(root)).artifacts.find((item) => item.path === "src/agent/main.py");
    await mkdir(join(root, "src/agent/prompts"), { recursive: true });
    await writeFile(join(root, "src/agent/prompts/system.md"), "New instructions");
    const after = (await readBuildWorkspace(root)).artifacts.find((item) => item.path === before.path);
    assert.equal(after.id, before.id);
    await rm(join(root, before.path));
    await symlink(join(root, "private.txt"), join(root, before.path));
    await assert.rejects(resolveBuildArtifactPath(root, before.id), /known Build artifact|not symlinks/);
    await assert.rejects(saveBuildArtifact(root, { id: before.id, content: "overwrite", baseSha: before.sha }), /not editable|not symlinks/);
    assert.equal(await readFile(join(root, "private.txt"), "utf8"), "not source");
  });
});

test("document Build honors the declared legacy tool instead of an unrelated new-layout directory", async () => {
  await fixture({
    "unity.app.yaml": "capabilities:\n  agent:\n    path: src/agent\n  sandbox:\n    path: src/sandbox/tool\n",
    "src/agent/agent.yaml": "kind: hosted\n",
    "src/agent/prompts/system.md": "Process documents.",
    "src/sandbox/tool/main.py": "print('selected legacy tool')",
    "src/sandbox/tool/contract.json": "{}",
    "src/tools/document-validation/main.py": "print('unrelated new tool')",
    "config/document-policy.json": "{}",
    "config/runtime.json": '{"agentRuntime":"local"}',
  }, async (root) => {
    const state = await readBuildWorkspace(root);
    assert.equal(state.supportsDocuments, true);
    const tool = state.artifacts.find((item) => item.id === "tool");
    assert.equal(tool.path, "src/sandbox/tool/main.py");
    assert.match(tool.content, /selected legacy/);
    assert.equal(await resolveBuildArtifactPath(root, "tool"), join(root, tool.path));
    await saveBuildArtifact(root, { id: tool.id, content: "print('updated legacy tool')", baseSha: tool.sha });
    assert.equal(await readFile(join(root, "src/tools/document-validation/main.py"), "utf8"), "print('unrelated new tool')");
  });
});

test("empty and invalid app inventories report their state without inventing missing template artifacts", async () => {
  await fixture({}, async (root) => {
    assert.deepEqual((await readBuildWorkspace(root)).artifacts, []);
  });
  await fixture({ "unity.app.yaml": "capabilities:\n  agent:\n    path: ../outside\n" }, async (root) => {
    await assert.rejects(readBuildWorkspace(root), /app-relative path/);
  });
  await fixture({ "unity.app.yaml": "capabilities:\n  agent:\n    path: missing-agent\n" }, async (root) => {
    const state = await readBuildWorkspace(root);
    assert.deepEqual(state.artifacts.map((item) => item.id), ["app-inventory"]);
    assert.ok(state.diagnostics.some((item) => item.code === "missing-component-path"));
  });
});
