import { chmod, lstat, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ASSET_ROOT = fileURLToPath(new URL("./templates/shared/dealer", import.meta.url));
const SCRIPT_FILES = [
  "scripts/dev-start.sh",
  "scripts/dev-stop.sh",
  "scripts/dev-start.ps1",
  "scripts/dev-stop.ps1",
];
const REQUIRED_DEALER_PATHS = [
  ...SCRIPT_FILES,
  "scripts/load-ports.sh",
  "scripts/load-ports.ps1",
  "src/agent/main.py",
  "src/web/package.json",
  "src/skills/inventory-search/local.settings.json.example",
  "src/skills/trade-in-value/local.settings.json.example",
  "src/skills/rate-sheet/local.settings.json.example",
  "src/skills/deal-doc/local.settings.json.example",
];
const RUNTIME_IGNORE_RULES = [".azure-app-platform/", ".dev-run/"];
const PORT_IMPORT = "from local_ports import agent_listen_port, agent_port_override, local_skill_ports";

function adaptAgentSource(source) {
  const alreadyAdapted = source.includes(PORT_IMPORT)
    && /LOCAL_SKILL_PORTS(?:\s*:\s*dict\[str,\s*int\])?\s*=\s*local_skill_ports\(\)/.test(source)
    && /ResponsesHostServer\((?:agent|build_agent\(\))\)\.run\(port=agent_port_override\(\)\)/.test(source);
  if (alreadyAdapted) {
    return source;
  }
  if (source.includes("from local_ports import")) {
    throw new Error("Unsupported Dealer agent layout: an unknown local_ports integration is already present.");
  }

  const importAnchor = "from azure.identity import DefaultAzureCredential";
  if (!source.includes(importAnchor)) {
    throw new Error("Unsupported Dealer agent layout: Azure identity import anchor was not found.");
  }

  const skillPorts = /LOCAL_SKILL_PORTS\s*:\s*dict\[str,\s*int\]\s*=\s*\{\s*["']inventory-search["']\s*:\s*7071,\s*["']trade-in-value["']\s*:\s*7072,\s*["']rate-sheet["']\s*:\s*7073,\s*["']deal-doc["']\s*:\s*7074,?\s*\}/m;
  if (!skillPorts.test(source)) {
    throw new Error("Unsupported Dealer agent layout: the known four-skill port map was not found.");
  }

  const hostRun = /ResponsesHostServer\((agent|build_agent\(\))\)\.run\(\)/;
  if (!hostRun.test(source)) {
    throw new Error("Unsupported Dealer agent layout: the ResponsesHostServer launch call was not found.");
  }

  let adapted = source.replace(importAnchor, `${importAnchor}\n${PORT_IMPORT}`);
  adapted = adapted.replace(skillPorts, "LOCAL_SKILL_PORTS = local_skill_ports()");
  adapted = adapted.replace(
    hostRun,
    (_match, agentExpression) =>
      `ResponsesHostServer(${agentExpression}).run(port=agent_port_override())`,
  );
  adapted = adapted.replace(
    /logger\.info\("Agent built\. Starting Responses host server on http:\/\/127\.0\.0\.1:8088 \.\.\."\)/,
    [
      "logger.info(",
      '        "Agent built. Starting Responses host server on http://127.0.0.1:%d ...",',
      "        agent_listen_port(),",
      "    )",
    ].join("\n"),
  );
  return adapted;
}

async function assertSupportedDealer(destination) {
  for (const path of REQUIRED_DEALER_PATHS) {
    let entry;
    try {
      entry = await lstat(join(destination, path));
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(`Unsupported Dealer sample layout: required path is missing: ${path}`);
      }
      throw error;
    }
    if (!entry.isFile()) {
      throw new Error(`Unsupported Dealer sample layout: required path is not a regular file: ${path}`);
    }
  }
}

async function readOptionalFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function appendMissingRuntimeIgnores(source) {
  const normalizedRules = new Set(source.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
      return [];
    }
    return [trimmed
      .replace(/^\/|^\*\*\//, "")
      .replace(/\/+$/, "")];
  }));
  const missing = RUNTIME_IGNORE_RULES.filter(
    (rule) => !normalizedRules.has(rule.replace(/\/$/, "")),
  );
  if (missing.length === 0) {
    return source;
  }

  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const separator = source.length > 0 && !source.endsWith("\n") ? newline : "";
  return `${source}${separator}${missing.join(newline)}${newline}`;
}

export async function prepareDealerPortOverrides(destination) {
  const root = resolve(destination);
  await assertSupportedDealer(root);

  const agentPath = join(root, "src", "agent", "main.py");
  const gitignorePath = join(root, ".gitignore");
  const [agentSource, gitignoreSource, localPortsSource, ...scriptSources] = await Promise.all([
    readFile(agentPath, "utf8"),
    readOptionalFile(gitignorePath),
    readFile(join(ASSET_ROOT, "src", "agent", "local_ports.py"), "utf8"),
    ...SCRIPT_FILES.map((path) => readFile(join(ASSET_ROOT, path), "utf8")),
  ]);
  const adaptedAgent = adaptAgentSource(agentSource);
  const adaptedGitignore = appendMissingRuntimeIgnores(gitignoreSource);

  const writes = [
    writeFile(agentPath, adaptedAgent),
    writeFile(join(root, "src", "agent", "local_ports.py"), localPortsSource),
    ...SCRIPT_FILES.map((path, index) => writeFile(join(root, path), scriptSources[index])),
  ];
  if (adaptedGitignore !== gitignoreSource) {
    writes.push(writeFile(gitignorePath, adaptedGitignore));
  }
  await Promise.all(writes);
  await Promise.all([
    chmod(join(root, "scripts", "dev-start.sh"), 0o755),
    chmod(join(root, "scripts", "dev-stop.sh"), 0o755),
  ]);

  return {
    kind: "dealer-port-overrides",
    destination: root,
    adaptedAgent: adaptedAgent !== agentSource,
    copiedFiles: [...SCRIPT_FILES, "src/agent/local_ports.py"],
  };
}
