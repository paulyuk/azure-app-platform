import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, win32 } from "node:path";
import { discoverRepository, parseUnityManifest, scanRepository } from "./discovery.mjs";
import { getTierDefinition } from "./tier-definitions.mjs";

const DOCUMENT_ARTIFACTS = [
  { id: "instructions", blockCategory: "agent", blockTemplateId: "agent-instructions", customizationArea: "behavior", projectPath: "src/agent", projectName: "Agent", title: "Agent instructions", path: "src/agent/prompts/system.md", description: "Agent behavior. The agent harness calls the document validation tool before passing sanitized text to the model." },
  { id: "tool", blockCategory: "sandbox", customizationArea: "tools", projectPath: "src/tools/document-validation", projectName: "Document validation", title: "Document validation tool", path: "src/tools/document-validation/main.py", description: "Deterministic document validation and redaction. The running model cannot edit this code." },
  { id: "contract", blockCategory: "sandbox", customizationArea: "tools", projectPath: "src/tools/document-validation", projectName: "Document validation", title: "Document validation tool contract", path: "src/tools/document-validation/contract.json", description: "Allowed inputs and bounded outputs. Enforced by code, not by instructions." },
  { id: "policy", blockCategory: "sandbox", projectPath: "src/tools/document-validation", projectName: "Document validation", customizationArea: "policies", title: "Enforcement policy", path: "config/document-policy.json", description: "Operator-owned limits and rejection rules. The running model cannot edit this file. Review developer changes, test enforcement, and redeploy." },
  { id: "runtime", blockCategory: "agent", projectPath: "src/agent", projectName: "Agent", customizationArea: "runtime", title: "Runtime & access", path: "config/runtime.json", description: "Choose the agent runtime. Local simulation is not an isolation boundary." },
];
const MAX_BYTES = 96 * 1024;
const sha = (text) => createHash("sha256").update(text).digest("hex");
const CODE_FILE = /\.(?:py|[cm]?[jt]sx?|cs|go|java|rs)$/i;
const SOURCE_FILES = {
  agent: ["prompts/system.md", "main.py", "agent.yaml", "runtime.json", "pyproject.toml"],
  skills: ["function_app.py", "agents.config.yaml", "contract.json", "host.json", "pyproject.toml", "requirements.txt"],
  workflows: ["function_app.py", "host.json", "pyproject.toml", "requirements.txt"],
  sandbox: ["main.py", "contract.json", "Dockerfile", "egress-policy.md"],
  web: ["builder.yaml", "index.html", "server.mjs", "src/app/page.tsx", "app/page.tsx", "src/main.ts", "src/main.tsx", "package.json"],
  connectors: ["connector.json", "README.md"],
  sre: ["sre-agent.yaml", "README.md"],
};

