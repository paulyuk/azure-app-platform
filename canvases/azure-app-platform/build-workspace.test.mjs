import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { documentDeploymentBlocker, readBuildRuntime, readBuildWorkspace, resolveBuildArtifactPath, resolveProjectSourcePath, WEB_STYLE_PRESETS, writeBuildWebStyle } from "./build-workspace.mjs";
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

test("Build leads document collections with runtime code and the real egress policy when present", async () => {
  for (const directory of ["src/tools/document-validation", "src/sandbox/tool"]) {
    await fixture(async root => {
      await writeFile(join(root, "src/agent/main.py"), "class AgentHarness: pass\n");
      await writeFile(join(root, "config/egress-policy.yaml"), "defaultAction: Deny\ntrafficInspection: Full\nrules: []\n");
      await writeFile(join(root, "azure-app.yaml"), `capabilities:\n  agent:\n    path: src/agent\n  sandbox:\n    path: ${directory}\n`);
      await writeFile(join(root, directory, "egress-policy.md"), "Supplementary guidance.");
      await writeFile(join(root, directory, "README.md"), "Tool documentation.");
      const { artifacts } = await readBuildWorkspace(root);
      const agent = artifacts.filter(item => item.projectPath === "src/agent");
      assert.equal(agent[0].path, "src/agent/main.py");
      assert.equal(agent[0].title, "Agent runtime & egress audit");
      assert.equal(agent[0].blockTemplateId, "agent-instructions");
      assert.ok(agent.every(item => item.projectName === "Agent"));
      assert.equal(await resolveProjectSourcePath(root, "src/agent"), join(root, "src/agent/main.py"));
      const sandbox = artifacts.filter(item => item.projectPath === directory);
      assert.deepEqual(sandbox.slice(0, 2).map(item => item.path), [`${directory}/main.py`, "config/egress-policy.yaml"]);
      assert.ok(sandbox.every(item => item.projectName === "Document validation" && item.blockCategory === "sandbox"));
      const policy = sandbox.find(item => item.id === "egress-policy");
      assert.equal(policy.customizationArea, "policies");
      assert.equal(policy.blockTemplateId, "sandbox");
      assert.equal(policy.title, "Sandbox egress policy");
      assert.equal(policy.available, true);
      assert.match(policy.content, /^defaultAction: Deny/);
      assert.equal(await resolveBuildArtifactPath(root, policy.id), join(root, policy.path));
      assert.ok(!sandbox.some(item => item.path.endsWith(".md")));
      assert.equal(new Set(artifacts.map(item => item.path)).size, artifacts.length);
      await rm(join(root, policy.path));
      assert.ok(!(await readBuildWorkspace(root)).artifacts.some(item => item.id === "egress-policy"));
      await assert.rejects(resolveBuildArtifactPath(root, policy.id), /known Customize artifact/);
      await symlink(join(root, "config/document-policy.json"), join(root, policy.path));
      await assert.rejects(readBuildWorkspace(root), /not symlinks/);
    }, directory);
  }
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
    assert.equal(await documentDeploymentBlocker(root), null);
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

test("Build discovers and updates Fluent Headless web style presets across HTML and React web artifacts", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "unity-web-style-")));
  try {
    await mkdir(join(root, "src/web/src/app"), { recursive: true });
    await writeFile(join(root, "azure-app.yaml"), "capabilities:\n  web:\n    path: src/web\n");
    await writeFile(
      join(root, "src/web/index.html"),
      '<!doctype html><html lang="en" data-style="copilot" data-theme="light"><body><button type="button" data-style-choice="copilot" data-selected="true">Copilot</button><button type="button" data-style-choice="modern">Modern</button></body></html>\n',
    );
    await writeFile(
      join(root, "src/web/src/app/page.tsx"),
      'export default function Home() {\n  const [stylePreset, setStylePreset] = useState<StylePreset>("copilot");\n  return null;\n}\n',
    );
    await writeFile(join(root, "src/web/package.json"), '{"name":"web","private":true}\n');

    const initial = await readBuildWorkspace(root);
    const htmlArtifact = initial.artifacts.find((item) => item.path === "src/web/index.html");
    const reactArtifact = initial.artifacts.find((item) => item.path === "src/web/src/app/page.tsx");
    const pkgArtifact = initial.artifacts.find((item) => item.path === "src/web/package.json");

    assert.deepEqual(WEB_STYLE_PRESETS, ["copilot", "warm", "modern", "editorial", "minimal"]);
    assert.equal(htmlArtifact.stylePreset, "copilot");
    assert.equal(reactArtifact.stylePreset, "copilot");
    assert.equal("stylePreset" in pkgArtifact, false);

    const updatedHtml = await writeBuildWebStyle(root, htmlArtifact.id, "modern");
    assert.equal(updatedHtml.artifact.stylePreset, "modern");
    assert.match(updatedHtml.artifact.content, /<html lang="en" data-style="modern" data-theme="light">/);
    assert.match(updatedHtml.artifact.content, /<button type="button" data-style-choice="copilot">Copilot<\/button>/);
    assert.match(updatedHtml.artifact.content, /<button type="button" data-style-choice="modern" data-selected="true">Modern<\/button>/);

    const updatedReact = await writeBuildWebStyle(root, reactArtifact.id, "warm");
    assert.equal(updatedReact.artifact.stylePreset, "warm");
    assert.match(updatedReact.artifact.content, /useState<StylePreset>\("warm"\)/);

    await assert.rejects(writeBuildWebStyle(root, htmlArtifact.id, "neon"), /Choose a valid web style preset/);
    await assert.rejects(writeBuildWebStyle(root, pkgArtifact.id, "modern"), /does not declare a configurable Fluent Headless style preset/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Build exposes default Copilot style preset, maps legacy presets, and stamps data-style on unstamped web entry files", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "unity-web-legacy-")));
  try {
    await mkdir(join(root, "src/web/src/app"), { recursive: true });
    await writeFile(join(root, "azure-app.yaml"), "capabilities:\n  web:\n    path: src/web\n");
    await writeFile(join(root, "src/web/builder.yaml"), "version: 1\n");
    await writeFile(join(root, "src/web/index.html"), "<!doctype html><html lang=\"en\"><body><h1>App</h1></body></html>\n");
    await writeFile(
      join(root, "src/web/src/app/page.tsx"),
      "export default function Home() {\n  return <div className=\"min-h-screen\"><main>App</main></div>;\n}\n",
    );

    const initial = await readBuildWorkspace(root);
    const webArtifacts = initial.artifacts.filter((item) => item.blockCategory === "web");
    assert.equal(webArtifacts[0].path, "src/web/index.html");
    assert.equal(webArtifacts[0].stylePreset, "copilot");

    const reactArtifact = webArtifacts.find((item) => item.path === "src/web/src/app/page.tsx");
    assert.equal(reactArtifact.stylePreset, "copilot");

    const updatedHtml = await writeBuildWebStyle(root, webArtifacts[0].id, "minimal");
    assert.equal(updatedHtml.artifact.stylePreset, "minimal");
    assert.match(updatedHtml.artifact.content, /<html data-style="minimal" data-theme="light" lang="en">/);

    const updatedReact = await writeBuildWebStyle(root, reactArtifact.id, "editorial");
    assert.equal(updatedReact.artifact.stylePreset, "editorial");
    assert.match(updatedReact.artifact.content, /<div data-style="editorial" data-theme="light" className="min-h-screen">/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


