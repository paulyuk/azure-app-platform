import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { documentDeploymentBlocker, readBuildRuntime, readBuildWorkspace, resolveBuildArtifactPath, resolveProjectSourcePath } from "./build-workspace.mjs";

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
    assert.equal(agent.customizationArea, "behavior");
    assert.equal(agent.projectPath, "src/agent");
    assert.equal(agent.projectName, "deal-finder-agent");
    assert.equal(agent.focusLine, 1);
    const skillArtifacts = state.artifacts.filter((item) => item.customizationArea === "tools");
    assert.ok(skillArtifacts.length > 1);
    assert.deepEqual([...new Set(skillArtifacts.map((item) => item.projectPath))], ["src/skills/inventory"]);
    assert.deepEqual([...new Set(skillArtifacts.map((item) => item.projectName))], ["inventory"]);
    assert.deepEqual(state.artifacts.filter((item) => item.customizationArea).map((item) => [item.path, item.customizationArea]).sort(), [
      ["src/agent/main.py", "behavior"],
      ["src/agent/agent.yaml", "runtime"],
      ["src/skills/inventory/function_app.py", "tools"],
      ["src/skills/inventory/agents.config.yaml", "tools"],
    ].sort());
    assert.ok(state.artifacts.filter((item) => item.path.startsWith("src/web/") || item.path.endsWith("/host.json"))
      .every((item) => item.customizationArea === undefined), "The raw catalog remains available without turning boilerplate into customization decisions");
    assert.equal(await resolveBuildArtifactPath(root, agent.id), join(root, agent.path));
    assert.equal(await resolveProjectSourcePath(root, "src/agent"), join(root, "src/agent/main.py"));
    assert.equal(await resolveProjectSourcePath(root, "src/skills/inventory"), join(root, "src/skills/inventory/function_app.py"));
    assert.equal(await resolveProjectSourcePath(root, "src/web"), join(root, "src/web/src/app/page.tsx"));
    assert.equal("editable" in agent, false);
    assert.equal(await readBuildRuntime(root), null);
    assert.equal(await documentDeploymentBlocker(root), null);
    await assert.rejects(resolveBuildArtifactPath(root, "contract"), /known Customize artifact/);
  });
});

test("Empty Unity Build includes the prompt, starter runtime and declared skill without document actions", async () => {
  await fixture({
    "azure-app.yaml": "capabilities:\n  agent:\n    path: src/agent\n  skills:\n    path: src/skills/look-up\n",
    "src/agent/agent.yaml": "kind: hosted\n",
    "src/agent/main.py": "ThreadingHTTPServer(('127.0.0.1', 8088), Handler).serve_forever()",
    "src/agent/prompts/system.md": "Define this app's behavior.",
    "src/skills/look-up/function_app.py": "import azure.functions as func\napp = func.FunctionApp()\n",
    "config/domain.json": '{"name":"lookup"}',
  }, async (root) => {
    const state = await readBuildWorkspace(root);
    assert.equal(state.supportsDocuments, false);
    assert.ok(state.artifacts.every((item) => item.available));
    for (const path of ["src/agent/prompts/system.md", "src/agent/main.py", "src/skills/look-up/function_app.py", "config/domain.json", "azure-app.yaml"]) {
      assert.ok(state.artifacts.some((item) => item.path === path), path);
    }
    assert.ok(!state.artifacts.some((item) => item.id === "policy" || item.id === "runtime"));
    const areaFor = (path) => state.artifacts.find((item) => item.path === path)?.customizationArea;
    assert.equal(areaFor("src/agent/prompts/system.md"), "behavior");
    assert.equal(areaFor("src/agent/main.py"), undefined);
    assert.equal(areaFor("src/skills/look-up/function_app.py"), "tools");
    assert.equal(areaFor("config/domain.json"), "runtime");
    assert.equal(areaFor("azure-app.yaml"), "runtime");
    assert.ok(!state.artifacts.some((item) => item.customizationArea === "policies"));
  });
});

test("custom declared paths scope read and open away from unrelated apps and leftover document files", async () => {
  await fixture({
    "azure-app.yaml": "components:\n  - tier: agent\n    path: services/assistant\n",
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
    assert.ok(state.artifacts.every((item) => item.path.startsWith("services/assistant/") || item.path === "azure-app.yaml"));
    const worker = state.artifacts.find((item) => item.path === "services/assistant/worker.ts");
    assert.ok(worker);
    assert.equal(worker.customizationArea, "behavior");
    assert.equal(worker.projectPath, "services/assistant");
    assert.equal(worker.focusLine, 1);
    assert.equal(await resolveBuildArtifactPath(root, worker.id), join(root, worker.path));
    assert.equal(await resolveProjectSourcePath(root, "services/assistant"), join(root, worker.path));
    await assert.rejects(resolveProjectSourcePath(root, "unrelated"), /source project discovered/);
    assert.equal(await readBuildRuntime(root), null);
    await writeFile(join(root, "azure-app.yaml"), "capabilities:\n  agent:\n    path: ../outside\n");
    await assert.rejects(readBuildWorkspace(root), /app-relative path/);
    await writeFile(join(root, "azure-app.yaml"), "name: not-an-inventory\n");
    await assert.rejects(readBuildWorkspace(root), /declare capabilities or components/);
    await writeFile(join(root, "azure-app.yaml"), "capabilities:\n  agent:\n    path: unrelated\n");
    await assert.rejects(resolveBuildArtifactPath(root, worker.id), /known Customize artifact/);
  });
});

