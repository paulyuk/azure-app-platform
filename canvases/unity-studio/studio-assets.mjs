import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const assets = new Map([
  ["/assets/unity-symbol.png", { path: fileURLToPath(new URL("./assets/unity-symbol.png", import.meta.url)), type: "image/png" }],
  ["/assets/unity-intro.mp4", { path: fileURLToPath(new URL("./assets/unity-intro.mp4", import.meta.url)), type: "video/mp4" }],
]);

export async function serveStudioAsset(request, response, pathname) {
  const asset = assets.get(pathname);
  if (!asset || !["GET", "HEAD"].includes(request.method)) return false;
  // The allowlist bounds the cache to the two shipped brand assets, never workspace files.
  const content = asset.content ??= await readFile(asset.path);
  response.setHeader("Content-Type", asset.type);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "private, max-age=3600");
  response.setHeader("Accept-Ranges", "bytes");
  let start = 0;
  let end = content.length - 1;
  const range = request.method === "GET" ? request.headers.range : undefined;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, content.length - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
    }
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start)
      || !Number.isSafeInteger(end) || start > end || start >= content.length) {
      response.writeHead(416, { "Content-Range": `bytes */${content.length}`, "Content-Length": 0 });
      response.end();
      return true;
    }
    response.statusCode = 206;
    response.setHeader("Content-Range", `bytes ${start}-${end}/${content.length}`);
  }
  response.setHeader("Content-Length", end - start + 1);
  response.end(request.method === "HEAD" ? undefined : content.subarray(start, end + 1));
  return true;
}
