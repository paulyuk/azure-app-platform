import assert from "node:assert/strict";
import { win32 } from "node:path";
import test from "node:test";
import { openBuildFileCanvas, repoCanvasPath } from "./build-file-canvas.mjs";

test("native Build handoff opens the exact allowlisted nested source with a stable file instance", async () => {
  const requests = [];
  const session = {
    rpc: {
      canvas: {
        list: async () => ({
          canvases: [
            { canvasId: "azure-app-platform", extensionId: "project:azure-app-platform" },
            { canvasId: "editor", extensionId: "host:files" },
          ],
        }),
        open: async (request) => {
          requests.push(request);
          return { ...request, title: request.input.title };
        },
      },
    },
  };
  const options = {
    session,
    workspaceRoot: "/repo",
    root: "/repo/apps/claims",
    id: "source-agent",
    artifactResolver: async (root, id) => {
      assert.equal(root, "/repo/apps/claims");
      assert.equal(id, "source-agent");
      return "/repo/apps/claims/src/agent/main.py";
    },
  };

  const first = await openBuildFileCanvas(options);
  const second = await openBuildFileCanvas(options);
  assert.equal(first.path, "apps/claims/src/agent/main.py");
  assert.deepEqual(requests[0], {
    extensionId: "host:files",
    canvasId: "editor",
    instanceId: requests[0].instanceId,
    input: {
      scope: "repo",
      path: "apps/claims/src/agent/main.py",
      title: "main.py",
    },
  });
  assert.match(requests[0].instanceId, /^app-platform-build-file-[a-f0-9]{24}$/);
  assert.equal(requests[1].instanceId, requests[0].instanceId);
  assert.equal(second.canvas.input.path, first.canvas.input.path);
});

test("native Build handoff reports unavailable and rejected host canvas operations", async () => {
  const base = {
    workspaceRoot: "/repo",
    root: "/repo",
    id: "instructions",
    artifactResolver: async () => "/repo/src/agent/prompts/system.md",
  };
  await assert.rejects(openBuildFileCanvas({
    ...base,
    session: { rpc: { canvas: { list: async () => ({ canvases: [] }), open: async () => assert.fail() } } },
  }), (error) => error.statusCode === 503 && /not registered/.test(error.message) && /external editor/.test(error.message));
  await assert.rejects(openBuildFileCanvas({
    ...base,
    session: { rpc: { canvas: { list: async () => { throw new Error("catalog unavailable"); }, open: async () => assert.fail() } } },
  }), (error) => error.statusCode === 502 && /catalog unavailable/.test(error.message) && /external editor/.test(error.message));
  await assert.rejects(openBuildFileCanvas({
    ...base,
    session: {
      rpc: {
        canvas: {
          list: async () => ({ canvases: [{ canvasId: "editor", extensionId: "host:files" }] }),
          open: async () => { throw new Error("host rejected input"); },
        },
      },
    },
  }), (error) => error.statusCode === 502 && /host rejected input/.test(error.message) && /external editor/.test(error.message));
});

test("repository canvas paths preserve Windows separators and reject parent or sibling sources", () => {
  assert.equal(
    repoCanvasPath("C:\\Work\\Repo", "c:\\work\\repo\\apps\\claims\\main.py", win32),
    "apps/claims/main.py",
  );
  for (const file of ["/repo", "/repo-other/main.py", "/outside/main.py"]) {
    assert.throws(() => repoCanvasPath("/repo", file), (error) =>
      error.statusCode === 400 && /outside the current session working tree|safe repository-relative/.test(error.message));
  }
  assert.throws(() => repoCanvasPath("C:\\Work\\Repo", "D:\\Other\\main.py", win32), /outside the current session/);
});
