import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readAppLastOpened, recordAppOpened, sortAppsByLastOpened } from "./app-recency.mjs";

test("opening an app persists recency without modifying its identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "unity-recency-"));
  try {
    assert.equal(await readAppLastOpened(root), null);
    const earlier = new Date("2026-09-13T20:00:00Z");
    const later = new Date("2026-09-14T00:00:00Z");
    await recordAppOpened(root, earlier);
    const identity = JSON.stringify({ name: "Example", runtime: { start: "start" } });
    await writeFile(join(root, ".azure-app-platform/app.json"), identity);
    await Promise.all([recordAppOpened(root, later), recordAppOpened(root, earlier)]);
    assert.equal(await readAppLastOpened(root), later.toISOString());
    assert.equal(await readFile(join(root, ".azure-app-platform/app.json"), "utf8"), identity);
    await writeFile(join(root, ".azure-app-platform/last-opened.json"), '{"lastOpenedAt":"invalid"}');
    await assert.rejects(readAppLastOpened(root), /Invalid app last-opened timestamp/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("apps sort by opening time, newest first, with unrecorded apps last", () => {
  const apps = [
    { name: "Never", path: "/never", lastOpenedAt: null },
    { name: "Earlier", path: "/earlier", lastOpenedAt: "2026-09-13T20:00:00Z" },
    { name: "Newest", path: "/newest", lastOpenedAt: "2026-09-14T00:00:00Z" },
    { name: "Also never", path: "/also", lastOpenedAt: null },
  ];
  assert.deepEqual(sortAppsByLastOpened(apps).map((app) => app.name),
    ["Newest", "Earlier", "Also never", "Never"]);
  assert.equal(apps[0].name, "Never");
});
