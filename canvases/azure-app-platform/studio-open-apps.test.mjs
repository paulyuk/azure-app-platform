import assert from "node:assert/strict";
import test from "node:test";
import { getAppOpenedLabel, getAppPathLabels } from "./studio-open-apps.mjs";

test("app paths show only the final project folder", () => {
  const paths = [
    "C:\\Users\\developer\\.copilot\\worktrees\\customer-portal",
    "C:\\projects\\customer-app\\source",
    "C:\\projects\\internal-app\\source",
  ];
  assert.deepEqual([...getAppPathLabels(paths).values()], [
    "customer-portal", "source", "source",
  ]);
});

test("duplicate project folders never expand across Windows drives and UNC shares", () => {
  const paths = ["C:\\apps\\source", "D:\\apps\\source", "\\\\host\\share\\apps\\source"];
  assert.deepEqual([...getAppPathLabels(paths).values()], ["source", "source", "source"]);
});

test("project folders preserve case and handle mixed and trailing separators", () => {
  const paths = ["C:\\customer\\Source\\", "D:/internal/source/"];
  assert.deepEqual([...getAppPathLabels(paths).values()], ["Source", "source"]);
  assert.deepEqual([...getAppPathLabels(["C:/customer/Source", "D:/internal/source"]).values()], [
    "Source", "source",
  ]);
  assert.deepEqual([...getAppPathLabels([
    "C:app", "\\\\?\\C:\\projects\\app", "\\\\?\\UNC\\host\\share\\app", "///projects/app///",
  ]).values()], [
    "app", "app", "app", "app",
  ]);
});

test("POSIX app paths show one folder without expanding duplicate names", () => {
  const paths = ["/projects/Source", "/projects/source", "/workspace/shared", "/shared"];
  assert.deepEqual([...getAppPathLabels(paths).values()], ["Source", "source", "shared", "shared"]);
});

test("root-only Windows, POSIX and UNC paths retain their root without fabricating a folder", () => {
  const paths = [
    "/", "//", "\\", "C:", "C:\\", "C:/", "\\\\host\\share", "\\\\host\\share\\", "//host/share/",
    "\\\\?\\C:\\", "\\\\?\\UNC\\host\\share\\",
  ];
  assert.deepEqual([...getAppPathLabels(paths).entries()], paths.map(path => [path, path]));
});

test("repeated paths keep full-path map keys and empty inventories have no labels", () => {
  const paths = ["C:\\projects\\app", "C:\\projects\\app"];
  assert.deepEqual([...getAppPathLabels(paths).entries()], [
    ["C:\\projects\\app", "app"],
  ]);
  assert.equal(getAppPathLabels([]).size, 0);
});

test("project folder labels do not depend on the visible inventory", () => {
  assert.deepEqual([...getAppPathLabels(["C:\\projects\\app-name", "/projects/app-name"]).values()],
    ["app-name", "app-name"]);
  assert.equal(getAppPathLabels(["C:\\projects\\app-name"]).get("C:\\projects\\app-name"), "app-name");
});

test("opening times use bounded compact relative labels and omit missing timestamps", () => {
  const now = Date.parse("2026-11-07T18:00:00Z");
  const ago = minutes => new Date(now - minutes * 60000).toISOString();
  for (const value of [undefined, null, "", "invalid"]) assert.equal(getAppOpenedLabel(value, now), "");
  assert.equal(getAppOpenedLabel(ago(-5), now), "opened just now");
  assert.equal(getAppOpenedLabel(ago(0), now), "opened just now");
  assert.equal(getAppOpenedLabel(ago(5), now), "opened 5m ago");
  assert.equal(getAppOpenedLabel(ago(59), now), "opened 59m ago");
  assert.equal(getAppOpenedLabel(ago(60), now), "opened 1h ago");
  assert.equal(getAppOpenedLabel(ago(1439), now), "opened 23h ago");
  assert.equal(getAppOpenedLabel(ago(1440), now), "opened 1d ago");
});
