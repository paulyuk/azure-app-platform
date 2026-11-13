import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, win32 } from "node:path";
import { discoverRepository, parseUnityManifest, scanRepository } from "./discovery.mjs";
import { getTierDefinition } from "./tier-definitions.mjs";

const DOCUMENT_ARTIFACTS = [
  { id: "agent-implementation", blockCategory: "agent", blockTemplateId: "agent-instructions", projectPath: "src/agent", projectName: "Agent", customizationArea: "runtime", title: "Agent runtime & egress audit", path: "src/agent/main.py", description: "Agent harness, sandbox lifecycle, and ACA egress decision auditing.", optional: true },
  { id: "instructions", blockCategory: "agent", blockTemplateId: "agent-instructions", customizationArea: "behavior", projectPath: "src/agent", projectName: "Agent", title: "Agent instructions", path: "src/agent/prompts/system.md", description: "Agent instructions and document-validation workflow." },
  { id: "tool", blockCategory: "sandbox", customizationArea: "tools", projectPath: "src/tools/document-validation", projectName: "Document validation", title: "Document validation tool", path: "src/tools/document-validation/main.py", description: "Document validation and redaction." },
  { id: "egress-policy", blockCategory: "sandbox", blockTemplateId: "sandbox", customizationArea: "policies", projectPath: "src/tools/document-validation", projectName: "Document validation", title: "Sandbox egress policy", path: "config/egress-policy.yaml", description: "ACA Sandbox Egress Proxy policy and Transform header rules.", optional: true },
  { id: "contract", blockCategory: "sandbox", customizationArea: "tools", projectPath: "src/tools/document-validation", projectName: "Document validation", title: "Document validation tool contract", path: "src/tools/document-validation/contract.json", description: "Document validation inputs and outputs." },
  { id: "policy", blockCategory: "sandbox", projectPath: "src/tools/document-validation", projectName: "Document validation", customizationArea: "policies", title: "Enforcement policy", path: "config/document-policy.json", description: "Validation limits, redaction, and rejection rules." },
  { id: "runtime", blockCategory: "agent", projectPath: "src/agent", projectName: "Agent", customizationArea: "runtime", title: "Runtime & access", path: "config/runtime.json", description: "Runtime selection and connection settings." },
];
const MAX_BYTES = 96 * 1024;
const sha = (text) => createHash("sha256").update(text).digest("hex");
const CODE_FILE = /\.(?:py|[cm]?[jt]sx?|cs|go|java|rs)$/i;
const SOURCE_FILES = {
  agent: ["main.py", "prompts/system.md", "agent.yaml", "runtime.json", "pyproject.toml"],
  skills: ["function_app.py", "agents.config.yaml", "contract.json", "host.json", "pyproject.toml", "requirements.txt"],
  workflows: ["function_app.py", "host.json", "pyproject.toml", "requirements.txt"],
  sandbox: ["main.py", "contract.json", "egress-policy.yaml", "Dockerfile", "pyproject.toml"],
  web: ["index.html", "server.mjs", "src/app/page.tsx", "app/page.tsx", "src/main.ts", "src/main.tsx", "app.py", "config.py", "gateway.py", "static/index.html", "static/chat.js", "static/site.css", "builder.yaml", "package.json", "pyproject.toml", "requirements.txt"],
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

function parseAppScope(content, allowResourceOnly = false) {
  if (!/^(?:capabilities|components)\s*:/m.test(content)) {
    throw new Error("App inventory must declare capabilities or components before Customize can select source.");
  }
  const components = parseUnityManifest({ path: "azure-app.yaml", content });
  for (const item of components) {
    if (allowResourceOnly && getTierDefinition(item.tierId) && !item.path) continue;
    if (!getTierDefinition(item.tierId) || !item.path || isAbsolute(item.path) ||
        win32.isAbsolute(item.path) || item.path.split(/[\\/]/).includes("..")) {
      throw new Error("Fix the app inventory: each capability needs a known tier and an app-relative path.");
    }
  }
  return components.filter(item => item.path).map((item) => item.path.replaceAll("\\", "/").replace(/\/+$/, "") || ".");
}

async function appScope(root) {
  if (!await existingPath(root, "azure-app.yaml")) return null;
  return parseAppScope(await readFile(await artifactPath(root, { path: "azure-app.yaml" }), "utf8"));
}

function inScope(path, scope) {
  return scope === null || scope.some((component) =>
    component === "." || path === component || path.startsWith(component + "/"));
}

async function hasLegacyDocumentLayout(root, scope = undefined) {
  if (scope === undefined) scope = await appScope(root);
  const directories = ["src/tools/document-validation", "src/sandbox/tool"];
  if (!inScope("src/agent", scope) || !directories.some((directory) => inScope(directory, scope))) return false;
  for (const directory of directories) {
    if (inScope(directory, scope) && await existingPath(root, directory, true)) return true;
  }
  return inScope("src/agent", scope) &&
    await existingPath(root, "config/document-policy.json");
}

async function boundedAppText(root, path, maxBytes = MAX_BYTES) {
  if (!path || isAbsolute(path) || win32.isAbsolute(path) || path.includes("\\")
    || path.split("/").some(part => !part || part === "." || part === ".." || part.startsWith("."))) return null;
  if (!await existingPath(root, path)) return null;
  if ((await lstat(join(root, path))).size > maxBytes) return null;
  const file = await artifactPath(root, { path });
  return readFile(file, "utf8");
}

function documentContract(contract) {
  const schemas = [contract?.inputSchema, contract?.input_schema, contract?.parameters, contract];
  return schemas.some(schema => {
    const properties = schema?.properties;
    return properties?.document?.type === "object"
      || properties?.document?.properties?.content?.type === "string"
      || properties?.documentText?.type === "string";
  });
}

function declaresInputProperties(contract) {
  return [contract?.inputSchema, contract?.input_schema, contract?.parameters, contract]
    .some(schema => schema?.properties && Object.keys(schema.properties).length);
}

async function readSampleDocument(root, value, maxBytes) {
  if (typeof value === "string") value = { path: value };
  if (!value || typeof value !== "object") return null;
  let content = typeof value.content === "string" ? value.content : null;
  const path = typeof value.path === "string" ? value.path : null;
  if (path) {
    if (!/^(?:(?:src\/[^/]+(?:\/[^/]+)?\/)?(?:samples|fixtures|data)\/)[^/]+\.(?:md|txt)$/i.test(path)
      || /(?:secret|credential|token|password|private|\.env)/i.test(path)) return null;
    content = await boundedAppText(root, path, maxBytes);
  }
  const name = value.name ?? (path ? basename(path) : "sample-document.md");
  if (typeof name !== "string" || name.length > 200 || /[/\\\x00-\x1f]/.test(name)
    || !/\.(?:md|txt)$/i.test(name) || !content?.trim()
    || Buffer.byteLength(content) > maxBytes || content.includes("\0")
    || /-----BEGIN [^\n]*PRIVATE KEY-----|(?:API[_-]?KEY|TOKEN|PASSWORD|SECRET)\s*[:=]\s*["']?[A-Za-z0-9/+_-]{12,}/i.test(content)) return null;
  return { name, content };
}

export async function readAppInputCapabilities(root, {
  agentConfiguration = "", sandboxConfigured = Boolean(process.env.ACA_SANDBOX_GROUP?.trim()), scan, discovery,
} = {}) {
  const manifest = await boundedAppText(root, "azure-app.yaml");
  const scope = manifest ? parseAppScope(manifest, true) : null;
  const declaredSandbox = manifest && parseUnityManifest({ path: "azure-app.yaml", content: manifest })
    .some(component => component.tierId === "sandbox");
  scan ??= await scanRepository(root);
  discovery ??= await discoverRepository(root, { scan });
  const candidates = discovery.candidates.filter(candidate => inScope(candidate.projectPath, scope));
  const legacy = await hasLegacyDocumentLayout(root, scope);
  const sandboxAvailable = legacy || declaredSandbox || candidates.some(candidate => candidate.tierId === "sandbox")
    || (!manifest && (sandboxConfigured || /^\s*(?:export\s+)?ACA_SANDBOX_GROUP\s*=\s*["']?[^"'\s#]+/m.test(agentConfiguration)));
  const legacyContractPaths = [];
  if (legacy) {
    for (const directory of ["src/tools/document-validation", "src/sandbox/tool"]) {
      if (inScope(directory, scope) && await existingPath(root, directory, true)) {
        legacyContractPaths.push(`${directory}/contract.json`);
        break;
      }
    }
  }
  const contractPaths = [...new Set([
    ...legacyContractPaths,
    ...candidates.filter(candidate => ["agent", "sandbox"].includes(candidate.tierId))
      .map(candidate => `${candidate.projectPath === "." ? "" : candidate.projectPath + "/"}contract.json`),
  ])].filter(path => !legacy || !["src/tools/document-validation/contract.json", "src/sandbox/tool/contract.json"].includes(path)
    || legacyContractPaths.includes(path)).slice(0, 24);
  let declaredDocuments = false;
  let legacyContractExcludesDocuments = false;
  let sampleDocument = null;
  let maxBytes = 65536;
  for (const path of ["config/sandbox-boundary-test.json", "config/domain.json", ...contractPaths]) {
    const text = await boundedAppText(root, path);
    if (!text) continue;
    let metadata;
    try { metadata = JSON.parse(text); } catch { continue; }
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) continue;
    if (contractPaths.includes(path)) {
      declaredDocuments ||= documentContract(metadata);
      if (["src/tools/document-validation/contract.json", "src/sandbox/tool/contract.json"].includes(path)
        && declaresInputProperties(metadata) && !documentContract(metadata)) legacyContractExcludesDocuments = true;
    }
    const input = metadata.documentInput;
    if (input?.accepted === true) declaredDocuments = true;
    if (Number.isInteger(input?.maxBytes) && input.maxBytes > 0) maxBytes = Math.min(maxBytes, input.maxBytes);
    sampleDocument ??= await readSampleDocument(root,
      metadata.sampleDocument ?? metadata.baseDocument ?? input?.sampleDocument ?? input?.baseDocument, maxBytes);
  }
  let acceptsDocuments = declaredDocuments || (legacy && !legacyContractExcludesDocuments);
  if (sampleDocument && Buffer.byteLength(sampleDocument.content) > maxBytes) sampleDocument = null;
  if (!acceptsDocuments) {
    for (const candidate of candidates.filter(candidate => candidate.tierId === "agent").slice(0, 8)) {
      for (const name of ["main.py", "app.py", "server.mjs", "index.mjs", "main.ts", "index.ts"]) {
        const path = `${candidate.projectPath === "." ? "" : candidate.projectPath + "/"}${name}`;
        const source = await boundedAppText(root, path);
        if (source && /(?:(?:@?[\w.]+)\.(?:post|route)\(\s*["']\/invoke["']|(?:path|route)\s*=\s*["']\/invoke["'])/.test(source)
          && /(?:payload|body|request|data)\s*(?:\.get\(\s*["']document["']|\[\s*["']document["']\s*\]|\.document\b)/.test(source)) {
          acceptsDocuments = true;
          break;
        }
      }
      if (acceptsDocuments) break;
    }
  }
  if (acceptsDocuments && !sampleDocument) {
    const samplePaths = scan.files.map(file => file.path).filter(path =>
      /(?:^|\/)(?:samples|fixtures|data)\/(?:sample(?:-[\w-]+)?|base-document|starter-document)\.(?:md|txt)$/i.test(path)).sort().slice(0, 8);
    for (const path of samplePaths) {
      sampleDocument = await readSampleDocument(root, { path }, maxBytes);
      if (sampleDocument) break;
    }
  }
  const documentInput = acceptsDocuments ? { extensions: [".txt", ".md"], maxBytes,
    ...(legacy ? { legacyDocumentTemplate: true } : {}),
    ...(sampleDocument ? { sampleDocument } : {}) } : null;
  return {
    documentInput,
    sandboxBoundaryTest: sandboxAvailable ? {
      available: true, mode: documentInput ? "document" : "prompt-or-code",
      execution: "app-sandbox", requiresInvocation: true,
    } : null,
  };
}

async function isDocumentApp(root, discoveryState = {}) {
  return Boolean((await readAppInputCapabilities(root, discoveryState)).documentInput);
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
        : ["egress-policy.yaml", "egress-allowlist.json"].includes(file) ? "policies" : undefined;
  let title = `${tier?.mapLabel || tier?.name || "Component"} source`;
  let description = "Implementation discovered in this app. Open it in Files or a supported external editor to make changes.";
  if (path.endsWith("/prompts/system.md")) {
    title = "Agent instructions";
    description = "Saved instructions for this agent.";
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
  } else if (candidate.tierId === "web" && file === "server.mjs") {
    title = "Web server";
  } else if (candidate.tierId === "web" && file === "page.tsx") {
    title = "Web page";
  } else if (candidate.tierId === "web" && (file === "main.ts" || file === "main.tsx")) {
    title = "Web client script";
  } else if (file === "agents.config.yaml") {
    title = "Hosted skill configuration";
  } else if (file === "function_app.py") {
    title = isTrigger ? "Trigger implementation" : candidate.tierId === "workflows" ? "Workflow implementation" : "Hosted skill entry point";
  } else if (file === "Dockerfile") {
    title = "Container build";
  } else if (file === "egress-policy.yaml") {
    title = "Sandbox egress policy";
    description = "ACA Sandbox Egress Proxy policy and Transform header rules.";
  } else if (file === "egress-allowlist.json") {
    title = "Sandbox egress allowlist";
    description = "Explicit outbound enablement and approved destinations.";
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
        : ({ web: "user-experience", connectors: "connector", workflows: "orchestration", sandbox: "sandbox", sre: "operations" })[candidate.tierId],
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
  const scan = discoveryState.scan ?? await scanRepository(root);
  const discovery = discoveryState.discovery ?? await discoverRepository(root, { scan });
  const supportsDocuments = await isDocumentApp(root, { scan, discovery });
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
  const sandbox = discovery.candidates.find(candidate => candidate.tierId === "sandbox" && inScope(candidate.projectPath, scope));
  if (sandbox) {
    for (const path of ["config/egress-policy.yaml", "config/egress-allowlist.json"]) {
      if (await existingPath(root, path)) selected.set(path, sourceArtifact(path, sandbox));
    }
  }
  const documentArtifacts = [];
  if (supportsDocuments && await hasLegacyDocumentLayout(root, scope)) {
    for (const { optional, ...artifact } of DOCUMENT_ARTIFACTS) {
      const actual = await appArtifact(root, artifact);
      if (optional && !await existingPath(root, actual.path)) continue;
      selected.delete(actual.path);
      documentArtifacts.push(actual);
    }
  }
  const projectNames = new Map(documentArtifacts.map(artifact => [artifact.projectPath, artifact.projectName]));
  const artifacts = [...documentArtifacts, ...selected.values()].map(artifact =>
    projectNames.has(artifact.projectPath) ? { ...artifact, projectName: projectNames.get(artifact.projectPath) } : artifact);
  return {
    kind: supportsDocuments ? "document" : "source", supportsDocuments, artifacts,
    diagnostics: discovery.diagnostics,
  };
}

async function buildArtifact(root, id) {
  const catalog = await buildCatalog(root);
  return catalog.artifacts.find((item) => item.id === id);
}

async function appArtifact(root, artifact) {
  if (!["tool", "contract", "policy", "egress-policy"].includes(artifact.id)) return artifact;
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

export const WEB_STYLE_PRESETS = Object.freeze(["copilot", "warm", "modern", "editorial", "minimal"]);
const LEGACY_STYLE_PRESET_MAP = Object.freeze({
  fluent: "copilot",
  azure: "modern",
  industrial: "minimal",
});
const STYLABLE_WEB_FILE = /(?:^|\/)(?:index\.html|server\.mjs|page\.tsx)$/i;

function normalizeWebStylePreset(rawPreset) {
  const normalized = String(rawPreset ?? "").trim().toLowerCase();
  if (WEB_STYLE_PRESETS.includes(normalized)) return normalized;
  if (LEGACY_STYLE_PRESET_MAP[normalized]) return LEGACY_STYLE_PRESET_MAP[normalized];
  return undefined;
}

function isStylableWebArtifact(artifact) {
  return artifact?.blockCategory === "web" && STYLABLE_WEB_FILE.test(artifact.path ?? "");
}

function detectWebStylePreset(content) {
  if (typeof content !== "string") return undefined;
  const htmlMatch = content.match(/<html\b[^>]*\bdata-style=["']([a-z0-9_-]+)["']/i);
  if (htmlMatch) {
    const resolved = normalizeWebStylePreset(htmlMatch[1]);
    if (resolved) return resolved;
  }
  const stateMatch = content.match(/useState<StylePreset>\(\s*["']([a-z0-9_-]+)["']\s*\)/);
  if (stateMatch) {
    const resolved = normalizeWebStylePreset(stateMatch[1]);
    if (resolved) return resolved;
  }
  const attrMatch = content.match(/\bdata-style=["']([a-z0-9_-]+)["']/i);
  if (attrMatch) {
    const resolved = normalizeWebStylePreset(attrMatch[1]);
    if (resolved) return resolved;
  }
  return undefined;
}

const INLINE_WEB_STYLE_TOKENS_CSS = `
:root,[data-style="copilot"]{--bg:#faf9f8;--bg-elev:#ffffff;--surface-muted:#f3f2f0;--border:#e5e2dc;--text:#141418;--text-muted:#42434d;--text-soft:#686a78;--accent:#464feb;--accent-contrast:#ffffff;--radius-lg:16px;--radius-xl:20px;--shadow-2:0 2px 6px rgba(20,20,24,.05),0 8px 24px rgba(70,79,235,.06);--font-sans:"Segoe UI",-apple-system,BlinkMacSystemFont,sans-serif;--font-display:"Segoe UI",-apple-system,BlinkMacSystemFont,sans-serif}
[data-style="copilot"][data-theme="dark"]{--bg:#0f1015;--bg-elev:#171922;--surface-muted:#202330;--border:#2d3142;--text:#f5f6fa;--text-muted:#b9bccb;--text-soft:#8b90a3;--accent:#7b83ff;--accent-contrast:#0c0d14}
[data-style="warm"]{--bg:#f9f5f0;--bg-elev:#fffdfb;--surface-muted:#f1eae1;--border:#e4d9cc;--text:#231b15;--text-muted:#57483d;--text-soft:#7c6a5c;--accent:#c2410c;--accent-contrast:#ffffff;--radius-lg:14px;--radius-xl:18px;--shadow-2:0 2px 8px rgba(35,27,21,.06)}
[data-style="warm"][data-theme="dark"]{--bg:#16120f;--bg-elev:#211b17;--surface-muted:#2c241e;--border:#3e332b;--text:#f9f3ec;--text-muted:#cbbba9;--text-soft:#9a8978;--accent:#fb923c;--accent-contrast:#1b120b}
[data-style="modern"]{--bg:#f4f7fb;--bg-elev:#ffffff;--surface-muted:#eaeff7;--border:#d8e1ee;--text:#0f172a;--text-muted:#334155;--text-soft:#64748b;--accent:#0f6cbd;--accent-contrast:#ffffff;--radius-lg:10px;--radius-xl:12px;--shadow-2:0 2px 6px rgba(15,23,42,.06)}
[data-style="modern"][data-theme="dark"]{--bg:#0b1120;--bg-elev:#111827;--surface-muted:#1e293b;--border:#334155;--text:#f8fafc;--text-muted:#cbd5e1;--text-soft:#94a3b8;--accent:#38bdf8;--accent-contrast:#082f49}
[data-style="editorial"]{--bg:#f6f2ea;--bg-elev:#fdfbf7;--surface-muted:#efeae0;--border:#ded6c6;--text:#1c1917;--text-muted:#44403c;--text-soft:#78716c;--accent:#9a3412;--accent-contrast:#ffffff;--radius-lg:6px;--radius-xl:8px;--font-display:Georgia,Cambria,"Times New Roman",serif}
[data-style="editorial"][data-theme="dark"]{--bg:#141210;--bg-elev:#1c1917;--surface-muted:#292524;--border:#3f3a36;--text:#f5f2eb;--text-muted:#d6d0c4;--text-soft:#a8a096;--accent:#f59e0b;--accent-contrast:#1c1406}
[data-style="minimal"]{--bg:#f4f4f5;--bg-elev:#ffffff;--surface-muted:#e4e4e7;--border:#18181b;--text:#09090b;--text-muted:#27272a;--text-soft:#52525b;--accent:#09090b;--accent-contrast:#ffffff;--radius-lg:4px;--radius-xl:4px;--shadow-2:4px 4px 0 0 #18181b;--font-sans:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;--font-display:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
[data-style="minimal"][data-theme="dark"]{--bg:#09090b;--bg-elev:#121215;--surface-muted:#1f1f23;--border:#f4f4f5;--text:#fafafa;--text-muted:#d4d4d8;--text-soft:#a1a1aa;--accent:#fafafa;--accent-contrast:#09090b;--shadow-2:4px 4px 0 0 #f4f4f5}
html[data-style],body{background:var(--bg);color:var(--text);font-family:var(--font-sans)}
html[data-style] main{max-width:720px;margin:0 auto;background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius-xl);box-shadow:var(--shadow-2);padding:32px}
html[data-style] h1,html[data-style] h2,html[data-style] h3{font-family:var(--font-display);color:var(--text)}
html[data-style] p{color:var(--text-muted)}
html[data-style] button,html[data-style] main a{display:inline-flex;align-items:center;justify-content:center;background:var(--accent);color:var(--accent-contrast);border:1px solid var(--accent);border-radius:var(--radius-lg);padding:10px 16px;font-weight:600;text-decoration:none;cursor:pointer}
html[data-style] textarea,html[data-style] input{background:var(--bg-elev);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-lg)}
html[data-style] pre{background:var(--surface-muted);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-lg)}
`.trim();

function detectWebColorTheme(content) {
  if (typeof content !== "string") return undefined;
  const match = content.match(/\bdata-theme=["'](light|dark)["']/i);
  return match ? match[1].toLowerCase() : undefined;
}

export function applyWebStylePreset(content, stylePreset, colorTheme) {
  const resolvedPreset = normalizeWebStylePreset(stylePreset) ?? "copilot";
  const resolvedTheme = colorTheme === "dark" ? "dark" : colorTheme === "light" ? "light" : undefined;
  let updated = content;
  if (/<header\s+class=["']toolbar["'][\s\S]*?<\/header>\s*/i.test(updated)) {
    updated = updated.replace(/<header\s+class=["']toolbar["'][\s\S]*?<\/header>\s*/gi, "");
  }
  if (/<html\b[^>]*\bdata-style=["'][a-z0-9_-]+["']/i.test(updated)) {
    updated = updated.replace(
      /(<html\b[^>]*\bdata-style=["'])([a-z0-9_-]+)(["'])/i,
      `$1${resolvedPreset}$3`,
    );
  } else if (/<html\b/i.test(updated)) {
    updated = updated.replace(/<html\b/i, `<html data-style="${resolvedPreset}" data-theme="${resolvedTheme ?? "light"}"`);
  }
  if (resolvedTheme) {
    if (/<html\b[^>]*\bdata-theme=["'][a-z0-9_-]+["']/i.test(updated)) {
      updated = updated.replace(
        /(<html\b[^>]*\bdata-theme=["'])([a-z0-9_-]+)(["'])/i,
        `$1${resolvedTheme}$3`,
      );
    } else if (/<html\b[^>]*\bdata-style=["'][a-z0-9_-]+["']/i.test(updated)) {
      updated = updated.replace(
        /(<html\b[^>]*\bdata-style=["'][a-z0-9_-]+["'])/i,
        `$1 data-theme="${resolvedTheme}"`,
      );
    }
  }
  if (/<style>[\s\S]*?<\/style>/i.test(updated) && !/\[data-style=["']copilot["']\]\[data-theme=["']dark["']\]|\[data-theme=["']dark["']\]/i.test(updated)) {
    updated = updated.replace(
      /:root,\[data-style=["']copilot["']\][\s\S]*?html\[data-style\]\s+pre\{[^\n}]*\}\n?/i,
      "",
    );
    updated = updated.replace(/<\/style>/i, `\n${INLINE_WEB_STYLE_TOKENS_CSS}\n</style>`);
  } else if (/<\/head>/i.test(updated) && !/tokens\.css|\[data-style=["']copilot["']\]/i.test(updated)) {
    updated = updated.replace(/<\/head>/i, `<style>\n${INLINE_WEB_STYLE_TOKENS_CSS}\n</style>\n</head>`);
  }
  if (/<body>\s*<h1>/i.test(updated) && !/<main\b/i.test(updated)) {
    updated = updated
      .replace(/<body>\s*(<h1>)/i, "<body><main>\n$1")
      .replace(/(<\/pre>)\s*(<script>)/i, "$1\n</main>$2");
  }
  if (/useState<StylePreset>\(\s*["'][a-z0-9_-]+["']\s*\)/.test(updated)) {
    updated = updated.replace(
      /(useState<StylePreset>\(\s*["'])([a-z0-9_-]+)(["']\s*\))/,
      `$1${resolvedPreset}$3`,
    );
  } else if (!/<html\b/i.test(updated) && /\bdata-style=["'][a-z0-9_-]+["']/i.test(updated)) {
    updated = updated.replace(
      /(\bdata-style=["'])([a-z0-9_-]+)(["'])/i,
      `$1${resolvedPreset}$3`,
    );
  } else if (!/<html\b/i.test(updated) && /<(main|div)\s+className=/.test(updated)) {
    updated = updated.replace(/<(main|div)\s+className=/, `<$1 data-style="${resolvedPreset}" data-theme="${resolvedTheme ?? "light"}" className=`);
  }
  if (resolvedTheme && !/<html\b/i.test(updated)) {
    if (/\bdata-theme=["'][a-z0-9_-]+["']/i.test(updated)) {
      updated = updated.replace(
        /(\bdata-theme=["'])([a-z0-9_-]+)(["'])/i,
        `$1${resolvedTheme}$3`,
      );
    } else if (/\bdata-style=["'][a-z0-9_-]+["']/i.test(updated)) {
      updated = updated.replace(
        /(\bdata-style=["'][a-z0-9_-]+["'])/i,
        `$1 data-theme="${resolvedTheme}"`,
      );
    }
  }
  if (/<button\b[^>]*\bdata-style-choice=["'][a-z0-9_-]+["'][^>]*>/i.test(updated)) {
    updated = updated.replace(
      /<button\b([^>]*\bdata-style-choice=["']([a-z0-9_-]+)["'][^>]*)>/gi,
      (_match, attrs, choice) => {
        const cleaned = attrs.replace(/\s+data-selected=["'][^"']*["']/gi, "");
        return `<button${cleaned}${(normalizeWebStylePreset(choice) ?? choice.toLowerCase()) === resolvedPreset ? ' data-selected="true"' : ""}>`;
      },
    );
  }
  return updated;
}

async function syncCompanionStyleFiles(file, stylePreset, colorTheme) {
  if (/(?:^|[\\/])index\.html$/i.test(file)) {
    const distIndexHtml = join(dirname(file), "dist", "index.html");
    try {
      const distContent = await readFile(distIndexHtml, "utf8");
      const nextDist = applyWebStylePreset(distContent, stylePreset, colorTheme);
      if (nextDist !== distContent) {
        await writeFile(distIndexHtml, nextDist, "utf8");
      }
    } catch {
      // Ignore if no prebuilt dist/index.html exists.
    }
  }
  if (/page\.[jt]sx?$/i.test(file)) {
    const globalsCss = join(dirname(file), "globals.css");
    try {
      const cssContent = await readFile(globalsCss, "utf8");
      if (!/\[data-style=["']copilot["']\]\[data-theme=["']dark["']\]|\[data-theme=["']dark["']\]/i.test(cssContent)) {
        const cleanedCss = cssContent.replace(
          /\n*:root,\[data-style=["']copilot["']\][\s\S]*?\[data-style\]\s+\.shadow-sm\{[^\n}]*\}\s*$/i,
          "",
        );
        await writeFile(globalsCss, `${cleanedCss.trimEnd()}\n\n${TAILWIND_WEB_STYLE_TOKENS_CSS}\n`, "utf8");
      }
    } catch {
      // Ignore if no sibling globals.css exists.
    }
  }
}

async function readArtifact(root, artifact) {
  artifact = await appArtifact(root, artifact);
  try {
    const path = await artifactPath(root, artifact);
    let content = await readFile(path, "utf8");
    const detectedStyle = artifact.blockCategory === "web" ? detectWebStylePreset(content) : undefined;
    const stylePreset = detectedStyle ?? (isStylableWebArtifact(artifact) ? "copilot" : undefined);
    const colorTheme = artifact.blockCategory === "web" ? (detectWebColorTheme(content) ?? "light") : undefined;
    if (stylePreset && isStylableWebArtifact(artifact)) {
      if (!detectedStyle) {
        const initialized = applyWebStylePreset(content, stylePreset, colorTheme);
        if (initialized !== content) {
          content = initialized;
          await writeFile(path, content, "utf8").catch(() => {});
        }
      }
      await syncCompanionStyleFiles(path, stylePreset, colorTheme);
    }
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
    return {
      ...artifact,
      customizationArea,
      focusLine,
      ...(stylePreset ? { stylePreset, colorTheme } : {}),
      available: true,
      content,
    };
  } catch (error) {
    if (error.code === "ENOENT") return { ...artifact, available: false, detail: "Expected file is missing from this app. Restore it or review the app configuration." };
    throw error;
  }
}

export const TAILWIND_WEB_STYLE_TOKENS_CSS = `
${INLINE_WEB_STYLE_TOKENS_CSS}
body:has([data-style]),main[data-style]{background:var(--bg);color:var(--text);font-family:var(--font-sans)}
[data-style] .bg-white{background-color:var(--bg-elev)!important}
[data-style] .bg-slate-50,[data-style] .bg-slate-100{background-color:var(--surface-muted)!important}
[data-style] .bg-slate-900,[data-style] .bg-emerald-600{background-color:var(--accent)!important;color:var(--accent-contrast)!important}
[data-style] .border-slate-100,[data-style] .border-slate-200,[data-style] .border-slate-300{border-color:var(--border)!important}
[data-style] .text-slate-900,[data-style] .text-slate-800{color:var(--text)!important}
[data-style] .text-slate-700,[data-style] .text-slate-600{color:var(--text-muted)!important}
[data-style] .text-slate-500{color:var(--text-soft)!important}
[data-style] .rounded-2xl{border-radius:var(--radius-xl)!important}
[data-style] .rounded-xl{border-radius:var(--radius-lg)!important}
[data-style] .shadow-sm{box-shadow:var(--shadow-2)!important}
`.trim();

export async function writeBuildWebStyle(root, id, stylePreset, colorTheme) {
  if (typeof stylePreset !== "string" || !WEB_STYLE_PRESETS.includes(stylePreset)) {
    const error = new Error("Choose a valid web style preset.");
    error.statusCode = 400;
    throw error;
  }
  const artifact = await buildArtifact(root, id);
  if (!artifact || artifact.blockCategory !== "web") {
    const error = new Error("Choose a User Experience artifact that supports style presets.");
    error.statusCode = 400;
    throw error;
  }
  const resolved = await appArtifact(root, artifact);
  const file = await artifactPath(root, resolved);
  const content = await readFile(file, "utf8");
  if (!detectWebStylePreset(content) && !isStylableWebArtifact(resolved)) {
    const error = new Error("This file does not declare a configurable Fluent Headless style preset.");
    error.statusCode = 400;
    throw error;
  }
  const nextContent = applyWebStylePreset(content, stylePreset, colorTheme);
  await writeFile(file, nextContent, "utf8");
  await syncCompanionStyleFiles(file, stylePreset, colorTheme);
  return { artifact: await readArtifact(root, artifact) };
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

export async function readBuildRuntime(root, capabilities = undefined) {
  capabilities ??= await readAppInputCapabilities(root);
  if (!capabilities.documentInput && !capabilities.sandboxBoundaryTest) return null;
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