test("Run source review selects sandbox code, supports root projects, and rejects unsafe or unknown projects", async () => {
  await fixture({
    "azure-app.yaml": "capabilities:\n  sandbox:\n    path: src/sandbox/prequal\n  web:\n    path: .\n",
    "src/sandbox/prequal/main.py": "print('prequal')",
    "src/sandbox/prequal/contract.json": "{}",
    "src/sandbox/prequal/Dockerfile": "FROM python:3.12",
    "src/sandbox/prequal/egress-policy.md": "Deny outbound access.",
    "package.json": '{"dependencies":{"next":"1.0"}}',
    "src/app/page.tsx": "export default function Page() { return null; }",
  }, async (root) => {
    assert.equal(await resolveProjectSourcePath(root, "src\\sandbox\\prequal"), join(root, "src/sandbox/prequal/main.py"));
    assert.equal(await resolveProjectSourcePath(root, "."), join(root, "src/app/page.tsx"),
      "A root web project must not borrow a nested sandbox's source");
    for (const project of ["../outside", "src/../sandbox", "/outside", "C:\\outside", "", null]) {
      await assert.rejects(resolveProjectSourcePath(root, project), (error) =>
        error.statusCode === 400 && /app-relative source project/.test(error.message));
    }
    await assert.rejects(resolveProjectSourcePath(root, "src/not-discovered"), /source project discovered/);
    const source = join(root, "src/app/page.tsx");
    await rm(source);
    await symlink(join(root, "src/sandbox/prequal/main.py"), source);
    assert.equal(await resolveProjectSourcePath(root, "."), join(root, "package.json"),
      "A symlinked implementation must not be opened; only another allowlisted file is eligible");
    await rm(join(root, "package.json"));
    await assert.rejects(resolveProjectSourcePath(root, "."), (error) =>
      error.statusCode === 404 && /No recognized source file/.test(error.message));
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
    await assert.rejects(resolveBuildArtifactPath(root, before.id), /known Customize artifact|not symlinks/);
    assert.equal(await readFile(join(root, "private.txt"), "utf8"), "not source");
  });
});

test("document Build honors the declared legacy tool instead of an unrelated new-layout directory", async () => {
  await fixture({
    "azure-app.yaml": "capabilities:\n  agent:\n    path: src/agent\n  sandbox:\n    path: src/sandbox/tool\n",
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
    assert.deepEqual(state.artifacts.filter((item) => ["instructions", "tool", "contract", "policy", "runtime"].includes(item.id))
      .map((item) => [item.id, item.customizationArea]).sort(), [
      ["instructions", "behavior"], ["tool", "tools"], ["contract", "tools"], ["policy", "policies"], ["runtime", "runtime"],
    ].sort());
    assert.equal(new Set(state.artifacts.map(item => item.path)).size, state.artifacts.length);
    assert.ok(!state.artifacts.some(item => item.path.startsWith("src/tools/document-validation")));
    const tool = state.artifacts.find((item) => item.id === "tool");
    assert.equal(tool.path, "src/sandbox/tool/main.py");
    assert.equal(tool.projectPath, "src/sandbox/tool");
    assert.equal(tool.projectName, "Document validation");
    assert.equal(state.artifacts.find((item) => item.id === "contract").projectPath, tool.projectPath);
    assert.match(tool.content, /selected legacy/);
    assert.equal(await resolveBuildArtifactPath(root, "tool"), join(root, tool.path));
    assert.equal(await resolveProjectSourcePath(root, "src/sandbox/tool"), join(root, tool.path));
    assert.equal(await resolveProjectSourcePath(root, "src/agent"), join(root, "src/agent/prompts/system.md"));
    assert.equal(await readFile(join(root, "src/tools/document-validation/main.py"), "utf8"), "print('unrelated new tool')");
  });

});

test("inline customization requires recognized instruction evidence and points to the original source line", async () => {
  await fixture({
    "src/agent/agent.yaml": "kind: hosted\n",
    "src/agent/main.py": "agent = Agent()\n",
  }, async (root) => {
    const path = "src/agent/main.py";
    const cases = [
      ["# instructions = 'Comment only'\nagent = Agent()\n", undefined],
      ["import os\n\nINSTRUCTIONS: str = 'Customize here'\n", 3],
      ["import os\nagent = Agent(\n  instructions='Customize here'\n)\n", 3],
      ["// instructions: comment only\nexport const SYSTEM_PROMPT = 'Customize here';\n", 2],
    ];
    let id;
    for (const [content, focusLine] of cases) {
      await writeFile(join(root, path), content);
      const artifact = (await readBuildWorkspace(root)).artifacts.find((item) => item.path === path);
      assert.equal(artifact.content, content, "Instruction strings must never be extracted into synthetic files");
      assert.equal(artifact.focusLine, focusLine);
      assert.equal(artifact.customizationArea, focusLine ? "behavior" : undefined);
      if (id) assert.equal(artifact.id, id);
      id = artifact.id;
      assert.equal(await resolveBuildArtifactPath(root, id), join(root, path));
    }
  });
});

test("empty and invalid app inventories report their state without inventing missing template artifacts", async () => {
  await fixture({}, async (root) => {
    assert.deepEqual((await readBuildWorkspace(root)).artifacts, []);
  });
  await fixture({ "azure-app.yaml": "capabilities:\n  agent:\n    path: ../outside\n" }, async (root) => {
    await assert.rejects(readBuildWorkspace(root), /app-relative path/);
  });
  await fixture({ "azure-app.yaml": "capabilities:\n  agent:\n    path: missing-agent\n" }, async (root) => {
    const state = await readBuildWorkspace(root);
    assert.deepEqual(state.artifacts.map((item) => item.id), ["app-inventory"]);
    assert.ok(state.diagnostics.some((item) => item.code === "missing-component-path"));
  });
});