async function existingPath(root, path, directory = false) {
  const candidate = join(root, path);
  let info;
  try { info = await lstat(candidate); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
  if (info.isSymbolicLink() || await realpath(candidate) !== join(await realpath(root), path)) {
    throw new Error(directory
      ? "Customize artifact must be a directory inside the selected app, not a symlink."
      : "Customize artifacts must stay inside the selected app, not symlinks.");
  }
  if (directory ? !info.isDirectory() : !info.isFile()) {
    throw new Error(`Expected a ${directory ? "directory" : "file"} for Customize artifact ${path}.`);
  }
  return true;
}

function parseAppScope(content) {
  if (!/^(?:capabilities|components)\s*:/m.test(content)) {
    throw new Error("App inventory must declare capabilities or components before Customize can select source.");
  }
  const components = parseUnityManifest({ path: "azure-app.yaml", content });
  for (const item of components) {
    if (!getTierDefinition(item.tierId) || !item.path || isAbsolute(item.path) ||
        win32.isAbsolute(item.path) || item.path.split(/[\\/]/).includes("..")) {
      throw new Error("Fix the app inventory: each capability needs a known tier and an app-relative path.");
    }
  }
  return components.map((item) => item.path.replaceAll("\\", "/").replace(/\/+$/, "") || ".");
}

async function appScope(root) {
  if (!await existingPath(root, "azure-app.yaml")) return null;
  return parseAppScope(await readFile(await artifactPath(root, { path: "azure-app.yaml" }), "utf8"));
}

function inScope(path, scope) {
  return scope === null || scope.some((component) =>
    component === "." || path === component || path.startsWith(component + "/"));
}

async function isDocumentApp(root, scope = undefined) {
  if (scope === undefined) scope = await appScope(root);
  const directories = ["src/tools/document-validation", "src/sandbox/tool"];
  if (!inScope("src/agent", scope) || !directories.some((directory) => inScope(directory, scope))) return false;
  for (const directory of directories) {
    if (inScope(directory, scope) && await existingPath(root, directory, true)) return true;
  }
  return inScope("src/agent", scope) &&
    await existingPath(root, "config/document-policy.json");
}

function sourceArtifact(path, candidate) {
  const tier = getTierDefinition(candidate.tierId);
  const name = basename(candidate.projectPath);
  const file = basename(path);
  const triggerKind = candidate.evidence.find(item => item.rule?.startsWith("function-trigger-"))?.rule.slice("function-trigger-".length);
  const isTrigger = candidate.tierId === "skills" &&
    (candidate.projectPath.startsWith("src/triggers/") || Boolean(triggerKind)) &&
    !candidate.evidence.some(item => ["skill-config", "tool-declaration", "hosted-skill-entrypoint"].includes(item.rule));
  const customizationArea = path.endsWith("/prompts/system.md") || (candidate.tierId === "agent" && CODE_FILE.test(path))
    ? "behavior"
    : file === "contract.json" || file === "agents.config.yaml"
      || (["skills", "workflows"].includes(candidate.tierId) && file === "function_app.py") ? "tools"
      : file === "agent.yaml" || file === "builder.yaml" || file === "embr.yaml" ? "runtime"
        : file === "egress-policy.md" ? "policies" : undefined;
  let title = `${tier?.mapLabel || tier?.name || "Component"} source`;
  let description = "Implementation discovered in this app. Open it in Files or a supported external editor to make changes.";
  if (path.endsWith("/prompts/system.md")) {
    title = "Agent instructions";
    description = "Instruction source in this app. Its presence does not prove the runtime loads it.";
  } else if (candidate.tierId === "agent" && CODE_FILE.test(path)) {
    title = "Agent implementation & instructions";
    description = "Agent runtime code, including any inline instructions and tool registrations defined here.";
  } else if (file === "agent.yaml") {
    title = "Agent manifest";
  } else if (candidate.tierId === "agent" && file === "runtime.json") {
    title = "Agent runtime configuration";
  } else if (file === "builder.yaml" || file === "embr.yaml") {
    title = "App Service Builder manifest";
    description = "Component roles, build toolchain, and output directory for App Service Builder deployment.";
  } else if (file === "index.html") {
    title = "Web entry HTML";
  } else if (file === "agents.config.yaml") {
    title = "Hosted skill configuration";
  } else if (file === "function_app.py") {
    title = isTrigger ? "Trigger implementation" : candidate.tierId === "workflows" ? "Workflow implementation" : "Hosted skill entry point";
  } else if (file === "Dockerfile") {
    title = "Container build";
  } else if (file === "egress-policy.md") {
    title = "Egress policy";
  } else if (file === "contract.json") {
    title = "Tool contract";
  } else if (file === "host.json") {
    title = "Functions host configuration";
  } else if (file === "package.json") {
    title = "Web app configuration";
  } else if (file === "connector.json") {
    title = "Connector contract";
  } else if (file === "sre-agent.yaml") {
    title = "Operations configuration";
  } else if (file === "pyproject.toml") {
    title = "Python project configuration";
  } else if (file === "requirements.txt") {
    title = "Deployment dependencies";
  }
  return {
    id: `source-${sha(path).slice(0, 20)}`, path,
    title: name && name !== "." ? `${title} · ${name}` : title,
    projectPath: candidate.projectPath,
    projectName: candidate.name,
    blockCategory: isTrigger ? "triggers" : candidate.tierId,
    blockTemplateId: candidate.tierId === "skills" ? (isTrigger ? `${triggerKind ?? "http"}-trigger` : "hosted-skill")
      : candidate.tierId === "agent" ? "agent-instructions"
        : ({ web: "user-experience", connectors: "connector", workflows: "orchestration", sre: "operations" })[candidate.tierId],
    description,
    customizationArea,
  };
}

function candidateSourcePaths(candidate) {
  return [
    ...(SOURCE_FILES[candidate.tierId] ?? []).map((name) =>
      candidate.projectPath === "." ? name : `${candidate.projectPath}/${name}`),
    ...candidate.evidence.filter((item) => CODE_FILE.test(item.path)).map((item) => item.path),
  ];
}

async function buildCatalog(root, discoveryState = {}) {
  const scope = await appScope(root);
  const supportsDocuments = await isDocumentApp(root, scope);
  const scan = discoveryState.scan ?? await scanRepository(root);
  const discovery = discoveryState.discovery ?? await discoverRepository(root, { scan });
  const files = new Set(scan.files.map((file) => file.path));
  const selected = new Map();
  for (const candidate of discovery.candidates) {
    const paths = new Set(candidateSourcePaths(candidate));
    for (const path of paths) {
      if (!files.has(path) || !inScope(path, scope) || selected.has(path)) continue;
      selected.set(path, sourceArtifact(path, candidate));
    }
  }
  if (files.has("azure-app.yaml")) {
    selected.set("azure-app.yaml", {
      id: "app-inventory", title: "App inventory", path: "azure-app.yaml",
      blockCategory: "application", projectPath: ".", projectName: "Application", customizationArea: "runtime",
      description: "Capability paths, interfaces, and relationships declared by this app.",
    });
  }
  if (files.has("config/domain.json") && discovery.candidates.length) {
    const path = "config/domain.json";
    selected.set(path, { id: `source-${sha(path).slice(0, 20)}`, title: "App configuration", path,
      blockCategory: "application", projectPath: ".", projectName: "Application", customizationArea: "runtime",
      description: "Domain configuration used by the app template." });
  }
  const agent = discovery.candidates.find(candidate => candidate.tierId === "agent" && candidate.projectPath === "src/agent");
  if (agent && inScope(agent.projectPath, scope) && files.has("config/runtime.json")) {
    const path = "config/runtime.json";
    selected.set(path, { ...sourceArtifact(path, agent), title: "Agent runtime configuration" });
  }
  if (supportsDocuments) {
    for (const artifact of DOCUMENT_ARTIFACTS) {
      const actual = await appArtifact(root, artifact);
      selected.set(actual.path, actual);
    }
  }
  return {
    kind: supportsDocuments ? "document" : "source", supportsDocuments, artifacts: [...selected.values()],
    diagnostics: discovery.diagnostics,
  };
}

async function buildArtifact(root, id) {
  const catalog = await buildCatalog(root);
  return catalog.artifacts.find((item) => item.id === id);
}

async function appArtifact(root, artifact) {
  if (!["tool", "contract", "policy"].includes(artifact.id)) return artifact;
  const scope = await appScope(root);
  const directories = ["src/tools/document-validation", "src/sandbox/tool"].filter((directory) => inScope(directory, scope));
  // Choose the whole layout, not individual files, so partial migrations fail visibly.
  for (const toolDirectory of directories) {
    const directory = join(root, toolDirectory);
    let info;
    try {
      info = await lstat(directory);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!info.isDirectory() || info.isSymbolicLink()
        || await realpath(directory) !== join(await realpath(root), toolDirectory)) {
      throw new Error("Document validation tool must be a directory inside the selected app, not a symlink.");
    }
    return { ...artifact, projectPath: toolDirectory, path: artifact.path.replace("src/tools/document-validation", toolDirectory) };
  }
  const toolDirectory = directories[0] ?? "src/tools/document-validation";
  return { ...artifact, projectPath: toolDirectory, path: artifact.path.replace("src/tools/document-validation", toolDirectory) };
}

async function artifactPath(root, artifact) {
  const canonicalRoot = await realpath(root);
  const path = resolve(canonicalRoot, artifact.path);
  if ((await lstat(path)).isSymbolicLink()) {
    throw new Error("Customize artifacts must be regular files inside the selected app, not symlinks.");
  }
  const actual = await realpath(path);
  const local = relative(canonicalRoot, actual);
  if (actual !== path || local.startsWith("..") || (await lstat(path)).isSymbolicLink()) {
    throw new Error("Customize artifacts must be regular files inside the selected app, not symlinks.");
  }
  const info = await lstat(path);
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error("Customize artifact exceeds the 96 KiB preview limit or is not a file.");
  return path;
}

async function readArtifact(root, artifact) {
  artifact = await appArtifact(root, artifact);
  try {
    const path = await artifactPath(root, artifact);
    const content = await readFile(path, "utf8");
    let customizationArea = artifact.customizationArea;
    let focusLine;
    if (customizationArea === "behavior" && CODE_FILE.test(artifact.path)) {
      const instructionLine = content.split("\n").findIndex((line) =>
        !/^\s*(?:#|\/\/|\/\*|\*)/.test(line)
        && (/^\s*(?:(?:export|const|let|var)\s+)*(?:INSTRUCTIONS|SYSTEM_PROMPT)\s*(?::[^=]+)?=/.test(line)
          || /\b(?:instructions|system_prompt)\s*[:=]/.test(line)));
      if (instructionLine >= 0) focusLine = instructionLine + 1;
      else customizationArea = undefined;
    }
    return { ...artifact, customizationArea, focusLine, available: true, content };
  } catch (error) {
    if (error.code === "ENOENT") return { ...artifact, available: false, detail: "Expected file is missing from this app. Restore it or review the app configuration." };
    throw error;
  }
}

export async function readBuildWorkspace(root) {
  const catalog = await buildCatalog(root);
  return { ...catalog, artifacts: await Promise.all(catalog.artifacts.map((artifact) => readArtifact(root, artifact))) };
}

export async function resolveBuildArtifactPath(root, id) {
  const artifact = await buildArtifact(root, id);
  if (!artifact) {
    const error = new Error("Choose a known Customize artifact.");
    error.statusCode = 400;
    throw error;
  }
  return artifactPath(root, await appArtifact(root, artifact));
}

export async function resolveProjectSourcePath(root, projectPath) {
  if (typeof projectPath !== "string" || !projectPath || projectPath.includes("\0")
    || isAbsolute(projectPath) || win32.isAbsolute(projectPath) || projectPath.split(/[\\/]/).includes("..")) {
    const error = new Error("Choose an app-relative source project.");
    error.statusCode = 400;
    throw error;
  }
  const project = projectPath.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "") || ".";
  const scan = await scanRepository(root);
  const discovery = await discoverRepository(root, { scan });
  const candidates = discovery.candidates.filter((candidate) => candidate.projectPath === project);
  if (!candidates.length) {
    const error = new Error("Choose a source project discovered in this app.");
    error.statusCode = 400;
    throw error;
  }
  const catalog = await buildCatalog(root, { scan, discovery });
  const artifacts = await Promise.all(catalog.artifacts.map((artifact) => appArtifact(root, artifact)));
  const paths = [...new Set(candidates.flatMap(candidateSourcePaths))]
    .sort((a, b) => Number(!CODE_FILE.test(a)) - Number(!CODE_FILE.test(b)));
  for (const path of paths) {
    const artifact = artifacts.find((item) => item.path === path);
    if (artifact && await existingPath(root, path)) return artifactPath(root, artifact);
  }
  const error = new Error("No recognized source file is available for this project in the app's source catalog. Review Key files or open the project with Customize's external-editor option.");
  error.statusCode = 404;
  throw error;
}

export async function readBuildRuntime(root) {
  if (!await isDocumentApp(root)) return null;
  const artifact = await readArtifact(root, DOCUMENT_ARTIFACTS.find((item) => item.id === "runtime"));
  if (!artifact.available) return null;
  const config = JSON.parse(artifact.content);
  if (!config || !["local", "copilot-sdk-sandbox"].includes(config.agentRuntime)) {
    throw new Error("Invalid config/runtime.json: choose agentRuntime local or copilot-sdk-sandbox.");
  }
  return config;
}

export async function documentDeploymentBlocker(_root) {
  return null;
}
