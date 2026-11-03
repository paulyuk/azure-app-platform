import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Studio preview uses locally readable screenshots and current workspace labels", async () => {
  const preview = new URL("../../docs/demos/azure-app-platform-preview.md", import.meta.url);
  const markdown = await readFile(preview, "utf8");
  assert.match(markdown, /Run\/Debug/);
  assert.match(markdown, /Observe\/Map/);
  assert.doesNotMatch(markdown, /<details|<summary|Run & manage/);
  const images = [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
  assert.deepEqual(images.map(([, path]) => path.split("/").at(-1)), [
    "template.png", "build-guide.png", "run-runtime.png",
    "document-input.png", "document-output.png", "map.png",
  ]);
  for (const [, path] of images) {
    assert.match(path, /^\.\.\/images\/azure-app-platform-preview\/[\w-]+\.png$/);
    const image = await readFile(new URL(path, preview));
    assert.deepEqual(image.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.ok(image.readUInt32BE(16) > 0 && image.readUInt32BE(20) > 0);
  }
});
