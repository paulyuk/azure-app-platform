import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { traceApp } from "./app-map.mjs";
import { discoverRepository, runCommand } from "./discovery.mjs";
import { EMPTY_TEMPLATE, SANDBOX_GATEWAY_TEMPLATE, listSourceCatalog } from "./source-catalog.mjs";
import { materializeTemplate } from "./template-materializer.mjs";
import { requestAppWorkspace } from "./workspace-actions.mjs";

const inherited = {
  "src/web/package.json": '{"name":"driveline-web","dependencies":{"next":"*"}}',
  "src/skills/inventory-search/function_app.py": 'import azure.functions as func\napp = func.FunctionApp()\n@app.generic_trigger(arg_name="context", type="mcpToolTrigger")\ndef inventory(context): return []\n',
  "src/skills/inventory-search/host.json": '{"version":"2.0"}',
  "src/workflows/loan-approval/function_app.py": 'import azure.durable_functions as df\napp = df.DFApp()\n',
  "src/agent/pyproject.toml": '[project]\nname = "unity-deal-finder-agent"\nversion = "1.0.0"\n',
  "unrelated.txt": "Keep user edits",
};

async function withFixture(files, action) {
  const root = await mkdtemp(join(tmpdir(), "unity-app-scope-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), content);
    }
    return await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

for (const template of [SANDBOX_GATEWAY_TEMPLATE, EMPTY_TEMPLATE]) {
  test(`${template.name} scopes existing inherited sources to its declared capabilities`, async () => {
    await withFixture(inherited, async (root) => {
      await materializeTemplate({
        appName: "Document processor",
        purpose: "Process documents",
        templateInputs: { hostedSkillName: "document-lookup" },
        sourcePlan: { kind: "empty-template", templateId: template.id },
      }, { destination: root });
      const inventory = await discoverRepository(root);
      assert.deepEqual([...new Set(inventory.candidates.map((item) => item.tierId))].sort(),
        [...template.capabilityIds].sort());
      const graph = await traceApp({ root });
      const projects = graph.nodes.filter((node) => node.kind === "project");
      assert.equal(projects.length, template.capabilityIds.length);
      assert.equal(projects.some((node) => /inventory-search|loan-approval/.test(node.projectPath)), false);
      const graphText = JSON.stringify(graph);
      assert.doesNotMatch(graphText, /inventory-search|loan-approval/);
      if (template === SANDBOX_GATEWAY_TEMPLATE) {
        assert.doesNotMatch(graphText, /driveline-web|src\/web/);
        assert.deepEqual(projects.filter((node) => node.tierId === "sandbox").map((node) => node.projectPath),
          ["src/tools/document-validation"]);
      } else {
        assert.deepEqual(projects.filter((node) => node.tierId === "skills").map((node) => node.projectPath),
          ["src/skills/document-lookup"]);
      }
      assert.equal(await readFile(join(root, "unrelated.txt"), "utf8"), "Keep user edits");
      assert.equal(await readFile(join(root, "src/skills/inventory-search/function_app.py"), "utf8"),
        inherited["src/skills/inventory-search/function_app.py"]);
    });
  });
}

test("invalid declared capabilities surface diagnostics without falling back to inherited projects", async () => {
  await withFixture({
    ...inherited,
    "unity.app.yaml": "capabilities:\n  agent:\n    path: ../outside\n  sandbox:\n    path: missing\n  unknown:\n    path: src/web\n",
  }, async (root) => {
    const inventory = await discoverRepository(root);
    assert.deepEqual(inventory.candidates, []);
    assert.deepEqual(inventory.diagnostics.map((item) => item.code).sort(),
      ["empty-app-scope", "invalid-component-path", "invalid-unity-tier", "missing-component-path"]);
  });
});

test("root components inventory is scoped while repositories without a manifest still discover all sources", async () => {
  await withFixture(inherited, async (root) => {
    const generic = await discoverRepository(root);
    assert.equal(generic.componentPaths, null);
    assert.equal(generic.candidates.some((item) => item.tierId === "skills"), true);
    await writeFile(join(root, "unity.app.yaml"), 'components:\n  - tier: agent\n    path: "src/agent"\n');
    const scoped = await discoverRepository(root);
    assert.deepEqual(scoped.candidates.map((item) => item.tierId), ["agent"]);
  });
});

test("fresh template worktrees contain only template sources and headless apps remain in Open app", async () => {
  await withFixture(Object.fromEntries(Object.entries(inherited).map(([path, text]) => [`source/${path}`, text])), async (root) => {
    const source = join(root, "source");
    async function git(...args) {
      const result = await runCommand("git", ["-C", source, ...args]);
      assert.equal(result.ok, true, result.stderr);
      return result;
    }
    await git("init", "-b", "main");
    await git("add", ".");
    await git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
      "-c", "commit.gpgsign=false", "commit", "-m", "Template source fixture");
    const result = await requestAppWorkspace({
      session: {},
      workspaceRoot: source,
      sourceCatalog: { roots: [], templates: [SANDBOX_GATEWAY_TEMPLATE] },
      input: {
        appName: "Document processor",
        purpose: "Process documents",
        templateRootId: SANDBOX_GATEWAY_TEMPLATE.id,
        tierIds: SANDBOX_GATEWAY_TEMPLATE.capabilityIds,
        openInVsCode: false,
      },
    });
    assert.equal(result.outcome, "workspace-created");
    assert.deepEqual((await readdir(join(result.worktreePath, "src"))).sort(), ["agent", "policy", "tools"]);
    assert.doesNotMatch(await readFile(join(result.worktreePath, "src/agent/pyproject.toml"), "utf8"), /unity-deal-finder/);
    const ignored = await runCommand("git", ["-C", result.worktreePath, "check-ignore", "--no-index",
      "src/agent/.env", "src/agent/.venv/cache", ".dev-run/stdout.log", ".unity-studio/gateway.json"]);
    assert.equal(ignored.ok, true, ignored.stderr);
    assert.equal(ignored.stdout.trim().split(/\r?\n/).length, 4);
    const catalog = await listSourceCatalog({ workspaceRoot: source });
    const app = catalog.apps.find((item) => item.name === "Document processor");
    assert.ok(app);
    assert.deepEqual([...app.capabilityIds].sort(), ["agent", "gateway", "sandbox"]);
    assert.equal(app.runnableSample, false);
    assert.equal(await readFile(join(source, "unrelated.txt"), "utf8"), "Keep user edits");
  });
});
