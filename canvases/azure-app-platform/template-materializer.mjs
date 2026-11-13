import { execFile } from "node:child_process";
import { access, chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { APP_SERVICE_BUILDER_AI_GATEWAY_TEMPLATE, APP_SERVICE_BUILDER_TEMPLATE, EMPTY_TEMPLATE, SANDBOX_GATEWAY_TEMPLATE } from "./source-catalog.mjs";
import { prepareDealerPortOverrides } from "./dealer-port-materializer.mjs";
import { BUILD_BLOCK_TEMPLATES } from "./build-blocks.mjs";
import { parseUnityManifest } from "./discovery.mjs";
import { getTierDefinition } from "./tier-definitions.mjs";

const execFileAsync = promisify(execFile);
const EMPTY_TEMPLATE_ID = "builtin-empty-starter-v1";
const SANDBOX_GATEWAY_TEMPLATE_ID = "builtin-sandbox-gateway-minimal-v1";
const APP_SERVICE_BUILDER_AI_GATEWAY_TEMPLATE_ID = "builtin-app-service-builder-ai-gateway-v1";
const APP_SERVICE_BUILDER_TEMPLATE_ID = "builtin-app-service-builder-vite-v1";
const TEMPLATE_ROOTS = {
  [EMPTY_TEMPLATE_ID]: fileURLToPath(new URL("./templates/empty-starter-app", import.meta.url)),
  [SANDBOX_GATEWAY_TEMPLATE_ID]: fileURLToPath(new URL("./templates/sandbox-gateway-minimal", import.meta.url)),
  [APP_SERVICE_BUILDER_AI_GATEWAY_TEMPLATE_ID]: fileURLToPath(new URL("./templates/app-service-builder-ai-gateway", import.meta.url)),
  [APP_SERVICE_BUILDER_TEMPLATE_ID]: fileURLToPath(new URL("./templates/app-service-builder-vite", import.meta.url)),
};
const APP_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/;
const SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
const DOMAIN_PATTERN = /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function appendBuildComponent(content, tierId, projectPath) {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => /^(?:components|capabilities):\s*(?:#.*)?$/.test(line));
  if (start < 0 || lines.filter((line) => /^(?:components|capabilities):/.test(line)).length !== 1) {
    throw new Error("The app inventory needs one block-style components or capabilities section before adding a block.");
  }
  const original = parseUnityManifest({ content });
  if (original.some((item) => !item.path || !getTierDefinition(item.tierId)
    || /^(?:[\\/]|[A-Za-z]:)/.test(item.path) || item.path.split(/[\\/]/).includes(".."))) {
    throw new Error("Fix the app inventory's component paths before adding a block.");
  }
  let end = start + 1;
  while (end < lines.length && (!lines[end].trim() || /^\s|^#/.test(lines[end]))) end++;
  if (lines[start].startsWith("capabilities:")) {
    lines[start] = lines[start].replace("capabilities:", "components:");
    for (let index = start + 1; index < end; index++) {
      const heading = /^  ([a-z][a-z0-9-]*):\s*(#.*)?$/.exec(lines[index]);
      if (heading) lines[index] = "  - tier: " + heading[1] + (heading[2] ? " " + heading[2] : "");
      else if (lines[index].trim() && !/^(?: {4,}\S|\s*#)/.test(lines[index])) {
        throw new Error("The app inventory uses an unsupported capability layout. Use a block-style components list before adding a block.");
      }
    }
  }
  lines.splice(end, 0, `  - tier: ${tierId}`, `    path: ${projectPath}`, "    interface: configuration", "    links: []");
  const result = lines.join(newline).replace(/\s*$/, newline);
  const parsed = parseUnityManifest({ content: result });
  if (JSON.stringify(parsed.map(({ tierId, path }) => ({ tierId, path }))) !==
    JSON.stringify([...original.map(({ tierId, path }) => ({ tierId, path })), { tierId, path: projectPath }])) {
    throw new Error("Could not preserve the app inventory while adding the block.");
  }
  return result;
}

export async function materializeBuildBlock({ root, templateId, name }) {
  const template = BUILD_BLOCK_TEMPLATES.find((item) => item.id === templateId);
  if (!template) throw new Error("Choose a supported building block template.");
  name = requireText(name, "block name (lowercase letters, digits, and hyphens)", SKILL_NAME_PATTERN, 40);
  root = await realpath(root);
  const projectPath = template.projectPath.replace("{name}", name);
  const destination = join(root, projectPath);
  const manifestPath = join(root, "azure-app.yaml");
  let manifest, updatedManifest;
  try {
    if ((await lstat(manifestPath)).isSymbolicLink()) throw new Error("App inventory must not be a symlink.");
    manifest = await readFile(manifestPath, "utf8");
    updatedManifest = appendBuildComponent(manifest, template.tierId, projectPath);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  let directory = root;
  for (const part of projectPath.split("/").slice(0, -1)) {
    directory = join(directory, part);
    try { await mkdir(directory); } catch (error) { if (error.code !== "EEXIST") throw error; }
    if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== directory) {
      throw new Error("New blocks must stay inside the app, not a symlink.");
    }
  }
  try { await mkdir(destination); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("A block already exists at this path. Choose another name; existing files were not changed.");
    throw error;
  }
  try {
    // Copy entries into the reserved directory; Node 24 rejects copying onto it.
    for (const templateSource of [template.baseSource, template.source].filter(Boolean)) {
      const source = fileURLToPath(new URL("./templates/" + templateSource, import.meta.url));
      for (const entry of await readdir(source)) {
        await cp(join(source, entry), join(destination, entry),
          { recursive: true, force: false, errorOnExist: true });
      }
    }
    await replaceTokens(destination, { "__BLOCK_NAME__": name, "__SKILL_NAME__": name });
    if (manifest !== undefined) {
      if ((await lstat(manifestPath)).isSymbolicLink() || await readFile(manifestPath, "utf8") !== manifest) {
        throw new Error("The app inventory changed during creation. Try again after reviewing it.");
      }
      await writeFile(manifestPath, updatedManifest);
    }
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
  return { projectPath, entry: template.entry };
}

function requireText(value, label, pattern, maxLength) {
  if (
    typeof value !== "string"
    || !value.trim()
    || value.length > maxLength
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    || (pattern && !pattern.test(value))
  ) {
    throw new Error(`Invalid ${label}.`);
  }
  return value.trim();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function replaceTokens(root, tokens) {
  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
        continue;
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`Template symlinks are not allowed: ${path}`);
      }
      let content = await readFile(path, "utf8");
      for (const [token, value] of Object.entries(tokens)) {
        content = content.replaceAll(token, value);
      }
      if (/\.md(?:\.template)?$/.test(path)) {
        // Source docs link to .template files; generated apps contain the rendered paths.
        content = content.replace(/(\]\((?![a-z]+:)[^)\s]+)\.template(?=[)#])/gi, "$1");
      }
      const output = path.endsWith(".template") ? path.slice(0, -".template".length) : path;
      await writeFile(output, content);
      if (output !== path) {
        await rm(path);
      }
    }
  }
}

async function materializeLocalTemplate(plan, destination) {
  const templateId = plan.sourcePlan?.templateId ?? EMPTY_TEMPLATE_ID;
  const isSandboxGateway = templateId === SANDBOX_GATEWAY_TEMPLATE_ID;
  const isAppServiceBuilderAiGateway = templateId === APP_SERVICE_BUILDER_AI_GATEWAY_TEMPLATE_ID;
  const isAppServiceBuilder = templateId === APP_SERVICE_BUILDER_TEMPLATE_ID;
  const templateRoot = TEMPLATE_ROOTS[templateId] ?? TEMPLATE_ROOTS[EMPTY_TEMPLATE_ID];
  const appName = requireText(plan.appName, "app name", APP_NAME_PATTERN, 80);
  const purpose = requireText(plan.purpose, "app purpose", null, 500);
  const agentInstructions = requireText(
    plan.templateInputs?.agentInstructions ?? `Help users accomplish: ${purpose}`,
    "agent instructions",
    null,
    2_000,
  );
  const staging = await mkdtemp(join(tmpdir(), "app-platform-empty-"));
  let requiredFiles;
  try {
    const templateEntries = await readdir(templateRoot);
    await Promise.all(templateEntries.map((entry) =>
      cp(join(templateRoot, entry), join(staging, entry), {
        recursive: true, force: true,
        filter: (source) => !["__pycache__", ".venv", ".pytest_cache", "node_modules", ".git"].includes(basename(source)),
      })));
    await materializePortLoaders(staging);
    const tokens = {
      "__APP_NAME__": appName,
      "__APP_NAME_HTML_JSON__": JSON.stringify(escapeHtml(appName)),
      "__APP_SLUG__": appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      "__PURPOSE_JSON__": JSON.stringify(purpose).slice(1, -1),
      "__PURPOSE__": purpose,
      "__USER_INTENT__": purpose,
      "__PURPOSE_HTML_JSON__": JSON.stringify(escapeHtml(purpose)),
      "__AGENT_INSTRUCTIONS__": agentInstructions,
    };
    if (isSandboxGateway) {
      const egressAllowDomain = requireText(
        plan.templateInputs?.egressAllowDomain ?? "api.lender.example.com",
        "egress allow-list domain",
        DOMAIN_PATTERN,
        253,
      );
      tokens["__EGRESS_ALLOW_DOMAIN__"] = egressAllowDomain;
    } else if (!isAppServiceBuilder && !isAppServiceBuilderAiGateway) {
      const hostedSkillName = requireText(
        plan.templateInputs?.hostedSkillName ?? "starter-skill",
        "Hosted Skill name",
        SKILL_NAME_PATTERN,
        40,
      );
      await rename(join(staging, "src", "skills", "__SKILL__"), join(staging, "src", "skills", hostedSkillName));
      tokens["__SKILL_NAME__"] = hostedSkillName;
      requiredFiles = EMPTY_TEMPLATE.requiredPaths.map((path) =>
        path.replaceAll("<hosted-skill>", hostedSkillName));
    }
    await replaceTokens(staging, tokens);
    if (isSandboxGateway) {
      requiredFiles = [...SANDBOX_GATEWAY_TEMPLATE.requiredPaths];
    } else if (isAppServiceBuilderAiGateway) {
      requiredFiles = [...APP_SERVICE_BUILDER_AI_GATEWAY_TEMPLATE.requiredPaths];
    } else if (isAppServiceBuilder) {
      requiredFiles = [...APP_SERVICE_BUILDER_TEMPLATE.requiredPaths];
    }
    await Promise.all(requiredFiles.map((path) => access(join(staging, path))));
    const renderedEntries = await readdir(staging);
    await Promise.all(renderedEntries.map((entry) =>
      cp(join(staging, entry), join(destination, entry), { recursive: true, force: true })));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  await Promise.all([
    chmod(join(destination, "scripts", "dev-start.sh"), 0o755),
    chmod(join(destination, "scripts", "dev-stop.sh"), 0o755),
  ]);
  return {
    kind: "empty-template",
    destination,
    requiredFiles,
  };
}

async function materializeSample(plan, destination, commandRunner) {
  const source = resolve(requireText(plan.sourcePlan?.rootPath, "sample source path", null, 2_048));
  const commit = requireText(plan.sourcePlan?.commit, "sample commit", /^[0-9a-f]{40}$/, 40);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "app-platform-sample-"));
  const archive = join(temporaryRoot, "sample.tar");
  const extracted = join(temporaryRoot, "source");
  try {
    await mkdir(extracted);
    const archived = await commandRunner("git", [
      "-C",
      source,
      "archive",
      "--format=tar",
      `--output=${archive}`,
      commit,
    ]);
    if (!archived?.ok) {
      throw new Error(`Could not archive the pinned Dealer sample: ${archived?.stderr || archived?.error || "unknown error"}`);
    }
    const unpacked = await commandRunner("tar", ["-xf", archive, "-C", extracted]);
    if (!unpacked?.ok) {
      throw new Error(`Could not unpack the pinned Dealer sample: ${unpacked?.stderr || unpacked?.error || "unknown error"}`);
    }
    const requiredFiles = [
      "scripts/dev-start.sh",
      "scripts/dev-stop.sh",
      "scripts/dev-start.ps1",
      "scripts/dev-stop.ps1",
    ];
    await Promise.all(requiredFiles.map((path) => access(join(extracted, path))));
    const existingEntries = await readdir(destination);
    await Promise.all(existingEntries
      .filter((entry) => entry !== ".git")
      .map((entry) => rm(join(destination, entry), { recursive: true, force: true })));
    const sampleEntries = await readdir(extracted);
    await Promise.all(sampleEntries.map((entry) =>
      cp(join(extracted, entry), join(destination, entry), { recursive: true, force: true })));
    await materializePortLoaders(destination);
    await prepareDealerPortOverrides(destination);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  await Promise.all([
    chmod(join(destination, "scripts", "dev-start.sh"), 0o755),
    chmod(join(destination, "scripts", "dev-stop.sh"), 0o755),
  ]);
  return {
    kind: "complete-sample",
    destination,
    commit,
    requiredFiles: [
      "scripts/dev-start.sh",
      "scripts/dev-stop.sh",
      "scripts/dev-start.ps1",
      "scripts/dev-stop.ps1",
    ],
  };
}

async function defaultCommandRunner(command, args) {
  try {
    const result = await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, stdout: error.stdout || "", stderr: error.stderr || "", error: error.message };
  }
}

export async function materializePortLoaders(destination) {
  await Promise.all(["load-ports.sh", "load-ports.ps1"].map((file) => cp(
    fileURLToPath(new URL(`./templates/shared/${file}`, import.meta.url)),
    join(destination, "scripts", file),
  )));
}

export async function materializeTemplate(plan, {
  destination = process.cwd(),
  commandRunner = defaultCommandRunner,
} = {}) {
  const resolvedDestination = resolve(destination);
  if (plan?.sourcePlan?.kind === "empty-template") {
    return materializeLocalTemplate(plan, resolvedDestination);
  }
  if (plan?.sourcePlan?.kind === "complete-sample") {
    return materializeSample(plan, resolvedDestination, commandRunner);
  }
  throw new Error("Unsupported app template plan.");
}

async function main() {
  const encoded = process.argv[2];
  if (!encoded) {
    throw new Error("Usage: node template-materializer.mjs <base64url-plan>");
  }
  const plan = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  const result = await materializeTemplate(plan);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
