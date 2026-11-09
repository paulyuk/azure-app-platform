import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { runCommand } from "./discovery.mjs";
import { requestAppWorkspace } from "./workspace-actions.mjs";
import { applyPortSettings, readPortSettings } from "./local-ports.mjs";

const dealerEntries = [
  ["web", 3000], ["agent", 8088], ["inventory-search", 7071], ["trade-in-value", 7072],
  ["rate-sheet", 7073], ["deal-doc", 7074], ["azurite", 10000],
  ["azurite-queue", 10001], ["azurite-table", 10002],
].map(([name, port]) => ({ name, port }));

async function repository(t) {
  const directory = await mkdtemp(join(tmpdir(), "unity-auto-ports-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "source");
  await mkdir(root);
  const files = {
    "README.md": "Disposable pinned Dealer fixture",
    "src/agent/main.py": [
      "from azure.identity import DefaultAzureCredential",
      'LOCAL_SKILL_PORTS: dict[str, int] = {"inventory-search": 7071, "trade-in-value": 7072, "rate-sheet": 7073, "deal-doc": 7074}',
      "ResponsesHostServer(agent).run()",
    ].join("\n"),
    "src/web/package.json": '{"scripts":{"dev":"next dev"}}',
  };
  for (const script of ["dev-start.sh", "dev-start.ps1", "dev-stop.sh", "dev-stop.ps1"]) {
    files[`scripts/${script}`] = "Pinned legacy lifecycle fixture";
  }
  for (const skill of ["inventory-search", "trade-in-value", "rate-sheet", "deal-doc"]) {
    files[`src/skills/${skill}/local.settings.json.example`] = '{"IsEncrypted":false,"Values":{}}';
  }
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  for (const args of [
    ["init", "-q"], ["add", "."],
    ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Port allocation fixture"],
  ]) {
    const result = await runCommand("git", ["-C", root, ...args]);
    assert.equal(result.ok, true, result.stderr);
  }
  const commit = (await runCommand("git", ["-C", root, "rev-parse", "HEAD"])).stdout.trim();
  return { root, commit };
}

async function create(root, name, extra = {}) {
  return requestAppWorkspace({
    workspaceRoot: root,
    session: {},
    input: {
      appName: name, purpose: "Exercise automatic local ports", tierIds: ["agent"],
      templateRootId: "builtin-sandbox-gateway-minimal-v1", openInVsCode: false,
      ...extra.input,
    },
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== "input")),
  });
}

async function occupyAgentPort(t) {
  for (let port = 8088; port < 9088; port++) {
    const server = createServer();
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
      t.after(() => new Promise((resolve) => server.close(resolve)));
      return server;
    } catch (error) {
      if (error.code !== "EADDRINUSE" && error.code !== "EACCES") throw error;
    }
  }
  throw new Error("No disposable test port available.");
}

test("new apps avoid live and saved sibling ports before exposing the child session", async (t) => {
  const { root } = await repository(t);
  const listener = await occupyAgentPort(t);
  const first = await create(root, "first");
  const firstSettings = await readPortSettings(first.worktreePath);
  let sessionOpened = false;
  const stages = [];
  const second = await create(root, "second", {
    onProgress: message => stages.push(message),
    session: { rpc: { sessions: { open: async ({ options }) => {
      assert.deepEqual(stages, ["Creating app workspace...", "Preparing template files...", "Preparing local settings...", "Opening app session..."]);
      const settings = await readPortSettings(options.workingDirectory);
      assert.ok(settings.AGENT_PORT);
      assert.notEqual(settings.AGENT_PORT, firstSettings.AGENT_PORT);
      assert.notEqual(settings.AGENT_PORT, listener.address().port);
      sessionOpened = true;
      return { status: "created", sessionId: "fixture-child" };
    } } } },
  });
  assert.equal(sessionOpened, true);
  assert.equal(listener.listening, true);
  assert.notEqual(firstSettings.AGENT_PORT, listener.address().port);
  assert.deepEqual(await readPortSettings(first.worktreePath), firstSettings);
  assert.deepEqual(second.app.portSettings, await readPortSettings(second.worktreePath));
});

