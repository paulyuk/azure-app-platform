import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const components = require("prismjs/components.json");
const getLoader = require("prismjs/dependencies.js");
const { version } = require("prismjs/package.json");
const languages = [
  "markup", "css", "javascript", "typescript", "jsx", "tsx", "python", "json",
  "yaml", "bash", "docker", "csharp", "go", "java", "rust", "markdown", "powershell", "bicep", "hcl",
];
const ids = ["core", ...getLoader(components, languages).getIds()];
const sources = await Promise.all(ids.map((id) =>
  readFile(require.resolve(`prismjs/components/prism-${id}.min.js`), "utf8")));
const license = await readFile(require.resolve("prismjs/LICENSE"), "utf8");
const destination = new URL("../vendor/", import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL("prism.mjs", destination), [
  `// Generated from prismjs ${version} (https://github.com/PrismJS/prism).`,
  "// MIT license: see prism-LICENSE.txt. Rebuild with npm run vendor:syntax.",
  "export function createSyntaxHighlighter() {",
  `/*\n${license}*/`,
  "const window = undefined, WorkerGlobalScope = undefined, module = undefined, global = undefined;",
  ...sources,
  "return Prism;",
  "}",
  "",
].join("\n"));
await writeFile(new URL("prism-LICENSE.txt", destination), license);
console.log(`Vendored Prism ${version}: ${ids.join(", ")}.`);
