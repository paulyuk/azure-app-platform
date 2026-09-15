import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const source = fileURLToPath(new URL("./", import.meta.url));

test("installed payload opens and materializes templates without checkout dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "unity plugin portability "));
  try {
    const payload = join(root, "installed plugin");
    const workspace = join(root, "unrelated workspace");
    await cp(source, payload, {
      recursive: true,
      filter: (path) => !["node_modules", ".git", ".venv", "__pycache__"].includes(basename(path))
        && !path.endsWith(".test.mjs"),
    });
    await mkdir(workspace);
    const manifest = JSON.parse(await readFile(join(payload, ".github/plugin/plugin.json"), "utf8"));
    assert.equal(manifest.extensions, ".");
    const packageJson = JSON.parse(await readFile(join(payload, "package.json"), "utf8"));
    assert.deepEqual(packageJson.dependencies ?? {}, {});
    assert.deepEqual(packageJson.optionalDependencies ?? {}, {});
    for (const path of ["README.md", ...manifest.skills.map((skill) => `${skill}/SKILL.md`)]) {
      const instructions = await readFile(join(payload, path), "utf8");
      assert.doesNotMatch(instructions, /bootstrap-extension\.mjs/);
    }

    const { stdout } = await execute(process.execPath, ["--input-type=module", "--eval", `
      import assert from "node:assert/strict";
      import { access, realpath } from "node:fs/promises";
      import { isBuiltin, registerHooks } from "node:module";
      import { join, sep } from "node:path";
      import { pathToFileURL } from "node:url";

      const payload = await realpath(process.argv[1]);
      const base = pathToFileURL(payload + sep).href;
      // Only host registration is substituted; every provider/UI module is real.
      const sdk = "data:text/javascript," + encodeURIComponent(\`
        export const createCanvas = (options) => options;
        export class CanvasError extends Error {
          constructor(code, message) { super(message); this.code = code; }
        }
        export async function joinSession({ canvases }) {
          globalThis.portabilityCanvases = canvases;
          return { sessionId: "portability-test" };
        }
      \`);
      registerHooks({
        resolve(specifier, context, next) {
          if (specifier === "@github/copilot-sdk/extension") return { url: sdk, shortCircuit: true };
          if (isBuiltin(specifier)) return next(specifier, context);
          assert.match(specifier, /^(?:\\.\\.?\\/|file:)/, "Unbundled runtime dependency: " + specifier);
          const resolved = next(specifier, context);
          assert.ok(resolved.url.startsWith(base), "Import escaped plugin payload: " + resolved.url);
          return resolved;
        },
      });
      await import(base + "extension.mjs");
      assert.equal(globalThis.portabilityCanvases.length, 1);
      const [canvas] = globalThis.portabilityCanvases;
      assert.equal(canvas.id, "unity-studio");
      const context = { instanceId: "portable-smoke", input: {} };
      try {
        const opened = await canvas.open(context);
        assert.equal(new URL(opened.url).hostname, "127.0.0.1");
        const response = await fetch(opened.url);
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.match(html, /Create a new app/);
        assert.doesNotMatch(html, /<(?:script|link|img)\\b[^>]+(?:src|href)=["'](?:https?:)?\\/\\//i);
      } finally {
        await canvas.onClose(context);
      }
      const { materializeTemplate } = await import(base + "template-materializer.mjs");
      const { LOCAL_TEMPLATES } = await import(base + "source-catalog.mjs");
      assert.equal(LOCAL_TEMPLATES.length, 2);
      for (const template of LOCAL_TEMPLATES) {
        const destination = join(process.cwd(), template.id);
        const generated = await materializeTemplate({
          appName: "Portable app", purpose: "Review loan documents",
          sourcePlan: { kind: "empty-template", templateId: template.id },
        }, { destination });
        assert.ok(generated.requiredFiles.length > 0);
        for (const path of generated.requiredFiles) await access(join(destination, path));
      }
      for (const file of ["dev-start.sh", "dev-stop.sh", "dev-start.ps1", "dev-stop.ps1"]) {
        await access(join(payload, "templates/shared/dealer/scripts", file));
      }
      await access(join(payload, "templates/shared/dealer/src/agent/local_ports.py"));
      process.stdout.write("portable payload passed");
    `, payload], {
      cwd: workspace,
      env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" },
      timeout: 30_000,
    });
    assert.equal(stdout, "portable payload passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
