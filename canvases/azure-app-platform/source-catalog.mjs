import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { discoverRepository, runCommand } from "./discovery.mjs";
import { readAppLastOpened, sortAppsByLastOpened } from "./app-recency.mjs";

const EXCLUDED_PROJECT_PREFIXES = [
  ".copilot",
  ".scratch",
  ".github",
  "canvases",
  "node_modules",
  "tests",
];

export const EMPTY_TEMPLATE = Object.freeze({
  id: "builtin-empty-starter-v1",
  kind: "empty",
  name: "Empty Starter App",
  description: "Start with an editable app shell and shape it around your own scenario.",
  capabilityIds: ["web", "agent", "gateway", "skills"],
  customization: ["App purpose", "Agent instructions", "Hosted Skill name"],
  readyToRun: true,
  startup: {
    start: "./scripts/dev-start.sh --skip-skill",
    fullStart: "./scripts/dev-start.sh",
    stop: "./scripts/dev-stop.sh",
    startArgs: ["--skip-skill"],
    startPowerShellArgs: ["-SkipSkill"],
    requiresGatewayForFullStart: false,
    entrypoints: [
      { name: "web", port: 3000 },
      { name: "agent", port: 8088 },
      { name: "skill", port: 7071, kind: "function" },
    ],
    startEntrypoints: [
      { name: "web", port: 3000 },
      { name: "agent", port: 8088 },
    ],
    reservedPorts: [3000, 8088, 7071],
  },
  requiredPaths: [
    "README.md",
    "azure-app.yaml",
    "config/domain.json",
    "scripts/dev-start.sh",
    "scripts/dev-stop.sh",
    "scripts/dev-start.ps1",
    "scripts/dev-stop.ps1",
    "src/web",
    "src/agent/agent.yaml",
    "src/agent/prompts/system.md",
    "src/skills/<hosted-skill>",
    "src/skills/<hosted-skill>/tests/test_contract.py",
  ],
  constraints: {
    hostedSkillCount: 1,
    inventDomainTools: false,
    editableDomainConfiguration: true,
    wholeAppScriptsRequired: true,
  },
});

export const SANDBOX_GATEWAY_TEMPLATE = Object.freeze({
  id: "builtin-sandbox-gateway-minimal-v1",
  kind: "empty",
  name: "Sandboxes & AI Gateway Starter",
  description: "Minimal starter with an agent runtime in ACA Sandboxes, isolated tool execution, and governed model access through AI Gateway.",
  capabilityIds: ["agent", "sandbox", "gateway"],
  customization: ["App purpose", "Agent instructions"],
  readyToRun: true,
  startup: {
    start: "./scripts/dev-start.sh",
    fullStart: "./scripts/dev-start.sh",
    stop: "./scripts/dev-stop.sh",
    startArgs: [],
    startPowerShellArgs: [],
    requiresGatewayForFullStart: false,
    entrypoints: [
      { name: "agent", port: 8088 },
    ],
    startEntrypoints: [
      { name: "agent", port: 8088 },
    ],
    reservedPorts: [8088],
  },
  requiredPaths: [
    "README.md",
    "azure-app.yaml",
    "config/domain.json",
    "config/egress-allowlist.json",
    "config/runtime.json",
    "config/document-policy.json",
    "scripts/dev-start.sh",
    "scripts/dev-stop.sh",
    "scripts/dev-start.ps1",
    "scripts/dev-stop.ps1",
    "scripts/load-ports.sh",
    "scripts/load-ports.ps1",
    "src/agent/agent.yaml",
    "src/agent/main.py",
    "src/agent/pyproject.toml",
    "src/agent/Dockerfile",
    "src/agent/tests/test_runtime.py",
    "src/agent/prompts/system.md",
    "src/tools/document-validation/main.py",
    "src/tools/document-validation/pyproject.toml",
    "src/tools/document-validation/Dockerfile",
    "src/tools/document-validation/contract.json",
    "src/tools/document-validation/tests/test_main.py",
    "src/tools/document-validation/egress-policy.md",
    "src/policy/enforcement.py",
    "docs/demos/loan-application/README.md",
    "docs/demos/loan-application/HOW-IT-WORKS.md",
    "examples/loan-application.txt",
    "infra-ai-gateway/README.md",
  ],
  constraints: {
    hostedSkillCount: 0,
    inventDomainTools: false,
    editableDomainConfiguration: true,
    wholeAppScriptsRequired: true,
    sandboxToolBoundary: true,
  },
});

export const LOCAL_TEMPLATES = Object.freeze([SANDBOX_GATEWAY_TEMPLATE, EMPTY_TEMPLATE]);

