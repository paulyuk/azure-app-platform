import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { prepareDealerPortOverrides } from "./dealer-port-materializer.mjs";
import { portOverrideSupport } from "./local-ports.mjs";

const execFileAsync = promisify(execFile);
const FIXTURE_PREFIX = fileURLToPath(new URL("./.dealer-port-test-", import.meta.url));
const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SKILLS = ["inventory-search", "trade-in-value", "rate-sheet", "deal-doc"];
const DEALER_ENTRYPOINTS = [
  ["web", 3000],
  ["agent", 8088],
  ["inventory-search", 7071],
  ["trade-in-value", 7072],
  ["rate-sheet", 7073],
  ["deal-doc", 7074],
  ["azurite", 10000],
  ["azurite-queue", 10001],
  ["azurite-table", 10002],
].map(([name, port]) => ({ name, port }));

const PINNED_AGENT = `import os
from azure.identity import DefaultAzureCredential

LOCAL_SKILL_PORTS: dict[str, int] = {
    "inventory-search": 7071,
    "trade-in-value": 7072,
    "rate-sheet": 7073,
    "deal-doc": 7074,
}

def main():
    agent = build_agent()
    logger.info("Agent built. Starting Responses host server on http://127.0.0.1:8088 ...")
    ResponsesHostServer(agent).run()
`;

async function makeDealerFixture(t, agentSource = PINNED_AGENT) {
  const root = await mkdtemp(FIXTURE_PREFIX);
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    mkdir(join(root, "scripts"), { recursive: true }),
    mkdir(join(root, "src", "agent"), { recursive: true }),
    mkdir(join(root, "src", "web"), { recursive: true }),
    ...SKILLS.map((skill) => mkdir(join(root, "src", "skills", skill), { recursive: true })),
  ]);
  await Promise.all([
    ...["dev-start.sh", "dev-stop.sh", "dev-start.ps1", "dev-stop.ps1"]
      .map((file) => writeFile(join(root, "scripts", file), `old ${file}\n`)),
    cp(
      fileURLToPath(new URL("./templates/shared/load-ports.sh", import.meta.url)),
      join(root, "scripts", "load-ports.sh"),
    ),
    cp(
      fileURLToPath(new URL("./templates/shared/load-ports.ps1", import.meta.url)),
      join(root, "scripts", "load-ports.ps1"),
    ),
    writeFile(join(root, "src", "agent", "main.py"), agentSource),
    writeFile(join(root, "src", "web", "package.json"), "{}\n"),
    ...SKILLS.map((skill) => writeFile(
      join(root, "src", "skills", skill, "local.settings.json.example"),
      '{"Values":{"AzureWebJobsStorage":"UseDevelopmentStorage=true"}}\n',
    )),
  ]);
  return root;
}

async function allocatePorts(count) {
  const servers = [];
  const ports = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const server = (await import("node:net")).createServer();
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      servers.push(server);
      ports.push(server.address().port);
    }
  } finally {
    await Promise.all(servers.map((server) =>
      new Promise((resolve) => server.close(resolve))));
  }
  return ports;
}

function assertDealerEndpointSummary(output, ports) {
  assert.match(output, new RegExp(`azurite\\s+http://127\\.0\\.0\\.1:${ports.blob}\\b`));
  assert.match(output, new RegExp(`azurite-queue\\s+http://127\\.0\\.0\\.1:${ports.queue}\\b`));
  assert.match(output, new RegExp(`azurite-table\\s+http://127\\.0\\.0\\.1:${ports.table}\\b`));
  assert.match(output, new RegExp(`inventory-search\\s+http://localhost:${ports.inventory}/runtime/webhooks/mcp`));
  assert.match(output, new RegExp(`trade-in-value\\s+http://localhost:${ports.tradeIn}/runtime/webhooks/mcp`));
  assert.match(output, new RegExp(`rate-sheet\\s+http://localhost:${ports.rate}/runtime/webhooks/mcp`));
  assert.match(output, new RegExp(`deal-doc\\s+http://localhost:${ports.dealDoc}/runtime/webhooks/mcp`));
  assert.match(output, new RegExp(`agent\\s+http://127\\.0\\.0\\.1:${ports.agent}/responses`));
  assert.match(output, new RegExp(`web\\s+http://localhost:${ports.web}\\b`));
}

