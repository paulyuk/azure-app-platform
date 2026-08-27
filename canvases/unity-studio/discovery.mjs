import { execFile } from "node:child_process";
import { opendir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { PLATFORM_TIERS, getTierDefinition } from "./tier-definitions.mjs";

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".pytest_cache",
  ".tox",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "obj",
  "target",
  "venv",
]);

const EXCLUDED_FILES = new Set([
  ".env",
  "local.settings.json",
]);

const TEXT_EXTENSIONS = new Set([
  ".bicep",
  ".cs",
  ".go",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".rs",
  ".sql",
  ".tf",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const ALWAYS_READ_FILES = new Set([
  "Dockerfile",
  "agent.yaml",
  "agents.config.yaml",
  "azure.yaml",
  "embr.yaml",
  "function_app.py",
  "host.json",
  "package.json",
  "pyproject.toml",
  "schema.prisma",
  "unity.app.yaml",
]);

const PROJECT_MARKERS = new Set([
  "Dockerfile",
  "agent.yaml",
  "agents.config.yaml",
  "azure.yaml",
  "embr.yaml",
  "function_app.py",
  "host.json",
  "package.json",
  "pyproject.toml",
  "schema.prisma",
  "unity.app.yaml",
]);

const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_READ_BYTES = 32 * 1024 * 1024;
const SELF_DIRECTORY = dirname(fileURLToPath(import.meta.url));

function toPosix(path) {
  return path.split(sep).join("/");
}

function isWithin(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

export async function resolveDiscoveryRoot(requestedRoot, workspaceRoot = process.cwd()) {
  const workspace = await realpath(resolve(workspaceRoot));
  const requested = requestedRoot ? resolve(workspace, requestedRoot) : workspace;
  const root = await realpath(requested);
  if (!isWithin(workspace, root)) {
    throw new Error(`Discovery root must stay within the current workspace: ${workspace}`);
  }
  return root;
}

function shouldReadFile(file) {
  if (
    EXCLUDED_FILES.has(file.name)
    || file.name.endsWith(".lock")
    || /\.(?:test|spec)\.[^.]+$/i.test(file.name)
  ) {
    return false;
  }
  return ALWAYS_READ_FILES.has(file.name) || TEXT_EXTENSIONS.has(extname(file.name).toLowerCase());
}

export async function scanRepository(root, { maxDepth = 10, maxFiles = 20_000 } = {}) {
  const resolvedRoot = await realpath(resolve(root));
  const files = [];
  const diagnostics = [];

  async function walk(directory, depth) {
    if (depth > maxDepth || files.length >= maxFiles) {
      return;
    }

    let handle;
    try {
      handle = await opendir(directory);
    } catch (error) {
      diagnostics.push({
        code: "directory-unreadable",
        path: toPosix(relative(resolvedRoot, directory)) || ".",
        message: error.message,
      });
      return;
    }

    for await (const entry of handle) {
      if (files.length >= maxFiles) {
        break;
      }
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name) && resolve(absolutePath) !== SELF_DIRECTORY) {
          await walk(absolutePath, depth + 1);
        }
      } else if (entry.isFile() && shouldReadFile(entry)) {
        try {
          const metadata = await stat(absolutePath);
          files.push({
            absolutePath,
            path: toPosix(relative(resolvedRoot, absolutePath)),
            name: entry.name,
            size: metadata.size,
            readable: metadata.size <= MAX_FILE_BYTES,
          });
        } catch (error) {
          diagnostics.push({
            code: "file-unreadable",
            path: toPosix(relative(resolvedRoot, absolutePath)),
            message: error.message,
          });
        }
      }
    }
  }

  await walk(resolvedRoot, 0);
  if (files.length >= maxFiles) {
    diagnostics.push({
      code: "file-limit-reached",
      path: ".",
      message: `Repository scan stopped after ${maxFiles} files.`,
    });
  }
  return { root: resolvedRoot, files, diagnostics };
}