const RUNNABLE_SAMPLE_PATHS = Object.freeze([
  "scripts/dev-start.sh",
  "scripts/dev-stop.sh",
  "scripts/dev-start.ps1",
  "scripts/dev-stop.ps1",
  "src/agent/agent.yaml",
  "src/web/package.json",
]);
const DEALER_REPOSITORY = "https://github.com/coreai-microsoft/azure-app-platform.git";
const DEALER_LEGACY_REPOSITORY = "https://github.com/coreai-microsoft/unity.git";
const DEALER_BASE_COMMIT = "2830d882941163f833b9a893dcc62d507dc98bb6";
const TEMPLATE_TIER_ORDER = Object.freeze([
  "web",
  "agent",
  "gateway",
  "skills",
  "sandbox",
  "connectors",
  "workflows",
  "sre",
  "data",
]);

function sourceId(...values) {
  return createHash("sha256").update(values.join("\0")).digest("hex").slice(0, 20);
}

function sanitizeRepository(value) {
  const remote = value?.trim();
  if (!remote || remote.startsWith("/") || remote.startsWith("file:") || remote.startsWith(".")) {
    return null;
  }
  const scp = remote.match(/^[^/@\s]+@([^:/\s]+):([^\s?#]+)$/);
  let parsed;
  if (scp) {
    parsed = new URL(`ssh://${scp[1]}/${scp[2]}`);
  } else {
    try {
      parsed = new URL(remote);
    } catch {
      return null;
    }
  }
  if (!["http:", "https:", "ssh:", "git:"].includes(parsed.protocol)) {
    return null;
  }
  const repositoryPath = parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (!parsed.hostname || !repositoryPath) return null;
  return `https://${parsed.hostname.toLowerCase()}/${repositoryPath}.git`;
}

async function discoverPinnedRepository(root, commit, commandRunner) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "app-platform-template-"));
  const archive = join(temporaryRoot, "source.tar");
  const extracted = join(temporaryRoot, "source");
  try {
    await mkdir(extracted);
    const archived = await commandRunner("git", [
      "-C",
      root,
      "archive",
      "--format=tar",
      `--output=${archive}`,
      commit,
    ]);
    if (!archived.ok) {
      throw new Error(`Could not inspect pinned source ${commit}: ${archived.stderr || archived.error || "unknown error"}`);
    }
    const unpacked = await commandRunner("tar", ["-xf", archive, "-C", extracted]);
    if (!unpacked.ok) {
      throw new Error(`Could not unpack pinned source ${commit}: ${unpacked.stderr || unpacked.error || "unknown error"}`);
    }
    return await discoverRepository(extracted);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function parseWorktrees(output) {
  const worktrees = [];
  let current = null;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) {
        worktrees.push(current);
      }
      current = { path: line.slice("worktree ".length) };
    } else if (current && line.startsWith("HEAD ")) {
      current.commit = line.slice("HEAD ".length);
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (current && line === "detached") {
      current.branch = null;
    }
  }
  if (current) {
    worktrees.push(current);
  }
  return worktrees;
}

function isUsefulProject(projectPath) {
  return !EXCLUDED_PROJECT_PREFIXES.some((prefix) =>
    projectPath === prefix || projectPath.startsWith(`${prefix}/`));
}

async function worktreeTitle(root, branch) {
  try {
    const identity = JSON.parse(await readFile(`${root}/.azure-app-platform/app.json`, "utf8"));
    if (typeof identity.name === "string" && identity.name.trim()) {
      return identity.name.trim();
    }
  } catch {
    // Identity metadata was added after the first generated apps.
  }
  const folderName = basename(root);
  const generatedName = folderName.match(/^(dealer-sample|starter-app|app-platform)-[a-z0-9]+/i)?.[0];
  if (generatedName) return generatedName;
  if (branch && /^(dealer-sample|starter-app|app-platform)-/i.test(branch)) return branch;
  return folderName;
}