test("concurrent creation reserves different ports even before either app starts", async (t) => {
  const { root } = await repository(t);
  const apps = await Promise.all([create(root, "parallel"), create(root, "parallel")]);
  assert.notEqual(apps[0].branch, apps[1].branch);
  assert.notEqual(apps[0].app.portSettings.AGENT_PORT, apps[1].app.portSettings.AGENT_PORT);
});

test("separate Studio processes do not allocate the same port", async (t) => {
  const { root } = await repository(t);
  const module = new URL("./workspace-actions.mjs", import.meta.url).href;
  const script = `
    import { requestAppWorkspace } from ${JSON.stringify(module)};
    const app = await requestAppWorkspace({
      workspaceRoot: ${JSON.stringify(root)}, session: {},
      input: { appName: "parallel-process", purpose: "Verify independent allocators", tierIds: ["agent"],
        templateRootId: "builtin-sandbox-gateway-minimal-v1", openInVsCode: false }
    });
    console.log(JSON.stringify(app.app.portSettings));
  `;
  const results = await Promise.all([1, 2].map(() => runCommand(process.execPath, ["--input-type=module", "-e", script])));
  for (const result of results) assert.equal(result.ok, true, result.stderr);
  assert.notEqual(JSON.parse(results[0].stdout).AGENT_PORT, JSON.parse(results[1].stdout).AGENT_PORT);
});

test("Empty and pinned Dealer creation allocate every component and remap runtime metadata", async (t) => {
  const { root, commit } = await repository(t);
  const empty = await create(root, "empty", { input: { templateRootId: "builtin-empty-unity-v1" } });
  assert.deepEqual(Object.keys(empty.app.portSettings).sort(), ["AGENT_PORT", "SKILL_PORT", "WEB_PORT"]);
  const dealer = await create(root, "dealer", {
    input: { templateRootId: "fixture-dealer" },
    sourceCatalog: {
      roots: [{ id: "fixture", path: root, commit, implementations: [], repository: "https://example.invalid/fixture.git" }],
      templates: [{
        id: "fixture-dealer", sourceRootId: "fixture", capabilityIds: ["web", "agent", "skills"],
        startup: {
          startArgs: ["--skip-skills", "--skip-agent"], startPowerShellArgs: ["-SkipSkills", "-SkipAgent"],
          entrypoints: dealerEntries, startEntrypoints: [dealerEntries[0]],
          reservedPorts: dealerEntries.map((entry) => entry.port),
        },
      }],
    },
  });
  assert.equal(Object.keys(dealer.app.portSettings).length, 9);
  assert.equal(new Set(Object.values(dealer.app.portSettings)).size, 9);
  assert.ok(Object.values(dealer.app.portSettings).every((port) => !Object.values(empty.app.portSettings).includes(port)));
  const identity = JSON.parse(await readFile(join(dealer.worktreePath, ".azure-app-platform/app.json"), "utf8"));
  const profile = applyPortSettings(identity.runtime, dealer.app.portSettings);
  assert.equal(profile.startEntrypoints[0].port, dealer.app.portSettings.WEB_PORT);
  assert.equal(profile.entrypoints.find((entry) => entry.name === "azurite").port, dealer.app.portSettings.AZURITE_BLOB_PORT);
  assert.deepEqual(new Set(profile.reservedPorts), new Set(Object.values(dealer.app.portSettings)));
});

test("allocation failures abort creation before opening a session and roll back only the new worktree", async (t) => {
  const { root } = await repository(t);
  let opened = false;
  await assert.rejects(create(root, "failed", {
    session: { rpc: { sessions: { open: async () => { opened = true; } } } },
    commandRunner: async (command, args) => args.includes("worktree") && args.includes("list")
      ? { ok: false, stderr: "fixture listing failure" } : runCommand(command, args),
  }), /Could not inspect existing app port assignments/);
  assert.equal(opened, false);
  const listed = await runCommand("git", ["-C", root, "worktree", "list", "--porcelain"]);
  assert.equal((listed.stdout.match(/^worktree /gm) ?? []).length, 1);
  assert.equal(await readFile(join(root, "README.md"), "utf8"), "Disposable pinned Dealer fixture");
});