test("retrofit replaces lifecycle scripts and narrowly adapts the pinned Dealer agent", async (t) => {
  const root = await makeDealerFixture(t);
  const result = await prepareDealerPortOverrides(root);

  assert.equal(result.kind, "dealer-port-overrides");
  assert.equal(result.adaptedAgent, true);
  assert.deepEqual(result.copiedFiles, [
    "scripts/dev-start.sh",
    "scripts/dev-stop.sh",
    "scripts/dev-start.ps1",
    "scripts/dev-stop.ps1",
    "src/agent/local_ports.py",
  ]);

  const agent = await readFile(join(root, "src", "agent", "main.py"), "utf8");
  assert.match(agent, /from local_ports import agent_listen_port, agent_port_override, local_skill_ports/);
  assert.match(agent, /LOCAL_SKILL_PORTS = local_skill_ports\(\)/);
  assert.match(agent, /ResponsesHostServer\(agent\)\.run\(port=agent_port_override\(\)\)/);
  assert.doesNotMatch(agent, /"inventory-search": 7071/);
  assert.equal(
    await readFile(join(root, ".gitignore"), "utf8"),
    ".azure-app-platform/\n.dev-run/\n",
  );

  const posixStart = await readFile(join(root, "scripts", "dev-start.sh"), "utf8");
  const powershellStart = await readFile(join(root, "scripts", "dev-start.ps1"), "utf8");
  const posixStop = await readFile(join(root, "scripts", "dev-stop.sh"), "utf8");
  const powershellStop = await readFile(join(root, "scripts", "dev-stop.ps1"), "utf8");
  assert.match(posixStart, /AZURITE_CONNECTION_STRING=/);
  assert.match(posixStart, /--blobPort "\$AZURITE_BLOB_PORT"/);
  assert.match(posixStart, /AGENT_URL="http:\/\/127\.0\.0\.1:\$AGENT_PORT"/);
  assert.match(powershellStart, /AzureWebJobsStorage = \$storageConnectionString/);
  assert.match(powershellStart, /'--blobPort', "\$AzuriteBlobPort"/);
  assert.match(powershellStart, /'--queuePort', "\$AzuriteQueuePort"/);
  assert.match(powershellStart, /'--tablePort', "\$AzuriteTablePort"/);
  assert.match(powershellStart, /'inventory-search'\s*=\s*\$InventorySearchPort/);
  assert.match(powershellStart, /'trade-in-value'\s*=\s*\$TradeInValuePort/);
  assert.match(powershellStart, /'rate-sheet'\s*=\s*\$RateSheetPort/);
  assert.match(powershellStart, /'deal-doc'\s*=\s*\$DealDocPort/);
  assert.match(powershellStart, /-ArgumentList @\('run', 'main\.py'\) -Port \$AgentPort/);
  assert.match(powershellStart, /SetEnvironmentVariable\('AGENT_URL', "http:\/\/127\.0\.0\.1:\$AgentPort"/);
  assert.match(powershellStart, /'--port', "\$WebPort"/);
  assert.doesNotMatch(posixStop, /\blsof\b|\bfuser\b/);
  assert.doesNotMatch(powershellStop, /Get-NetTCPConnection/);

  const second = await prepareDealerPortOverrides(root);
  assert.equal(second.adaptedAgent, false);
  assert.equal(
    await readFile(join(root, ".gitignore"), "utf8"),
    ".azure-app-platform/\n.dev-run/\n",
  );
});

test("repository Dealer wrappers advertise the complete shared port contract", async () => {
  assert.equal(await portOverrideSupport(REPOSITORY_ROOT, DEALER_ENTRYPOINTS), true);
});

test("retrofit rejects an unknown Dealer layout before replacing scripts", async (t) => {
  const root = await makeDealerFixture(t, "print('unknown layout')\n");
  const original = await readFile(join(root, "scripts", "dev-start.sh"), "utf8");

  await assert.rejects(
    prepareDealerPortOverrides(root),
    /Unsupported Dealer agent layout/,
  );
  assert.equal(await readFile(join(root, "scripts", "dev-start.sh"), "utf8"), original);
});

test("retrofit preserves existing ignores and appends only missing runtime rules", async (t) => {
  const root = await makeDealerFixture(t);
  const original = [
    "# Existing Dealer ignores",
    ".azure/",
    "/.dev-run/",
    "**/.venv/",
    "",
  ].join("\n");
  await writeFile(join(root, ".gitignore"), original);

  await prepareDealerPortOverrides(root);
  const once = await readFile(join(root, ".gitignore"), "utf8");
  assert.equal(once, `${original}.azure-app-platform/\n`);

  await prepareDealerPortOverrides(root);
  assert.equal(await readFile(join(root, ".gitignore"), "utf8"), once);
});

test("retrofit preserves non-missing filesystem failures", {
  skip: process.platform === "win32",
}, async (t) => {
  const root = await mkdtemp(FIXTURE_PREFIX);
  t.after(() => rm(root, { recursive: true, force: true }));
  const destinationFile = join(root, "not-a-directory");
  await writeFile(destinationFile, "not a directory\n");

  await assert.rejects(
    prepareDealerPortOverrides(destinationFile),
    (error) => {
      assert.equal(error.code, "ENOTDIR");
      assert.doesNotMatch(error.message, /required path is missing/);
      return true;
    },
  );
});

test("retrofit supports the earlier pinned direct build_agent launch shape", async (t) => {
  const root = await makeDealerFixture(
    t,
    PINNED_AGENT.replace(
      [
        "    agent = build_agent()",
        '    logger.info("Agent built. Starting Responses host server on http://127.0.0.1:8088 ...")',
        "    ResponsesHostServer(agent).run()",
      ].join("\n"),
      "    ResponsesHostServer(build_agent()).run()",
    ),
  );

  await prepareDealerPortOverrides(root);
  const agent = await readFile(join(root, "src", "agent", "main.py"), "utf8");
  assert.match(
    agent,
    /ResponsesHostServer\(build_agent\(\)\)\.run\(port=agent_port_override\(\)\)/,
  );
});

test("retrofitted launchers load every allocated port without starting apps", async (t) => {
  const root = await makeDealerFixture(t);
  await prepareDealerPortOverrides(root);
  await mkdir(join(root, ".azure-app-platform"));
  await writeFile(join(root, ".azure-app-platform", "ports.env"), [
    "WEB_PORT=13000",
    "AGENT_PORT=18088",
    "INVENTORY_SEARCH_PORT=17071",
    "TRADE_IN_VALUE_PORT=17072",
    "RATE_SHEET_PORT=17073",
    "DEAL_DOC_PORT=17074",
    "AZURITE_BLOB_PORT=11000",
    "AZURITE_QUEUE_PORT=11001",
    "AZURITE_TABLE_PORT=11002",
    "",
  ].join("\n"));
  const selectedPorts = {
    web: 13000,
    agent: 18088,
    inventory: 17071,
    tradeIn: 17072,
    rate: 17073,
    dealDoc: 17074,
    blob: 11000,
    queue: 11001,
    table: 11002,
  };

  const env = {
    ...process.env,
    UV_INDEX_URL: "https://packagefeedproxy.microsoft.io/pypi/simple/",
    UV_DEFAULT_INDEX: "https://packagefeedproxy.microsoft.io/pypi/simple/",
  };
  const posix = await execFileAsync(join(root, "scripts", "dev-start.sh"), [
    "--keep-existing", "--skip-skills", "--skip-agent", "--skip-web",
  ], { cwd: root, env });
  assertDealerEndpointSummary(posix.stdout, selectedPorts);

  const powershell = await execFileAsync("pwsh", [
    "-NoProfile",
    "-NonInteractive",
    "-File",
    join(root, "scripts", "dev-start.ps1"),
    "-KeepExisting",
    "-SkipSkills",
    "-SkipAgent",
    "-SkipWeb",
  ], { cwd: root, env });
  assertDealerEndpointSummary(powershell.stdout, selectedPorts);
  assert.deepEqual(
    JSON.parse(await readFile(join(root, ".dev-run", "processes.json"), "utf8")),
    [],
  );
});

test("POSIX launcher wires allocated ports through every Dealer process", async (t) => {
  const root = await makeDealerFixture(t);
  await prepareDealerPortOverrides(root);
  await mkdir(join(root, ".azure-app-platform"));
  await mkdir(join(root, "bin"));
  await writeFile(join(root, "src", "agent", ".env"), [
    "AZURE_AI_GATEWAY_ENDPOINT=https://gateway.example",
    "AZURE_AI_GATEWAY_API_KEY=test-key",
    "",
  ].join("\n"));

  const ports = await allocatePorts(9);
  const [
    webPort, agentPort, inventoryPort, tradeInPort, ratePort, dealDocPort,
    blobPort, queuePort, tablePort,
  ] = ports;
  await writeFile(join(root, ".azure-app-platform", "ports.env"), [
    `WEB_PORT=${webPort}`,
    `AGENT_PORT=${agentPort}`,
    `INVENTORY_SEARCH_PORT=${inventoryPort}`,
    `TRADE_IN_VALUE_PORT=${tradeInPort}`,
    `RATE_SHEET_PORT=${ratePort}`,
    `DEAL_DOC_PORT=${dealDocPort}`,
    `AZURITE_BLOB_PORT=${blobPort}`,
    `AZURITE_QUEUE_PORT=${queuePort}`,
    `AZURITE_TABLE_PORT=${tablePort}`,
    "",
  ].join("\n"));

  await writeFile(join(root, "bin", "server.mjs"), [
    'import { createServer } from "node:net";',
    "for (const port of process.argv.slice(2).map(Number)) {",
    '  createServer(() => {}).listen(port, "127.0.0.1");',
    "}",
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"));
  await writeFile(join(root, "bin", "azurite"), `#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
blob= queue= table=
while (($#)); do
  case "$1" in
    --blobPort) blob="$2"; shift 2 ;;
    --queuePort) queue="$2"; shift 2 ;;
    --tablePort) table="$2"; shift 2 ;;
    *) shift ;;
  esac
done
exec node "$SCRIPT_DIR/server.mjs" "$blob" "$queue" "$table"
`);
  await writeFile(join(root, "bin", "uv"), `#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ "$1" == "run" && "$2" == "func" ]]; then
  exec node "$SCRIPT_DIR/server.mjs" "$5"
fi
if [[ "$1" == "run" && "$2" == "main.py" ]]; then
  printf 'agent=%s inventory=%s trade=%s rate=%s deal=%s\\n' \
    "$AGENT_PORT" "$INVENTORY_SEARCH_PORT" "$TRADE_IN_VALUE_PORT" "$RATE_SHEET_PORT" "$DEAL_DOC_PORT"
  exec node "$SCRIPT_DIR/server.mjs" "$AGENT_PORT"
fi
exit 2
`);
  await writeFile(join(root, "bin", "npm"), `#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ "$1" == "install" ]]; then exit 0; fi
port="\${!#}"
printf 'agent_url=%s web=%s\\n' "$AGENT_URL" "$port"
exec node "$SCRIPT_DIR/server.mjs" "$port"
`);
  await Promise.all(["azurite", "uv", "npm"].map((file) => chmod(join(root, "bin", file), 0o755)));

  const env = {
    ...process.env,
    PATH: `${join(root, "bin")}:${process.env.PATH}`,
    UV_INDEX_URL: "https://packagefeedproxy.microsoft.io/pypi/simple/",
    UV_DEFAULT_INDEX: "https://packagefeedproxy.microsoft.io/pypi/simple/",
  };
  try {
    const started = await execFileAsync(join(root, "scripts", "dev-start.sh"), ["--keep-existing"], {
      cwd: root,
      env,
      timeout: 30_000,
    });
    assert.match(started.stdout, new RegExp(`agent\\s+port ${agentPort}`));
    assert.match(started.stdout, new RegExp(`web\\s+port ${webPort}`));
    assert.match(
      await readFile(join(root, ".dev-run", "logs", "agent.out.log"), "utf8"),
      new RegExp(`agent=${agentPort} inventory=${inventoryPort} trade=${tradeInPort} rate=${ratePort} deal=${dealDocPort}`),
    );
    assert.match(
      await readFile(join(root, ".dev-run", "logs", "web.out.log"), "utf8"),
      new RegExp(`agent_url=http://127\\.0\\.0\\.1:${agentPort} web=${webPort}`),
    );
    const registry = (await readFile(
      join(root, ".dev-run", "processes.posix.tsv"),
      "utf8",
    )).trim().split("\n").map((line) => {
      const [name, port] = line.split("\t");
      return [name, Number(port)];
    });
    assert.deepEqual(registry, [
      ["azurite", blobPort],
      ["azurite-queue", queuePort],
      ["azurite-table", tablePort],
      ["inventory-search", inventoryPort],
      ["trade-in-value", tradeInPort],
      ["rate-sheet", ratePort],
      ["deal-doc", dealDocPort],
      ["agent", agentPort],
      ["web", webPort],
    ]);
    for (const skill of SKILLS) {
      const settings = JSON.parse(await readFile(
        join(root, "src", "skills", skill, "local.settings.json"),
        "utf8",
      ));
      assert.match(settings.Values.AzureWebJobsStorage, new RegExp(`BlobEndpoint=http://127\\.0\\.0\\.1:${blobPort}/`));
      assert.match(settings.Values.AzureWebJobsStorage, new RegExp(`QueueEndpoint=http://127\\.0\\.0\\.1:${queuePort}/`));
      assert.match(settings.Values.AzureWebJobsStorage, new RegExp(`TableEndpoint=http://127\\.0\\.0\\.1:${tablePort}/`));
      assert.notEqual(settings.Values.AzureWebJobsStorage, "UseDevelopmentStorage=true");
    }
  } finally {
    await execFileAsync(join(root, "scripts", "dev-stop.sh"), [], { cwd: root, env });
  }
});

test("POSIX stop terminates only the process recorded by this fixture", async (t) => {
  const root = await makeDealerFixture(t);
  await prepareDealerPortOverrides(root);
  await mkdir(join(root, ".dev-run"), { recursive: true });

  const owned = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { stdio: "ignore" },
  );
  const unrelated = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { stdio: "ignore" },
  );
  const ownedExit = once(owned, "exit");
  t.after(() => {
    if (owned.exitCode === null) owned.kill("SIGKILL");
    if (unrelated.exitCode === null) unrelated.kill("SIGKILL");
  });
  await writeFile(
    join(root, ".dev-run", "processes.posix.tsv"),
    `agent\t18088\t${owned.pid}\n`,
  );

  await execFileAsync(join(root, "scripts", "dev-stop.sh"), [], { cwd: root });
  await ownedExit;
  assert.ok(owned.exitCode !== null || owned.signalCode !== null);
  assert.equal(unrelated.exitCode, null);
});

test("POSIX start refuses an untracked listener without stopping it", async (t) => {
  const root = await makeDealerFixture(t);
  await prepareDealerPortOverrides(root);
  await mkdir(join(root, ".azure-app-platform"));
  await mkdir(join(root, "bin"));
  const listener = (await import("node:net")).createServer((socket) => socket.destroy());
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => listener.close(resolve)));
  const port = listener.address().port;
  const remaining = (await allocatePorts(8)).filter((candidate) => candidate !== port);
  while (remaining.length < 8) {
    remaining.push(...(await allocatePorts(8 - remaining.length))
      .filter((candidate) => candidate !== port && !remaining.includes(candidate)));
  }
  await writeFile(join(root, ".azure-app-platform", "ports.env"), [
    `WEB_PORT=${port}`,
    `AGENT_PORT=${remaining[0]}`,
    `INVENTORY_SEARCH_PORT=${remaining[1]}`,
    `TRADE_IN_VALUE_PORT=${remaining[2]}`,
    `RATE_SHEET_PORT=${remaining[3]}`,
    `DEAL_DOC_PORT=${remaining[4]}`,
    `AZURITE_BLOB_PORT=${remaining[5]}`,
    `AZURITE_QUEUE_PORT=${remaining[6]}`,
    `AZURITE_TABLE_PORT=${remaining[7]}`,
    "",
  ].join("\n"));
  await writeFile(join(root, "bin", "npm"), "#!/usr/bin/env bash\nexit 0\n");
  await chmod(join(root, "bin", "npm"), 0o755);

  await assert.rejects(
    execFileAsync(join(root, "scripts", "dev-start.sh"), [
      "--keep-existing", "--skip-skills", "--skip-agent",
    ], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${join(root, "bin")}:${process.env.PATH}`,
        UV_INDEX_URL: "https://packagefeedproxy.microsoft.io/pypi/simple/",
        UV_DEFAULT_INDEX: "https://packagefeedproxy.microsoft.io/pypi/simple/",
      },
    }),
    /owned by an untracked process/,
  );
  assert.equal(listener.listening, true);
});