async function inspectWorktree(worktree, commandRunner, pinnedDiscovery) {
  const root = await realpath(worktree.path);
  const [status, remote, repository, commitTimestamp, approvedAncestry, ...sampleFiles] = await Promise.all([
    commandRunner("git", ["-C", root, "status", "--porcelain"]),
    commandRunner("git", ["-C", root, "config", "--get", "remote.origin.url"]),
    discoverRepository(root),
    worktree.commit
      ? commandRunner("git", ["-C", root, "show", "-s", "--format=%ct", worktree.commit])
      : Promise.resolve({ ok: false, stdout: "" }),
    worktree.commit
      ? commandRunner("git", ["-C", root, "merge-base", "--is-ancestor", DEALER_BASE_COMMIT, worktree.commit])
      : Promise.resolve({ ok: false }),
    ...RUNNABLE_SAMPLE_PATHS.map((path) => worktree.commit
      ? commandRunner("git", ["-C", root, "cat-file", "-e", `${worktree.commit}:${path}`])
      : Promise.resolve({ ok: false })),
  ]);
  const candidates = repository.candidates
    .filter((candidate) => isUsefulProject(candidate.projectPath));
  const implementations = candidates.map((candidate) => ({
    id: sourceId(root, worktree.commit, candidate.tierId, candidate.projectPath),
    tierId: candidate.tierId,
    name: candidate.name,
    projectPath: candidate.projectPath,
    matchedFiles: candidate.evidence,
  }));
  const normalizedRepository = remote.ok ? sanitizeRepository(remote.stdout) : null;
  const dirty = !worktree.commit || !status.ok || Boolean(status.stdout.trim());
  const runnableSample = sampleFiles.every((result) => result.ok);
  const approvedSampleAncestry = approvedAncestry.ok;
  let pinnedImplementations = implementations;
  if (worktree.commit && (normalizedRepository === DEALER_REPOSITORY || normalizedRepository === DEALER_LEGACY_REPOSITORY) && approvedSampleAncestry && runnableSample && (dirty || pinnedDiscovery !== discoverPinnedRepository)) {
    const pinnedRepository = await pinnedDiscovery(root, worktree.commit, commandRunner);
    pinnedImplementations = pinnedRepository.candidates
      .filter((candidate) => isUsefulProject(candidate.projectPath))
      .map((candidate) => ({
        id: sourceId(root, worktree.commit, candidate.tierId, candidate.projectPath),
        tierId: candidate.tierId,
        name: candidate.name,
        projectPath: candidate.projectPath,
        matchedFiles: candidate.evidence,
      }));
  }
  return {
    id: sourceId(root, worktree.commit),
    kind: "git-worktree",
    name: await worktreeTitle(root, worktree.branch),
    lastOpenedAt: await readAppLastOpened(root),
    declaredApp: repository.componentPaths !== null,
    path: root,
    branch: worktree.branch,
    commit: worktree.commit,
    repository: normalizedRepository,
    dirty,
    statusKnown: status.ok,
    implementations,
    pinnedImplementations,
    capabilityIds: [...new Set(implementations.map((item) => item.tierId))],
    runnableSample,
    approvedSampleAncestry,
    commitTimestamp: commitTimestamp.ok ? Number(commitTimestamp.stdout.trim()) || 0 : 0,
  };
}

