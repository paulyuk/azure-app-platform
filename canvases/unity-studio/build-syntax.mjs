import { createSyntaxHighlighter } from "./vendor/prism.mjs";

export function createBuildSyntax(prism) {
  const languages = {
    py: ["python", "Python"],
    js: ["javascript", "JavaScript"], mjs: ["javascript", "JavaScript"], cjs: ["javascript", "JavaScript"],
    ts: ["typescript", "TypeScript"], mts: ["typescript", "TypeScript"], cts: ["typescript", "TypeScript"],
    jsx: ["jsx", "JSX"], tsx: ["tsx", "TSX"],
    json: ["json", "JSON"], yaml: ["yaml", "YAML"], yml: ["yaml", "YAML"],
    md: ["markdown", "Markdown"], markdown: ["markdown", "Markdown"],
    html: ["markup", "HTML"], xml: ["markup", "XML"], css: ["css", "CSS"],
    sh: ["bash", "Shell"], bash: ["bash", "Shell"], ps1: ["powershell", "PowerShell"],
    cs: ["csharp", "C#"], go: ["go", "Go"], java: ["java", "Java"], rs: ["rust", "Rust"],
    bicep: ["bicep", "Bicep"], tf: ["hcl", "Terraform"], hcl: ["hcl", "HCL"],
  };
  function languageForPath(path) {
    const name = path.split("/").at(-1).toLowerCase();
    const [id, label] = /^dockerfile(?:\.|$)/.test(name) ? ["docker", "Dockerfile"]
      : languages[name.split(".").at(-1)] ?? ["plain", "Plain text"];
    return { id, label };
  }
  function escape(text) {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }
  function render(token) {
    if (typeof token === "string") return escape(token);
    if (Array.isArray(token)) return token.map(render).join("");
    const classes = [token.type, ...[token.alias ?? []].flat()]
      .filter((name) => /^[a-z][\w-]*$/i.test(name)).join(" ");
    return `<span class="token ${classes}">${render(token.content)}</span>`;
  }
  function highlight(source, path) {
    const { id } = languageForPath(path);
    if (id === "plain") return escape(source);
    const grammar = prism.languages[id];
    if (!grammar) throw new Error(`The bundled ${id} grammar is missing.`);
    return render(prism.tokenize(source, grammar));
  }
  return { languageForPath, highlight };
}

export const BUILD_SYNTAX_SCRIPT = `const buildSyntax = (${createBuildSyntax.toString()})((${createSyntaxHighlighter.toString()})());`
  .replace(/<\/script/gi, "<\\/script");