export async function loadRepositoryFiles(scan, { maxTotalBytes = MAX_TOTAL_READ_BYTES } = {}) {
  const loaded = [];
  let totalBytes = 0;
  for (const file of [...scan.files].sort((left, right) => left.path.localeCompare(right.path))) {
    if (!file.readable) {
      continue;
    }
    if (totalBytes + file.size > maxTotalBytes) {
      scan.diagnostics.push({
        code: "read-limit-reached",
        path: ".",
        message: `Source loading stopped at ${maxTotalBytes} bytes.`,
      });
      break;
    }
    try {
      loaded.push({ ...file, content: await readFile(file.absolutePath, "utf8") });
      totalBytes += file.size;
    } catch (error) {
      scan.diagnostics.push({
        code: "file-unreadable",
        path: file.path,
        message: error.message,
      });
    }
  }
  return loaded;
}

function projectRootsFor(files) {
  return [...new Set(files
    .filter((file) => PROJECT_MARKERS.has(file.name))
    .map((file) => toPosix(dirname(file.path))))]
    .sort((left, right) => right.length - left.length);
}

function projectRootFor(file, projectRoots) {
  const parent = toPosix(dirname(file.path));
  return projectRoots.find((root) =>
    root === "." || parent === root || parent.startsWith(`${root}/`))
    ?? (parent === "." ? "." : parent);
}

