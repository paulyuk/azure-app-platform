import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { documentDeploymentBlocker, readBuildRuntime, readBuildWorkspace, resolveBuildArtifactPath } from "./build-workspace.mjs";
import { invocationBody } from "./run-contract.mjs";

async function fixture(action, toolDirectory = "src/tools/document-validation") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "unity-build-")));
  try {
    for (const [path, content] of Object.entries({
      "src/agent/prompts/system.md": "Use registered tools.",
      [`${toolDirectory}/main.py`]: "print('tool')",
      [`${toolDirectory}/contract.json`]: '{"type":"object"}',
      "config/document-policy.json": '{"maxBytes":4096}',
      "config/runtime.json": '{"agentRuntime":"local"}',
    })) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), content);
    }
    await action(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("Build reads canonical files for preview without advertising inline mutation", async () => {
  await fixture(async (root) => {
    const { artifacts } = await readBuildWorkspace(root);
    assert.equal(artifacts.length, 5);
    assert.ok(artifacts.every((item) => item.available));
    const instructions = artifacts.find((item) => item.id === "instructions");
    assert.equal(instructions.content, await readFile(join(root, instructions.path), "utf8"));
    assert.equal("editable" in instructions, false);
    assert.equal("sha" in instructions, false);
    assert.equal(await resolveBuildArtifactPath(root, instructions.id), join(root, instructions.path));
  });
});

test("Build resolves allowlisted developer files and rejects arbitrary paths and symlinked source", async () => {
  await fixture(async (root) => {
    const { artifacts } = await readBuildWorkspace(root);
    assert.ok(artifacts.every((item) => !("editable" in item)));
    for (const id of ["policy", "contract"]) {
      const artifact = artifacts.find((item) => item.id === id);
      assert.ok((await resolveBuildArtifactPath(root, id)).endsWith(artifact.path));
    }
    for (const id of ["../.env", "src/agent/main.py"]) {
      await assert.rejects(resolveBuildArtifactPath(root, id), /known Customize artifact/);
    }
    const path = join(root, "src/agent/prompts/system.md");
    await rm(path);
    await symlink(join(root, "config/document-policy.json"), path);
    await assert.rejects(readBuildWorkspace(root), /not symlinks/);
    await assert.rejects(resolveBuildArtifactPath(root, "instructions"), /not symlinks/);
  });
});

test("Build reports missing artifacts and validates runtime selection without fallback", async () => {
  await fixture(async (root) => {
    await writeFile(join(root, "config/runtime.json"), '{"agentRuntime":"magic"}');
    await assert.rejects(readBuildRuntime(root), /choose agentRuntime/);
    await writeFile(join(root, "config/runtime.json"), '{"agentRuntime":"copilot-sdk-sandbox"}');
    assert.match(await documentDeploymentBlocker(root), /inherited Dealer configuration/);
    await rm(join(root, "src/agent/prompts/system.md"));
    assert.equal((await readBuildWorkspace(root)).artifacts.find((item) => item.id === "instructions").available, false);
  });
});

test("Build and Code retain the legacy tool layout without creating a second implementation", async () => {
  await fixture(async (root) => {
    const { artifacts } = await readBuildWorkspace(root);
    for (const id of ["tool", "contract"]) {
      const artifact = artifacts.find((item) => item.id === id);
      assert.ok(artifact.available);
      assert.ok(artifact.path.startsWith("src/sandbox/tool/"));
      assert.ok((await resolveBuildArtifactPath(root, id)).endsWith(artifact.path));
    }
    await assert.rejects(readFile(join(root, "src/tools/document-validation/main.py")), { code: "ENOENT" });
  }, "src/sandbox/tool");
});

test("Build never mixes new and legacy tool files or falls back around an unsafe new directory", async () => {
  await fixture(async (root) => {
    const directory = join(root, "src/tools/document-validation");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "main.py"), "print('new tool')");
    const { artifacts } = await readBuildWorkspace(root);
    assert.equal(artifacts.find((item) => item.id === "tool").path, "src/tools/document-validation/main.py");
    assert.equal(artifacts.find((item) => item.id === "contract").available, false);
    await assert.rejects(resolveBuildArtifactPath(root, "contract"), { code: "ENOENT" });
    await rm(directory, { recursive: true });
    await symlink(join(root, "src/sandbox/tool"), directory);
    await assert.rejects(readBuildWorkspace(root), /not a symlink/);
    await assert.rejects(resolveBuildArtifactPath(root, "tool"), /not a symlink/);
    await rm(directory);
    await symlink(join(root, "does-not-exist"), directory);
    await assert.rejects(resolveBuildArtifactPath(root, "contract"), /not a symlink/);
  }, "src/sandbox/tool");
});

test("document invocation carries only a bounded document, never policy overrides", () => {
  const contract = { url: "http://127.0.0.1:8088/invoke", route: "/invoke", inputField: "message" };
  assert.deepEqual(invocationBody(contract, "Summarize", { name: "sample.txt", content: "Document" }),
    { message: "Summarize", document: { name: "sample.txt", content: "Document" } });
  for (const document of [{ name: "x", content: "text", policy: {} }, { name: "x", content: "x".repeat(65537) }]) {
    assert.throws(() => invocationBody(contract, "Summarize", document), /Document invocation/);
  }
});
