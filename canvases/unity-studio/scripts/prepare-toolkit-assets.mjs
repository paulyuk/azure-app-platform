import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = "coreai-microsoft/canvases-cloud-foundation";
const commit = "63280d0d3b3a515bde6c1e48e9a3192bf8768b41";
const destination = fileURLToPath(new URL("../vendor/toolkit/", import.meta.url));
const check = process.argv.includes("--check");
assert.ok(process.argv.slice(2).every(arg => arg === "--check"), "Usage: node scripts/prepare-toolkit-assets.mjs [--check]");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const runNpm = (args, cwd) => {
  // npm.cmd is a batch launcher on Windows; arguments here are fixed, not user input.
  return process.platform === "win32"
    ? execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `${npm} ${args.join(" ")}`], { cwd, stdio: "inherit" })
    : execFileSync(npm, args, { cwd, stdio: "inherit" });
};
const inventory = [
  ["canvas-ui/base.mjs", "ui/browser/base.mjs", "text/javascript; charset=utf-8"],
  ["canvas-ui/react-runtime.mjs", "ui/browser/react-runtime.mjs", "text/javascript; charset=utf-8"],
  ["canvas-ui/styles.css", "ui/styles.css", "text/css; charset=utf-8"],
  ["canvas-ui/base.css", "ui/base.css", "text/css; charset=utf-8"],
  ["canvas-ui/visual-profiles.mjs", "ui/visual-profiles.mjs", "text/javascript; charset=utf-8"],
  ["canvas-ui/profiles/github-app.css", "ui/profiles/github-app.css", "text/css; charset=utf-8"],
  ["canvas-ui/hosts/github-app/design.md", "ui/hosts/github-app/design.md", "text/markdown; charset=utf-8"],
  ["canvas-ui/hosts/github-app/theming.md", "ui/hosts/github-app/theming.md", "text/markdown; charset=utf-8"],
  ["canvas-ui/THIRD_PARTY_NOTICES.txt", "ui/browser/THIRD_PARTY_NOTICES.txt", "text/plain; charset=utf-8"],
];
const temporary = await mkdtemp(path.join(tmpdir(), "unity-toolkit-build-"));
try {
  const archive = path.join(temporary, "source.tgz");
  await writeFile(archive, execFileSync("gh", ["api", `repos/${repository}/tarball/${commit}`], { maxBuffer: 128 * 1024 * 1024 }));
  execFileSync("tar", ["-xzf", archive, "-C", temporary], { stdio: "inherit" });
  const roots = (await readdir(temporary, { withFileTypes: true })).filter(entry => entry.isDirectory());
  assert.equal(roots.length, 1, "Expected one GitHub source root");
  assert.ok(roots[0].name.endsWith(commit), "Archive must identify the pinned source commit");
  const source = path.join(temporary, roots[0].name);
  const toolkit = path.join(source, "packages", "canvas-toolkit");
  const { getCanvasVisualProfile } = await import(pathToFileURL(path.join(toolkit, "src", "ui", "visual-profiles.mjs")));
  assert.deepEqual(getCanvasVisualProfile("github-app"), {
    id: "github-app", className: "canvas-profile-github-app", stylesheet: "canvas-ui/profiles/github-app.css",
    designGuide: "canvas-ui/hosts/github-app/design.md", themingGuide: "canvas-ui/hosts/github-app/theming.md",
  });
  const lock = await readFile(path.join(source, "package-lock.json"));
  try {
    createRequire(path.join(toolkit, "package.json")).resolve("esbuild");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    runNpm(["ci", "--ignore-scripts", "--workspace=@microsoft/canvas-toolkit", "--include-workspace-root", "--no-audit", "--no-fund"], source);
  }
  const builderPath = path.join(toolkit, "scripts", "build-ui.mjs");
  // The upstream builder resolves metafile inputs against cwd when collecting licenses.
  const previous = process.cwd();
  process.chdir(toolkit);
  try {
    const { buildToolkitUi } = await import(pathToFileURL(builderPath));
    await buildToolkitUi();
    const first = await Promise.all(inventory.map(([, relative]) => readFile(path.join(toolkit, "src", relative))));
    await buildToolkitUi();
    for (const [index, [, relative]] of inventory.entries()) {
      assert.deepEqual(await readFile(path.join(toolkit, "src", relative)), first[index], `Repeated upstream build changed ${relative}`);
    }
  } finally {
    const { stop } = await import(pathToFileURL(path.join(source, "node_modules", "esbuild", "lib", "main.js")));
    await stop();
    process.chdir(previous);
  }
  const prepared = path.join(temporary, "prepared");
  const { prepareCanvasUiAssets } = await import(pathToFileURL(path.join(toolkit, "src", "build.mjs")));
  const result = await prepareCanvasUiAssets(prepared);
  const { canvasUiAssets } = await import(pathToFileURL(path.join(toolkit, "src", "ui.mjs")));
  const files = [];
  for (const [route, relative, contentType] of inventory) {
    assert.equal(canvasUiAssets.get(route)?.[1], contentType);
    const file = `assets/toolkit/${relative}`;
    assert.ok(result.files.includes(file), `Upstream helper did not prepare ${file}`);
    files.push({ route: `/${route}`, file: relative, contentType, sha256: sha256(await readFile(path.join(prepared, file))) });
  }
  const license = await readFile(path.join(toolkit, "LICENSE"));
  files.push({ route: "/canvas-ui/LICENSE", file: "LICENSE", contentType: "text/plain; charset=utf-8", sha256: sha256(license) });
  const packageJson = JSON.parse(await readFile(path.join(toolkit, "package.json")));
  const manifest = {
    schemaVersion: 1,
    source: { repository, commit, package: packageJson.name, version: packageJson.version, published: false },
    build: {
      node: process.version,
      npm: execFileSync(process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : npm,
        process.platform === "win32" ? ["/d", "/s", "/c", "npm --version"] : ["--version"], { encoding: "utf8" }).trim(),
      esbuild: JSON.parse(await readFile(path.join(source, "node_modules", "esbuild", "package.json"))).version,
      lockSha256: sha256(lock),
      builderSha256: sha256(await readFile(builderPath)),
      command: "npm ci --ignore-scripts --workspace=@microsoft/canvas-toolkit --include-workspace-root --no-audit --no-fund; buildToolkitUi(); prepareCanvasUiAssets(output)",
      repeatBuildVerified: true,
    },
    files,
  };
  if (check) {
    const existing = JSON.parse(await readFile(path.join(destination, "provenance.json")));
    assert.deepEqual(existing.source, manifest.source);
    assert.equal(existing.build.lockSha256, manifest.build.lockSha256);
    assert.equal(existing.build.builderSha256, manifest.build.builderSha256);
    assert.deepEqual(existing.files, manifest.files, "Prepared assets differ from checked-in provenance");
    for (const file of files) {
      assert.equal(sha256(await readFile(path.join(destination, file.file))), file.sha256, `Changed checked-in asset: ${file.file}`);
    }
  } else {
    for (const file of files) {
      const target = path.join(destination, file.file);
      await mkdir(path.dirname(target), { recursive: true });
      if (file.file === "LICENSE") await writeFile(target, license);
      else await copyFile(path.join(prepared, "assets", "toolkit", file.file), target);
    }
    await writeFile(path.join(destination, "provenance.json"), JSON.stringify(manifest, null, 2) + "\n");
  }
  console.log(`${check ? "Verified" : "Prepared"} ${packageJson.name}@${packageJson.version} from ${commit}; repeated build bytes match on ${process.version}. Nothing published.`);
} finally {
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
