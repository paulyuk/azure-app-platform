import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({
  absWorkingDir: root,
  stdin: {
    contents: [
      'export { EditorState, EditorSelection } from "@codemirror/state";',
      'export { EditorView, GutterMarker, gutter, keymap, lineNumbers, drawSelection } from "@codemirror/view";',
      'export { defaultKeymap, history, historyKeymap } from "@codemirror/commands";',
      'export { unifiedMergeView, getChunks, getOriginalDoc } from "@codemirror/merge";',
    ].join("\n"),
    resolveDir: root,
  },
  bundle: true,
  format: "iife",
  globalName: "ReviewRuntime",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  metafile: true,
  write: false,
});
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  if (input === "<stdin>") continue;
  let directory = dirname(resolve(root, input));
  while (directory !== root) {
    try {
      await readFile(join(directory, "package.json"), "utf8");
      packages.add(directory);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = dirname(directory);
      if (parent === directory) throw new Error(`No package metadata for ${input}.`);
      directory = parent;
    }
  }
}
const licenses = [];
for (const directory of [...packages].sort()) {
  const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  let license;
  for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
    try { license = await readFile(join(directory, name), "utf8"); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (!license) throw new Error(`Missing license for ${pkg.name}.`);
  licenses.push(`${pkg.name}@${pkg.version}\n${license.trim()}`);
}
const license = licenses.join("\n\n----------------------------------------\n\n") + "\n";
const destination = new URL("../vendor/", import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL("codemirror.mjs", destination), [
  "// Generated CodeMirror review runtime. Rebuild with npm run vendor:review.",
  "// Licenses: see codemirror-LICENSE.txt.",
  "export function createReviewRuntime() {",
  `/*\n${license.replaceAll("*/", "* /")}*/`,
  result.outputFiles[0].text,
  "return ReviewRuntime;",
  "}",
  "",
].join("\n"));
await writeFile(new URL("codemirror-LICENSE.txt", destination), license);
console.log(`Vendored CodeMirror and ${packages.size - 1} bundled dependencies (${result.outputFiles[0].contents.length} bytes).`);
