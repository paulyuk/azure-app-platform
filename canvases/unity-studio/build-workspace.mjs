import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const ARTIFACTS = [
  { id: "instructions", title: "Agent instructions", path: "src/agent/prompts/system.md", description: "Agent behavior. The agent harness calls the document validation tool before passing sanitized text to the model.", editable: true },
  { id: "tool", title: "Document validation tool", path: "src/tools/document-validation/main.py", description: "Deterministic document validation and redaction. The running model cannot edit this code.", editable: true },
  { id: "contract", title: "Document validation tool contract", path: "src/tools/document-validation/contract.json", description: "Allowed inputs and bounded outputs. Enforced by code, not by instructions.", editable: true },
  { id: "policy", title: "Enforcement policy", path: "config/document-policy.json", description: "Operator-owned limits and rejection rules. The running model cannot edit this file. Review developer changes, test enforcement, and redeploy.", editable: true },
  { id: "runtime", title: "Runtime & access", path: "config/runtime.json", description: "Choose the agent runtime. Local simulation is not an isolation boundary.", editable: true },
];
const MAX_BYTES = 96 * 1024;
const saveQueues = new Map();
const sha = (text) => createHash("sha256").update(text).digest("hex");

async function appArtifact(root, artifact) {
  if (!["tool", "contract"].includes(artifact.id)) return artifact;
  // Choose the whole layout, not individual files, so partial migrations fail visibly.
  for (const toolDirectory of ["src/tools/document-validation", "src/sandbox/tool"]) {
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
    return { ...artifact, path: artifact.path.replace("src/tools/document-validation", toolDirectory) };
  }
  return artifact;
}

async function artifactPath(root, artifact) {
  const canonicalRoot = await realpath(root);
  const path = resolve(canonicalRoot, artifact.path);
  const actual = await realpath(path);
  const local = relative(canonicalRoot, actual);
  if (actual !== path || local.startsWith("..") || (await lstat(path)).isSymbolicLink()) {
    throw new Error("Build artifacts must be regular files inside the selected app, not symlinks.");
  }
  const info = await lstat(path);
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error("Build artifact exceeds the 96 KiB editor limit or is not a file.");
  return path;
}

async function readArtifact(root, artifact) {
  artifact = await appArtifact(root, artifact);
  try {
    const path = await artifactPath(root, artifact);
    const content = await readFile(path, "utf8");
    return { ...artifact, available: true, content, sha: sha(content) };
  } catch (error) {
    if (error.code === "ENOENT") return { ...artifact, available: false, detail: "Not implemented in this app yet." };
    throw error;
  }
}

export async function readBuildWorkspace(root) {
  return { artifacts: await Promise.all(ARTIFACTS.map((artifact) => readArtifact(root, artifact))) };
}

export async function resolveBuildArtifactPath(root, id) {
  const artifact = ARTIFACTS.find((item) => item.id === id);
  if (!artifact) throw new Error("Choose a known Build artifact.");
  return artifactPath(root, await appArtifact(root, artifact));
}

export async function readBuildRuntime(root) {
  const artifact = await readArtifact(root, ARTIFACTS.find((item) => item.id === "runtime"));
  if (!artifact.available) return null;
  const config = JSON.parse(artifact.content);
  if (!config || !["local", "copilot-sdk-sandbox"].includes(config.agentRuntime)) {
    throw new Error("Invalid config/runtime.json: choose agentRuntime local or copilot-sdk-sandbox.");
  }
  return config;
}

export async function documentDeploymentBlocker(root) {
  const runtime = await readBuildRuntime(root);
  if (!runtime) return null;
  return "This document POC requires explicitly configured ACA agent/tool session pools and reviewed agent and document validation tool images. "
    + "Whole-app azd deployment is disabled so inherited Dealer configuration cannot deploy unrelated services. "
    + "Review the app README cloud prerequisites and Runtime & access settings; no cloud isolation is claimed by selecting a runtime.";
}

export async function saveBuildArtifact(root, input) {
  const artifact = ARTIFACTS.find((item) => item.id === input?.id);
  if (!artifact?.editable) throw new Error("This build artifact is not editable here.");
  if (typeof input.content !== "string" || !input.content.trim() || Buffer.byteLength(input.content) > MAX_BYTES || input.content.includes("\0")) {
    throw new Error("Provide nonempty UTF-8 source up to 96 KiB.");
  }
  if (artifact.path.endsWith(".json")) {
    const config = JSON.parse(input.content);
    if (!config || Array.isArray(config) || typeof config !== "object") throw new Error("Provide a JSON object for this Build artifact.");
    if (artifact.id === "runtime" && !["local", "copilot-sdk-sandbox"].includes(config.agentRuntime)) {
      throw new Error("Choose agentRuntime local or copilot-sdk-sandbox.");
    }
  }
  const canonicalRoot = await realpath(root);
  const previous = saveQueues.get(canonicalRoot) ?? Promise.resolve();
  const next = previous.then(async () => {
    const path = await artifactPath(canonicalRoot, await appArtifact(canonicalRoot, artifact));
    const current = await readFile(path, "utf8");
    if (sha(current) !== input.baseSha) {
      const error = new Error("The file changed since you opened it. Reload and review the latest source before saving.");
      error.statusCode = 409;
      throw error;
    }
    const temporary = join(dirname(path), `.unity-build-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, input.content, { flag: "wx", mode: (await lstat(path)).mode & 0o777 });
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
    }
    return readArtifact(canonicalRoot, artifact);
  });
  const settled = next.then(() => undefined, () => undefined);
  saveQueues.set(canonicalRoot, settled);
  try {
    return await next;
  } finally {
    if (saveQueues.get(canonicalRoot) === settled) saveQueues.delete(canonicalRoot);
  }
}
