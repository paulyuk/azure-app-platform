import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readBuildWorkspace } from "./build-workspace.mjs";

test("docagent sample preserves the generated source without local runtime state", async () => {
  const root = new URL("./samples/docagent/", import.meta.url);
  const snapshot = JSON.parse(await readFile(new URL("./samples/docagent.snapshot.json", import.meta.url), "utf8"));
  assert.equal(snapshot.sourceApp, "docs-agent5");
  assert.equal(snapshot.templateId, "builtin-sandbox-gateway-minimal-v1");
  const paths = snapshot.files.map((file) => file.path);
  assert.equal(new Set(paths).size, paths.length);
  for (const { path, sha256 } of snapshot.files) {
    assert.doesNotMatch(path, /(?:^|\/)(?:\.env|\.azure-app-platform|\.dev-run|\.venv|__pycache__)(?:\/|$)|\.template$|(?:^|\/)\.\.(?:\/|$)/);
    const file = new URL(path, root);
    const bytes = await readFile(file);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256, path);
    const text = bytes.toString("utf8");
    assert.doesNotMatch(text, /__APP_NAME__|__PURPOSE__|__AGENT_INSTRUCTIONS__|\/Users\//);
    if (path.endsWith(".md")) {
      for (const [, link] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (link.startsWith("#") || /^[a-z]+:/i.test(link)) continue;
        await access(new URL(link.split("#")[0], file));
      }
    }
  }
  for (const path of [
    "azure-app.yaml", "README.md", "config/runtime.json", "config/document-policy.json",
    "src/agent/main.py", "src/agent/uv.lock", "src/agent/tests/test_runtime.py",
    "src/tools/document-validation/main.py", "src/tools/document-validation/contract.json",
    "src/tools/document-validation/tests/test_main.py", "src/policy/enforcement.py",
    "scripts/load-ports.sh", "scripts/load-ports.ps1", "examples/loan-application.txt",
  ]) assert.ok(paths.includes(path), path);
  const { artifacts } = await readBuildWorkspace(fileURLToPath(root));
  assert.ok(artifacts.length >= 5);
  assert.equal(new Set(artifacts.map(artifact => artifact.path)).size, artifacts.length);
  assert.ok(artifacts.every((artifact) => artifact.available));
});
