import { createHash } from "node:crypto";
import path from "node:path";
import { resolveBuildArtifactPath } from "./build-workspace.mjs";

function requestError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function repoCanvasPath(workspaceRoot, file, pathApi = path) {
  const local = pathApi.relative(workspaceRoot, file);
  if (!local || pathApi.isAbsolute(local) || local === ".." || local.startsWith(`..${pathApi.sep}`)) {
    throw requestError(
      "This source is outside the current session working tree, so Files cannot open it. Use the external editor option instead.",
      400,
    );
  }
  const normalized = local.split(pathApi.sep).join("/");
  if (normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw requestError("The selected Build source does not have a safe repository-relative path.", 400);
  }
  return normalized;
}

function editorCanvas(catalog) {
  const matches = catalog?.canvases?.filter((canvas) =>
    canvas?.canvasId === "editor" && typeof canvas.extensionId === "string" && canvas.extensionId) ?? [];
  if (matches.length !== 1) {
    const detail = matches.length
      ? "More than one host editor canvas is registered."
      : "The host editor canvas is not registered.";
    throw requestError(
      `${detail} Use the external editor option instead, or reload GitHub Copilot and try Edit in Files again.`,
      503,
    );
  }
  return matches[0];
}

export async function openBuildFileCanvas({
  session,
  workspaceRoot,
  root,
  id,
  artifactResolver = resolveBuildArtifactPath,
  pathApi = path,
}) {
  const file = await artifactResolver(root, id);
  const repositoryPath = repoCanvasPath(workspaceRoot, file, pathApi);
  if (!session?.rpc?.canvas?.list || !session.rpc.canvas.open) {
    throw requestError(
      "This GitHub Copilot host cannot open Files from Unity Studio. Use the external editor option instead.",
      503,
    );
  }
  let provider;
  try {
    provider = editorCanvas(await session.rpc.canvas.list());
  } catch (error) {
    if (error?.statusCode) throw error;
    throw requestError(
      `Files canvas discovery failed: ${error instanceof Error ? error.message : String(error)} Use the external editor option instead.`,
      502,
    );
  }
  const request = {
    extensionId: provider.extensionId,
    canvasId: "editor",
    instanceId: `unity-build-file-${createHash("sha256").update(repositoryPath).digest("hex").slice(0, 24)}`,
    input: {
      scope: "repo",
      path: repositoryPath,
      title: pathApi.basename(file),
    },
  };
  try {
    return { path: repositoryPath, canvas: await session.rpc.canvas.open(request) };
  } catch (error) {
    throw requestError(
      `Files could not open ${repositoryPath}: ${error instanceof Error ? error.message : String(error)} Use the external editor option instead.`,
      502,
    );
  }
}