export async function listSourceCatalog({
  workspaceRoot = process.cwd(),
  commandRunner = runCommand,
  additionalRoots = [],
  pinnedDiscovery = discoverPinnedRepository,
} = {}) {
  const result = await commandRunner("git", [
    "-C",
    workspaceRoot,
    "worktree",
    "list",
    "--porcelain",
  ]);
  if (!result.ok) {
    throw new Error(`Could not list Git worktrees: ${result.stderr || result.error || "unknown error"}`);
  }
  const discovered = parseWorktrees(result.stdout);
  const knownPaths = new Set(discovered.map((worktree) => worktree.path));
  for (const path of additionalRoots) {
    const topLevel = await commandRunner("git", ["-C", path, "rev-parse", "--show-toplevel"]);
    const sourceRoot = topLevel.ok ? await realpath(topLevel.stdout.trim()) : path;
    if (knownPaths.has(sourceRoot)) {
      continue;
    }
    knownPaths.add(sourceRoot);
    const [commit, branch] = await Promise.all([
      commandRunner("git", ["-C", sourceRoot, "rev-parse", "HEAD"]),
      commandRunner("git", ["-C", sourceRoot, "branch", "--show-current"]),
    ]);
    discovered.push({
      path: sourceRoot,
      commit: commit.ok ? commit.stdout.trim() : null,
      branch: branch.ok ? branch.stdout.trim() || null : null,
    });
  }
  const inspected = await Promise.allSettled(
    discovered.map((worktree) => inspectWorktree(worktree, commandRunner, pinnedDiscovery)),
  );
  const roots = inspected
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const diagnostics = inspected
    .filter((result) => result.status === "rejected")
    .map((result) => ({
      level: "warning",
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
    }));
  const sampleRoots = roots
    .filter((root) => root.commit
      && (root.repository === DEALER_REPOSITORY || root.repository === DEALER_LEGACY_REPOSITORY)
      && root.approvedSampleAncestry
      && root.runnableSample
      && ["web", "agent", "skills", "sandbox", "workflows"].every((tierId) =>
        root.pinnedImplementations.some((item) => item.tierId === tierId)))
    .sort((left, right) => right.commitTimestamp - left.commitTimestamp);
  const templates = [
    SANDBOX_GATEWAY_TEMPLATE,
    ...sampleRoots.slice(0, 1).map((root) => ({
      id: root.id,
      kind: "sample",
      name: "Dealership E2E Reference Sample",
      description: "Start with a complete, runnable reference app for the dealer workflow.",
      capabilityIds: [...TEMPLATE_TIER_ORDER],
      sourceRootId: root.id,
      commit: root.commit,
      dirty: root.dirty,
      readyToRun: true,
      preservesDomain: true,
      startup: {
        start: "./scripts/dev-start.sh --skip-skills --skip-agent",
        fullStart: "./scripts/dev-start.sh",
        stop: "./scripts/dev-stop.sh",
        startArgs: ["--skip-skills", "--skip-agent"],
        startPowerShellArgs: ["-SkipSkills", "-SkipAgent"],
        requiresGatewayForFullStart: true,
        entrypoints: [
          { name: "web", port: 3000 },
          { name: "agent", port: 8088 },
          { name: "inventory-search", port: 7071, kind: "function" },
          { name: "trade-in-value", port: 7072, kind: "function" },
          { name: "rate-sheet", port: 7073, kind: "function" },
          { name: "deal-doc", port: 7074, kind: "function" },
          { name: "azurite", port: 10000 },
          { name: "azurite-queue", port: 10001 },
          { name: "azurite-table", port: 10002 },
        ],
        startEntrypoints: [{ name: "web", port: 3000 }],
        reservedPorts: [3000, 8088, 7071, 7072, 7073, 7074, 10000, 10001, 10002],
      },
    })),
    EMPTY_TEMPLATE,
  ];
  return {
    generatedAt: new Date().toISOString(),
    roots,
    apps: sortAppsByLastOpened(roots.filter((root) =>
      root.declaredApp || (root.runnableSample && root.capabilityIds.includes("web") && root.capabilityIds.includes("agent")))),
    templates,
    diagnostics,
  };
}

export function resolveSourcePlan(catalog, input) {
  const roots = new Map(catalog.roots.map((root) => [root.id, root]));
  const implementations = new Map(catalog.roots.flatMap((root) =>
    root.implementations.map((implementation) => [
      implementation.id,
      { ...implementation, root },
    ])));

  let bindings = [];
  if (input?.starterKind === "template") {
    const template = LOCAL_TEMPLATES.find((item) => item.id === input.templateRootId)
      ?? catalog.templates.find((item) => item.id === input.templateRootId);
    if (template && LOCAL_TEMPLATES.some((item) => item.id === template.id)) {
      return [{
        kind: "empty-template",
        templateId: template.id,
        templateVersion: 1,
        snapshotMode: "blueprint",
        capabilityIds: template.capabilityIds,
        requiredPaths: template.requiredPaths,
        constraints: template.constraints,
        startup: template.startup,
      }];
    }
    const root = template ? roots.get(template.sourceRootId) : null;
    if (!template || !root?.commit) {
      throw new Error("The selected template is no longer available.");
    }
    return [{
      kind: "complete-sample",
      templateId: template.id,
      rootId: root.id,
      rootPath: root.path,
      projectPath: ".",
      repository: root.repository,
      branch: root.branch,
      commit: root.commit,
      snapshotMode: "commit",
      capabilityIds: template.capabilityIds,
      startup: template.startup,
    }];
  } else if (input?.journey === "assemble") {
    for (const binding of input.sourceBindings ?? []) {
      const sourceIds = [...new Set(binding.sourceIds ?? [])];
      if (sourceIds.length === 0) {
        throw new Error(`Choose a source project for ${binding.tierId}.`);
      }
      for (const id of sourceIds) {
        const selected = implementations.get(id);
        if (!selected || selected.tierId !== binding.tierId) {
          throw new Error(`The selected ${binding.tierId} source is no longer available.`);
        }
        bindings.push({
          tierId: binding.tierId,
          source: selected,
          root: selected.root,
          snapshotMode: selected.root.dirty ? "working-tree" : "commit",
        });
      }
    }
  }

  return bindings.map(({ tierId, source, root, snapshotMode }) => ({
    tierId,
    sourceId: source.id,
    rootId: root.id,
    rootPath: root.path,
    projectPath: source.projectPath,
    repository: root.repository,
    branch: root.branch,
    commit: root.commit,
    snapshotMode,
  }));
}

export { parseWorktrees };