function sourceLine(content, index) {
  return content.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

function evidence(tierId, file, projectRoots, rule, confidence, detail, line = 1) {
  return {
    tierId,
    projectPath: projectRootFor(file, projectRoots),
    path: file.path,
    line,
    rule,
    confidence,
    detail,
  };
}

function collectFileEvidence(file, projectRoots) {
  const results = [];
  const content = file.content;
  const lowerName = file.name.toLowerCase();
  const normalizedPath = `/${file.path.toLowerCase()}`;
  if (
    normalizedPath.includes("/canvases/unity-studio/")
    || normalizedPath.startsWith("/.github/")
    || normalizedPath.includes("/infra/")
    || normalizedPath.startsWith("/infra/")
    || /\/infra-[^/]+\//.test(normalizedPath)
  ) {
    return results;
  }
  const isDocumentation = extname(file.name).toLowerCase() === ".md";
  const addMarker = (tierId, rule, confidence, detail) => {
    results.push(evidence(tierId, file, projectRoots, rule, confidence, detail));
  };
  const addMatch = (tierId, rule, confidence, expression, detail) => {
    const match = expression.exec(content);
    if (match) {
      results.push(evidence(
        tierId,
        file,
        projectRoots,
        rule,
        confidence,
        detail ?? match[0],
        sourceLine(content, match.index),
      ));
    }
  };

  if (file.name === "embr.yaml") {
    addMarker("web", "embr-manifest", "high", "Embr web project manifest");
  }
  if (file.name === "package.json") {
    addMatch("web", "web-package", "high", /"(next|react|vite|svelte|@angular\/core|nuxt)"/i, "Web framework dependency");
  }
  if (/\.(?:[cm]?[jt]sx?)$/.test(file.path)) {
    addMatch("web", "agent-client", "medium", /\b(fetch|axios)\s*\(|\/responses\b|AGENT_(URL|ENDPOINT)/, "Source calls an agent-style HTTP endpoint");
  }

  if (file.name === "agent.yaml") {
    addMarker("agent", "agent-manifest", "high", "Hosted agent manifest");
  }
  if (!isDocumentation) {
    addMatch(
      "agent",
      "agent-runtime",
      "high",
      /\b(ResponsesHostServer|FoundryToolbox|build_agent)\s*\(|\bnew Agent\s*\(|\bAgent\s*\(/,
      "Agent runtime construction",
    );
  }

  if (!isDocumentation) {
    addMatch("gateway", "gateway-reference", "medium", /AZURE_AI_GATEWAY_ENDPOINT|Microsoft\.ApiManagement\/service|ai[_ -]?gateway/i, "AI Gateway endpoint or resource reference");
  }

  if (file.name === "agents.config.yaml") {
    addMarker("skills", "skill-config", "high", "Hosted skill runtime configuration");
  }
  if (file.name === "function_app.py") {
    addMatch("skills", "hosted-skill-entrypoint", "high", /azure_functions_agents|create_function_app\s*\(/, "Hosted skill Function App entry point");
  }
  if (!isDocumentation) {
    addMatch("skills", "tool-declaration", "medium", /@tool\b|mcpToolTrigger|builtin_endpoints\.mcp/, "Tool or MCP endpoint declaration");
  }

  if (file.name === "Dockerfile") {
    addMarker("sandbox", "container-image", "medium", "Container build definition");
  }
  if (lowerName === "egress-policy.md") {
    addMarker("sandbox", "sandbox-boundary", "high", "Sandbox lifecycle or egress boundary");
  } else if (!isDocumentation) {
    addMatch("sandbox", "sandbox-boundary", "high", /Microsoft\.App\/(jobs|containerApps)|ACA sandbox/i, "Sandbox lifecycle or egress boundary");
  }

  if (!isDocumentation) {
    addMatch("connectors", "connector-reference", "medium", /Microsoft\.Web\/connections|GraphServiceClient\s*\(|Connector Namespace(?:\.|\()/i, "External connector API reference");
  }

  if (!isDocumentation) {
    addMatch("workflows", "durable-orchestration", "high", /azure\.durable_functions|\bDFApp\s*\(|orchestration_trigger|call_activity\s*\(|wait_for_external_event\s*\(/, "Durable workflow orchestration or activity");
    addMatch("workflows", "workflow-resource", "high", /Microsoft\.(Logic\/workflows|Web\/sites).*workflowapp/i, "Workflow resource definition");
  }

  if (!isDocumentation) {
    addMatch("sre", "sre-configuration", "medium", /sre[_ -]?agent|Microsoft\.[A-Za-z.]+\/sreAgents|health model|safe remediation/i, "SRE agent or health model reference");
  }

  if (
    file.name === "schema.prisma"
    || extname(file.name).toLowerCase() === ".sql"
  ) {
    addMarker("data", "data-definition", "high", "Data schema or Azure data resource definition");
  } else if (/Microsoft\.(DocumentDB|Storage|Sql|DBforPostgreSQL|DBforMySQL)\//i.test(content)) {
    addMatch("data", "data-definition", "high", /Microsoft\.(DocumentDB|Storage|Sql|DBforPostgreSQL|DBforMySQL)\//i, "Data schema or Azure data resource definition");
  } else if (normalizedPath.includes("/data/") && extname(file.name).toLowerCase() === ".json") {
    addMarker("data", "application-data", "low", "Repository application data file");
  }

  return results;
}

function yamlScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const quote = trimmed[0];
    const end = trimmed.indexOf(quote, 1);
    if (end > 0) {
      return trimmed.slice(1, end);
    }
  }
  return trimmed.split(/\s+#/, 1)[0].trim();
}

function parseUnityManifest(file) {
  const components = [];
  const lines = file.content.split(/\r?\n/);
  let componentsIndent = null;
  let current = null;
  const finish = () => {
    if (current) {
      components.push(current);
      current = null;
    }
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (componentsIndent === null) {
      if (/^components\s*:\s*(?:#.*)?$/i.test(trimmed)) {
        componentsIndent = indent;
      }
      continue;
    }
    if (indent <= componentsIndent) {
      finish();
      break;
    }
    const item = /^-\s*tier\s*:\s*(.+)$/i.exec(trimmed);
    if (item) {
      finish();
      current = { tierId: yamlScalar(item[1]), path: null, line: index + 1 };
      continue;
    }
    const property = /^(tier|path)\s*:\s*(.+)$/i.exec(trimmed);
    if (!property) {
      continue;
    }
    current ??= { tierId: null, path: null, line: index + 1 };
    if (property[1].toLowerCase() === "tier") {
      current.tierId = yamlScalar(property[2]);
      current.line = index + 1;
    } else {
      current.path = yamlScalar(property[2]);
    }
  }
  finish();
  return components;
}

function collectUnityManifestResults(files) {
  const matches = [];
  const diagnostics = [];
  for (const file of files.filter((candidate) => candidate.name === "unity.app.yaml")) {
    for (const component of parseUnityManifest(file)) {
      const tier = getTierDefinition(component.tierId);
      if (!tier) {
        diagnostics.push({
          code: "invalid-unity-tier",
          source: "repository",
          path: file.path,
          line: component.line,
          message: `Unity app inventory contains unknown tier "${component.tierId ?? ""}".`,
        });
        continue;
      }
      if (
        !component.path
        || isAbsolute(component.path)
        || component.path.split(/[\\/]/).includes("..")
      ) {
        diagnostics.push({
          code: "invalid-component-path",
          source: "repository",
          path: file.path,
          line: component.line,
          message: `${tier.name} must declare a workspace-relative component path.`,
        });
        continue;
      }
      const manifestRoot = toPosix(dirname(file.path));
      const componentPath = component.path === "."
        ? manifestRoot
        : toPosix(join(manifestRoot, component.path));
      const prefix = componentPath === "." ? "" : `${componentPath}/`;
      const exists = files.some((candidate) =>
        candidate.path !== file.path
        && (candidate.path === componentPath || candidate.path.startsWith(prefix)));
      if (!exists) {
        diagnostics.push({
          code: "missing-component-path",
          source: "repository",
          path: file.path,
          line: component.line,
          message: `${tier.name} declares "${component.path}", but that project path was not found.`,
        });
        continue;
      }
      matches.push({
        tierId: tier.id,
        projectPath: componentPath,
        path: file.path,
        line: component.line,
        rule: "unity-app-inventory",
        confidence: "medium",
        detail: `Unity app inventory maps ${tier.name} to ${component.path}`,
      });
    }
  }
  return { matches, diagnostics };
}

function confidenceRank(confidence) {
  return { low: 1, medium: 2, high: 3 }[confidence] ?? 0;
}

function projectDisplayName(files, projectPath, tierId) {
  const agentManifest = files.find((file) => file.name === "agent.yaml");
  const agentName = agentManifest?.content.match(/^\s*name\s*:\s*["']?([^"'#\s]+)["']?\s*$/m)?.[1];
  if (tierId === "agent") {
    if (agentName) return `${agentName}-agent`;
  }
  if (tierId === "web" && agentName) {
    return `${agentName}-web`;
  }
  return basename(projectPath) || basename(process.cwd());
}

function groupRepoCandidates(allEvidence, files = []) {
  const grouped = new Map();
  for (const item of allEvidence) {
    const key = `${item.tierId}:${item.projectPath}`;
    let candidate = grouped.get(key);
    if (!candidate) {
      candidate = {
        id: key,
        source: "repository",
        tierId: item.tierId,
        name: projectDisplayName(files, item.projectPath, item.tierId),
        projectPath: item.projectPath,
        confidence: item.confidence,
        evidence: [],
      };
      grouped.set(key, candidate);
    }
    candidate.evidence.push({
      path: item.path,
      line: item.line,
      rule: item.rule,
      confidence: item.confidence,
      detail: item.detail,
    });
    if (confidenceRank(item.confidence) > confidenceRank(candidate.confidence)) {
      candidate.confidence = item.confidence;
    }
  }
  return [...grouped.values()].sort((left, right) =>
    left.tierId.localeCompare(right.tierId) || left.projectPath.localeCompare(right.projectPath));
}

export async function discoverRepository(root, options = {}) {
  const scan = options.scan ?? await scanRepository(root, options);
  const files = options.files ?? await loadRepositoryFiles(scan, options);
  const projectRoots = projectRootsFor(files);
  const manifest = collectUnityManifestResults(files);
  const allEvidence = [
    ...files.flatMap((file) => collectFileEvidence(file, projectRoots)),
    ...manifest.matches,
  ];
  return {
    source: "repository",
    root: scan.root,
    candidates: groupRepoCandidates(allEvidence, files),
    diagnostics: [...scan.diagnostics, ...manifest.diagnostics],
    scannedFiles: scan.files.length,
  };
}

export function createCommandEnvironment(source = process.env) {
  const environment = { ...source };
  for (const key of [
    "client_session",
    "CLIENT_SESSION",
    "SESSION_ID",
    "COPILOT_AGENT_SESSION_ID",
    "AGENCY_SESSION_ID",
  ]) {
    delete environment[key];
  }
  return environment;
}

export function runCommand(command, args, { timeout = 8_000 } = {}) {
  return new Promise((resolveResult) => {
    execFile(command, args, {
      env: createCommandEnvironment(),
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      resolveResult({
        ok: !error,
        exitCode: typeof error?.code === "number" ? error.code : null,
        signal: error?.signal ?? null,
        timedOut: Boolean(error?.killed),
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: error?.message ?? null,
      });
    });
  });
}

function parseJsonResult(result, label) {
  if (!result.ok) {
    return {
      value: null,
      diagnostic: {
        code: result.timedOut ? "command-timeout" : "command-failed",
        source: "azure",
        message: `${label} failed: ${result.stderr || result.error || "unknown error"}`,
      },
    };
  }
  try {
    return { value: JSON.parse(result.stdout), diagnostic: null };
  } catch (error) {
    return {
      value: null,
      diagnostic: {
        code: "invalid-json",
        source: "azure",
        message: `${label} returned invalid JSON: ${error.message}`,
      },
    };
  }
}

function azureTierIds(resource) {
  const type = String(resource.type ?? "").toLowerCase();
  const kind = String(resource.kind ?? "").toLowerCase();
  const tags = resource.tags && typeof resource.tags === "object" ? resource.tags : {};
  const tierTag = String(tags["unity-tier"] ?? tags.unityTier ?? tags.unity_tier ?? "")
    .toLowerCase()
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const tiers = new Map();

  for (const tierId of tierTag) {
    if (getTierDefinition(tierId)) {
      tiers.set(tierId, { confidence: "high", rule: "unity-tier-tag" });
    }
  }

  const add = (tierId, confidence, rule) => {
    const existing = tiers.get(tierId);
    if (!existing || confidenceRank(confidence) > confidenceRank(existing.confidence)) {
      tiers.set(tierId, { confidence, rule });
    }
  };

  if (type === "microsoft.web/staticsites" || (type === "microsoft.web/sites" && !kind.includes("functionapp") && !kind.includes("workflowapp"))) {
    add("web", "high", "azure-web-resource");
  }
  if (type.endsWith("/projects") && (type.includes("cognitiveservices") || type.includes("machinelearningservices"))) {
    add("agent", "medium", "azure-ai-project");
  }
  if (type === "microsoft.apimanagement/service") {
    add("gateway", "high", "azure-api-management");
  }
  if (type === "microsoft.web/sites" && kind.includes("functionapp")) {
    add("skills", "medium", "azure-function-app");
    add("workflows", "low", "azure-function-app");
  }
  if (type === "microsoft.app/jobs" || type === "microsoft.app/containerapps" || type === "microsoft.app/managedenvironments") {
    add("sandbox", "medium", "azure-container-apps");
  }
  if (type === "microsoft.web/connections") {
    add("connectors", "high", "azure-api-connection");
  }
  if (type === "microsoft.logic/workflows" || kind.includes("workflowapp")) {
    add("workflows", "high", "azure-workflow");
  }
  if (type.includes("/sreagents") || type.includes("/healthmodels")) {
    add("sre", "high", "azure-sre-resource");
  }
  if (
    type.startsWith("microsoft.documentdb/")
    || type.startsWith("microsoft.storage/")
    || type.startsWith("microsoft.sql/")
    || type.startsWith("microsoft.dbforpostgresql/")
    || type.startsWith("microsoft.dbformysql/")
  ) {
    add("data", "high", "azure-data-resource");
  }
  return tiers;
}

export function classifyAzureResources(resources, { diagnostics = [] } = {}) {
  const candidates = [];
  resources.forEach((resource, index) => {
    if (
      !resource
      || typeof resource !== "object"
      || typeof resource.id !== "string"
      || typeof resource.name !== "string"
      || typeof resource.type !== "string"
    ) {
      diagnostics.push({
        code: "malformed-resource",
        source: "azure",
        message: `Azure resource entry ${index} is missing a string id, name, or type.`,
      });
      return;
    }
    for (const [tierId, classification] of azureTierIds(resource)) {
      candidates.push({
        id: `${tierId}:${resource.id}`,
        source: "azure",
        tierId,
        name: resource.name,
        resourceId: resource.id,
        resourceType: resource.type,
        resourceGroup: resource.resourceGroup ?? null,
        location: resource.location ?? null,
        confidence: classification.confidence,
        evidence: [{
          rule: classification.rule,
          confidence: classification.confidence,
          detail: `Azure resource type ${resource.type}${resource.kind ? ` (${resource.kind})` : ""}`,
        }],
      });
    }
  });
  return candidates.sort((left, right) =>
    left.tierId.localeCompare(right.tierId) || String(left.name).localeCompare(String(right.name)));
}

export async function discoverAzure({ commandRunner = runCommand } = {}) {
  const diagnostics = [];
  const accountResult = await commandRunner("az", [
    "account",
    "show",
    "--query",
    "{id:id,name:name}",
    "--output",
    "json",
  ]);
  const account = parseJsonResult(accountResult, "Azure account discovery");
  if (account.diagnostic) {
    diagnostics.push(account.diagnostic);
    return {
      source: "azure",
      available: false,
      subscription: null,
      candidates: [],
      diagnostics,
    };
  }
  if (
    !account.value
    || typeof account.value !== "object"
    || typeof account.value.id !== "string"
    || account.value.id.trim() === ""
  ) {
    diagnostics.push({
      code: "unexpected-result",
      source: "azure",
      message: "Azure account discovery did not return an active subscription ID.",
    });
    return {
      source: "azure",
      available: false,
      subscription: null,
      candidates: [],
      diagnostics,
    };
  }

  const subscription = {
    id: account.value.id,
    name: typeof account.value.name === "string" ? account.value.name : null,
  };
  const resourceResult = await commandRunner("az", [
    "resource",
    "list",
    "--subscription",
    subscription.id,
    "--query",
    "[].{id:id,name:name,type:type,kind:kind,location:location,resourceGroup:resourceGroup,tags:tags}",
    "--output",
    "json",
  ], { timeout: 20_000 });
  const resources = parseJsonResult(resourceResult, "Azure resource discovery");
  if (resources.diagnostic) {
    diagnostics.push(resources.diagnostic);
    return {
      source: "azure",
      available: false,
      subscription,
      candidates: [],
      diagnostics,
    };
  }
  if (!Array.isArray(resources.value)) {
    diagnostics.push({
      code: "unexpected-result",
      source: "azure",
      message: "Azure resource discovery did not return an array.",
    });
    return {
      source: "azure",
      available: false,
      subscription,
      candidates: [],
      diagnostics,
    };
  }
  return {
    source: "azure",
    available: true,
    subscription,
    candidates: classifyAzureResources(resources.value, { diagnostics }),
    diagnostics,
  };
}

function tierResult(tier, repoCandidates, azureCandidates) {
  const repository = repoCandidates.filter((candidate) => candidate.tierId === tier.id);
  const azure = azureCandidates.filter((candidate) => candidate.tierId === tier.id);
  return {
    ...tier,
    candidates: { repository, azure },
    candidateCount: repository.length + azure.length,
    scaffoldAvailable: repository.length + azure.length === 0,
  };
}

export async function discoverPlatform({
  root = process.cwd(),
  includeAzure = true,
  commandRunner = runCommand,
} = {}) {
  const repository = await discoverRepository(root);
  const azure = includeAzure
    ? await discoverAzure({ commandRunner })
    : {
        source: "azure",
        available: false,
        subscription: null,
        candidates: [],
        diagnostics: [{ code: "azure-skipped", source: "azure", message: "Azure discovery was not requested." }],
      };
  return {
    generatedAt: new Date().toISOString(),
    root: repository.root,
    tiers: PLATFORM_TIERS.map((tier) => tierResult(tier, repository.candidates, azure.candidates)),
    diagnostics: [...repository.diagnostics, ...azure.diagnostics],
    repository: {
      scannedFiles: repository.scannedFiles,
      candidateCount: repository.candidates.length,
    },
    azure: {
      available: azure.available,
      subscription: azure.subscription,
      candidateCount: azure.candidates.length,
    },
  };
}
