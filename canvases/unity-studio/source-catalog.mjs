import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { discoverRepository, runCommand } from "./discovery.mjs";

const EXCLUDED_PROJECT_PREFIXES = [
  ".copilot",
  ".scratch",
  ".github",
  "canvases",
  "node_modules",
  "tests",
];

function sourceId(...values) {
  return createHash("sha256").update(values.join("\0")).digest("hex").slice(0, 20);
}

function sanitizeRepository(value) {
  const remote = value?.trim();
  if (!remote || remote.startsWith("/") || remote.startsWith("file:") || remote.startsWith(".")) {
    return null;
  }
  const scp = remote.match(/^[^/@\s]+@([^:/\s]+):([^\s?#]+)$/);
  if (scp) {
    return `ssh://${scp[1]}/${scp[2]}`;
  }
  try {
    const url = new URL(remote);
    if (!["http:", "https:", "ssh:", "git:"].includes(url.protocol)) {
      return null;
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

async function discoverPinnedRepository(root, commit, commandRunner) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "unity-template-"));
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
    const readme = await readFile(`${root}/README.md`, "utf8");
    const heading = readme.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (heading) {
      return heading;
    }
  } catch {
    // A README is optional; branch/folder names remain deterministic labels.
  }
  return branch || basename(root);
}

async function inspectWorktree(worktree, commandRunner, pinnedDiscovery) {
  const root = await realpath(worktree.path);
  const [status, remote, repository] = await Promise.all([
    commandRunner("git", ["-C", root, "status", "--porcelain"]),
    commandRunner("git", ["-C", root, "config", "--get", "remote.origin.url"]),
    discoverRepository(root),
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
  const pinnedRepository = worktree.commit
    ? await pinnedDiscovery(root, worktree.commit, commandRunner)
    : { candidates: [] };
  const pinnedImplementations = pinnedRepository.candidates
    .filter((candidate) => isUsefulProject(candidate.projectPath))
    .map((candidate) => ({
      id: sourceId(root, worktree.commit, candidate.tierId, candidate.projectPath),
      tierId: candidate.tierId,
      name: candidate.name,
      projectPath: candidate.projectPath,
      matchedFiles: candidate.evidence,
    }));
  return {
    id: sourceId(root, worktree.commit),
    kind: "git-worktree",
    name: await worktreeTitle(root, worktree.branch),
    path: root,
    branch: worktree.branch,
    commit: worktree.commit,
    repository: remote.ok ? sanitizeRepository(remote.stdout) : null,
    dirty: !worktree.commit || !status.ok || Boolean(status.stdout.trim()),
    statusKnown: status.ok,
    implementations,
    pinnedImplementations,
    capabilityIds: [...new Set(implementations.map((item) => item.tierId))],
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
  const templates = roots
    .filter((root) => root.commit
      && new Set(root.pinnedImplementations.map((item) => item.tierId)).size >= 3)
    .map((root) => ({
      id: root.id,
      name: root.name,
      description: `${new Set(root.pinnedImplementations.map((item) => item.tierId)).size} Unity capabilities · pinned commit`,
      capabilityIds: [...new Set(root.pinnedImplementations.map((item) => item.tierId))],
      sourceRootId: root.id,
      commit: root.commit,
      dirty: root.dirty,
    }));
  return {
    generatedAt: new Date().toISOString(),
    roots,
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
    const template = catalog.templates.find((item) => item.id === input.templateRootId);
    const root = template ? roots.get(template.sourceRootId) : null;
    if (!template || !root?.commit) {
      throw new Error("The selected template is no longer available.");
    }
    const selected = new Set(input.tierIds);
    bindings = root.pinnedImplementations
      .filter((implementation) => selected.has(implementation.tierId))
      .map((implementation) => ({
        tierId: implementation.tierId,
        source: implementation,
        root,
        snapshotMode: "commit",
      }));
    for (const tierId of selected) {
      if (!bindings.some((binding) => binding.tierId === tierId)) {
        throw new Error(`The selected template no longer provides ${tierId}.`);
      }
    }
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
