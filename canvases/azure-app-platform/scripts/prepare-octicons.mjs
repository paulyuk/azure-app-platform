import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const octicons = require("@primer/octicons");
const packageUrl = new URL("../node_modules/@primer/octicons/", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", packageUrl)));
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url)));
const names = [
  "agent", "alert", "apps", "arrow-left", "arrow-right", "check", "chevron-down", "chevron-right",
  "comment-discussion", "project", "sidebar-expand", "search",
  "code", "codespaces", "database", "dot-fill", "eye", "gear",
  "info", "link", "list-unordered", "meter", "plus", "question", "screen-full",
  "shield-check", "shield-lock", "sidebar-collapse", "skip",
  "stopwatch", "terminal", "tools", "trash", "workflow", "x",
  "zoom-in", "zoom-out", "play", "browser", "link-external", "cloud",
];
const icons = Object.fromEntries(names.sort().map((name) => {
  const icon = octicons[name]?.heights[16];
  assert.ok(icon?.path && icon.width, `Missing official 16px Octicon: ${name}`);
  return [name, { width: icon.width, height: 16, path: icon.path }];
}));
const content = JSON.stringify(icons, null, 2) + "\n";
const destination = new URL("../vendor/octicons/", import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL("icons.json", destination), content);
await writeFile(new URL("LICENSE", destination), await readFile(new URL("LICENSE", packageUrl)));
await writeFile(new URL("provenance.json", destination), JSON.stringify({
  package: packageJson.name,
  version: packageJson.version,
  integrity: lock.packages["node_modules/@primer/octicons"].integrity,
  sha256: createHash("sha256").update(content).digest("hex"),
  icons: Object.keys(icons),
}, null, 2) + "\n");
await writeFile(new URL(".gitattributes", destination), "* -text\n");
console.log(`Prepared ${names.length} official Octicons from ${packageJson.name}@${packageJson.version}.`);
