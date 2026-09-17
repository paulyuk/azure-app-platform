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
      import { access, readFile, realpath } from "node:fs/promises";
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
      const { createSyntaxHighlighter } = await import(base + "vendor/prism.mjs");
      const { createBuildSyntax } = await import(base + "build-syntax.mjs");
      const syntax = createBuildSyntax(createSyntaxHighlighter());
      assert.match(syntax.highlight("def main(): return 42", "main.py"), /token keyword/);
      assert.match(await readFile(join(payload, "vendor/prism-LICENSE.txt"), "utf8"), /MIT LICENSE/);
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
        assert.equal(new URL(opened.url).searchParams.get("intro"), "1");
        assert.match(html, /id="skip-studio-intro"/);
        for (const name of ["unity-symbol.png", "unity-intro.mp4"]) {
          const assetUrl = new URL("/assets/" + name, opened.url);
          const asset = await fetch(assetUrl);
          const expected = await readFile(join(payload, "assets", name));
          assert.equal(asset.status, 200);
          assert.equal(asset.headers.get("content-type"), name.endsWith(".png") ? "image/png" : "video/mp4");
          assert.equal(asset.headers.get("content-length"), String(expected.length));
          assert.deepEqual(Buffer.from(await asset.arrayBuffer()), expected);
          const head = await fetch(assetUrl, { method: "HEAD" });
          assert.equal(head.status, 200);
          assert.equal(head.headers.get("content-length"), String(expected.length));
          assert.equal((await head.arrayBuffer()).byteLength, 0);
          for (const [range, start, end] of [
            ["bytes=0-1", 0, 1], ["bytes=20-", 20, expected.length - 1],
            ["bytes=-16", expected.length - 16, expected.length - 1],
            ["bytes=0-999999999", 0, expected.length - 1],
          ]) {
            const partial = await fetch(assetUrl, { headers: { Range: range } });
            assert.equal(partial.status, 206);
            assert.equal(partial.headers.get("content-range"), "bytes " + start + "-" + end + "/" + expected.length);
            assert.deepEqual(Buffer.from(await partial.arrayBuffer()), expected.subarray(start, end + 1));
          }
          for (const range of ["bytes=5-2", "bytes=-0", "bytes=-", "bytes=999999999-", "bytes=0-1,4-5", "invalid"]) {
            const invalid = await fetch(assetUrl, { headers: { Range: range } });
            assert.equal(invalid.status, 416);
            assert.equal(invalid.headers.get("content-range"), "bytes */" + expected.length);
            await invalid.arrayBuffer();
          }
        }
        for (const path of ["/assets/extension.mjs", "/assets/%2e%2e%2fextension.mjs"]) {
          const missing = await fetch(new URL(path, opened.url));
          assert.equal(missing.status, 404);
          await missing.arrayBuffer();
        }
        const home = await fetch(new URL("/", opened.url));
        assert.doesNotMatch(await home.text(), /id="skip-studio-intro"/);
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
