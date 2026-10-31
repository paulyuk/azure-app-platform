import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { readBuildWorkspace, resolveBuildArtifactPath } from "./build-workspace.mjs";
import { summarizeAgentResult } from "./agent-result.mjs";
import { SANDBOX_GATEWAY_TEMPLATE } from "./source-catalog.mjs";
import { materializeTemplate } from "./template-materializer.mjs";

async function allFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await allFiles(path));
    else files.push(path);
  }
  return files;
}

test("fresh template synchronizes catalog, runtime, Build paths, instructions and portable docs", async () => {
  const root = await mkdtemp(join(tmpdir(), "unity-alignment-"));
  try {
    const generated = await materializeTemplate({
      appName: "Loan application demo",
      purpose: "Explain untrusted loan application documents",
      sourcePlan: { kind: "empty-template", templateId: SANDBOX_GATEWAY_TEMPLATE.id },
    }, { destination: root });
    assert.deepEqual(generated.requiredFiles, SANDBOX_GATEWAY_TEMPLATE.requiredPaths);
    await Promise.all(generated.requiredFiles.map((path) => access(join(root, path))));
    await assert.rejects(access(join(root, "src/sandbox/tool")), { code: "ENOENT" });

    const { artifacts } = await readBuildWorkspace(root);
    assert.equal(artifacts.length, 5);
    for (const artifact of artifacts) {
      assert.equal(artifact.available, true, artifact.path);
      assert.equal(await resolveBuildArtifactPath(root, artifact.id), join(await realpath(root), artifact.path));
    }
    assert.equal(artifacts.find((item) => item.id === "tool").title, "Document validation tool");
    assert.equal(artifacts.find((item) => item.id === "tool").path, "src/tools/document-validation/main.py");
    assert.equal(artifacts.find((item) => item.id === "contract").path, "src/tools/document-validation/contract.json");

    const agent = await readFile(join(root, "src/agent/main.py"), "utf8");
    assert.match(agent, /class AgentHarness:/);
    assert.match(agent, /ROOT \/ "src" \/ "tools" \/ "document-validation" \/ "main.py"/);
    assert.doesNotMatch(agent, /ControlPlaneService|SANDBOX_TOOL_PATH/);
    const descriptor = await readFile(join(root, "src/agent/agent.yaml"), "utf8");
    assert.match(descriptor, /name: document-validation/);
    assert.match(descriptor, /path: \.\.\/tools\/document-validation\/main\.py/);
    assert.doesNotMatch(descriptor, /type: timer/);
    const manifest = await readFile(join(root, "unity.app.yaml"), "utf8");
    assert.match(manifest, /path: src\/tools\/document-validation/);
    const dockerfile = await readFile(join(root, "src/tools/document-validation/Dockerfile"), "utf8");
    assert.match(dockerfile, /WORKDIR \/app\/src\/tools\/document-validation/);
    for (const match of dockerfile.matchAll(/^COPY (src\/\S+|config\/\S+) /gm)) {
      await access(join(root, match[1]));
    }
    const prompt = artifacts.find((item) => item.id === "instructions").content;
    assert.match(prompt, /When processing a loan application/);
    assert.match(prompt, /Do not approve or deny loans/);
    assert.match(prompt, /document validation tool and agent harness checks/);
    const readme = await readFile(join(root, "README.md"), "utf8");
    for (const expected of ["Customize", "Edit in Files", "Policy checks passed", "ports.env", "src/tools/document-validation", "copilot-sdk-sandbox"]) {
      assert.ok(readme.includes(expected), `README must explain ${expected}`);
    }
    assert.doesNotMatch(readme, /https?:\/\/(?:127\.0\.0\.1|localhost):8088\/(?:invoke|test-document)/);

    for (const path of (await allFiles(root)).filter((file) => file.endsWith(".md"))) {
      const content = await readFile(path, "utf8");
      assert.doesNotMatch(content, /__APP_NAME__|__PURPOSE__|__AGENT_INSTRUCTIONS__/);
      assert.doesNotMatch(content, /\*\*Build(?: → Behavior)?\*\*/);
      for (const match of content.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1].split("#")[0];
        if (!target || /^[a-z]+:/i.test(target)) continue;
        assert.ok(!target.endsWith(".template"), `${path}: unrendered link ${target}`);
        await assert.doesNotReject(access(resolve(dirname(path), target)), `${path}: broken link ${target}`);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent tool results use the same document validation tool label", () => {
  const result = summarizeAgentResult({ message: "Summary", toolResult: { verdict: "approved" } });
  assert.equal(result.tools[0].name, "Document validation tool");
});
