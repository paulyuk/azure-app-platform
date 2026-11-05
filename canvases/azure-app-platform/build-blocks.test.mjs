import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BUILD_BLOCK_TEMPLATES, createdBuildBlock, requestBuildAdjustment } from "./build-blocks.mjs";
import { materializeBuildBlock } from "./template-materializer.mjs";
import { readBuildWorkspace, resolveBuildArtifactPath } from "./build-workspace.mjs";
import { parseUnityManifest } from "./discovery.mjs";

async function fixture(action) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "build-blocks-")));
  try { await action(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

for (const template of BUILD_BLOCK_TEMPLATES) {
  test(`${template.name} materializes saved, discoverable files without overwriting existing blocks`, () => fixture(async root => {
    const block = await materializeBuildBlock({ root, templateId: template.id, name: "new-block" });
    const result = await createdBuildBlock(root, block.projectPath, block.entry);
    assert.ok(result.paths.includes(`${block.projectPath}/${block.entry}`));
    const file = await resolveBuildArtifactPath(root, result.artifactId);
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, /__(?:SKILL|BLOCK)_NAME__/);
    const artifact = (await readBuildWorkspace(root)).artifacts.find(item => item.id === result.artifactId);
    assert.equal(artifact.blockTemplateId, template.id);
    assert.equal(artifact.blockCategory, template.id.endsWith("-trigger") ? "triggers" : template.tierId);
    await assert.rejects(materializeBuildBlock({ root, templateId: template.id, name: "new-block" }), /already exists/);
    assert.equal(await readFile(file, "utf8"), content);
    if (template.id === "hosted-skill") {
      assert.match(content, /status_code=501/);
      assert.match(await readFile(join(root, block.projectPath, "pyproject.toml"), "utf8"), /azure-functions/);
    }
    if (template.id === "agent-instructions") {
      assert.equal(JSON.parse(await readFile(join(root, block.projectPath, "runtime.json"), "utf8")).status, "not_configured");
      assert.ok(result.paths.includes(`${block.projectPath}/agent.yaml`));
      assert.ok(result.paths.includes(`${block.projectPath}/runtime.json`));
    }
    if (template.id.endsWith("-trigger") || template.id === "orchestration") {
      const dependencies = await readFile(join(root, block.projectPath, "pyproject.toml"), "utf8");
      const requirements = await readFile(join(root, block.projectPath, "requirements.txt"), "utf8");
      for (const dependency of requirements.trim().split("\n")) assert.ok(dependencies.includes(dependency));
      assert.equal(JSON.parse(await readFile(join(root, block.projectPath, "host.json"), "utf8")).version, "2.0");
      assert.match(content, /status_code=501|raise NotImplementedError/);
    }
  }));
}

test("the complete creation catalog stays scoped and discoverable in one app inventory", () => fixture(async root => {
  await writeFile(join(root, "azure-app.yaml"), "name: all-blocks\ncomponents:\n");
  for (const template of BUILD_BLOCK_TEMPLATES) {
    const block = await materializeBuildBlock({ root, templateId: template.id, name: template.id });
    const { artifactId } = await createdBuildBlock(root, block.projectPath, block.entry);
    const state = await readBuildWorkspace(root);
    const artifact = state.artifacts.find(item => item.id === artifactId);
    assert.equal(artifact.projectPath, block.projectPath);
    assert.equal(artifact.blockTemplateId, template.id);
  }
  const state = await readBuildWorkspace(root);
  assert.equal(new Set(state.artifacts.map(item => item.path)).size, state.artifacts.length);
  assert.ok(state.artifacts.every(item => item.available));
  assert.equal(state.artifacts.find(item => item.path === "azure-app.yaml").blockCategory, "application");
  assert.equal(parseUnityManifest({ content: await readFile(join(root, "azure-app.yaml"), "utf8") }).length, BUILD_BLOCK_TEMPLATES.length);
}));

test("adding several blocks preserves scoped source and inventory metadata in both manifest formats", () => fixture(async root => {
  await mkdir(join(root, "services", "existing"), { recursive: true });
  await writeFile(join(root, "services", "existing", "agent.yaml"), "name: existing\nkind: hosted\n");
  await writeFile(join(root, "services", "existing", "prompts.md"), "existing");
  for (const section of [
    "capabilities:\r\n  agent:\r\n    path: services/existing\r\n    links: [gateway]\r\n",
    "components:\n  - tier: agent\n    path: services/existing\n    links: [gateway]\n",
  ]) {
    await writeFile(join(root, "azure-app.yaml"), "name: retained\n" + section + "metadata:\n  keep: true\n");
    const name = section.startsWith("capabilities") ? "first" : "second";
    await materializeBuildBlock({ root, templateId: "hosted-skill", name });
    await materializeBuildBlock({ root, templateId: "agent-instructions", name });
    const manifest = await readFile(join(root, "azure-app.yaml"), "utf8");
    assert.match(manifest, /links: \[gateway\]/);
    assert.match(manifest, /metadata:\r?\n  keep: true/);
    assert.deepEqual(parseUnityManifest({ content: manifest }).map(({ tierId, path }) => [tierId, path]), [
      ["agent", "services/existing"], ["skills", `src/skills/${name}`], ["agent", `src/agents/${name}`],
    ]);
    const state = await readBuildWorkspace(root);
    assert.ok(state.artifacts.some(item => item.path === "services/existing/agent.yaml"));
    assert.ok(state.artifacts.some(item => item.path === `src/skills/${name}/function_app.py`));
    assert.ok(state.artifacts.some(item => item.path === `src/agents/${name}/prompts/system.md`));
  }
}));

test("new blocks remain discoverable alongside document-specific artifacts", () => fixture(async root => {
  await mkdir(join(root, "src/tools/document-validation"), { recursive: true });
  await writeFile(join(root, "src/tools/document-validation/main.py"), "print('document')\n");
  const block = await materializeBuildBlock({ root, templateId: "hosted-skill", name: "lookup" });
  const result = await createdBuildBlock(root, block.projectPath, block.entry);
  const state = await readBuildWorkspace(root);
  assert.equal(state.supportsDocuments, true);
  assert.ok(state.artifacts.some(item => item.id === "tool"));
  assert.ok(state.artifacts.some(item => item.id === result.artifactId));
}));

test("the first block can be added to an empty block-style app inventory", () => fixture(async root => {
  await writeFile(join(root, "azure-app.yaml"), "name: empty\ncomponents:\n");
  const block = await materializeBuildBlock({ root, templateId: "hosted-skill", name: "first" });
  assert.ok((await createdBuildBlock(root, block.projectPath, block.entry)).artifactId);
}));

test("templates reject unsafe names, symlinked parents, invalid inventories, and unknown templates before writing files", () => fixture(async root => {
  for (const name of ["../outside", "/absolute", "Uppercase", "", "a/b", "a".repeat(41)]) {
    await assert.rejects(materializeBuildBlock({ root, templateId: "hosted-skill", name }), /Invalid block name/);
  }
  await assert.rejects(materializeBuildBlock({ root, templateId: "unknown", name: "new" }), /supported/);
  await mkdir(join(root, "elsewhere"));
  await symlink(join(root, "elsewhere"), join(root, "src"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(materializeBuildBlock({ root, templateId: "hosted-skill", name: "new" }), /symlink/);
  await rm(join(root, "src"));
  await writeFile(join(root, "azure-app.yaml"), "capabilities: {}\n");
  await assert.rejects(materializeBuildBlock({ root, templateId: "hosted-skill", name: "new" }), /block-style/);
  await assert.rejects(access(join(root, "src/skills/new")), { code: "ENOENT" });
}));

test("AI adjustments resolve allowlisted source and send the scoped request to the app session", () => fixture(async root => {
  const block = await materializeBuildBlock({ root, templateId: "hosted-skill", name: "lookup" });
  const { artifactId } = await createdBuildBlock(root, block.projectPath, block.entry);
  const messages = [];
  const session = { send: async message => { messages.push(message); return "message-1"; } };
  await assert.rejects(requestBuildAdjustment({ session, root, id: "../outside", instructions: "Change it." }), /known Customize artifact/);
  await assert.rejects(requestBuildAdjustment({ session, root, id: artifactId, instructions: " " }), /Describe/);
  assert.equal(messages.length, 0);
  const result = await requestBuildAdjustment({ session, root, id: artifactId, instructions: "Add input validation.", targetSessionId: "app-session" });
  assert.equal(result.outcome, "adjustment-requested");
  assert.match(messages[0].prompt, /src\/skills\/lookup\/function_app.py/);
  assert.match(messages[0].prompt, /app-session/);
  assert.match(messages[0].prompt, /Add input validation/);
  assert.match(messages[0].prompt, /Do not deploy/);
  assert.match(messages[0].prompt, /azure-app-platform-hosted-skill/);
  assert.match(messages[0].prompt, /malformed JSON/);
  assert.match(messages[0].prompt, /uv run/);
  assert.doesNotMatch(messages[0].prompt, /# Author an Agent instructions block/);
}));

test("each block template registers and carries its shipped authoring skill into AI requests", () => fixture(async root => {
  const manifest = JSON.parse(await readFile(new URL("./.github/plugin/plugin.json", import.meta.url), "utf8"));
  for (const template of BUILD_BLOCK_TEMPLATES) {
    assert.ok(manifest.skills.includes(`./skills/${template.authoringSkill}/`));
    const skill = await readFile(new URL(`./skills/${template.authoringSkill}/SKILL.md`, import.meta.url), "utf8");
    assert.match(skill, new RegExp(`name: ${template.authoringSkill}`));
    const block = await materializeBuildBlock({ root, templateId: template.id, name: template.id });
    const { artifactId } = await createdBuildBlock(root, block.projectPath, block.entry);
    let prompt;
    await requestBuildAdjustment({
      session: { send: async (message) => { prompt = message.prompt; return "sent"; } },
      root, id: artifactId, instructions: "Adapt the base to the requested operation.", targetSessionId: "app-session",
    });
    assert.ok(prompt.includes(skill), "The receiving app session gets the actual skill, not an inaccessible plugin path");
    assert.match(prompt, /carry it with the request/);
  }
}));
