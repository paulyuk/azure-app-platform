import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const source = fileURLToPath(new URL("./", import.meta.url));

test("installed payload opens and materializes templates without checkout dependencies", async () => {
  const root = await mkdtemp(join(source, "..", "..", ".plugin-portability-"));
  try {
    const payload = join(root, "installed plugin");
    const workspace = join(root, "unrelated workspace");
    await cp(source, payload, {
      recursive: true,
      filter: (path) => !["node_modules", ".git", ".venv", "__pycache__"].includes(basename(path))
        && !path.endsWith(".test.mjs"),
    });
    await mkdir(workspace);
    await execute("git", ["init", "--quiet", workspace]);
    const manifest = JSON.parse(await readFile(join(payload, ".github/plugin/plugin.json"), "utf8"));
    assert.equal(manifest.name, "azure-app-platform");
    assert.equal(manifest.extensions, ".");
    const packageJson = JSON.parse(await readFile(join(payload, "package.json"), "utf8"));
    assert.equal(packageJson.name, manifest.name);
    assert.equal(packageJson.version, manifest.version);
    assert.deepEqual(packageJson.dependencies ?? {}, {});
    assert.deepEqual(packageJson.optionalDependencies ?? {}, {});
    const marketplace = JSON.parse(await readFile(join(source, "..", "..", ".github/plugin/marketplace.json"), "utf8"));
    assert.equal(marketplace.name, "azure-app-platform");
    assert.equal(marketplace.plugins.length, 1);
    assert.deepEqual(marketplace.plugins[0], {
      name: manifest.name,
      source: "canvases/azure-app-platform",
      description: manifest.description,
      version: manifest.version,
    });
    assert.equal((await readFile(join(source, "..", "..", ".github/extensions/azure-app-platform/extension.mjs"), "utf8")).trim(),
      'import "../../../canvases/azure-app-platform/extension.mjs";');
    assert.equal((await readFile(join(payload, "vendor/toolkit/.gitattributes"), "utf8")).trim(), "* -text",
      "Vendored asset hashes must survive Git newline conversion on Windows");
    for (const path of ["README.md", ...manifest.skills.map((skill) => `${skill}/SKILL.md`)]) {
      const instructions = await readFile(join(payload, path), "utf8");
      assert.doesNotMatch(instructions, /bootstrap-extension\.mjs/);
    }

    const { stdout } = await execute(process.execPath, ["--input-type=module", "--eval", `
      import assert from "node:assert/strict";
      import { createHash } from "node:crypto";
      import { access, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
      import { isBuiltin, registerHooks } from "node:module";
      import { join, sep } from "node:path";
      import { pathToFileURL } from "node:url";

      const payload = await realpath(process.argv[1]);
      const base = pathToFileURL(payload + sep).href;
      const checkpoint = (stage) => process.stderr.write("Portable payload: " + stage + "\\n");
      // Only host registration is substituted; every provider/UI module is real.
      const sdk = "data:text/javascript," + encodeURIComponent(\`
        export const createCanvas = (options) => options;
        export class CanvasError extends Error {
          constructor(code, message) { super(message); this.code = code; }
        }
        export async function joinSession({ canvases }) {
          globalThis.portabilityCanvases = canvases;
          globalThis.portabilityEditorCanvases = [{
            canvasId: "editor", extensionId: "host:editor", displayName: "Files", description: "Repository files",
          }];
          globalThis.portabilityCanvasOpenCalls = [];
          globalThis.portabilityCanvasOpenFailure = null;
          return {
            sessionId: "portability-test",
            rpc: {
              canvas: {
                list: async () => ({ canvases: globalThis.portabilityEditorCanvases }),
                open: async (request) => {
                  globalThis.portabilityCanvasOpenCalls.push(request);
                  if (globalThis.portabilityCanvasOpenFailure) throw new Error(globalThis.portabilityCanvasOpenFailure);
                  return { ...request, title: request.input.title };
                },
              },
            },
          };
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
      checkpoint("provider imported");
      const { renderOcticon } = await import(base + "studio-icons.mjs");
      assert.match(renderOcticon("gear"), /data-octicon="gear"/);
      const iconManifest = JSON.parse(await readFile(join(payload, "vendor/octicons/provenance.json"), "utf8"));
      assert.equal(iconManifest.package, "@primer/octicons");
      assert.equal(iconManifest.version, "19.41.0");
      assert.equal(createHash("sha256").update(await readFile(join(payload, "vendor/octicons/icons.json"))).digest("hex"), iconManifest.sha256);
      assert.match(await readFile(join(payload, "vendor/octicons/LICENSE"), "utf8"), /MIT/);
      const { createSyntaxHighlighter } = await import(base + "vendor/prism.mjs");
      const { createBuildSyntax } = await import(base + "build-syntax.mjs");
      const syntax = createBuildSyntax(createSyntaxHighlighter());
      assert.match(syntax.highlight("def main(): return 42", "main.py"), /token keyword/);
      assert.match(await readFile(join(payload, "vendor/prism-LICENSE.txt"), "utf8"), /MIT LICENSE/);
      assert.equal(globalThis.portabilityCanvases.length, 1);
      const [canvas] = globalThis.portabilityCanvases;
      assert.equal(canvas.id, "azure-app-platform");
      const context = {
        instanceId: "portable-smoke", input: {},
        session: { workingDirectory: process.cwd() + sep + "." },
      };
      try {
        const opened = await canvas.open(context);
        checkpoint("canvas opened");
        assert.equal(new URL(opened.url).hostname, "127.0.0.1");
        const response = await fetch(opened.url);
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.match(html, /Create a new app/);
        assert.match(html, /data-studio-presentation="github-app"/);
        assert.deepEqual(canvas.inputSchema.properties.presentationProfile.enum, ["standalone", "github-app"]);
        await assert.rejects(canvas.open({ ...context, input: { presentationProfile: "vscode" } }), /Unsupported/);
        await assert.rejects(canvas.open({ ...context, input: { presentationProfile: null } }), /Unsupported/);
        const standaloneContext = { ...context, instanceId: "standalone-smoke", input: { presentationProfile: "standalone" } };
        try {
          const standalone = await canvas.open(standaloneContext);
          assert.match(await (await fetch(standalone.url)).text(), /data-studio-presentation="standalone"/);
          const switched = await canvas.open({ ...standaloneContext, input: { presentationProfile: "github-app" } });
          assert.match(await (await fetch(switched.url)).text(), /data-studio-presentation="github-app"/);
        } finally { await canvas.onClose({ instanceId: standaloneContext.instanceId }); }
        assert.equal(new URL(opened.url).searchParams.has("intro"), false);
        assert.doesNotMatch(html, /id="skip-studio-intro"/);
        for (const name of ["app-platform-symbol.png", "app-platform-intro.mp4"]) {
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
        const toolkit = JSON.parse(await readFile(join(payload, "vendor/toolkit/provenance.json"), "utf8"));
        assert.equal(toolkit.source.commit, "0b5ca6c5f98f1b695492699e596fdd4c3af48176");
        assert.equal(toolkit.source.published, false);
        assert.deepEqual(toolkit.files.map(file => file.route).sort(), [
          "/canvas-ui/LICENSE", "/canvas-ui/THIRD_PARTY_NOTICES.txt",
          "/canvas-ui/base.css", "/canvas-ui/base.mjs", "/canvas-ui/react-runtime.mjs", "/canvas-ui/styles.css",
          "/canvas-ui/visual-profiles.mjs", "/canvas-ui/profiles/github-app.css",
          "/canvas-ui/hosts/github-app/design.md", "/canvas-ui/hosts/github-app/theming.md",
        ].sort());
        for (const file of toolkit.files) {
          const assetUrl = new URL(file.route, opened.url);
          const asset = await fetch(assetUrl);
          const expected = await readFile(join(payload, "vendor/toolkit", file.file));
          assert.equal(asset.status, 200);
          assert.equal(asset.headers.get("content-type"), file.contentType);
          assert.equal(asset.headers.get("x-content-type-options"), "nosniff");
          const actual = Buffer.from(await asset.arrayBuffer());
          assert.deepEqual(actual, expected);
          assert.equal(createHash("sha256").update(actual).digest("hex"), file.sha256);
          const head = await fetch(assetUrl, { method: "HEAD" });
          assert.equal(head.status, 200);
          assert.equal(head.headers.get("content-length"), String(expected.length));
          assert.equal((await head.arrayBuffer()).byteLength, 0);
          if (file.file.endsWith(".mjs")) {
            const source = actual.toString();
            for (const match of source.matchAll(/\\bfrom\\s*["']([^"']+)["']/g)) {
              assert.equal(match[1], "./react-runtime.mjs", "Unprepared browser dependency");
              assert.equal((await fetch(new URL(match[1], assetUrl))).status, 200);
            }
            assert.doesNotMatch(source, /(?:https?:\\/\\/|file:\\/\\/|[A-Z]:\\\\).*node_modules/);
          }
        }
        const notices = await readFile(join(payload, "vendor/toolkit/ui/browser/THIRD_PARTY_NOTICES.txt"), "utf8");
        for (const dependency of ["@fluentui/react-button@9.11.3", "@primer/octicons-react@19.38.0", "react@19.3.0", "react-dom@19.3.0", "scheduler@0.28.0"]) {
          assert.ok(notices.includes(dependency), "Missing notice for " + dependency);
        }
        assert.match(await readFile(join(payload, "vendor/toolkit/LICENSE"), "utf8"), /MIT License/);
        for (const path of [
          "/assets/extension.mjs", "/assets/%2e%2e%2fextension.mjs",
          "/canvas-ui/extension.mjs", "/canvas-ui/%2e%2e%2fextension.mjs",
          "/canvas-ui/provenance.json", "/canvas-ui/fluent.mjs",
          "/canvas-ui/profiles/coreai-azure.css", "/canvas-ui/hosts/github-app/private.md",
        ]) {
          const missing = await fetch(new URL(path, opened.url));
          assert.equal(missing.status, 404);
          await missing.arrayBuffer();
        }
        const home = await fetch(new URL("/", opened.url));
        checkpoint("shipped assets verified");
        assert.doesNotMatch(await home.text(), /id="skip-studio-intro"/);
        assert.doesNotMatch(html, /<(?:script|link|img)\\b[^>]+(?:src|href)=["'](?:https?:)?\\/\\//i);
        const token = JSON.parse(/const apiToken = (".*?");/.exec(html)[1]);
        const api = (path, input) => fetch(new URL(path, opened.url), {
          method: input ? "POST" : "GET",
          headers: { "x-app-platform-token": token, "Content-Type": "application/json" },
          ...(input ? { body: JSON.stringify(input) } : {}),
        });
        assert.ok(canvas.actions.some((action) => action.name === "open_in_editor"));
        const initial = await api("/api/editor-settings");
        assert.equal(initial.status, 200);
        assert.equal((await initial.json()).editorId, "vscode");
        const saved = await api("/api/editor-settings", { editorId: "cursor" });
        assert.equal(saved.status, 200);
        assert.equal((await saved.json()).editorId, "cursor");
        const invalid = await api("/api/editor-settings", { editorId: "cursor", command: "custom" });
        assert.equal(invalid.status, 400);
        await invalid.arrayBuffer();
        const unauthenticated = await fetch(new URL("/api/editor-settings", opened.url), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editorId: "zed" }),
        });
        assert.equal(unauthenticated.ok, false);
        await unauthenticated.arrayBuffer();
        const { readEditorSettings } = await import(base + "editor-settings.mjs");
        assert.equal((await readEditorSettings()).editorId, "cursor");
        await mkdir("src/agent/prompts", { recursive: true });
        await mkdir("src/tools/document-validation", { recursive: true });
        await writeFile("src/agent/agent.yaml", "kind: hosted\\n");
        await writeFile("src/agent/prompts/system.md", "Use the tool.\\n\\n");
        const build = await api("/api/build-workspace?root=.");
        const state = await build.json();
        assert.equal(build.status, 200, JSON.stringify(state));
        const canonicalContext = {
          ...context, session: { workingDirectory: await realpath(process.cwd()) },
        };
        assert.equal((await canvas.open(canonicalContext)).url, opened.url);
        const outside = await api("/api/build-workspace?root=..");
        assert.equal(outside.ok, false);
        assert.match((await outside.json()).error, /must stay within the current workspace/);
        const unregistered = await api("/api/build-workspace?root=src");
        assert.equal(unregistered.ok, false);
        assert.match((await unregistered.json()).error, /not an authorized app workspace/);
        assert.equal(state.editorSettings.editorId, "cursor");
        const artifact = state.artifacts.find((item) => item.id === "instructions");
        assert.equal(artifact.customizationArea, "behavior");
        assert.equal("editable" in artifact, false);
        const native = await api("/api/open-build-file-canvas", { root: ".", id: artifact.id });
        const nativeResult = await native.json();
        assert.equal(native.status, 200, JSON.stringify(nativeResult));
        assert.equal(nativeResult.path, "src/agent/prompts/system.md");
        assert.equal(globalThis.portabilityCanvasOpenCalls.length, 1);
        assert.deepEqual(globalThis.portabilityCanvasOpenCalls[0], {
          extensionId: "host:editor",
          canvasId: "editor",
          instanceId: globalThis.portabilityCanvasOpenCalls[0].instanceId,
          input: { scope: "repo", path: "src/agent/prompts/system.md", title: "system.md" },
        });
        assert.match(globalThis.portabilityCanvasOpenCalls[0].instanceId, /^app-platform-build-file-[a-f0-9]{24}$/);
        const again = await api("/api/open-build-file-canvas", { root: ".", id: artifact.id });
        assert.equal(again.status, 200);
        await again.arrayBuffer();
        assert.equal(globalThis.portabilityCanvasOpenCalls[1].instanceId, globalThis.portabilityCanvasOpenCalls[0].instanceId);
        const reviewedSource = await api("/api/open-source-canvas", { root: ".", projectPath: "src/agent" });
        const reviewedResult = await reviewedSource.json();
        assert.equal(reviewedSource.status, 200, JSON.stringify(reviewedResult));
        assert.equal(reviewedResult.path, "src/agent/prompts/system.md");
        assert.equal(globalThis.portabilityCanvasOpenCalls.at(-1).instanceId, globalThis.portabilityCanvasOpenCalls[0].instanceId);
        const unsafeSource = await api("/api/open-source-canvas", { root: ".", projectPath: "../outside" });
        assert.equal(unsafeSource.status, 400);
        assert.match((await unsafeSource.json()).error, /app-relative source project/);
        const unknownSource = await api("/api/open-source-canvas", { root: ".", projectPath: "private" });
        assert.equal(unknownSource.status, 400);
        assert.match((await unknownSource.json()).error, /source project discovered/);
        const unauthorizedSource = await fetch(new URL("/api/open-source-canvas", opened.url), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ root: ".", projectPath: "src/agent" }),
        });
        assert.equal(unauthorizedSource.ok, false);
        await unauthorizedSource.arrayBuffer();
        const outsideOpen = await api("/api/open-build-file-canvas", { root: "..", id: artifact.id });
        assert.equal(outsideOpen.ok, false);
        assert.match((await outsideOpen.json()).error, /must stay within the current workspace/);
        const arbitrary = await api("/api/open-build-file-canvas", { root: ".", id: "../outside" });
        assert.equal(arbitrary.status, 400);
        assert.match((await arbitrary.json()).error, /known Customize artifact/);
        globalThis.portabilityEditorCanvases = [];
        const missingCanvas = await api("/api/open-build-file-canvas", { root: ".", id: artifact.id });
        assert.equal(missingCanvas.status, 503);
        assert.match((await missingCanvas.json()).error, /not registered.*external editor/i);
        globalThis.portabilityEditorCanvases = [{
          canvasId: "editor", extensionId: "host:editor", displayName: "Files", description: "Repository files",
        }];
        globalThis.portabilityCanvasOpenFailure = "host rejected the file";
        const rejectedCanvas = await api("/api/open-build-file-canvas", { root: ".", id: artifact.id });
        assert.equal(rejectedCanvas.status, 502);
        assert.match((await rejectedCanvas.json()).error, /host rejected the file.*external editor/i);
        globalThis.portabilityCanvasOpenFailure = null;

        await mkdir("apps/nested/src/agent/prompts", { recursive: true });
        await mkdir("apps/nested/src/tools/document-validation", { recursive: true });
        await writeFile("apps/nested/src/agent/agent.yaml", "kind: hosted\\n");
        await writeFile("apps/nested/src/agent/prompts/system.md", "Nested instructions.\\n");
        const nestedRoot = join(process.cwd(), "apps/nested");
        const registered = await api("/api/sources", { path: nestedRoot });
        assert.equal(registered.status, 200, await registered.text());
        const nestedBuild = await api("/api/build-workspace?root=apps%2Fnested");
        const nestedState = await nestedBuild.json();
        assert.equal(nestedBuild.status, 200, JSON.stringify(nestedState));
        const nestedArtifact = nestedState.artifacts.find((item) => item.id === "instructions");
        const nestedOpen = await api("/api/open-build-file-canvas", {
          root: "apps/nested/../nested", id: nestedArtifact.id,
        });
        const nestedResult = await nestedOpen.json();
        assert.equal(nestedOpen.status, 200, JSON.stringify(nestedResult));
        assert.equal(nestedResult.path, "apps/nested/src/agent/prompts/system.md");
        assert.equal(globalThis.portabilityCanvasOpenCalls.at(-1).input.path, nestedResult.path);
        const nestedReview = await api("/api/open-source-canvas", { root: "apps/nested", projectPath: "src/agent" });
        const nestedReviewResult = await nestedReview.json();
        assert.equal(nestedReview.status, 200, JSON.stringify(nestedReviewResult));
        assert.equal(nestedReviewResult.path, nestedResult.path);

        const outsideRoot = join(process.cwd(), "..", "outside app");
        await mkdir(join(outsideRoot, "src/agent/prompts"), { recursive: true });
        await mkdir(join(outsideRoot, "src/tools/document-validation"), { recursive: true });
        await writeFile(join(outsideRoot, "src/agent/prompts/system.md"), "Outside instructions.\\n");
        const outsideRegistered = await api("/api/sources", { path: outsideRoot });
        assert.equal(outsideRegistered.status, 200, await outsideRegistered.text());
        const outsideBuild = await api("/api/build-workspace?root=" + encodeURIComponent(outsideRoot));
        const outsideState = await outsideBuild.json();
        assert.equal(outsideBuild.status, 200, JSON.stringify(outsideState));
        const externalOnly = await api("/api/open-build-file-canvas", {
          root: outsideRoot, id: outsideState.artifacts.find((item) => item.id === "instructions").id,
        });
        assert.equal(externalOnly.status, 400);
        assert.match((await externalOnly.json()).error, /outside the current session working tree.*external editor/i);

        for (const endpoint of ["/api/build-diff", "/api/build-file"]) {
          const discontinued = await api(endpoint, {
            root: ".", id: artifact.id, baseSha: "discontinued", content: "MUST NOT WRITE\\n",
          });
          assert.equal(discontinued.status, 404);
          await discontinued.arrayBuffer();
        }
        assert.equal(await readFile("src/agent/prompts/system.md", "utf8"), "Use the tool.\\n\\n");
        const mapUrl = new URL("/app-map", opened.url);
        mapUrl.searchParams.set("root", ".");
        mapUrl.searchParams.set("token", token);
        const map = await fetch(mapUrl);
        const mapHtml = await map.text();
        assert.equal(map.status, 200, mapHtml);
        assert.match(mapHtml, /data-studio-presentation="github-app"/);
        assert.match(mapHtml, /Change your app/);
        assert.match(mapHtml, /aria-label="Preferred external editor"/);
        assert.match(mapHtml, /build-help-tooltip/);
        assert.doesNotMatch(mapHtml, /About these customization points/);
        assert.doesNotMatch(mapHtml, /Resize key files/);
        checkpoint("workspace actions verified");
      } finally {
        await canvas.onClose(context);
      }
      const { materializeTemplate } = await import(base + "template-materializer.mjs");
      const { LOCAL_TEMPLATES } = await import(base + "source-catalog.mjs");
      assert.equal(LOCAL_TEMPLATES.length, 2);
      for (const template of LOCAL_TEMPLATES) {
        checkpoint("materializing " + template.id);
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
      env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "", COPILOT_HOME: join(root, "copilot-home") },
      // Real Git/discovery calls can exceed 30s on a shared Windows host.
      timeout: 120_000,
    });
    assert.equal(stdout, "portable payload passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
