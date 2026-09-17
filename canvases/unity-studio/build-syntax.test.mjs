import assert from "node:assert/strict";
import test from "node:test";
import { createBuildSyntax, BUILD_SYNTAX_SCRIPT } from "./build-syntax.mjs";
import { createSyntaxHighlighter } from "./vendor/prism.mjs";

const syntax = createBuildSyntax(createSyntaxHighlighter());

test("Build syntax recognizes shipped source/config languages without changing source text", () => {
  const cases = [
    ["src/main.PY", "python", 'def main():\n\treturn "hello"\n'],
    ["src/server.mjs", "javascript", "const app = true; // server\n"],
    ["src/server.cjs", "javascript", "module.exports = 42;"],
    ["src/main.ts", "typescript", "const value: string = 'hello';"],
    ["src/main.mts", "typescript", "export const value = 1;"],
    ["src/main.cts", "typescript", "export const value = 1;"],
    ["src/page.jsx", "jsx", 'const Page = () => <div title="Hi">Hello</div>;'],
    ["src/page.tsx", "tsx", "const Page = (): JSX.Element => <div>Hello</div>;"],
    ["config/app.json", "json", '{"name":"hello","enabled":true}'],
    ["unity.app.yaml", "yaml", "version: 1\nname: hello\n"],
    ["config/app.yml", "yaml", "enabled: true"],
    ["prompts/system.md", "markdown", "# Instructions\nUse **trusted** tools."],
    ["README.markdown", "markdown", "# Heading"],
    ["index.html", "markup", '<div class="test">Hi</div>'],
    ["app.xml", "markup", "<root>Hi</root>"],
    ["app.css", "css", "body { color: red; }"],
    ["dev-start.sh", "bash", '#!/bin/bash\necho "$NAME"'],
    ["dev-start.ps1", "powershell", 'Write-Host "$env:NAME"'],
    ["src/Tool.cs", "csharp", "public class Tool { public int Run() => 42; }"],
    ["main.go", "go", 'package main\nfunc main() { println("hi") }'],
    ["Main.java", "java", "public class Main { int value = 42; }"],
    ["main.rs", "rust", "fn main() { let value = 42; }"],
    ["Dockerfile", "docker", "FROM node:22\nRUN npm start"],
    ["Dockerfile.agent", "docker", "FROM python:3.13"],
    ["main.bicep", "bicep", "param location string = 'westus'"],
    ["main.tf", "hcl", 'variable "name" { type = string }'],
  ];
  for (const [path, language, source] of cases) {
    assert.equal(syntax.languageForPath(path).id, language, path);
    const html = syntax.highlight(source, path);
    assert.match(html, /<span class="token /, path);
    const restored = html.replace(/<\/?span[^>]*>/g, "")
      .replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");
    assert.equal(restored, source, path);
  }
});

test("Build syntax escapes markup and preserves tabs, Unicode, nonbreaking spaces and trailing newlines", () => {
  const source = '# <script>alert("not code")</script>\n\treturn "résumé\u00a0<&>"\n\n';
  const html = syntax.highlight(source, "main.py");
  assert.doesNotMatch(html, /<script|<img/i);
  assert.match(html, /résumé\u00a0/);
  assert.match(html, /\t/);
  assert.ok(html.endsWith("\n\n"));
  assert.deepEqual(syntax.languageForPath("notes.custom"), { id: "plain", label: "Plain text" });
  assert.equal(syntax.highlight("<script>&x</script>", "notes.custom"), "&lt;script&gt;&amp;x&lt;/script&gt;");
  assert.doesNotMatch(BUILD_SYNTAX_SCRIPT, /<\/script/i);
  assert.throws(() => createBuildSyntax({ languages: {} }).highlight("{}", "app.json"), /grammar is missing/);
});

test("Bundled highlighters are isolated and handle an editor-sized source file", () => {
  const existingGlobal = globalThis.Prism;
  const first = createSyntaxHighlighter();
  const second = createSyntaxHighlighter();
  assert.notEqual(first, second);
  assert.equal(globalThis.Prism, existingGlobal);
  const source = '# comment\ndef main():\n\treturn "value"\n'.repeat(2600).slice(0, 96 * 1024);
  assert.match(syntax.highlight(source, "main.py"), /token keyword/);
});
