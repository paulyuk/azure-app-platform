import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const assets = new Map([
  ["/assets/run-ready-spot.svg", { path: fileURLToPath(new URL("./assets/run-ready-spot.svg", import.meta.url)), type: "image/svg+xml" }],
  ["/assets/run-working-spot.svg", { path: fileURLToPath(new URL("./assets/run-working-spot.svg", import.meta.url)), type: "image/svg+xml" }],
  ["/assets/app-platform-symbol.png", { path: fileURLToPath(new URL("./assets/app-platform-symbol.png", import.meta.url)), type: "image/png" }],
  ["/assets/app-platform-intro.mp4", { path: fileURLToPath(new URL("./assets/app-platform-intro.mp4", import.meta.url)), type: "video/mp4" }],
  ["/assets/homepage-create.svg", { path: fileURLToPath(new URL("./assets/homepage-create.svg", import.meta.url)), type: "image/svg+xml" }],
  ["/assets/homepage-open.svg", { path: fileURLToPath(new URL("./assets/homepage-open.svg", import.meta.url)), type: "image/svg+xml" }],
  ["/assets/homepage-assemble.svg", { path: fileURLToPath(new URL("./assets/homepage-assemble.svg", import.meta.url)), type: "image/svg+xml" }],
  ["/assets/homepage-create-dark.svg", { path: fileURLToPath(new URL("./assets/homepage-create-dark.svg", import.meta.url)), type: "image/svg+xml" }],
  ["/assets/homepage-open-dark.svg", { path: fileURLToPath(new URL("./assets/homepage-open-dark.svg", import.meta.url)), type: "image/svg+xml" }],
  ["/assets/homepage-assemble-dark.svg", { path: fileURLToPath(new URL("./assets/homepage-assemble-dark.svg", import.meta.url)), type: "image/svg+xml" }],
  ["/canvas-ui/base.mjs", { path: fileURLToPath(new URL("./vendor/toolkit/ui/browser/base.mjs", import.meta.url)), type: "text/javascript; charset=utf-8" }],
  ["/canvas-ui/react-runtime.mjs", { path: fileURLToPath(new URL("./vendor/toolkit/ui/browser/react-runtime.mjs", import.meta.url)), type: "text/javascript; charset=utf-8" }],
  ["/canvas-ui/styles.css", { path: fileURLToPath(new URL("./vendor/toolkit/ui/styles.css", import.meta.url)), type: "text/css; charset=utf-8" }],
  ["/canvas-ui/base.css", { path: fileURLToPath(new URL("./vendor/toolkit/ui/base.css", import.meta.url)), type: "text/css; charset=utf-8" }],
  ["/canvas-ui/visual-profiles.mjs", { path: fileURLToPath(new URL("./vendor/toolkit/ui/visual-profiles.mjs", import.meta.url)), type: "text/javascript; charset=utf-8" }],
  ["/canvas-ui/profiles/github-app.css", { path: fileURLToPath(new URL("./vendor/toolkit/ui/profiles/github-app.css", import.meta.url)), type: "text/css; charset=utf-8" }],
  ["/canvas-ui/hosts/github-app/design.md", { path: fileURLToPath(new URL("./vendor/toolkit/ui/hosts/github-app/design.md", import.meta.url)), type: "text/markdown; charset=utf-8" }],
  ["/canvas-ui/hosts/github-app/theming.md", { path: fileURLToPath(new URL("./vendor/toolkit/ui/hosts/github-app/theming.md", import.meta.url)), type: "text/markdown; charset=utf-8" }],
  ["/canvas-ui/THIRD_PARTY_NOTICES.txt", { path: fileURLToPath(new URL("./vendor/toolkit/ui/browser/THIRD_PARTY_NOTICES.txt", import.meta.url)), type: "text/plain; charset=utf-8" }],
  ["/canvas-ui/LICENSE", { path: fileURLToPath(new URL("./vendor/toolkit/LICENSE", import.meta.url)), type: "text/plain; charset=utf-8" }],
]);

export async function serveStudioAsset(request, response, pathname) {
  const asset = assets.get(pathname);
  if (!asset || !["GET", "HEAD"].includes(request.method)) return false;
  // Only explicitly shipped UI assets are cached, never workspace files.
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
